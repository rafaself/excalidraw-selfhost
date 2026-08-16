import { copyFile, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const remoteConfigPath = join(projectRoot, "wrangler.remote.jsonc");

function parseJsonc(source) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      index -= 1;
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 1;
      continue;
    }

    if (character === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(source[nextIndex] ?? "")) {
        nextIndex += 1;
      }

      if (source[nextIndex] === "}" || source[nextIndex] === "]") {
        index = nextIndex - 1;
        continue;
      }
    }

    output += character;
  }

  return JSON.parse(output);
}

async function readRemoteConfig() {
  let source;

  try {
    source = await readFile(remoteConfigPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "Missing wrangler.remote.jsonc. Copy wrangler.remote.jsonc.example and set a development bucket name.",
      );
    }
    throw error;
  }

  let config;
  try {
    config = parseJsonc(source);
  } catch {
    throw new Error("wrangler.remote.jsonc is not valid JSONC.");
  }

  const bindings = Array.isArray(config?.r2_buckets) ? config.r2_buckets : [];
  const diagramsBindings = bindings.filter((binding) => binding?.binding === "DIAGRAMS");

  if (diagramsBindings.length !== 1) {
    throw new Error("wrangler.remote.jsonc must define exactly one r2_buckets binding named DIAGRAMS.");
  }

  const [diagrams] = diagramsBindings;
  if (
    typeof diagrams.bucket_name !== "string" ||
    diagrams.bucket_name.trim() === "" ||
    diagrams.bucket_name === "replace-with-development-r2-bucket"
  ) {
    throw new Error(
      "wrangler.remote.jsonc must set DIAGRAMS.bucket_name to a real development bucket name.",
    );
  }

  if (diagrams.remote !== true) {
    throw new Error("wrangler.remote.jsonc must set remote: true for the DIAGRAMS binding.");
  }

  return config;
}

function run(command, args, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });

    child.once("error", (error) => {
      console.error(error.message);
      resolvePromise(1);
    });
    child.once("exit", (code, signal) => {
      resolvePromise(signal ? 1 : code ?? 1);
    });
  });
}

try {
  await readRemoteConfig();
} catch (error) {
  console.error(`dev:remote: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const buildExitCode = await run("pnpm", ["run", "build"], projectRoot);
if (buildExitCode !== 0) {
  process.exitCode = buildExitCode;
} else {
  const runtimeDirectory = await mkdtemp(join(tmpdir(), "excalidraw-selfhost-remote-"));

  try {
    await copyFile(remoteConfigPath, join(runtimeDirectory, "wrangler.jsonc"));
    await symlink(join(projectRoot, "dist"), join(runtimeDirectory, "dist"), "dir");
    await symlink(join(projectRoot, "functions"), join(runtimeDirectory, "functions"), "dir");

    process.exitCode = await run(
      join(projectRoot, "node_modules", ".bin", "wrangler"),
      ["pages", "dev", "dist"],
      runtimeDirectory,
    );
  } finally {
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
}
