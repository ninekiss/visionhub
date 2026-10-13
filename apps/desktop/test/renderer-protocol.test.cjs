const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
  createPackagedRendererHandler,
  isApiRequestUrl,
  resolveApiProxyUrl,
  resolveRendererAssetPath,
} = require("../src/renderer-protocol.cjs");

async function createRendererFixture() {
  const root = await mkdtemp(join(tmpdir(), "visionhub-renderer-"));
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><html><head></head><body>VisionHub</body></html>");
  await writeFile(join(root, "assets", "app.js"), "console.log('renderer');");
  await writeFile(join(root, "assets", "player.css"), ".plyr { color: #c7f36b; } .player-shell { aspect-ratio: 16 / 9; }");
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
    assert.match(html.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(html.headers.get("content-security-policy"), /connect-src[^;]*https:/, "Packaged HLS requests must reach HTTPS stream hosts.");
    assert.equal(await html.text(), "<!doctype html><html><head></head><body>VisionHub</body></html>");

    const asset = await handler({ url: "visionhub://app/assets/app.js", method: "GET" });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /text\/javascript/);
    assert.equal(await asset.text(), "console.log('renderer');");
    assert.equal(asset.headers.get("content-security-policy"), null);

    const css = await handler({ url: "visionhub://app/assets/player.css", method: "GET" });
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /text\/css/);
    assert.ok((await css.text()).includes(".plyr"));
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

test("API proxy maps the renderer's same-origin API path to the configured API base", () => {
  assert.equal(isApiRequestUrl("visionhub://app/api/v1/catalog?page=2"), true);
  assert.equal(isApiRequestUrl("visionhub://app/api/v1"), true);
  assert.equal(isApiRequestUrl("visionhub://app/api/v10/catalog"), false);
  assert.deepEqual(
    resolveApiProxyUrl("http://127.0.0.1:3001/api/v1", "visionhub://app/api/v1/catalog?q=space&page=2"),
    { url: "http://127.0.0.1:3001/api/v1/catalog?q=space&page=2" },
  );
  assert.deepEqual(
    resolveApiProxyUrl("https://api.example.test/custom/v1/", "visionhub://app/api/v1/catalog"),
    { url: "https://api.example.test/custom/v1/catalog" },
  );
  assert.equal(resolveApiProxyUrl("http://user:pass@example.test/api/v1", "visionhub://app/api/v1/catalog").error, 503);
});

test("API proxy forwards request method, body and safe headers while removing renderer Origin", async () => {
  const root = await createRendererFixture();
  let observed = null;
  try {
    const handler = createPackagedRendererHandler({
      rendererRoot: root,
      apiBaseUrl: "http://127.0.0.1:3001/api/v1",
      fetchImpl: async (url, init) => {
        observed = {
          url,
          method: init.method,
          body: init.body ? Buffer.from(init.body).toString("utf8") : null,
          origin: init.headers.get("origin"),
          cookie: init.headers.get("cookie"),
          contentType: init.headers.get("content-type"),
        };
        return new Response(JSON.stringify({ data: { accepted: true } }), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Encoding": "identity",
            "X-Request-Id": "request-123",
          },
        });
      },
    });
    const response = await handler({
      url: "visionhub://app/api/v1/admin/items?id=7",
      method: "POST",
      headers: new Headers({
        origin: "visionhub://app",
        cookie: "visionhub.admin-session=sample",
        "content-type": "application/json",
        "content-length": "12",
        host: "app",
      }),
      arrayBuffer: async () => Buffer.from('{"ok":true}'),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /accepted/);
    assert.deepEqual(observed, {
      url: "http://127.0.0.1:3001/api/v1/admin/items?id=7",
      method: "POST",
      body: '{"ok":true}',
      origin: null,
      cookie: "visionhub.admin-session=sample",
      contentType: "application/json",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("API proxy returns explicit unavailable and gateway errors without exposing upstream details", async () => {
  const root = await createRendererFixture();
  try {
    const noConfig = createPackagedRendererHandler({ rendererRoot: root });
    const missingConfig = await noConfig({
      url: "visionhub://app/api/v1/catalog",
      method: "GET",
      headers: new Headers(),
    });
    assert.equal(missingConfig.status, 503);

    const unavailable = createPackagedRendererHandler({
      rendererRoot: root,
      apiBaseUrl: "http://127.0.0.1:3001/api/v1",
      fetchImpl: async () => { throw new Error("secret internal network detail"); },
    });
    const response = await unavailable({
      url: "visionhub://app/api/v1/catalog",
      method: "GET",
      headers: new Headers(),
    });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret internal network detail/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
