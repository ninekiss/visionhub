const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");
const { createPackagedRendererCsp } = require("./security.cjs");

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function resolveRendererAssetPath(rendererRoot, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return { error: 400 };
  }

  if (
    url.protocol !== "visionhub:" ||
    url.hostname !== "app" ||
    url.username ||
    url.password ||
    url.port
  ) {
    return { error: 404 };
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { error: 400 };
  }
  if (!pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0")) {
    return { error: 400 };
  }

  const root = path.resolve(rendererRoot);
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, "." + requestPath);
  const relative = path.relative(root, filePath);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    return { error: 400 };
  }

  return { filePath, pathname: requestPath };
}

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function createPackagedRendererHandler(options) {
  const rendererRoot = path.resolve(options.rendererRoot);
  const csp = createPackagedRendererCsp(options.apiBaseUrl);
  const indexPath = path.join(rendererRoot, "index.html");

  return async function handlePackagedRendererRequest(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: {
          Allow: "GET, HEAD",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const resolved = resolveRendererAssetPath(rendererRoot, request.url);
    if (resolved.error) return textResponse("Not found", resolved.error);

    let filePath = resolved.filePath;
    let fileInfo;
    try {
      fileInfo = await stat(filePath);
    } catch {
      // Extensionless paths are client-side routes; serve the SPA entry point on refresh.
      if (path.extname(resolved.pathname)) return textResponse("Not found", 404);
      filePath = indexPath;
      try {
        fileInfo = await stat(filePath);
      } catch {
        return textResponse("Renderer build not found", 404);
      }
    }

    if (!fileInfo.isFile()) return textResponse("Not found", 404);

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    };
    if (extension === ".html") headers["Content-Security-Policy"] = csp;

    try {
      const body = request.method === "HEAD" ? null : await readFile(filePath);
      return new Response(body, { status: 200, headers });
    } catch {
      return textResponse("Unable to read renderer resource", 500);
    }
  };
}

module.exports = {
  createPackagedRendererHandler,
  resolveRendererAssetPath,
};
