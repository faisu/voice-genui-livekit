import type { CanvasContentType } from "./types";

const FORBIDDEN_THREEJS =
  /\b(fetch|XMLHttpRequest|WebSocket|import\s*\(|eval\s*\(|Function\s*\(|window\.parent|document\.cookie|localStorage|sessionStorage)\b/i;

export function prepareCanvasContent(
  content: string,
  contentType: CanvasContentType = "threejs",
): string {
  if (contentType !== "threejs") {
    throw new Error("Only threejs canvas content is supported");
  }
  return sanitizeThreejsContent(content);
}

export function sanitizeThreejsContent(content: string): string {
  if (FORBIDDEN_THREEJS.test(content)) {
    throw new Error("Three.js canvas content contains forbidden APIs");
  }
  return content.trim();
}
