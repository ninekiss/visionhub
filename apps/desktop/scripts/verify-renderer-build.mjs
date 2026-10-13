import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rendererRoot = resolve(scriptDirectory, "../renderer-dist");
const htmlPath = resolve(rendererRoot, "index.html");

async function main() {
  const html = await readFile(htmlPath, "utf8");
  const cssReferences = [...html.matchAll(/\bhref=["']([^"']+\.css(?:\?[^"']*)?)["']/gi)]
    .map((match) => match[1]);
  assert.ok(cssReferences.length > 0, "Desktop renderer index.html must reference a built CSS asset.");

  const loadedCss = [];
  for (const reference of cssReferences) {
    const assetUrl = new URL(reference, "visionhub://app/index.html");
    assert.equal(assetUrl.protocol, "visionhub:", "Built CSS references must use the renderer protocol.");
    assert.equal(assetUrl.hostname, "app", "Built CSS references must stay on the app origin.");
    const assetPath = resolve(rendererRoot, "." + decodeURIComponent(assetUrl.pathname));
    const relativePath = relative(rendererRoot, assetPath);
    assert.ok(
      relativePath && relativePath !== ".." && !relativePath.startsWith(".." + sep) && !isAbsolute(relativePath),
      "CSS reference must remain inside the renderer build directory.",
    );
    const info = await stat(assetPath);
    assert.ok(info.isFile(), "Built CSS asset must exist: " + reference);
    loadedCss.push(await readFile(assetPath, "utf8"));
  }

  const stylesheet = loadedCss.join("\n");
  assert.ok(stylesheet.includes(".plyr__controls"), "Plyr control-bar styles must be included in the desktop renderer CSS bundle.");
  assert.ok(stylesheet.includes(".plyr__control"), "Plyr button styles must be included in the desktop renderer CSS bundle.");
  assert.ok(stylesheet.includes(".plyr__progress__container"), "Plyr progress-bar styles must be included in the desktop renderer CSS bundle.");
  assert.ok(stylesheet.includes(".player-shell"), "VisionHub player layout styles must be included in the desktop renderer CSS bundle.");
  assert.ok(stylesheet.includes(".topbar"), "The public app stylesheet must be included in the desktop renderer CSS bundle.");
  console.log("Verified desktop renderer CSS bundle: Plyr, player layout, and public UI styles are present.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
