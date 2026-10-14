const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  canShowExternalPlayer,
  createPlayerIsolationScript,
  discoverUnpackedExtensions,
  isValidExternalPlayerRequestId,
  providerOriginAllowed,
  resolveProviderUrl,
  validateExternalPlayerBounds,
} = require("../src/external-player.cjs");

const provider = {
  id: "demo",
  urlTemplate: "https://player.example.test/watch/{contentId}",
  allowedOrigins: ["https://player.example.test", "https://embed.example.test"],
  playerSelector: ".video-player",
  readinessSelector: ".video-player video",
  timeoutMs: 15000,
};

test("validates external-player correlation IDs without rejecting short valid IDs", () => {
  assert.equal(isValidExternalPlayerRequestId("0:"), true);
  assert.equal(isValidExternalPlayerRequestId("0:3bf69fc0-2d77-4f19-8d57-ecdfcc0f2a99"), true);
  assert.equal(isValidExternalPlayerRequestId("invalid request id"), false);
  assert.equal(isValidExternalPlayerRequestId("x".repeat(161)), false);
  assert.equal(isValidExternalPlayerRequestId(null), false);
});

test("resolves content IDs through a configured HTTPS template and encodes the ID", () => {
  assert.equal(resolveProviderUrl(provider, "film / 123"), "https://player.example.test/watch/film%20%2F%20123");
  assert.throws(() => resolveProviderUrl(provider, ""), /content ID/);
  assert.throws(() => resolveProviderUrl({ ...provider, urlTemplate: "javascript:alert(1)" }, "1"), /HTTPS allowlist/);
  assert.throws(() => resolveProviderUrl({ ...provider, urlTemplate: "https://outside.example/watch/{contentId}" }, "1"), /HTTPS allowlist/);
  assert.throws(() => resolveProviderUrl({ ...provider, urlTemplate: "https://user:pass@player.example.test/watch/{contentId}" }, "1"), /HTTPS allowlist/);
});

test("external navigation is limited to exact configured HTTPS origins", () => {
  assert.equal(providerOriginAllowed("https://embed.example.test/page", provider), true);
  assert.equal(providerOriginAllowed("http://player.example.test/page", provider), false);
  assert.equal(providerOriginAllowed("https://player.example.test.evil.test/page", provider), false);
  assert.equal(providerOriginAllowed("https://user:pass@player.example.test/page", provider), false);
  assert.equal(providerOriginAllowed("javascript:alert(1)", provider), false);
});

test("bounds reject malformed and absurd coordinates and preserve explicit visibility", () => {
  assert.deepEqual(validateExternalPlayerBounds({ x: 1.4, y: 2, width: 500.4, height: 280 }), {
    x: 1, y: 2, width: 500, height: 280, visible: true,
  });
  assert.deepEqual(validateExternalPlayerBounds({ x: 0, y: 0, width: 1, height: 1, visible: false }), {
    x: 0, y: 0, width: 1, height: 1, visible: false,
  });
  assert.deepEqual(validateExternalPlayerBounds({ x: -120, y: -40, width: 500, height: 280 }), {
    x: -120, y: -40, width: 500, height: 280, visible: true,
  });
  assert.throws(() => validateExternalPlayerBounds({ x: -20001, y: 0, width: 1, height: 1 }), /accepted range/);
  assert.throws(() => validateExternalPlayerBounds({ x: 0, y: 0, width: NaN, height: 1 }), /finite numbers/);
});

test("player isolation logic is selector-based and does not evaluate metadata as code", () => {
  const script = createPlayerIsolationScript(".vp-player", ".vp-player video");
  assert.match(script, /document\.querySelector\("\.vp-player video"\)/);
  assert.match(script, /setProperty\("display", "none", "important"\)/);
  assert.doesNotMatch(script, /eval\(|Function\(/);
});

test("native player remains hidden through loading, resize, and fullscreen until ready", () => {
  assert.equal(canShowExternalPlayer({ ready: false, visible: true, htmlFullscreen: false }), false);
  assert.equal(canShowExternalPlayer({ ready: false, visible: true, htmlFullscreen: true }), false);
  assert.equal(canShowExternalPlayer({ ready: true, visible: false, htmlFullscreen: false }), false);
  assert.equal(canShowExternalPlayer({ ready: true, visible: false, htmlFullscreen: true }), true);
  assert.equal(canShowExternalPlayer({ ready: true, visible: true, htmlFullscreen: false }), true);
});

test("player isolation waits until a native video has current frame data", () => {
  const script = createPlayerIsolationScript(".vp-player", ".vp-player video");
  assert.ok(script.includes("video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA"));
  assert.ok(script.includes("video.videoWidth <= 0"));
  assert.ok(script.includes("video.videoHeight <= 0"));
  assert.ok(script.includes("getBoundingClientRect()"));
  assert.ok(script.includes("window.getComputedStyle(element)"));
  assert.ok(script.includes("style.display === \"none\""));
});

test("discovers unpacked extensions and Chrome profile version folders", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "visionhub-extensions-"));
  const directExtension = path.join(root, "translation-extension");
  const profileExtension = path.join(root, "chrome-profile", "sample-extension-id", "1.2.3_0");
  try {
    await mkdir(directExtension, { recursive: true });
    await mkdir(profileExtension, { recursive: true });
    await writeFile(path.join(directExtension, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      name: "Translation extension",
      version: "1.0.0",
    }));
    await writeFile(path.join(profileExtension, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      name: "Sample extension",
      version: "1.2.3",
    }));

    assert.deepEqual(
      await discoverUnpackedExtensions(root),
      [directExtension, profileExtension].sort((left, right) => left.localeCompare(right)),
    );
    assert.deepEqual(await discoverUnpackedExtensions(directExtension), [directExtension]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a missing configured extension directory", async () => {
  await assert.rejects(
    discoverUnpackedExtensions(path.join(tmpdir(), "visionhub-extension-folder-that-does-not-exist")),
    /does not exist or is not accessible/,
  );
});

test("external-player browser extensions use an isolated persistent session", () => {
  const { readFileSync } = require("node:fs");
  const mainSource = readFileSync(require.resolve("../src/main.cjs"), "utf8");
  assert.match(mainSource, /electronSession\.fromPartition\(EXTERNAL_PLAYER_PARTITION\)/);
  assert.match(mainSource, /externalPlayerElectronSession\.extensions\.loadExtension\(/);
  assert.match(mainSource, /session: externalPlayerElectronSession/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.match(mainSource, /contextIsolation: true/);
  assert.match(mainSource, /sandbox: true/);
});

test("desktop player setup does not call unsupported WebContents background APIs", () => {
  const { readFileSync } = require("node:fs");
  const mainSource = readFileSync(require.resolve("../src/main.cjs"), "utf8");
  assert.doesNotMatch(mainSource, /view\.webContents\.setBackgroundColor\s*\(/);
});
