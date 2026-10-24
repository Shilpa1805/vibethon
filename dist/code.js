"use strict";
(() => {
  // src/adapters/figma/extract.ts
  var MAX_NODE_CAP = 5e3;
  async function extractDesignFacts(rootNode) {
    const nodes = [];
    let truncated = false;
    if ("loadAsync" in rootNode && typeof rootNode.loadAsync === "function") {
      try {
        await rootNode.loadAsync();
      } catch (e) {
        console.warn("Page loadAsync skipped or failed:", e);
      }
    }
    function extractSolidColor(fills) {
      if (!fills || fills === figma.mixed || !Array.isArray(fills)) {
        return null;
      }
      for (const paint of fills) {
        if (paint.type === "SOLID" && paint.visible !== false && paint.opacity !== 0) {
          return {
            r: paint.color.r,
            g: paint.color.g,
            b: paint.color.b
          };
        }
      }
      return null;
    }
    function getHslHue(rgb) {
      if (!rgb) return null;
      const r = rgb.r, g = rgb.g, b = rgb.b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d < 1e-3) return null;
      let h = 0;
      if (max === r) {
        h = (g - b) / d % 6;
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h = Math.round(h * 60);
      if (h < 0) h += 360;
      return h;
    }
    function determineType(node) {
      switch (node.type) {
        case "FRAME":
        case "COMPONENT":
        case "INSTANCE":
          return "FRAME";
        case "TEXT":
          return "TEXT";
        case "GROUP":
          return "GROUP";
        case "RECTANGLE":
        case "ELLIPSE":
        case "POLYGON":
        case "STAR":
        case "VECTOR":
        case "LINE":
          return "SHAPE";
        default:
          return "OTHER";
      }
    }
    function walk(current) {
      if (nodes.length >= MAX_NODE_CAP) {
        truncated = true;
        return;
      }
      if (current.type !== "PAGE") {
        const sceneNode = current;
        const nodeType = determineType(sceneNode);
        let textColor = null;
        let fontSize = null;
        let fontBold = null;
        if (sceneNode.type === "TEXT") {
          const textNode = sceneNode;
          textColor = extractSolidColor(textNode.fills);
          if (textNode.fontSize !== figma.mixed) {
            fontSize = typeof textNode.fontSize === "number" ? textNode.fontSize : null;
          }
          if (textNode.fontName !== figma.mixed && textNode.fontName) {
            const font = textNode.fontName;
            fontBold = /bold|black|heavy|semibold/i.test(font.style);
          }
        }
        let fillColor = null;
        if ("fills" in sceneNode) {
          fillColor = extractSolidColor(sceneNode.fills);
        }
        let layoutMode = "NONE";
        let itemSpacing = null;
        let padding = null;
        if ("layoutMode" in sceneNode) {
          const frame = sceneNode;
          if (frame.layoutMode === "HORIZONTAL" || frame.layoutMode === "VERTICAL") {
            layoutMode = frame.layoutMode;
          }
          if ("itemSpacing" in frame && frame.itemSpacing !== figma.mixed) {
            itemSpacing = typeof frame.itemSpacing === "number" ? frame.itemSpacing : null;
          }
          const l = "paddingLeft" in frame && typeof frame.paddingLeft === "number" ? frame.paddingLeft : 0;
          const r = "paddingRight" in frame && typeof frame.paddingRight === "number" ? frame.paddingRight : 0;
          const t = "paddingTop" in frame && typeof frame.paddingTop === "number" ? frame.paddingTop : 0;
          const b = "paddingBottom" in frame && typeof frame.paddingBottom === "number" ? frame.paddingBottom : 0;
          padding = { l, r, t, b };
        }
        const childCount = "children" in sceneNode && Array.isArray(sceneNode.children) ? sceneNode.children.length : 0;
        const factNode = {
          id: sceneNode.id,
          type: nodeType,
          name: sceneNode.name || "",
          parentId: sceneNode.parent ? sceneNode.parent.id : null,
          childCount,
          layoutMode,
          itemSpacing,
          padding,
          fontSize,
          fontBold,
          textColor,
          fillColor,
          width: "width" in sceneNode ? sceneNode.width : void 0,
          height: "height" in sceneNode ? sceneNode.height : void 0,
          hue: getHslHue(textColor || fillColor)
        };
        nodes.push(factNode);
      }
      if ("children" in current && Array.isArray(current.children)) {
        for (const child of current.children) {
          walk(child);
          if (nodes.length >= MAX_NODE_CAP) break;
        }
      }
    }
    walk(rootNode);
    return {
      nodes,
      truncated
    };
  }

  // src/core/analyzers/contrast.ts
  function linearizeChannel(c) {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function getRelativeLuminance(rgb) {
    const r = linearizeChannel(rgb.r);
    const g = linearizeChannel(rgb.g);
    const b = linearizeChannel(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function getContrastRatio(fg, bg) {
    const l1 = getRelativeLuminance(fg);
    const l2 = getRelativeLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function analyzeContrast(facts) {
    const findings = [];
    const nodeMap = /* @__PURE__ */ new Map();
    for (const node of facts.nodes) {
      nodeMap.set(node.id, node);
    }
    function getEffectiveBackground(node) {
      let curr = node.parentId ? nodeMap.get(node.parentId) : null;
      while (curr) {
        if (curr.fillColor) {
          return curr.fillColor;
        }
        curr = curr.parentId ? nodeMap.get(curr.parentId) : null;
      }
      return { r: 1, g: 1, b: 1 };
    }
    for (const node of facts.nodes) {
      if (node.type !== "TEXT" || !node.textColor) continue;
      const bg = getEffectiveBackground(node);
      const ratio = getContrastRatio(node.textColor, bg);
      const isLarge = node.fontSize !== null && node.fontSize >= 24 || node.fontSize !== null && node.fontSize >= 18.66 && node.fontBold === true;
      const threshold = isLarge ? 3 : 4.5;
      if (ratio < threshold) {
        findings.push({
          id: `contrast-${node.id}`,
          skill: "contrast",
          severity: ratio < 3 ? "high" : "medium",
          nodeId: node.id,
          measured: {
            ratio: Number(ratio.toFixed(2)),
            fontSize: node.fontSize ?? 14,
            isLarge: isLarge ? 1 : 0
          },
          expected: {
            minRatio: threshold,
            targetLevel: isLarge ? "WCAG Large Text (3.0:1)" : "WCAG Normal Text (4.5:1)"
          }
        });
      }
    }
    return findings;
  }

  // src/core/analyzers/spacing.ts
  function analyzeSpacing(facts) {
    const findings = [];
    for (const node of facts.nodes) {
      if (node.layoutMode === "NONE") continue;
      if (node.itemSpacing !== null && node.itemSpacing !== 0) {
        if (node.itemSpacing % 4 !== 0) {
          const nearest8 = Math.max(0, Math.round(node.itemSpacing / 8) * 8);
          findings.push({
            id: `spacing-item-${node.id}`,
            skill: "spacing-grid",
            severity: "medium",
            nodeId: node.id,
            measured: {
              property: "itemSpacing",
              value: node.itemSpacing
            },
            expected: {
              gridMultiple: 4,
              recommended8pt: nearest8
            }
          });
        }
      }
      if (node.padding) {
        const sides = ["l", "r", "t", "b"];
        for (const side of sides) {
          const val = node.padding[side];
          if (val !== 0 && val % 4 !== 0) {
            const nearest8 = Math.max(0, Math.round(val / 8) * 8);
            findings.push({
              id: `spacing-pad-${side}-${node.id}`,
              skill: "spacing-grid",
              severity: "medium",
              nodeId: node.id,
              measured: {
                property: `padding-${side}`,
                value: val
              },
              expected: {
                gridMultiple: 4,
                recommended8pt: nearest8
              }
            });
          }
        }
      }
    }
    return findings;
  }

  // src/core/analyzers/naming.ts
  var DEFAULT_NAME_REGEX = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Section)\s?\d*$/i;
  function analyzeNaming(facts) {
    const findings = [];
    for (const node of facts.nodes) {
      if (node.type === "TEXT") continue;
      if (node.type !== "FRAME" && node.type !== "GROUP" && node.type !== "SHAPE") continue;
      if (DEFAULT_NAME_REGEX.test(node.name.trim())) {
        findings.push({
          id: `naming-${node.id}`,
          skill: "layer-naming",
          severity: "low",
          nodeId: node.id,
          measured: {
            currentName: node.name,
            nodeType: node.type
          },
          expected: {
            guideline: "Semantic name describing purpose (e.g. CardHeader, IconWrapper, PrimaryBtn)"
          }
        });
      }
    }
    return findings;
  }

  // src/core/analyzers/autolayout.ts
  function analyzeAutoLayout(facts) {
    const findings = [];
    for (const node of facts.nodes) {
      if (node.type === "FRAME" && node.childCount >= 2 && node.layoutMode === "NONE") {
        findings.push({
          id: `autolayout-${node.id}`,
          skill: "auto-layout",
          severity: "low",
          nodeId: node.id,
          measured: {
            childCount: node.childCount,
            layoutMode: "NONE",
            frameName: node.name
          },
          expected: {
            layoutMode: "HORIZONTAL or VERTICAL",
            benefit: "Responsive flex flow and predictable spacing (Shift+A)"
          }
        });
      }
    }
    return findings;
  }

  // src/core/analyzers/index.ts
  function analyzeAll(facts) {
    const contrastFindings = analyzeContrast(facts);
    const spacingFindings = analyzeSpacing(facts);
    const namingFindings = analyzeNaming(facts);
    const autoLayoutFindings = analyzeAutoLayout(facts);
    const findings = [
      ...contrastFindings,
      ...spacingFindings,
      ...namingFindings,
      ...autoLayoutFindings
    ];
    const emptySummary = () => ({
      count: 0,
      high: 0,
      medium: 0,
      low: 0
    });
    const bySkill = {
      "contrast": emptySummary(),
      "spacing-grid": emptySummary(),
      "layer-naming": emptySummary(),
      "auto-layout": emptySummary()
    };
    for (const f of findings) {
      if (bySkill[f.skill]) {
        bySkill[f.skill].count += 1;
        bySkill[f.skill][f.severity] += 1;
      }
    }
    return {
      findings,
      bySkill,
      totalCount: findings.length,
      truncated: Boolean(facts.truncated)
    };
  }

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
      case "RUN_AUDIT": {
        try {
          const facts = await extractDesignFacts(figma.currentPage);
          const audit = analyzeAll(facts);
          figma.ui.postMessage({
            type: "AUDIT_RESULTS",
            audit,
            pageName: figma.currentPage.name
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "AUDIT_ERROR",
            error: err?.message || "Failed to audit current page."
          });
        }
        break;
      }
      case "SELECT_NODE": {
        if (typeof msg.nodeId === "string") {
          const node = figma.getNodeById(msg.nodeId);
          if (node && "type" in node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
            figma.currentPage.selection = [node];
            figma.viewport.scrollAndZoomIntoView([node]);
          }
        }
        break;
      }
      case "NOTIFY": {
        if (typeof msg.message === "string") {
          figma.notify(msg.message, { timeout: msg.timeout || 3e3 });
        }
        break;
      }
      default:
        console.log("Main thread received:", msg.type);
    }
  };
})();
