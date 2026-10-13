const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createPackagedRendererHandler, resolveRendererAssetPath } = require("../src/renderer-protocol.cjs");

async function createRendererFixture() {
  const root = await mkdtemp(join(tmpdir(), "visionhub-renderer-"));
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><html><head></head><body>VisionHub</body></html>");
  await writeFile(join(root, "assets", "app.js"), "console.log('renderer');");
  return root;
}

test("packaged protocol serves HTML with CSP and static assets with explicit MIME types", async () => {
  const root = await createRendererFixture();
  try {
    const handler = createPackagedRendererHandler({
      rendererRoot: root,
      apiBaseUrl: "https://api.example.test/api/v1",
    });

    const html = await handler({ url: "visionhub://app/index.html", method: "GET" });
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /text\/html/);
    assert.match(html.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(html.headers.get("content-security-policy"), /connect-src 'self' https:\/\/api\.example\.test/);
    assert.equal(await html.text(), "<!doctype html><html><head></head><body>VisionHub</body></html>");

    const asset = await handler({ url: "visionhub://app/assets/app.js", method: "GET" });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /text\/javascript/);
    assert.equal(await asset.text(), "console.log('renderer');");
    assert.equal(asset.headers.get("content-security-policy"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extensionless deep links serve the SPA document with CSP on refresh", async () => {
  const root = await createRendererFixture();
  try {
    const handler = createPackagedRendererHandler({ rendererRoot: root });
    const response = await handler({ url: "visionhub://app/title/demo", method: "GET" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(await response.text(), /VisionHub/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packaged protocol rejects other hosts, path traversal, unsupported methods and malformed paths", async () => {
  const root = await createRendererFixture();
  try {
    const handler = createPackagedRendererHandler({ rendererRoot: root });
    assert.equal((await handler({ url: "visionhub://other/index.html", method: "GET" })).status, 404);
    assert.equal((await handler({ url: "visionhub://app/%2e%2e%2Fsecret.txt", method: "GET" })).status, 400);
    assert.equal((await handler({ url: "visionhub://app/index.html", method: "POST" })).status, 405);
    assert.equal(resolveRendererAssetPath(root, "https://example.test/index.html").error, 404);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HEAD requests return headers without a body", async () => {
  const root = await createRendererFixture();
  try {
    const handler = createPackagedRendererHandler({ rendererRoot: root });
    const response = await handler({ url: "visionhub://app/index.html", method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
    assert.ok(response.headers.get("content-security-policy"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
