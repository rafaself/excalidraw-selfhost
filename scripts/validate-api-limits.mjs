import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.API_LIMITS_PORT ?? 8789);
const baseUrl = `http://127.0.0.1:${port}`;
const metadataLimit = 16 * 1024;
const documentLimit = 20 * 1024 * 1024;
const textEncoder = new TextEncoder();

let server;
let stateDirectory;
let output = "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function bodyWithPadding(prefix, suffix, targetBytes) {
  const paddingBytes = targetBytes - textEncoder.encode(prefix).byteLength - textEncoder.encode(suffix).byteLength;
  assert(paddingBytes >= 0, "Target body size is smaller than the JSON envelope");

  const body = `${prefix}${"x".repeat(paddingBytes)}${suffix}`;
  assert(textEncoder.encode(body).byteLength === targetBytes, "Generated body has the wrong byte length");
  return body;
}

function metadataBody(targetBytes) {
  return bodyWithPadding('{"name":"x","padding":"', '"}', targetBytes);
}

function documentBody(targetBytes) {
  return bodyWithPadding(
    '{"type":"excalidraw","version":2,"elements":[],"appState":{},"padding":"',
    '"}',
    targetBytes,
  );
}

function streamBody(body) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(textEncoder.encode(body));
      controller.close();
    },
  });
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
}

function errorCode(body) {
  return body?.error?.code;
}

function assertApiHeaders(response) {
  assert(response.headers.get("cache-control") === "no-store", "API responses must not be cached");
  assert(
    response.headers.get("x-content-type-options") === "nosniff",
    "API responses must disable MIME sniffing",
  );
}

async function expectError(path, expectedStatus, expectedCode, init) {
  const result = await request(path, init);
  assert(result.response.status === expectedStatus, `Expected ${expectedStatus}, got ${result.response.status}`);
  assert(errorCode(result.body) === expectedCode, `Expected ${expectedCode}, got ${errorCode(result.body)}`);
  assertApiHeaders(result.response);
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const result = await request("/api/workspaces");
      if (result.response.status === 200) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for Pages dev server.\n${output}`);
}

async function stopServer() {
  if (!server) return;

  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 2_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  stateDirectory = await mkdtemp(join(tmpdir(), "excalidraw-api-limits-"));
  server = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "pages",
      "dev",
      "dist",
      "--r2=DIAGRAMS",
      `--port=${port}`,
      `--persist-to=${stateDirectory}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitForServer();

  const jsonHeaders = { "content-type": "application/json" };
  const createdWorkspace = await request("/api/workspaces", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "request-limit-test" }),
  });
  assert(createdWorkspace.response.status === 201, "A valid workspace request should succeed");
  assertApiHeaders(createdWorkspace.response);

  const workspaceId = createdWorkspace.body?.workspace?.id;
  assert(typeof workspaceId === "string", "The workspace response should include an ID");

  await expectError("/api/workspaces", 415, "unsupported_media_type", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: '{"name":"wrong-media-type"}',
  });

  await expectError("/api/workspaces", 400, "invalid_json", {
    method: "POST",
    headers: jsonHeaders,
    body: '{"name":',
  });

  const exactMetadataBody = metadataBody(metadataLimit);
  const exactMetadata = await request("/api/workspaces", {
    method: "POST",
    headers: jsonHeaders,
    body: exactMetadataBody,
  });
  assert(exactMetadata.response.status === 201, "A metadata body at the limit should succeed");

  const oversizedMetadataBody = metadataBody(metadataLimit + 1);
  await expectError("/api/workspaces", 413, "payload_too_large", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      "content-length": String(textEncoder.encode(oversizedMetadataBody).byteLength),
    },
    body: oversizedMetadataBody,
  });

  await expectError("/api/workspaces", 413, "payload_too_large", {
    method: "POST",
    headers: jsonHeaders,
    body: streamBody(oversizedMetadataBody),
    duplex: "half",
  });

  const createdDiagram = await request(`/api/workspaces/${workspaceId}/diagrams`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "request-limit-document-test" }),
  });
  assert(createdDiagram.response.status === 201, "A valid diagram request should succeed");

  const diagramId = createdDiagram.body?.diagram?.id;
  assert(typeof diagramId === "string", "The diagram response should include an ID");

  const validDocument = await request(`/api/workspaces/${workspaceId}/diagrams/${diagramId}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: {},
      files: {},
    }),
  });
  assert(validDocument.response.status === 200, "A valid document inside the limit should succeed");
  assertApiHeaders(validDocument.response);

  const oversizedDocumentBody = documentBody(documentLimit + 1);
  await expectError(`/api/workspaces/${workspaceId}/diagrams/${diagramId}`, 413, "payload_too_large", {
    method: "PUT",
    headers: {
      ...jsonHeaders,
      "content-length": String(textEncoder.encode(oversizedDocumentBody).byteLength),
    },
    body: oversizedDocumentBody,
  });

  const deletedWorkspace = await request(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
  assert(deletedWorkspace.response.status === 204, "A valid workspace deletion should succeed");
  assertApiHeaders(deletedWorkspace.response);

  console.log("API request-size validation passed");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopServer();
  if (stateDirectory) {
    await rm(stateDirectory, { recursive: true, force: true });
  }
}
