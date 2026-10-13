const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPackagedRendererCsp,
  createWebPreferences,
  getSafeExternalUrl,
  isTrustedRendererUrl,
  parseDevelopmentServerUrl,
} = require("../src/security.cjs");

test("development renderer URLs must use the local loopback HTTP server", () => {
  assert.equal(parseDevelopmentServerUrl("http://127.0.0.1:5174").origin, "http://127.0.0.1:5174");
  assert.equal(parseDevelopmentServerUrl("http://localhost:5174").origin, "http://localhost:5174");
  assert.equal(parseDevelopmentServerUrl("https://example.com"), null);
  assert.equal(parseDevelopmentServerUrl("http://example.com:5174"), null);
  assert.equal(parseDevelopmentServerUrl("file:///tmp/index.html"), null);
});

test("renderer navigation stays within development origin or packaged app origin", () => {
  const development = { developmentUrl: "http://127.0.0.1:5174", packagedUrl: "file:///app/index.html" };
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:5174/title/demo", development), true);
  assert.equal(isTrustedRendererUrl("http://localhost:5174/title/demo", development), false);
  assert.equal(isTrustedRendererUrl("https://example.com", development), false);

  const packaged = { packagedUrl: "file:///app/index.html" };
  assert.equal(isTrustedRendererUrl("file:///app/index.html", packaged), true);
  assert.equal(isTrustedRendererUrl("file:///app/other.html", packaged), false);
  assert.equal(isTrustedRendererUrl("https://example.com", packaged), false);

  const packagedProtocol = { packagedUrl: "visionhub://app/index.html" };
  assert.equal(isTrustedRendererUrl("visionhub://app/title/demo", packagedProtocol), true);
  assert.equal(isTrustedRendererUrl("visionhub://other/title/demo", packagedProtocol), false);
  assert.equal(isTrustedRendererUrl("visionhub://user:pass@app/title/demo", packagedProtocol), false);
  assert.equal(isTrustedRendererUrl("https://app/title/demo", packagedProtocol), false);
});

test("external links are restricted to credential-free HTTPS URLs", () => {
  assert.equal(getSafeExternalUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(getSafeExternalUrl("http://example.com"), null);
  assert.equal(getSafeExternalUrl("javascript:alert(1)"), null);
  assert.equal(getSafeExternalUrl("file:///etc/passwd"), null);
  assert.equal(getSafeExternalUrl("https://user:pass@example.com"), null);
});

test("BrowserWindow renderer defaults preserve the sandbox boundary", () => {
  assert.deepEqual(createWebPreferences("/app/preload.cjs"), {
    preload: "/app/preload.cjs",
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    webviewTag: true,
  });
});

test("packaged renderer CSP restricts executable content and allows required resource types", () => {
  const policy = createPackagedRendererCsp();
  assert.ok(policy.includes("default-src 'self'"));
  assert.ok(policy.includes("script-src 'self'"));
  assert.ok(policy.includes("object-src 'none'"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"));
  assert.ok(policy.includes("font-src 'self' data: https://fonts.gstatic.com"));
  assert.ok(policy.includes("img-src 'self' data: https:"));
  assert.ok(policy.includes("media-src 'self' blob: https:"));
  assert.ok(policy.includes("connect-src 'self' https://cdn.plyr.io"));
  assert.match(policy, /connect-src 'self'.*https:/, "HLS manifests and segments should load from HTTPS stream hosts.");
  assert.ok(!policy.includes("unsafe-eval"));
  assert.ok(!policy.includes("script-src *"));
});

test("packaged renderer CSP can allow only the configured HTTP(S) API origin", () => {
  assert.ok(createPackagedRendererCsp("https://api.example.test/api/v1")
    .includes("connect-src 'self' https://cdn.plyr.io https://api.example.test"));
  assert.ok(createPackagedRendererCsp("http://127.0.0.1:3001/api/v1")
    .includes("connect-src 'self' https://cdn.plyr.io http://127.0.0.1:3001"));
  assert.ok(!createPackagedRendererCsp("javascript:alert(1)").includes("alert"));
  assert.ok(!createPackagedRendererCsp("https://user:pass@example.test").includes("example.test"));
});

