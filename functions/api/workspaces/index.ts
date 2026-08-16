import {
  errorResponse,
  jsonResponse,
  MAX_METADATA_BODY_BYTES,
  methodNotAllowed,
  readJsonBody,
  requireName,
} from "../../lib/http";
import { createWorkspace, listWorkspaces, type AppEnv } from "../../lib/storage";

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  try {
    if (context.request.method === "GET") {
      const workspaces = await listWorkspaces(context.env.DIAGRAMS);
      return jsonResponse({ workspaces });
    }

    if (context.request.method === "POST") {
      const body = await readJsonBody(context.request, { maxBytes: MAX_METADATA_BODY_BYTES });
      const name = requireName(body);
      const workspace = await createWorkspace(context.env.DIAGRAMS, name);

      return jsonResponse(
        { workspace },
        201,
        { location: `/api/workspaces/${workspace.id}` },
      );
    }

    return methodNotAllowed(["GET", "POST"]);
  } catch (error) {
    return errorResponse(error);
  }
};
