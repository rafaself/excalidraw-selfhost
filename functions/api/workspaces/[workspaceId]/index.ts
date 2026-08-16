import {
  ApiError,
  emptyResponse,
  errorResponse,
  jsonResponse,
  MAX_METADATA_BODY_BYTES,
  methodNotAllowed,
  readJsonBody,
  requireId,
  requireName,
} from "../../../lib/http";
import { deleteWorkspace, renameWorkspace, type AppEnv } from "../../../lib/storage";

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  try {
    const workspaceId = requireId(context.params.workspaceId, "Workspace ID");

    if (context.request.method === "PATCH") {
      const body = await readJsonBody(context.request, { maxBytes: MAX_METADATA_BODY_BYTES });
      const name = requireName(body);
      const workspace = await renameWorkspace(context.env.DIAGRAMS, workspaceId, name);

      if (!workspace) {
        throw new ApiError(404, "workspace_not_found", "Workspace not found");
      }

      return jsonResponse({ workspace });
    }

    if (context.request.method === "DELETE") {
      const deleted = await deleteWorkspace(context.env.DIAGRAMS, workspaceId);

      if (!deleted) {
        throw new ApiError(404, "workspace_not_found", "Workspace not found");
      }

      return emptyResponse();
    }

    return methodNotAllowed(["PATCH", "DELETE"]);
  } catch (error) {
    return errorResponse(error);
  }
};
