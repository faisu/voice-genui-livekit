/**
 * LiveKit reliable data packets are capped ~15KiB (headers included).
 * Chunk anything larger so HTML artifacts can reach the browser.
 */
export const CANVAS_MAX_PACKET_BYTES = 12_000;

export type CanvasChunkMessage = {
  type: "canvas_chunk";
  id: string;
  index: number;
  total: number;
  data: string;
};

export type CanvasWireEnvelope =
  | { kind: "single"; bytes: Uint8Array }
  | { kind: "chunked"; packets: Uint8Array[] };

const textEncoder = new TextEncoder();

export function encodeCanvasWirePayload(jsonPayload: string): CanvasWireEnvelope {
  const bytes = textEncoder.encode(jsonPayload);
  if (bytes.length <= CANVAS_MAX_PACKET_BYTES) {
    return { kind: "single", bytes };
  }

  // Leave headroom for chunk envelope JSON wrapping and re-escaping of \" / \\.
  const chunkDataBudget = 4_000;
  const parts = splitUtf8ByBytes(jsonPayload, chunkDataBudget);
  const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const packets = parts.map((data, index) => {
    const chunk: CanvasChunkMessage = {
      type: "canvas_chunk",
      id,
      index,
      total: parts.length,
      data,
    };
    return textEncoder.encode(JSON.stringify(chunk));
  });

  return { kind: "chunked", packets };
}

function splitUtf8ByBytes(value: string, maxBytes: number): string[] {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of value) {
    const charBytes = textEncoder.encode(char).length;
    if (currentBytes + charBytes > maxBytes && current.length > 0) {
      parts.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  if (current.length > 0) parts.push(current);
  return parts;
}

type ChunkBuffer = {
  total: number;
  received: number;
  parts: (string | null)[];
};

export type CanvasChunkAccumulator = {
  buffers: Map<string, ChunkBuffer>;
};

export function createCanvasChunkAccumulator(): CanvasChunkAccumulator {
  return { buffers: new Map() };
}

/** Returns a fully reassembled JSON string when the last chunk arrives. */
export function acceptCanvasChunk(
  acc: CanvasChunkAccumulator,
  chunk: CanvasChunkMessage,
): string | null {
  if (
    !chunk.id ||
    typeof chunk.index !== "number" ||
    typeof chunk.total !== "number" ||
    chunk.total < 1 ||
    chunk.index < 0 ||
    chunk.index >= chunk.total ||
    typeof chunk.data !== "string"
  ) {
    return null;
  }

  let entry = acc.buffers.get(chunk.id);
  if (!entry) {
    entry = {
      total: chunk.total,
      received: 0,
      parts: Array.from({ length: chunk.total }, () => null),
    };
    acc.buffers.set(chunk.id, entry);
  }

  if (entry.parts[chunk.index] === null) {
    entry.parts[chunk.index] = chunk.data;
    entry.received += 1;
  }

  if (entry.received < entry.total) {
    return null;
  }

  acc.buffers.delete(chunk.id);
  return entry.parts.join("");
}
