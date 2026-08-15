import { isExcalidrawDocument } from "../../../../lib/domain";
import {
  ApiError,
  emptyResponse,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  readJsonBody,
  requireId,
  requireName,
} from "../../../../lib/http";
import {
  deleteDiagram,
  getDiagram,
  renameDiagram,
  saveDiagram,
  type AppEnv,
} from "../../../../lib/storage";

export const onRequest: PagesFunction<AppEnv> = async (context) => {
  try {
    const workspaceId = requireId(context.params.workspaceId, "Workspace ID");
    const diagramId = requireId(context.params.diagramId, "Diagram ID");

    if (context.request.method === "GET") {
      const diagram = await getDiagram(context.env.DIAGRAMS, workspaceId, diagramId);

      if (!diagram) {
        throw new ApiError(404, "diagram_not_found", "Diagram not found");
      }

      return jsonResponse({
        diagram: diagram.metadata,
        document: diagram.document,
      });
    }

    if (context.request.method === "PATCH") {
      const body = await readJsonBody(context.request);
      const name = requireName(body);
      const diagram = await renameDiagram(context.env.DIAGRAMS, workspaceId, diagramId, name);

      if (!diagram) {
        throw new ApiError(404, "diagram_not_found", "Diagram not found");
      }

      return jsonResponse({ diagram });
    }

    if (context.request.method === "PUT") {
      const document = await readJsonBody(context.request);

      if (!isExcalidrawDocument(document)) {
        throw new ApiError(400, "invalid_document", "Body must be a valid Excalidraw document");
      }

      const diagram = await saveDiagram(
        context.env.DIAGRAMS,
        workspaceId,
        diagramId,
        document,
      );

      if (!diagram) {
        throw new ApiError(404, "diagram_not_found", "Diagram not found");
      }

      return jsonResponse({ diagram });
    }

    if (context.request.method === "DELETE") {
      const deleted = await deleteDiagram(context.env.DIAGRAMS, workspaceId, diagramId);

      if (!deleted) {
        throw new ApiError(404, "diagram_not_found", "Diagram not found");
      }

      return emptyResponse();
    }

    return methodNotAllowed(["GET", "PATCH", "PUT", "DELETE"]);
  } catch (error) {
    return errorResponse(error);
  }
};
