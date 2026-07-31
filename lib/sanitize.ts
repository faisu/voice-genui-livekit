import {
  parseSceneOpsDocument,
  serializeSceneOpsDocument,
  type SceneOpsDocument,
} from "./sceneOps";
import type { CanvasContentType } from "./types";

/** Block exfil / dynamic-code APIs if any string payload is inspected. */
const FORBIDDEN_APIS =
  /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|navigator\.sendBeacon)\b|\bimport\s*\(|\beval\s*\(|\bwindow\.parent\.|\bdocument\.cookie\b/i;

export function prepareCanvasContent(
  content: string,
  contentType: CanvasContentType = "scene_ops",
): string {
  if (contentType === "scene_ops") {
    return sanitizeSceneOpsContent(content);
  }
  throw new Error(`Unsupported canvas content type: ${contentType}`);
}

/**
 * Validate and re-serialize scene_ops JSON. Rejects remote asset references.
 */
export function sanitizeSceneOpsContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("scene_ops canvas content is empty");
  }
  if (
    /\bhttps?:\/\//i.test(trimmed) ||
    /\.gltf\b/i.test(trimmed) ||
    /\.glb\b/i.test(trimmed) ||
    /\.hdr\b/i.test(trimmed)
  ) {
    throw new Error("scene_ops must not reference remote models or HDRIs");
  }
  const doc = parseSceneOpsDocument(trimmed);
  return serializeSceneOpsDocument(doc);
}

export function prepareSceneOpsDocument(doc: SceneOpsDocument): string {
  return sanitizeSceneOpsContent(serializeSceneOpsDocument(doc));
}

/** @deprecated HTML iframe demos removed — Three.js scene_ops only. */
export function sanitizeHtmlContent(content: string): string {
  void content;
  throw new Error("HTML canvas content is no longer supported; use scene_ops");
}

/** @deprecated */
export function sanitizeThreejsContent(content: string): string {
  if (FORBIDDEN_APIS.test(content)) {
    throw new Error("Three.js canvas content contains forbidden APIs");
  }
  return content.trim();
}
