import {
  parseSceneOpsDocument,
  serializeSceneOpsDocument,
  type SceneOpsDocument,
} from "./sceneOps";
import type { CanvasContentType } from "./types";

const FORBIDDEN_THREEJS =
  /\b(fetch|XMLHttpRequest|WebSocket|import\s*\(|eval\s*\(|Function\s*\(|window\.parent|document\.cookie|localStorage|sessionStorage)\b/i;

export function prepareCanvasContent(
  content: string,
  contentType: CanvasContentType = "threejs",
): string {
  if (contentType === "scene_ops") {
    return sanitizeSceneOpsContent(content);
  }
  if (contentType !== "threejs") {
    throw new Error(`Unsupported canvas content type: ${contentType}`);
  }
  return sanitizeThreejsContent(content);
}

export function sanitizeThreejsContent(content: string): string {
  if (FORBIDDEN_THREEJS.test(content)) {
    throw new Error("Three.js canvas content contains forbidden APIs");
  }
  return content.trim();
}

export function sanitizeSceneOpsContent(content: string): string {
  const doc = parseSceneOpsDocument(content);
  return serializeSceneOpsDocument(doc);
}

export function prepareSceneOpsDocument(doc: SceneOpsDocument): string {
  return serializeSceneOpsDocument(doc);
}
