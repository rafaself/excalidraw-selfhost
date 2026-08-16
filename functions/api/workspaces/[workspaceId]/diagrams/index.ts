import {
  ApiError,
  errorResponse,
  jsonResponse,
  MAX_METADATA_BODY_BYTES,
  methodNotAllowed,
  readJsonBody,
  requireId,
  requireName,
} from "../../../../lib/http";
import {
  createDiagram,
  getWorkspace,
  listDiagrams,
  type AppEnv,
} from "../../../../lib/storage";

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  try {
    const workspaceId = requireId(context.params.workspaceId, "Workspace ID");
    const workspace = await getWorkspace(context.env.DIAGRAMS, workspaceId);

    if (!workspace) {
      throw new ApiError(404, "workspace_not_found", "Workspace not found");
    }

    if (context.request.method === "GET") {
      const diagrams = await listDiagrams(context.env.DIAGRAMS, workspaceId);
      return jsonResponse({ diagrams });
    }

    if (context.request.method === "POST") {
      const body = await readJsonBody(context.request, { maxBytes: MAX_METADATA_BODY_BYTES });
      const name = requireName(body);
      const diagram = await createDiagram(context.env.DIAGRAMS, workspaceId, name);

      if (!diagram) {
        throw new ApiError(404, "workspace_not_found", "Workspace not found");
      }

      return jsonResponse(
        { diagram },
        201,
        { location: `/api/workspaces/${workspaceId}/diagrams/${diagram.id}` },
      );
    }

    return methodNotAllowed(["GET", "POST"]);
  } catch (error) {
    return errorResponse(error);
  }
};
