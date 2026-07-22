import { sortedToolEntries, toJsonSchema, type ToolContext } from "@livekit/agents";
import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import type { JSONSchema7 } from "json-schema";

export function buildAiToolSet(toolCtx: ToolContext): ToolSet {
  const tools: ToolSet = {};

  for (const [name, fnTool] of sortedToolEntries(toolCtx)) {
    tools[name] = dynamicTool({
      description: fnTool.description,
      inputSchema: jsonSchema(
        toJsonSchema(fnTool.parameters, true, false) as JSONSchema7,
      ),
      execute: async (input) => input,
    });
  }

  return tools;
}
