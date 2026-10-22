const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canShowExternalPlayer,
  createPlayerIsolationScript,
  createSubframePlayerBridgeScript,
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

test("desktop player setup does not call unsupported WebContents background APIs", () => {
  const { readFileSync } = require("node:fs");
  const mainSource = readFileSync(require.resolve("../src/main.cjs"), "utf8");
  assert.doesNotMatch(mainSource, /view\.webContents\.setBackgroundColor\s*\(/);
});

test("external source WebContentsView uses a restricted focus-guard preload", () => {
  const { readFileSync } = require("node:fs");
  const mainSource = readFileSync(require.resolve("../src/main.cjs"), "utf8");
  const preloadSource = readFileSync(require.resolve("../src/external-player-preload.cjs"), "utf8");
  const packageSource = JSON.parse(readFileSync(require.resolve("../package.json"), "utf8"));

  assert.ok(mainSource.includes('preload: path.join(__dirname, "external-player-preload.cjs")'));
  assert.match(mainSource, /sandbox: true/);
  assert.match(mainSource, /nodeIntegration: false/);
  assert.ok(preloadSource.includes("HTMLMediaElement.prototype"));
  assert.ok(preloadSource.includes("shouldSuppressPause"));
  assert.ok(preloadSource.includes("manualPauseUntil"));
  assert.ok(preloadSource.includes("RETRY_DELAYS"));
  assert.doesNotMatch(preloadSource, /contextBridge\.exposeInMainWorld/);
  assert.ok(preloadSource.includes('ipcRenderer.on("external-player:initialize"'));
  assert.ok(preloadSource.includes('ipcRenderer.send("external-player:progress"'));
  assert.ok(preloadSource.includes("configuredReadinessSelector"));
  assert.ok(preloadSource.includes("restoreSeekConfirmed"));
  assert.ok(preloadSource.includes("seekVideoInPageWorld"));
  assert.ok(preloadSource.includes("func: seekVideoInPageWorld"));
  assert.ok(preloadSource.includes("restoreSeekPending"));
  assert.ok(preloadSource.includes("RESTORE_CONFIRMATION_MS = 1000"));
  assert.ok(preloadSource.includes("video.plyr"));
  assert.ok(mainSource.includes("playerSelector: session.provider.playerSelector"));
  assert.ok(mainSource.includes("readinessSelector: session.provider.readinessSelector || session.provider.playerSelector"));
  const readinessBlock = mainSource.slice(
    mainSource.indexOf("function startExternalPlayerReadinessCheck"),
    mainSource.indexOf("async function loadExternalPlaybackProviders"),
  );
  assert.ok(readinessBlock.indexOf('view.webContents.send("external-player:initialize"') >
    readinessBlock.indexOf("Date.now() - session.readySince < 2500"));
  const loadFinishedBlock = mainSource.slice(
    mainSource.indexOf('view.webContents.on("did-finish-load"'),
    mainSource.indexOf('view.webContents.on("enter-html-full-screen"'),
  );
  assert.doesNotMatch(loadFinishedBlock, /external-player:initialize/);
  assert.ok(mainSource.includes('event.sender !== session.view.webContents'));
  assert.ok(mainSource.includes('payload.requestId !== session.requestId'));
  assert.ok(packageSource.scripts.build.includes("node --check src/external-player-preload.cjs"));
});


test("builds a DOM-only subframe resume bridge for allowlisted source origins", () => {
  const script = createSubframePlayerBridgeScript({
    requestId: "resume:frame-test",
    token: "per-session-token",
    initialTime: 324,
    restoreTimeoutMs: 60000,
    playerSelector: ".player-container",
    readinessSelector: ".player-container video",
  });

  assert.match(script, /window === window\.top/);
  assert.match(script, /video\.currentTime = restoreTarget/);
  assert.match(script, /video\.addEventListener\("seeked"/);
  assert.match(script, /window\.top\.postMessage/);
  assert.match(script, /visionhub-desktop-source-frame-v1/);
  assert.doesNotMatch(script, /require\(|ipcRenderer|contextBridge/);
  assert.throws(() => createSubframePlayerBridgeScript({
    requestId: "invalid id with spaces",
    token: "token",
    initialTime: 10,
    playerSelector: ".player",
  }), /session identifiers/);

  // The generated source must parse independently before Electron evaluates it in the frame.
  assert.doesNotThrow(() => new Function(script));
});

test("only instruments configured HTTPS frames and validates subframe progress", () => {
  const { readFileSync } = require("node:fs");
  const mainSource = readFileSync(require.resolve("../src/main.cjs"), "utf8");
  const preloadSource = readFileSync(require.resolve("../src/external-player-preload.cjs"), "utf8");

  assert.ok(mainSource.includes("webFrameMain.fromId(processId, routingId)"));
  assert.ok(mainSource.includes("frame.executeJavaScript(script)"));
  assert.ok(mainSource.includes("framesInSubtree"));
  assert.ok(mainSource.includes("providerOriginAllowed(frame.url, session.provider)"));
  assert.ok(mainSource.includes("progressToken: randomUUID()"));
  assert.ok(preloadSource.includes("message.token !== frameBridgeToken"));
  assert.ok(preloadSource.includes("!allowedFrameOrigins.includes(event.origin)"));
  assert.ok(preloadSource.includes('window.addEventListener("message", handleSubframeProgressMessage, true)'));
  assert.ok(preloadSource.includes("message.requestId !== externalPlayerRequestId"));
});
