const test = require("node:test");
const assert = require("node:assert/strict");
const { createApplicationMenuTemplate } = require("../src/application-menu.cjs");

function rolesFor(menu) {
  return menu.flatMap((item) => Array.isArray(item.submenu)
    ? item.submenu.map((entry) => entry.role).filter(Boolean)
    : []);
}

test("macOS menu includes the application menu and native hide/quit/window roles", () => {
  const menu = createApplicationMenuTemplate("darwin");
  assert.deepEqual(menu.map((item) => item.label), ["VisionHub", "File", "Edit", "View", "Window"]);
  const appRoles = rolesFor([menu[0]]);
  assert.ok(appRoles.includes("about"));
  assert.ok(appRoles.includes("hide"));
  assert.ok(appRoles.includes("hideOthers"));
  assert.ok(appRoles.includes("unhide"));
  assert.ok(appRoles.includes("quit"));
  assert.ok(rolesFor([menu[4]]).includes("minimize"));
});

test("all platform menus preserve common edit shortcuts and view zoom actions", () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    const menu = createApplicationMenuTemplate(platform);
    const edit = menu.find((item) => item.label === "Edit");
    const view = menu.find((item) => item.label === "View");
    assert.ok(rolesFor([edit]).includes("undo"));
    assert.ok(rolesFor([edit]).includes("copy"));
    assert.ok(rolesFor([edit]).includes("paste"));
    assert.ok(rolesFor([edit]).includes("selectAll"));
    assert.ok(rolesFor([view]).includes("zoomIn"));
    assert.ok(rolesFor([view]).includes("zoomOut"));
    assert.ok(rolesFor([view]).includes("resetZoom"));
    assert.ok(rolesFor([view]).includes("togglefullscreen"));
  }
});

test("Windows and Linux menus provide explicit close, quit, and help entries", () => {
  for (const platform of ["win32", "linux"]) {
    const menu = createApplicationMenuTemplate(platform);
    assert.ok(menu.some((item) => item.label === "Help"));
    assert.ok(rolesFor([menu.find((item) => item.label === "File")]).includes("quit"));
    assert.ok(rolesFor([menu.find((item) => item.label === "File")]).includes("close"));
  }
});
