import type { ActiveTool } from "@excalidraw/excalidraw/types";

export const EQUATION_TOOL_TYPE = "equation";

export function isEquationTool(activeTool: ActiveTool): boolean {
  return activeTool.type === "custom" && activeTool.customType === EQUATION_TOOL_TYPE;
}
