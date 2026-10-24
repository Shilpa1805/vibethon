"use strict";
(() => {
  // src/code.ts
  figma.showUI(__html__, { width: 380, height: 640, themeColors: true });
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "GET_SELECTION_COUNT": {
        const count = figma.currentPage.selection.length;
        figma.ui.postMessage({
          type: "SELECTION_COUNT",
          count,
          pageName: figma.currentPage.name
        });
        break;
      }
      case "NOTIFY": {
        if (typeof msg.message === "string") {
          figma.notify(msg.message, { timeout: msg.timeout || 3e3 });
        }
        break;
      }
      default:
        console.log("Unhandled message in main thread:", msg.type);
    }
  };
})();
