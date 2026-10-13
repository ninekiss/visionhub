function createApplicationMenuTemplate(platform) {
  const isMac = platform === "darwin";
  const template = [];

  if (isMac) {
    template.push({
      label: "VisionHub",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services", submenu: [] },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push({
    label: "File",
    submenu: [
      { label: "Close Window", role: "close" },
      { type: "separator" },
      { label: "Quit VisionHub", role: "quit" },
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      { type: "separator" },
      { role: "selectAll" },
    ],
  });

  template.push({
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  template.push({
    label: "Window",
    submenu: isMac
      ? [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ]
      : [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "close" },
        ],
  });

  if (!isMac) {
    template.push({
      label: "Help",
      submenu: [
        { label: "About VisionHub", role: "about" },
      ],
    });
  }

  return template;
}

module.exports = { createApplicationMenuTemplate };
