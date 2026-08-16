import { MAX_NAME_LENGTH, isRecord, isUuidV4 } from "./domain";

export const MAX_METADATA_BODY_BYTES = 16 * 1024;
export const MAX_DOCUMENT_BODY_BYTES = 20 * 1024 * 1024;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  additionalHeaders?: HeadersInit,
): Response {
  const headers = apiHeaders(additionalHeaders);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), { status, headers });
}

export function emptyResponse(status = 204): Response {
  return new Response(null, {
    status,
    headers: apiHeaders(),
  });
}

function apiHeaders(additionalHeaders?: HeadersInit): Headers {
  const headers = new Headers(additionalHeaders);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export function methodNotAllowed(allowedMethods: string[]): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message: "Method not allowed",
      },
    },
    405,
    { allow: allowedMethods.join(", ") },
  );
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      error.status,
    );
  }

  console.error("Unhandled API error", error);
  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "Internal server error",
      },
    },
    500,
  );
}

export async function readJsonBody(
  request: Request,
  options: { maxBytes: number },
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Expected application/json");
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength);

    if (
      Number.isSafeInteger(parsedContentLength) &&
      parsedContentLength >= 0 &&
      parsedContentLength > options.maxBytes
    ) {
      throw new ApiError(413, "payload_too_large", "Request body is too large");
    }
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new ApiError(400, "invalid_json", "Request body must contain valid JSON");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > options.maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size rejection must remain deterministic even if cancellation fails.
        }

        throw new ApiError(413, "payload_too_large", "Request body is too large");
      }

      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body));
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(400, "invalid_json", "Request body must contain valid JSON");
  }
}

export function requireName(body: unknown): string {
  if (!isRecord(body) || typeof body.name !== "string") {
    throw new ApiError(400, "invalid_name", "A name is required");
  }

  const name = body.name.trim();

  if (name.length === 0) {
    throw new ApiError(400, "invalid_name", "Name cannot be empty");
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new ApiError(
      400,
      "invalid_name",
      `Name cannot exceed ${MAX_NAME_LENGTH} characters`,
    );
  }

  return name;
}

export function requireId(value: unknown, label: string): string {
  if (!isUuidV4(value)) {
    throw new ApiError(400, "invalid_id", `${label} must be a valid UUID`);
  }

  return value;
}
