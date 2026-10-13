const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");
const { createPackagedRendererCsp } = require("./security.cjs");

const API_ROUTE_PREFIX = "/api/v1";
const API_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const REQUEST_HEADERS_TO_DROP = new Set([
  "accept-encoding", "connection", "content-length", "host", "keep-alive",
  "origin", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "referer", "te", "trailer", "transfer-encoding", "upgrade",
]);
const RESPONSE_HEADERS_TO_DROP = new Set([
  "connection", "content-encoding", "content-length", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "proxy-connection", "te",
  "trailer", "transfer-encoding", "upgrade",
]);

const CONTENT_TYPES = Object.freeze({
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".vtt": "text/vtt; charset=utf-8",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function parseRequestUrl(requestUrl) {
  try {
    const url = new URL(requestUrl);
    if (
      url.protocol !== "visionhub:" ||
      url.hostname !== "app" ||
      url.username ||
      url.password ||
      url.port
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function isApiRequestUrl(requestUrl) {
  const url = parseRequestUrl(requestUrl);
  return Boolean(
    url &&
    (url.pathname === API_ROUTE_PREFIX || url.pathname.startsWith(API_ROUTE_PREFIX + "/")),
  );
}

function resolveApiProxyUrl(apiBaseUrl, requestUrl) {
  const request = parseRequestUrl(requestUrl);
  if (
    !request ||
    !(request.pathname === API_ROUTE_PREFIX || request.pathname.startsWith(API_ROUTE_PREFIX + "/"))
  ) return { error: 404 };

  let base;
  try {
    base = new URL(apiBaseUrl);
  } catch {
    return { error: 503 };
  }
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) return { error: 503 };

  const suffix = request.pathname.slice(API_ROUTE_PREFIX.length);
  let decodedSuffix;
  try {
    decodedSuffix = suffix.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    return { error: 400 };
  }
  if (decodedSuffix.some((segment) =>
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  )) return { error: 400 };

  const basePath = base.pathname.replace(/\/+$/, "");
  base.pathname = basePath + suffix;
  base.search = request.search;
  base.hash = "";
  return { url: base.href };
}

function filterHeaders(source, excluded) {
  const headers = new Headers();
  source.forEach((value, name) => {
    if (!excluded.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") {
      headers.append(name, value);
    }
  });
  if (typeof source.getSetCookie === "function") {
    for (const value of source.getSetCookie()) headers.append("set-cookie", value);
  } else {
    const cookie = source.get("set-cookie");
    if (cookie) headers.set("set-cookie", cookie);
  }
  return headers;
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

async function proxyApiRequest(request, options) {
  if (!API_METHODS.has(request.method)) {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        Allow: [...API_METHODS].join(", "),
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const resolved = resolveApiProxyUrl(options.apiBaseUrl, request.url);
  if (resolved.error === 404) return textResponse("Not found", 404);
  if (resolved.error === 400) return textResponse("Invalid API path", 400);
  if (resolved.error === 503) return textResponse("Desktop API endpoint is not configured correctly", 503);

  const headers = filterHeaders(request.headers || new Headers(), REQUEST_HEADERS_TO_DROP);
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  let upstream;
  try {
    upstream = await (options.fetchImpl || globalThis.fetch)(resolved.url, init);
  } catch {
    return textResponse("Unable to reach the configured VisionHub API endpoint", 502);
  }

  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    return textResponse("The configured VisionHub API endpoint returned an unexpected redirect", 502);
  }

  const responseHeaders = filterHeaders(upstream.headers, RESPONSE_HEADERS_TO_DROP);
  const body = request.method === "HEAD" || [204, 205, 304].includes(upstream.status)
    ? null
    : upstream.body;
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function resolveRendererAssetPath(rendererRoot, requestUrl) {
  const url = parseRequestUrl(requestUrl);
  if (!url) return { error: 404 };

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
  ) return { error: 400 };

  return { filePath, pathname: requestPath };
}

function createPackagedRendererHandler(options) {
  const rendererRoot = path.resolve(options.rendererRoot);
  const csp = createPackagedRendererCsp();
  const indexPath = path.join(rendererRoot, "index.html");

  return async function handlePackagedRendererRequest(request) {
    if (isApiRequestUrl(request.url)) return proxyApiRequest(request, options);

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
  isApiRequestUrl,
  resolveApiProxyUrl,
  resolveRendererAssetPath,
};
