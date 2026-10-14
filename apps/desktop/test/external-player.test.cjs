const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPlayerFullscreenScript,
  createPlayerIsolationScript,
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
  assert.throws(() => validateExternalPlayerBounds({ x: -1, y: 0, width: 1, height: 1 }), /accepted range/);
  assert.throws(() => validateExternalPlayerBounds({ x: 0, y: 0, width: NaN, height: 1 }), /finite numbers/);
});

test("player isolation logic is selector-based and does not evaluate metadata as code", () => {
  const script = createPlayerIsolationScript(".vp-player", ".vp-player video");
  assert.match(script, /document\.querySelector\("\.vp-player video"\)/);
  assert.match(script, /setProperty\("display", "none", "important"\)/);
  assert.doesNotMatch(script, /eval\(|Function\(/);
});

test("player isolation waits until a native video has current frame data", () => {
  const script = createPlayerIsolationScript(".vp-player", ".vp-player video");
  assert.ok(script.includes("video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA"));
  assert.ok(script.includes("video.videoWidth <= 0"));
  assert.ok(script.includes("video.videoHeight <= 0"));
});

test("fullscreen script sizes the actual fullscreen element and restores styles on exit", () => {
  const enterScript = createPlayerFullscreenScript(".vp-player", true);
  const leaveScript = createPlayerFullscreenScript(".vp-player", false);
  assert.ok(enterScript.includes("document.fullscreenElement"));
  assert.match(enterScript, /object-fit/);
  assert.match(enterScript, /100vh/);
  assert.match(leaveScript, /__VisionHubFullscreenStyleSnapshots/);
  assert.match(leaveScript, /removeProperty/);
});
