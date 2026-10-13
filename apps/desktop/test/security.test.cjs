const test = require("node:test");
const assert = require("node:assert/strict");
const {
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

test("renderer navigation stays within the development origin or exact packaged file", () => {
  const development = { developmentUrl: "http://127.0.0.1:5174", packagedUrl: "file:///app/index.html" };
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:5174/title/demo", development), true);
  assert.equal(isTrustedRendererUrl("http://localhost:5174/title/demo", development), false);
  assert.equal(isTrustedRendererUrl("https://example.com", development), false);

  const packaged = { packagedUrl: "file:///app/index.html" };
  assert.equal(isTrustedRendererUrl("file:///app/index.html", packaged), true);
  assert.equal(isTrustedRendererUrl("file:///app/other.html", packaged), false);
  assert.equal(isTrustedRendererUrl("https://example.com", packaged), false);
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
    webviewTag: false,
  });
});
