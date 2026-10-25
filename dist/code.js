"use strict";
(() => {
  // src/adapters/figma/extract.ts
  var MAX_NODE_CAP = 5e3;
  async function extractDesignFacts(rootNode) {
    const nodes = [];
    let truncated = false;
    if (typeof rootNode.loadAsync === "function") {
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
        try {
          const rawFills = sceneNode.fills;
          if (rawFills && rawFills !== figma.mixed) {
            fillColor = extractSolidColor(rawFills);
          }
        } catch (e) {
        }
        let layoutMode = "NONE";
        let itemSpacing = null;
        let padding = null;
        try {
          const anyNode = sceneNode;
          const rawMode = anyNode.layoutMode;
          if (rawMode === "HORIZONTAL" || rawMode === "VERTICAL") {
            layoutMode = rawMode;
          } else if (rawMode === "GRID") {
            layoutMode = "VERTICAL";
          }
          const rawSpacing = anyNode.itemSpacing;
          if (typeof rawSpacing === "number" && rawSpacing !== figma.mixed) {
            itemSpacing = rawSpacing;
          }
          const pl = anyNode.paddingLeft;
          const pr = anyNode.paddingRight;
          const pt = anyNode.paddingTop;
          const pb = anyNode.paddingBottom;
          if (typeof pl === "number" || typeof pr === "number" || typeof pt === "number" || typeof pb === "number") {
            padding = {
              l: typeof pl === "number" ? pl : 0,
              r: typeof pr === "number" ? pr : 0,
              t: typeof pt === "number" ? pt : 0,
              b: typeof pb === "number" ? pb : 0
            };
          }
        } catch (e) {
        }
        let childCount = 0;
        try {
          const ch = sceneNode.children;
          if (ch && Array.isArray(ch)) {
            childCount = ch.length;
          }
        } catch (e) {
        }
        const isComponent = sceneNode.type === "COMPONENT" || sceneNode.type === "INSTANCE" || sceneNode.type === "COMPONENT_SET";
        let width = void 0;
        let height = void 0;
        try {
          if (typeof sceneNode.width === "number") width = sceneNode.width;
          if (typeof sceneNode.height === "number") height = sceneNode.height;
        } catch (e) {
        }
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
          width,
          height,
          hue: getHslHue(textColor || fillColor),
          isComponent,
          componentName: isComponent ? sceneNode.name : null
        };
        nodes.push(factNode);
      }
      try {
        const children = current.children;
        if (children && Array.isArray(children)) {
          for (const child of children) {
            walk(child);
            if (nodes.length >= MAX_NODE_CAP) break;
          }
        }
      } catch (e) {
      }
    }
    walk(rootNode);
    return {
      nodes,
      truncated
    };
  }
  async function extractMultipleNodesFacts(targetNodes) {
    const combinedNodes = [];
    let isTruncated = false;
    for (const node of targetNodes) {
      const facts = await extractDesignFacts(node);
      combinedNodes.push(...facts.nodes);
      if (facts.truncated || combinedNodes.length >= 5e3) {
        isTruncated = true;
        break;
      }
    }
    return {
      nodes: combinedNodes.slice(0, 5e3),
      truncated: isTruncated
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
  function analyzeContrast(facts, profile) {
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
    const minNormal = profile?.contrast?.minNormalRatio ?? 4.5;
    const minLarge = profile?.contrast?.minLargeRatio ?? 3;
    const standardName = profile?.contrast?.standard ?? "AA";
    for (const node of facts.nodes) {
      if (node.type !== "TEXT" || !node.textColor) continue;
      const bg = getEffectiveBackground(node);
      const ratio = getContrastRatio(node.textColor, bg);
      const isLarge = node.fontSize !== null && node.fontSize >= 24 || node.fontSize !== null && node.fontSize >= 18.66 && node.fontBold === true;
      const threshold = isLarge ? minLarge : minNormal;
      if (ratio < threshold) {
        const fontSizeStr = node.fontSize ? `${node.fontSize}px` : "text";
        const styleStr = isLarge ? "large text" : "normal text";
        findings.push({
          id: `contrast-${node.id}`,
          skill: "contrast",
          severity: ratio < (isLarge ? 2.5 : 3) ? "high" : "medium",
          nodeId: node.id,
          nodeName: node.name || "Text Layer",
          nodeType: "TEXT",
          measured: {
            ratio: Number(ratio.toFixed(2)),
            fontSize: node.fontSize ?? 14,
            isLarge: isLarge ? 1 : 0
          },
          expected: {
            minRatio: threshold,
            targetLevel: `WCAG ${standardName} (${threshold}:1)`
          },
          profileContext: profile ? `${profile.name} (WCAG ${standardName})` : void 0,
          summary: `Text "${node.name}" (${fontSizeStr}) has ${ratio.toFixed(1)}:1 contrast against its background. Standard requires at least ${threshold}:1 for ${styleStr}.`,
          whyItMatters: `Fails WCAG ${standardName} accessibility standards. Low contrast causes text to wash out under glare or dim lighting, and makes reading difficult for people with vision impairments or color blindness.`,
          tradeoffTip: "If low contrast was intentionally chosen for disabled state or watermarks, mark it as Dismiss (Intentional).",
          actionSteps: [
            `Click "Show in File" to select "${node.name}" in your Figma canvas.`,
            `In Figma's right-hand panel, go to the "Fill" section.`,
            `Adjust the text color or container background to increase the luminance difference until contrast reaches at least ${threshold}:1.`,
            `Re-run audit to verify the fix passes!`
          ],
          shortcutTip: 'Press "I" to open the Eyedropper and sample a high-contrast color.'
        });
      }
    }
    return findings;
  }
  function detectUnsupportedCases(facts) {
    const unsupported = [];
    for (const node of facts.nodes) {
      if (node.type === "TEXT" && (node.hasUnsupportedFill || !node.textColor)) {
        unsupported.push({
          nodeId: node.id,
          nodeName: node.name || "Text",
          skill: "contrast",
          reason: "Layer has image or gradient fill; deterministic offline contrast measurement is skipped."
        });
      }
    }
    return unsupported;
  }

  // src/core/analyzers/spacing.ts
  function analyzeSpacing(facts, profile) {
    const findings = [];
    const baseGrid = profile?.spacing?.baseGrid ?? 4;
    const allowedExceptions = profile?.spacing?.allowedExceptions ?? [4, 12];
    for (const node of facts.nodes) {
      if (node.layoutMode === "NONE") continue;
      if (node.itemSpacing !== null && node.itemSpacing !== 0) {
        const isAllowed = node.itemSpacing % baseGrid === 0 || allowedExceptions.includes(node.itemSpacing);
        if (!isAllowed) {
          const nearest = Math.max(0, Math.round(node.itemSpacing / baseGrid) * baseGrid);
          const nearest8pt = Math.max(0, Math.round(node.itemSpacing / 8) * 8);
          findings.push({
            id: `spacing-item-${node.id}`,
            skill: "spacing-grid",
            severity: "medium",
            nodeId: node.id,
            nodeName: node.name || "Auto Layout Frame",
            nodeType: node.type,
            measured: {
              property: "itemSpacing",
              value: node.itemSpacing
            },
            expected: {
              gridMultiple: baseGrid,
              recommended8pt: nearest8pt
            },
            profileContext: profile ? `${profile.name} (${baseGrid}pt grid)` : void 0,
            summary: `Frame "${node.name}" has itemSpacing of ${node.itemSpacing}px, which violates the ${baseGrid}pt grid system.`,
            whyItMatters: "Arbitrary pixel gaps create subconscious visual noise and cause padding discrepancies when engineers translate Figma frames to CSS flex/grid.",
            tradeoffTip: `Optical adjustments may warrant exceptions (e.g. ${allowedExceptions.join(", ")}px). Use "Dismiss (Intentional)" if this is purposeful.`,
            actionSteps: [
              `Click "Show in File" to select "${node.name}".`,
              `In Figma's right-hand Auto layout panel, find "Gap between items".`,
              `Change the gap from ${node.itemSpacing}px to ${nearest}px (nearest ${baseGrid}pt multiple).`,
              `Re-run audit to confirm clean grid alignment!`
            ],
            shortcutTip: `Hold Shift + Arrow keys to nudge in ${baseGrid}px increments.`
          });
        }
      }
      if (node.padding) {
        const sides = ["l", "r", "t", "b"];
        const sideLabels = { l: "Left", r: "Right", t: "Top", b: "Bottom" };
        for (const side of sides) {
          const val = node.padding[side];
          const isAllowed = val % baseGrid === 0 || allowedExceptions.includes(val);
          if (val !== 0 && !isAllowed) {
            const nearest = Math.max(0, Math.round(val / baseGrid) * baseGrid);
            const nearest8pt = Math.max(0, Math.round(val / 8) * 8);
            findings.push({
              id: `spacing-pad-${side}-${node.id}`,
              skill: "spacing-grid",
              severity: "medium",
              nodeId: node.id,
              nodeName: node.name || "Auto Layout Frame",
              nodeType: node.type,
              measured: {
                property: `padding-${side}`,
                value: val
              },
              expected: {
                gridMultiple: baseGrid,
                recommended8pt: nearest8pt
              },
              profileContext: profile ? `${profile.name} (${baseGrid}pt grid)` : void 0,
              summary: `Frame "${node.name}" has ${sideLabels[side]} padding of ${val}px, which violates the ${baseGrid}pt grid.`,
              whyItMatters: "Predictable spacing grids establish cohesive visual rhythm and prevent awkward asymmetric margins.",
              tradeoffTip: "Optical spacing adjustments for nested components can be marked as Intentional to keep clean records.",
              actionSteps: [
                `Click "Show in File" to select "${node.name}".`,
                `In the right-hand Auto layout section, adjust ${sideLabels[side]} padding from ${val}px to ${nearest}px.`,
                `Re-run audit to verify!`
              ],
              shortcutTip: "Standard padding progression: 8px (compact), 16px (card default), 24px (spacious)."
            });
          }
        }
      }
    }
    return findings;
  }

  // src/core/analyzers/naming.ts
  var DEFAULT_NAME_REGEX = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Section)\s?\d*$/i;
  function analyzeNaming(facts, profile) {
    const findings = [];
    const pattern = profile?.naming?.pattern ?? "default-check";
    for (const node of facts.nodes) {
      if (node.type === "TEXT") continue;
      if (node.type !== "FRAME" && node.type !== "GROUP" && node.type !== "SHAPE") continue;
      const trimmed = node.name.trim();
      let isViolation = false;
      let expectedGuideline = "Semantic name describing purpose (e.g. CardHeader, IconWrapper, PrimaryBtn)";
      let summaryText = `${node.type} "${node.name}" uses a default Figma generated name that obscures its functional role.`;
      if (DEFAULT_NAME_REGEX.test(trimmed)) {
        isViolation = true;
      } else if (pattern === "slash-hierarchy" && node.isComponent && !trimmed.includes("/")) {
        isViolation = true;
        expectedGuideline = 'Slash-hierarchy pattern: e.g. "Button/Primary", "Input/Active", "Card/Header"';
        summaryText = `Component "${node.name}" does not use the project's slash-hierarchy naming convention (Category/Name).`;
      } else if (pattern === "pascal-case" && node.isComponent && !/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
        isViolation = true;
        expectedGuideline = 'PascalCase pattern: e.g. "PrimaryButton", "HeroCard", "NavMenu"';
        summaryText = `Component "${node.name}" does not follow the project's PascalCase convention.`;
      }
      if (isViolation) {
        findings.push({
          id: `naming-${node.id}`,
          skill: "layer-naming",
          severity: "low",
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          measured: {
            currentName: node.name,
            nodeType: node.type
          },
          expected: {
            guideline: expectedGuideline
          },
          profileContext: profile ? `${profile.name} (${pattern})` : void 0,
          summary: summaryText,
          whyItMatters: "Descriptive names slow down team collaboration, create confusion during component handoff, and make design systems harder to maintain.",
          tradeoffTip: "Temporary scratch layers can be named loosely, but components and export assets should strictly adhere to team naming standards.",
          actionSteps: [
            `Click "Show in File" to highlight "${node.name}".`,
            `Press "Cmd / Ctrl + R" (or double-click the layer name in Figma's left panel).`,
            `Rename it using ${expectedGuideline}.`,
            `Re-run audit to confirm!`
          ],
          shortcutTip: 'Press "Cmd / Ctrl + R" to open the Rename dialog (supports batch rename).'
        });
      }
    }
    return findings;
  }

  // src/core/analyzers/autolayout.ts
  function analyzeAutoLayout(facts, profile) {
    const findings = [];
    const minChildren = 2;
    for (const node of facts.nodes) {
      if (node.type === "FRAME" && node.childCount >= minChildren && node.layoutMode === "NONE") {
        findings.push({
          id: `autolayout-${node.id}`,
          skill: "auto-layout",
          severity: "low",
          nodeId: node.id,
          nodeName: node.name || "Frame",
          nodeType: "FRAME",
          measured: {
            childCount: node.childCount,
            layoutMode: "NONE",
            frameName: node.name
          },
          expected: {
            layoutMode: "HORIZONTAL or VERTICAL",
            benefit: "Responsive flex flow and predictable spacing (Shift+A)"
          },
          profileContext: profile ? profile.name : void 0,
          summary: `Frame "${node.name}" contains ${node.childCount} child elements using manual absolute positioning instead of Auto Layout.`,
          whyItMatters: "Without Auto Layout, dynamic content changes (like longer text or screen resizing) cause elements to overlap or misalign, requiring tedious manual tweaking and slowing down responsive coding.",
          tradeoffTip: 'Freeform canvas artboards, decorative illustrations, or badge overlays can use absolute positioning. Use "Dismiss (Intentional)" to mark valid exceptions.',
          actionSteps: [
            `Click "Show in File" to highlight "${node.name}" on your canvas.`,
            `Press "Shift + A" (or click the "+" icon next to Auto layout in the right sidebar).`,
            `Choose your layout flow: Vertical (top-to-bottom stack) or Horizontal (side-by-side row).`,
            `Set gap and padding to multiples of 4 or 8 (e.g., 12px or 16px).`,
            `Re-run audit to confirm responsive alignment!`
          ],
          shortcutTip: 'Press "Shift + A" to instantly convert any selection or frame into Auto Layout.'
        });
      }
    }
    return findings;
  }

  // src/core/analyzers/index.ts
  function analyzeAll(facts, profile) {
    const contrastFindings = analyzeContrast(facts, profile);
    const spacingFindings = analyzeSpacing(facts, profile);
    const namingFindings = analyzeNaming(facts, profile);
    const autoLayoutFindings = analyzeAutoLayout(facts, profile);
    const rawFindings = [
      ...contrastFindings,
      ...spacingFindings,
      ...namingFindings,
      ...autoLayoutFindings
    ];
    const exemptions = new Set(profile?.exemptions || []);
    let exemptedCount = 0;
    const findings = [];
    for (const f of rawFindings) {
      if (exemptions.has(f.nodeId)) {
        exemptedCount += 1;
      } else {
        findings.push(f);
      }
    }
    const unsupported = detectUnsupportedCases(facts);
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
      truncated: Boolean(facts.truncated),
      unsupported,
      exemptedCount,
      profileName: profile?.name || "Default"
    };
  }

  // src/core/lessons/verify.ts
  function verifyPracticeFrame(skill, facts) {
    let findings = [];
    switch (skill) {
      case "contrast":
        findings = analyzeContrast(facts);
        break;
      case "spacing-grid":
        findings = analyzeSpacing(facts);
        break;
      case "layer-naming":
        findings = analyzeNaming(facts);
        break;
      case "auto-layout":
        findings = analyzeAutoLayout(facts);
        break;
    }
    const passed = findings.length === 0;
    let message = "";
    if (passed) {
      message = "Great work! All checks passed deterministically.";
    } else {
      const first = findings[0];
      if (skill === "contrast") {
        message = `Contrast ratio is currently ${first.measured.ratio}:1 (needs at least ${first.expected.minRatio}:1).`;
      } else if (skill === "spacing-grid") {
        message = `${first.measured.property} is ${first.measured.value}px (use multiple of 4, e.g. ${first.expected.recommended8pt}px).`;
      } else if (skill === "layer-naming") {
        message = `Layer "${first.measured.currentName}" still has a default Figma name. Rename it to describe its purpose.`;
      } else if (skill === "auto-layout") {
        message = `Frame still has layoutMode NONE. Apply Auto Layout (Shift+A).`;
      }
    }
    return {
      passed,
      skill,
      remainingFindings: findings,
      message
    };
  }

  // src/adapters/figma/practice.ts
  var PRACTICE_PAGE_NAME = "SousArtist Practice";
  async function getOrCreatePracticePage() {
    let page = figma.root.children.find((p) => p.name === PRACTICE_PAGE_NAME);
    if (!page) {
      page = figma.createPage();
      page.name = PRACTICE_PAGE_NAME;
    }
    if ("loadAsync" in page && typeof page.loadAsync === "function") {
      await page.loadAsync();
    }
    return page;
  }
  async function buildPracticeFrame(skill) {
    const practicePage = await getOrCreatePracticePage();
    await figma.setCurrentPageAsync(practicePage);
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    const oldFrames = practicePage.children.filter(
      (n) => n.getPluginData("sousartist-skill") === skill || n.name.startsWith(`[SousArtist] ${skill}`)
    );
    for (const oldFrame of oldFrames) {
      oldFrame.remove();
    }
    const frame = figma.createFrame();
    frame.name = `[SousArtist] ${skill} Practice`;
    frame.setPluginData("sousartist-skill", skill);
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    frame.cornerRadius = 8;
    frame.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.87, b: 0.9 } }];
    frame.strokeWeight = 1;
    switch (skill) {
      case "contrast": {
        frame.resize(340, 180);
        frame.layoutMode = "VERTICAL";
        frame.itemSpacing = 12;
        frame.paddingLeft = 24;
        frame.paddingRight = 24;
        frame.paddingTop = 24;
        frame.paddingBottom = 24;
        const title = figma.createText();
        title.characters = "Product Card Title";
        title.fontSize = 20;
        title.fontName = { family: "Inter", style: "Bold" };
        title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        const bodyText = figma.createText();
        bodyText.characters = "This description text has poor contrast. Use the Fill panel to darken it until it meets WCAG AA (4.5:1).";
        bodyText.fontSize = 14;
        bodyText.fontName = { family: "Inter", style: "Regular" };
        bodyText.fills = [{ type: "SOLID", color: { r: 0.69, g: 0.69, b: 0.69 } }];
        frame.appendChild(title);
        frame.appendChild(bodyText);
        break;
      }
      case "spacing-grid": {
        frame.resize(320, 200);
        frame.layoutMode = "VERTICAL";
        frame.itemSpacing = 13;
        frame.paddingLeft = 7;
        frame.paddingRight = 19;
        frame.paddingTop = 7;
        frame.paddingBottom = 19;
        const rect1 = figma.createRectangle();
        rect1.name = "CardItem1";
        rect1.resize(260, 44);
        rect1.fills = [{ type: "SOLID", color: { r: 0.93, g: 0.94, b: 0.98 } }];
        rect1.cornerRadius = 6;
        const rect2 = figma.createRectangle();
        rect2.name = "CardItem2";
        rect2.resize(260, 44);
        rect2.fills = [{ type: "SOLID", color: { r: 0.88, g: 0.9, b: 0.96 } }];
        rect2.cornerRadius = 6;
        frame.appendChild(rect1);
        frame.appendChild(rect2);
        break;
      }
      case "layer-naming": {
        frame.name = "Frame 12";
        frame.resize(300, 180);
        frame.layoutMode = "VERTICAL";
        frame.itemSpacing = 12;
        frame.paddingLeft = 16;
        frame.paddingRight = 16;
        frame.paddingTop = 16;
        frame.paddingBottom = 16;
        const shape = figma.createRectangle();
        shape.name = "Rectangle 4";
        shape.resize(268, 80);
        shape.fills = [{ type: "SOLID", color: { r: 0.92, g: 0.93, b: 0.95 } }];
        const textInner = figma.createText();
        textInner.characters = "Rename layers in the left sidebar to meaningful names.";
        textInner.fontSize = 12;
        textInner.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
        const group = figma.group([textInner], frame);
        group.name = "Group 3";
        frame.appendChild(shape);
        frame.appendChild(group);
        break;
      }
      case "auto-layout": {
        frame.name = "FeatureFrame";
        frame.resize(320, 180);
        frame.layoutMode = "NONE";
        const item1 = figma.createRectangle();
        item1.name = "IconBox";
        item1.resize(40, 40);
        item1.x = 20;
        item1.y = 20;
        item1.fills = [{ type: "SOLID", color: { r: 0.39, g: 0.4, b: 0.95 } }];
        item1.cornerRadius = 8;
        const item2 = figma.createText();
        item2.characters = "Feature Headline";
        item2.fontSize = 16;
        item2.fontName = { family: "Inter", style: "Bold" };
        item2.x = 20;
        item2.y = 75;
        item2.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        const item3 = figma.createText();
        item3.characters = "Select outer frame and press Shift+A to turn into Auto Layout.";
        item3.fontSize = 12;
        item3.x = 20;
        item3.y = 110;
        item3.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        frame.appendChild(item1);
        frame.appendChild(item2);
        frame.appendChild(item3);
        break;
      }
    }
    frame.x = 100;
    frame.y = 100;
    practicePage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    return frame.id;
  }
  async function verifyCurrentPractice(skill, frameId) {
    let node = null;
    if (frameId) {
      node = await figma.getNodeByIdAsync(frameId);
    }
    if (!node || node.type !== "FRAME") {
      const practicePage = await getOrCreatePracticePage();
      node = practicePage.children.find(
        (n) => n.type === "FRAME" && n.getPluginData("sousartist-skill") === skill
      ) || null;
    }
    if (!node || node.type !== "FRAME") {
      return {
        passed: false,
        skill,
        remainingFindings: [],
        message: 'Practice frame was deleted or not found. Click "Set up practice frame" to recreate it.'
      };
    }
    const facts = await extractDesignFacts(node);
    return verifyPracticeFrame(skill, facts);
  }

  // src/core/learner/state.ts
  function getTodayDateString() {
    const now = /* @__PURE__ */ new Date();
    return now.toISOString().split("T")[0];
  }
  function getDefaultStandardsProfiles() {
    return [
      {
        id: "profile-personal",
        name: "Personal Learning",
        context: "personal",
        description: "Educational baseline: standard 8pt spacing grid, WCAG AA (4.5:1), and clean layer naming.",
        spacing: {
          baseGrid: 8,
          allowedExceptions: [4, 12]
        },
        naming: {
          pattern: "default-check",
          forbiddenDefaults: true
        },
        contrast: {
          standard: "AA",
          minNormalRatio: 4.5,
          minLargeRatio: 3
        },
        autoLayout: {
          strictness: "containers-only"
        },
        exemptions: []
      },
      {
        id: "profile-team",
        name: "Acme Core (Team DS)",
        context: "team",
        description: "Strict team conventions: rigid 8pt grid, slash-hierarchy naming (e.g. Button/Primary), full Auto Layout.",
        spacing: {
          baseGrid: 8,
          allowedExceptions: []
        },
        naming: {
          pattern: "slash-hierarchy",
          forbiddenDefaults: true
        },
        contrast: {
          standard: "AA",
          minNormalRatio: 4.5,
          minLargeRatio: 3
        },
        autoLayout: {
          strictness: "all-multi-child"
        },
        exemptions: []
      },
      {
        id: "profile-freelance",
        name: "Fintech App (Client A)",
        context: "freelance",
        description: "High-contrast accessible standard: WCAG AAA (7.0:1), compact 4pt spacing increments, PascalCase naming.",
        spacing: {
          baseGrid: 4,
          allowedExceptions: []
        },
        naming: {
          pattern: "pascal-case",
          forbiddenDefaults: true
        },
        contrast: {
          standard: "AAA",
          minNormalRatio: 7,
          minLargeRatio: 4.5
        },
        autoLayout: {
          strictness: "containers-only"
        },
        exemptions: []
      }
    ];
  }
  function getDefaultWorkflowRelayNotes() {
    return [
      {
        id: "relay-1",
        author: "Elena (Outgoing Lead)",
        context: "team",
        topic: "overrides",
        title: "Swap icons via component properties, do not detach",
        guideline: "Use the instance swap property on icon slots instead of copy-pasting new vector icons into buttons.",
        tradeoffReason: "Prevents detaching instances, preserving text and padding overrides across dark mode updates.",
        targetScope: "Button / Action",
        createdAt: "Yesterday"
      },
      {
        id: "relay-2",
        author: "Marcus (Design Ops)",
        context: "team",
        topic: "spacing",
        title: "Modal dialogs use 24px outer margin, 16px inner gap",
        guideline: "Keep vertical stacks inside cards to 16px item spacing to align with mobile viewport bounds.",
        tradeoffReason: "Maintains touch targets for handheld ergonomics and avoids awkward scrolling on small screens.",
        targetScope: "Card / Modal",
        createdAt: "2 days ago"
      }
    ];
  }
  function createDefaultLearnerState() {
    const today = getTodayDateString();
    const profiles = getDefaultStandardsProfiles();
    return {
      xp: 0,
      streakDays: 0,
      lastActiveDate: "",
      expertiseLevel: "intermediate",
      activeProfileId: profiles[0].id,
      profiles,
      relayNotes: getDefaultWorkflowRelayNotes(),
      exemptions: [],
      onboardingComplete: false,
      independentResolutions: 0,
      auditHistory: [],
      dismissedFindings: {},
      skills: {
        "contrast": { box: 0, dueDate: today, attempts: 0 },
        "spacing-grid": { box: 0, dueDate: today, attempts: 0 },
        "layer-naming": { box: 0, dueDate: today, attempts: 0 },
        "auto-layout": { box: 0, dueDate: today, attempts: 0 }
      },
      completedLessons: []
    };
  }
  function sanitizeLearnerState(raw) {
    if (!raw || typeof raw !== "object") {
      return createDefaultLearnerState();
    }
    const defaultState = createDefaultLearnerState();
    const xp = typeof raw.xp === "number" && raw.xp >= 0 ? raw.xp : defaultState.xp;
    const streakDays = typeof raw.streakDays === "number" && raw.streakDays >= 0 ? raw.streakDays : defaultState.streakDays;
    const lastActiveDate = typeof raw.lastActiveDate === "string" ? raw.lastActiveDate : "";
    const completedLessons = Array.isArray(raw.completedLessons) ? raw.completedLessons : [];
    const expertiseLevel = raw.expertiseLevel === "beginner" || raw.expertiseLevel === "expert" || raw.expertiseLevel === "intermediate" ? raw.expertiseLevel : "intermediate";
    const profiles = Array.isArray(raw.profiles) && raw.profiles.length > 0 ? raw.profiles : defaultState.profiles;
    const activeProfileId = typeof raw.activeProfileId === "string" && profiles.some((p) => p.id === raw.activeProfileId) ? raw.activeProfileId : profiles[0].id;
    const relayNotes = Array.isArray(raw.relayNotes) ? raw.relayNotes : defaultState.relayNotes;
    const exemptions = Array.isArray(raw.exemptions) ? raw.exemptions : [];
    const skills = { ...defaultState.skills };
    const validSkills = ["contrast", "spacing-grid", "layer-naming", "auto-layout"];
    for (const s of validSkills) {
      if (raw.skills && raw.skills[s] && typeof raw.skills[s] === "object") {
        const box = raw.skills[s].box >= 0 && raw.skills[s].box <= 4 ? raw.skills[s].box : 0;
        const dueDate = typeof raw.skills[s].dueDate === "string" ? raw.skills[s].dueDate : getTodayDateString();
        const attempts = typeof raw.skills[s].attempts === "number" ? raw.skills[s].attempts : 0;
        skills[s] = { box, dueDate, attempts };
      }
    }
    const onboardingComplete = typeof raw.onboardingComplete === "boolean" ? raw.onboardingComplete : false;
    const independentResolutions = typeof raw.independentResolutions === "number" ? raw.independentResolutions : 0;
    const auditHistory = Array.isArray(raw.auditHistory) ? raw.auditHistory : [];
    const dismissedFindings = raw.dismissedFindings && typeof raw.dismissedFindings === "object" ? raw.dismissedFindings : {};
    return {
      xp,
      streakDays,
      lastActiveDate,
      expertiseLevel,
      activeProfileId,
      profiles,
      relayNotes,
      exemptions,
      onboardingComplete,
      independentResolutions,
      auditHistory,
      dismissedFindings,
      skills,
      completedLessons
    };
  }

  // src/adapters/figma/storage.ts
  var STORAGE_KEY = "sousartist_learner_state_v1";
  async function loadLearnerState() {
    try {
      const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
      return sanitizeLearnerState(raw);
    } catch (err) {
      console.warn("Failed to load from clientStorage, resetting state:", err);
      return createDefaultLearnerState();
    }
  }
  async function saveLearnerState(state) {
    try {
      await figma.clientStorage.setAsync(STORAGE_KEY, state);
    } catch (err) {
      console.error("Failed to save to clientStorage:", err);
    }
  }

  // src/core/learner/leitner.ts
  var REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30];
  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }
  function isSkillDue(skillData, currentDate) {
    if (!skillData || skillData.box === 0) return true;
    if (!skillData.dueDate) return true;
    return currentDate >= skillData.dueDate;
  }
  function advanceLeitnerBox(state, skill, currentDate) {
    const skillData = state.skills[skill] || { box: 0, dueDate: currentDate, attempts: 0 };
    const isDue = isSkillDue(skillData, currentDate);
    if (!isDue) {
      return {
        ...state,
        skills: {
          ...state.skills,
          [skill]: {
            ...skillData,
            attempts: skillData.attempts + 1
          }
        }
      };
    }
    const nextBox = Math.min(4, skillData.box + 1);
    const interval = REVIEW_INTERVALS_DAYS[nextBox];
    const nextDueDate = addDays(currentDate, interval);
    return {
      ...state,
      skills: {
        ...state.skills,
        [skill]: {
          box: nextBox,
          dueDate: nextDueDate,
          attempts: skillData.attempts + 1
        }
      }
    };
  }
  function resetLeitnerOnAuditFailure(state, failedSkills, currentDate) {
    let changed = false;
    const newSkills = { ...state.skills };
    const droppedSkills = [];
    for (const s of failedSkills) {
      if (newSkills[s] && newSkills[s].box > 0) {
        droppedSkills.push(s);
        newSkills[s] = {
          box: 0,
          dueDate: currentDate,
          attempts: newSkills[s].attempts
        };
        changed = true;
      }
    }
    return {
      updatedState: changed ? { ...state, skills: newSkills } : state,
      droppedSkills
    };
  }

  // src/core/learner/xp.ts
  function calculateLessonXp(options) {
    const base = options.isFirstPass ? 10 : 5;
    const noHintBonus = options.hintsUsedCount === 0 ? 5 : 0;
    const streakBonus = Math.min(10, options.currentStreakDays * 2);
    const earnedXp = base + noHintBonus + streakBonus;
    return {
      earnedXp,
      breakdown: {
        base,
        noHintBonus,
        streakBonus
      }
    };
  }
  function updateStreak(lastActiveDate, today, currentStreak) {
    if (!lastActiveDate) {
      return 1;
    }
    if (lastActiveDate === today) {
      return currentStreak;
    }
    const lastDate = new Date(lastActiveDate);
    const nowDate = new Date(today);
    const diffTime = nowDate.getTime() - lastDate.getTime();
    const diffDays = Math.round(diffTime / (1e3 * 3600 * 24));
    if (diffDays === 1) {
      return currentStreak + 1;
    } else if (diffDays > 1) {
      return 1;
    }
    return currentStreak;
  }
  function recordLessonCompletion(state, lessonId, hintsUsedCount, today) {
    const isFirstPass = !state.completedLessons.includes(lessonId);
    const newStreak = updateStreak(state.lastActiveDate, today, state.streakDays);
    const { earnedXp } = calculateLessonXp({
      isFirstPass,
      hintsUsedCount,
      currentStreakDays: newStreak
    });
    const completed = isFirstPass ? [...state.completedLessons, lessonId] : state.completedLessons;
    const updatedState = {
      ...state,
      xp: state.xp + earnedXp,
      streakDays: newStreak,
      lastActiveDate: today,
      completedLessons: completed
    };
    return {
      updatedState,
      earnedXp
    };
  }

  // src/core/llm/client.ts
  var ResilientLlmClient = class {
    constructor(options) {
      this.cache = /* @__PURE__ */ new Map();
      this.proxyUrl = options?.proxyUrl !== void 0 ? options.proxyUrl : "https://sousartist.vercel.app/api/llm" ? "https://sousartist.vercel.app/api/llm" : "https://sousartist.vercel.app/api/llm";
    }
    // djb2 32-bit string hash for payload cache deduplication.
    // This is NOT a cryptographic hash — it prevents duplicate LLM calls for identical
    // prompt+system pairs within a single plugin session, not across restarts.
    hashPayload(payload) {
      const str = `${payload.systemPrompt || ""}::${payload.prompt}`;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
      }
      return `hash_${hash}`;
    }
    async generateText(prompt, systemPrompt) {
      const payload = { prompt, systemPrompt };
      const cacheKey = this.hashPayload(payload);
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }
      if (!this.proxyUrl) {
        throw new Error("OFFLINE_NO_PROXY");
      }
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            const jitterMs = 300 + Math.random() * 400;
            await new Promise((r) => setTimeout(r, jitterMs));
          }
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8e3);
          const response = await fetch(this.proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, systemPrompt }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
          }
          const data = await response.json();
          const text = typeof data?.text === "string" ? data.text.trim() : "";
          if (text) {
            this.cache.set(cacheKey, text);
            return text;
          }
          throw new Error("EMPTY_RESPONSE");
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error("LLM_REQUEST_FAILED");
    }
  };

  // src/core/llm/prompts.ts
  var SYSTEM_PROMPT = `You are SousArtist, a design coach for beginners. You teach; you never create.
Rules:
- Never produce designs, layouts, color palettes, copy, HTML, CSS, or code for the learner's work.
- Use only the numbers provided in CONTEXT. Do not invent measurements.
- Follow the requested hint level exactly. At levels 1-2, do not reveal the target value.
- At most 60 words. Plain, encouraging language. No emoji.
- If asked to design or fix something for the user, say you coach rather than create, and point to a lesson.
Output: plain text only (hints) or JSON matching the given schema (diagnosis).`;
  function getSystemPrompt(expertise = "intermediate") {
    switch (expertise) {
      case "beginner":
        return `You are SousArtist, a dedicated, patient design teacher for beginners.
Your coaching style: Explain foundational terminology clearly, break down problems into step-by-step guidance, ask gentle Socratic questions to build intuition, and provide extra encouragement.
Rules:
- Never produce designs, layouts, palettes, code, HTML, or CSS.
- Under 65 words. Plain, encouraging language. No emoji.
- Use only the numbers provided in CONTEXT.`;
      case "expert":
        return `You are SousArtist, a peer design systems coworker for senior designers.
Your coaching style: Be brief and pragmatic. Assume full familiarity with Figma and design fundamentals. Focus on edge cases, tokens, component reusability, and handoff tradeoffs.
Rules:
- Never produce designs, layouts, palettes, code, HTML, or CSS.
- Under 45 words. Sharp, professional, peer-to-peer.
- Discuss tradeoffs and edge cases. Skip basic definitions.`;
      case "intermediate":
      default:
        return `You are SousArtist, a supportive coach for intermediate designers.
Your coaching style: Give concise, professional explanations and actionable hints, leaving room for independent problem-solving. Reference design systems and UX standards.
Rules:
- Never produce designs, layouts, palettes, code, HTML, or CSS.
- Under 50 words. Direct and constructive. No emoji.
- Use only the numbers provided in CONTEXT.`;
    }
  }
  function formatHintPrompt(params) {
    const expertise = params.expertise || "intermediate";
    const safeMeasured = {};
    for (const [k, v] of Object.entries(params.measured || {})) {
      if (k === "currentName" || k === "name" || k === "text" || k === "nodeName") continue;
      safeMeasured[k] = v;
    }
    const safeExpected = {};
    for (const [k, v] of Object.entries(params.expected || {})) {
      if (k === "nodeName" || k === "name" || k === "text") continue;
      safeExpected[k] = v;
    }
    return `Provide a Level ${params.level} coaching hint for the skill "${params.skill}" tailored for a ${expertise} designer.
CONTEXT NUMBERS:
- Measured: ${JSON.stringify(safeMeasured)}
- Target threshold: ${JSON.stringify(safeExpected)}
- Attempts so far: ${params.attempts}
- Designer Expertise: ${expertise}

REQUIREMENTS FOR LEVEL ${params.level}:
${params.level === 1 ? expertise === "beginner" ? "- Ask a patient Socratic question explaining the visual concept. Do NOT reveal target numbers." : expertise === "expert" ? "- Note the measurement anomaly and briefly mention the token/tradeoff. Do NOT reveal solution." : "- Ask a thoughtful Socratic question about the visual rhythm or readability. Do NOT reveal any target numbers." : params.level === 2 ? expertise === "beginner" ? "- Name the design rule and explain why it matters, citing the measured value. Do NOT reveal the solution." : expertise === "expert" ? "- Point directly to the design system rule and tradeoff. Do NOT reveal exact fix values." : "- Name the exact design rule and mention the measured value. Do NOT reveal the final solution value." : "- Guide with specific tool actions (which Figma panel, shortcut, or setting to adjust). State rule thresholds, but NEVER provide an exact hex code or layout coordinates."}
Remember: Under 60 words. No code blocks. Tone matching ${expertise} level.`;
  }
  function formatDiagnosisPrompt(summary) {
    const anonymizedPayload = {};
    const skills = ["contrast", "spacing-grid", "layer-naming", "auto-layout"];
    for (const skill of skills) {
      const stats = summary.bySkill[skill];
      const samples = summary.findings.filter((f) => f.skill === skill).slice(0, 3).map((f) => {
        const safeMeasured = {};
        for (const [k, v] of Object.entries(f.measured || {})) {
          if (k === "currentName" || k === "name" || k === "text" || k === "nodeName") continue;
          safeMeasured[k] = v;
        }
        const safeExpected = {};
        for (const [k, v] of Object.entries(f.expected || {})) {
          if (k === "nodeName" || k === "name" || k === "text") continue;
          safeExpected[k] = v;
        }
        return { measured: safeMeasured, expected: safeExpected };
      });
      anonymizedPayload[skill] = {
        counts: stats,
        examples: samples
      };
    }
    return `Given this audit of design gaps, prioritize which skill the beginner should learn first.
CONTEXT:
${JSON.stringify(anonymizedPayload, null, 2)}

OUTPUT FORMAT: Return strictly a valid JSON object matching:
{
  "order": ["contrast", "spacing-grid", "layer-naming", "auto-layout"],
  "reason": "Short explanation under 200 characters explaining why this skill was picked first."
}`;
  }

  // src/core/llm/guard.ts
  var FORBIDDEN_GENERATIVE_PATTERNS = [
    /here is (a|the|your) (layout|design|palette|mockup|code|css|html|solution)/i,
    /i have (designed|created|built|drawn|generated|fixed)/i,
    /i designed/i,
    /i created/i,
    /copy and paste this (code|css|style|hex)/i,
    /use this exact (code|hex|layout|color):/i
  ];
  var CODE_OR_HTML_REGEX = /(```|<\/?[a-z][\s\S]*>)/i;
  var HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/;
  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function guardHint(text, level, expected) {
    if (!text || text.trim().length === 0) {
      return { ok: false, reason: "Empty output" };
    }
    if (CODE_OR_HTML_REGEX.test(text)) {
      return { ok: false, reason: "Contains code fence or HTML tag" };
    }
    const words = countWords(text);
    if (words > 70) {
      return { ok: false, reason: `Word count exceeds 70 words (${words} words)` };
    }
    for (const pattern of FORBIDDEN_GENERATIVE_PATTERNS) {
      if (pattern.test(text)) {
        return { ok: false, reason: `Matches generative design pattern: ${pattern}` };
      }
    }
    if (level <= 3 && HEX_COLOR_REGEX.test(text)) {
      return { ok: false, reason: "Reveals hex color at hint level <= 3" };
    }
    if (level <= 2 && expected) {
      for (const key of Object.keys(expected)) {
        const val = expected[key];
        if (typeof val === "number" || typeof val === "string") {
          const strVal = String(val).trim();
          let targetRegex;
          if (strVal === "4.5" || strVal === "4.5:1" || strVal === "4.5 : 1") {
            targetRegex = /\b4\.5(\s*:\s*1)?\b/i;
          } else {
            const escaped = escapeRegex(strVal);
            const startBound = /^\w/.test(strVal) ? "\\b" : "";
            const endBound = /\w$/.test(strVal) ? "\\b" : "";
            targetRegex = new RegExp(`${startBound}${escaped}${endBound}`, "i");
          }
          if (targetRegex.test(text)) {
            return { ok: false, reason: `Reveals expected target value "${strVal}" at hint level <= 2` };
          }
        }
      }
    }
    return { ok: true };
  }

  // src/core/lessons/lessons.ts
  var LESSONS = {
    "contrast": {
      id: "lesson-contrast",
      skill: "contrast",
      title: "Color Contrast & Readability",
      goal: "Change the light gray text color on this white card until contrast ratio reaches at least 4.5:1 (WCAG AA).",
      shortcutTip: 'Press "I" to open the Eyedropper and sample darker tones.',
      staticHints: [
        "Is the text easily readable against the white background, or does it blend into the card?",
        "WCAG AA requires a 4.5:1 ratio for normal text. Currently this gray is about 2.1:1.",
        "Select the text layer, open the Fill section in the right sidebar, and choose a darker tone like #4B5563 or darker."
      ],
      workedExample: "On pure white (#FFFFFF), #767676 reaches exactly 4.54:1 (AA minimum), while #1F2937 delivers a crisp 13.5:1 ratio."
    },
    "spacing-grid": {
      id: "lesson-spacing-grid",
      skill: "spacing-grid",
      title: "8-Point Spacing Grid",
      goal: "Adjust the container item spacing and padding to multiples of 4 (preferably 8) so the card aligns with the grid.",
      shortcutTip: "Hold Shift + Arrow keys to nudge values in 8px increments.",
      staticHints: [
        "Do the gaps and margins feel consistent, or do the odd numbers break the visual rhythm?",
        "The itemSpacing is currently 13px and padding is 7px and 19px. In an 8-point system, spacing values should be multiples of 4 or 8.",
        "Select the container frame. In the Auto layout panel, change the gap to 16px and horizontal/vertical padding to 16px or 24px."
      ],
      workedExample: "Standard 8pt scale uses 8px (small), 16px (medium), 24px (large), and 32px (xlarge). 4px is reserved for tight micro-elements."
    },
    "layer-naming": {
      id: "lesson-layer-naming",
      skill: "layer-naming",
      title: "Semantic Layer Naming",
      goal: "Rename the default Figma names (Frame 12, Rectangle 4, Group 3) to descriptive names indicating their purpose.",
      shortcutTip: "Press Cmd/Ctrl + R to quickly batch-rename selected layers.",
      staticHints: [
        "If a teammate inspected this file, would the layer names clearly explain what each element represents?",
        'Default names like "Frame 12" and "Rectangle 4" create clutter and slow down developer handoff.',
        'Double-click each layer in the left sidebar (or press Cmd/Ctrl+R) and rename them meaningfully, such as "CardContainer", "MediaThumbnail", or "HeaderGroup".'
      ],
      workedExample: 'Use component-oriented naming: "UserProfileCard" for the parent frame, "AvatarImage" for the media shape, and "CardHeader" for the text group.'
    },
    "auto-layout": {
      id: "lesson-auto-layout",
      skill: "auto-layout",
      title: "Responsive Auto Layout",
      goal: "Convert this frame with manually positioned elements into an Auto Layout frame so it adapts responsively.",
      shortcutTip: "Press Shift + A to instantly turn any selection or frame into Auto Layout.",
      staticHints: [
        "What happens if the text expands or elements resize? Do they adapt or overlap?",
        "The container has 3 child elements using absolute manual coordinates instead of an active layout flow.",
        'Select the outer frame and press Shift+A, or click "+" next to Auto layout in the right sidebar. Choose Vertical direction.'
      ],
      workedExample: "Auto layout with Vertical direction and 12px gap ensures items stack cleanly and reflow when content changes."
    }
  };

  // src/core/llm/fallback.ts
  function rankSkills(summary) {
    const allSkills = ["contrast", "spacing-grid", "layer-naming", "auto-layout"];
    const scored = allSkills.map((skill) => {
      const stats = summary.bySkill[skill] || { count: 0, high: 0, medium: 0, low: 0 };
      const score = stats.high * 3 + stats.medium * 2 + stats.low;
      return { skill, score, count: stats.count };
    });
    scored.sort((a, b) => b.score - a.score);
    const order = scored.map((s) => s.skill);
    const topSkill = scored[0];
    let reason = "Prioritized based on highest severity gaps found in your audit.";
    if (topSkill.count === 0) {
      reason = "No active violations found. Starting with foundational contrast principles.";
    } else if (topSkill.skill === "contrast") {
      reason = "Contrast gaps impact readability and accessibility directly. Fix these first.";
    } else if (topSkill.skill === "spacing-grid") {
      reason = "Inconsistent spacing disrupts visual hierarchy and alignment across your card layout.";
    } else if (topSkill.skill === "layer-naming") {
      reason = "Default layer names slow down developer handoff and component maintenance.";
    } else if (topSkill.skill === "auto-layout") {
      reason = "Converting manual frames to Auto Layout establishes responsive behavior early.";
    }
    return {
      order,
      reason
    };
  }
  function getCannedRedirect(closestSkill = "contrast") {
    const titles = {
      "contrast": "contrast",
      "spacing-grid": "the 8pt spacing grid",
      "layer-naming": "semantic layer naming",
      "auto-layout": "auto layout"
    };
    return `I coach, I don't create. The design stays yours. Want a 2-minute lesson on ${titles[closestSkill]} so you can do this faster yourself?`;
  }
  function getStaticHint(skill, level) {
    const lesson = LESSONS[skill];
    if (!lesson) {
      return "Review the core rule in the design guidelines.";
    }
    if (level <= 1) return lesson.staticHints[0];
    if (level === 2) return lesson.staticHints[1];
    if (level === 3) return lesson.staticHints[2];
    return lesson.workedExample;
  }

  // src/core/llm/coach.ts
  var SousArtistCoach = class {
    constructor(client) {
      this.client = client || new ResilientLlmClient();
    }
    async diagnoseGaps(summary) {
      try {
        const prompt = formatDiagnosisPrompt(summary);
        const rawText = await this.client.generateText(prompt, SYSTEM_PROMPT);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("NO_JSON_IN_RESPONSE");
        const parsed = JSON.parse(jsonMatch[0]);
        const validSkills = ["contrast", "spacing-grid", "layer-naming", "auto-layout"];
        if (Array.isArray(parsed.order) && parsed.order.length > 0 && parsed.order.every((s) => validSkills.includes(s)) && new Set(parsed.order).size === parsed.order.length && typeof parsed.reason === "string" && parsed.reason.length <= 200) {
          return {
            order: parsed.order,
            reason: parsed.reason,
            offline: false
          };
        }
        throw new Error("INVALID_DIAGNOSIS_SCHEMA");
      } catch (err) {
        const fallback = rankSkills(summary);
        return {
          ...fallback,
          offline: true
        };
      }
    }
    async getGradedHint(params) {
      if (params.level >= 4) {
        return {
          hint: getStaticHint(params.skill, 4),
          level: 4,
          guarded: true,
          offline: true
        };
      }
      const systemPrompt = getSystemPrompt(params.expertise || "intermediate");
      try {
        const prompt = formatHintPrompt(params);
        let text = await this.client.generateText(prompt, systemPrompt);
        let guardRes = guardHint(text, params.level, params.expected);
        if (!guardRes.ok) {
          const retryPrompt = `${prompt}
STRICT WARNING: Your previous output was rejected (${guardRes.reason}). Under 60 words, NO code blocks, NO hex codes, NO target numbers.`;
          text = await this.client.generateText(retryPrompt, systemPrompt);
          guardRes = guardHint(text, params.level, params.expected);
        }
        if (guardRes.ok) {
          return {
            hint: text,
            level: params.level,
            guarded: true,
            offline: false
          };
        }
        return {
          hint: getStaticHint(params.skill, params.level),
          level: params.level,
          guarded: true,
          offline: true
        };
      } catch (err) {
        return {
          hint: getStaticHint(params.skill, params.level),
          level: params.level,
          guarded: true,
          offline: true
        };
      }
    }
    classifyIntent(query) {
      const q = query.toLowerCase().trim();
      const generativeRegex = /\b(design (me|a|an|the)|create (a|an|me|the)|make (a|an|me|the|this)|generate (a|an|me|the)|build (a|an|me|the)|help me build|draw (a|an|me|the)|produce (a|an|me|the)|write\s+\S*\s*(css|html|code|copy)|give me (the|a)?\s*(html|css|code|layout)|rewrite (my|the)?\s*(text|copy)|replace my|fix it for me|do it for me|palette|color scheme|colour scheme|exact hex|mockup|wireframe|hero section|dashboard|login form|login page|checkout|button with|show me what (it|the|your|my)|what (it|the corrected|the fixed) (looks?|would look)|sketch a|put together a (color|colour|layout|palette)|suggest a layout|copy for a|write component|build a \w+ page)\b/i;
      if (generativeRegex.test(q)) {
        return "generate_design";
      }
      return "explain_concept";
    }
    async handleUserQuery(query, closestSkill = "contrast", expertise = "intermediate") {
      const intent = this.classifyIntent(query);
      if (intent === "generate_design") {
        return {
          response: getCannedRedirect(closestSkill),
          intent: "generate_design",
          offline: true
        };
      }
      try {
        const systemPrompt = getSystemPrompt(expertise);
        const prompt = `The ${expertise} designer asks this conceptual question about UI design: "${query}".
Answer in at most 50 words explaining the principle, rule, or architectural tradeoff. Do NOT produce designs, CSS, or color palettes.`;
        const text = await this.client.generateText(prompt, systemPrompt);
        const guard = guardHint(text, 2);
        if (guard.ok) {
          return { response: text, intent: "explain_concept", offline: false };
        }
      } catch (e) {
      }
      const q = query.toLowerCase();
      let offlineFallback = `Good design relies on clear hierarchy and standard rules: WCAG contrast (4.5:1), consistent 8pt spacing, and semantic layer structure. Try one of our 2-minute lessons to practice.`;
      if (closestSkill === "auto-layout" || q.includes("auto layout") || q.includes("layout")) {
        offlineFallback = `Auto Layout (Shift+A) turns frames into responsive containers where elements reflow automatically with consistent gap and padding as content resizes.`;
      } else if (closestSkill === "contrast" || q.includes("contrast") || q.includes("color")) {
        offlineFallback = `Color contrast ensures text is readable. WCAG AA requires at least 4.5:1 for normal text and 3.0:1 for large text against its background.`;
      } else if (closestSkill === "spacing-grid" || q.includes("spacing") || q.includes("grid") || q.includes("8pt")) {
        offlineFallback = `An 8-point spacing grid uses multiples of 8 (8, 16, 24, 32px) to establish visual rhythm, eliminate arbitrary margins, and speed up handoff.`;
      } else if (closestSkill === "layer-naming" || q.includes("nam") || q.includes("layer")) {
        offlineFallback = `Semantic layer naming replaces default Figma boilerplate (e.g. "Frame 12") with purposeful names (e.g. CardHeader, Avatar) to keep components maintainable.`;
      }
      return {
        response: offlineFallback,
        intent: "explain_concept",
        offline: true
      };
    }
    /**
     * Analyse an audit summary and produce 2-3 structured Workflow Relay notes for the next designer.
     * Output schema: { notes: Array<{ topic, title, guideline, tradeoffReason, targetScope }> }
     * Falls back to deterministic notes based on top findings if the LLM is unavailable.
     */
    async generateRelayNotes(audit, pageName) {
      const counts = Object.entries(audit.bySkill).filter(([, s]) => s.count > 0).map(([k, s]) => `${k}: ${s.high}H/${s.medium}M/${s.low}L`).join(", ");
      const prompt = `You are SousArtist, a design coach who writes workflow relay notes \u2014 short handoff messages for the next designer.

Page audited: "${pageName}".
Gap summary (rule: highSeverity H / medium M / low L): ${counts || "none"}.
Total findings: ${audit.totalCount}.

Write exactly 2-3 relay notes as a JSON array. Each note must cover a DIFFERENT gap category above.
Schema for each: { "topic": one of [structure|naming|spacing|overrides|autolayout], "title": string \u226410 words, "guideline": string \u226430 words describing the recurring pattern to watch for, "tradeoffReason": string \u226420 words on why it matters, "targetScope": string \u22646 words }.

STRICT RULES:
- No hex codes, no CSS, no code blocks.
- Only mention structural observations from the audit counts above.
- Return ONLY valid JSON: { "notes": [...] }`;
      try {
        const rawText = await this.client.generateText(prompt, SYSTEM_PROMPT);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("NO_JSON");
        const parsed = JSON.parse(jsonMatch[0]);
        const validTopics = ["structure", "naming", "spacing", "overrides", "autolayout"];
        if (Array.isArray(parsed.notes) && parsed.notes.length >= 1 && parsed.notes.every(
          (n) => validTopics.includes(n.topic) && typeof n.title === "string" && typeof n.guideline === "string"
        )) {
          return { notes: parsed.notes.slice(0, 3), offline: false };
        }
        throw new Error("INVALID_SCHEMA");
      } catch (_) {
        const fallbackNotes = [];
        const topicMap = {
          "contrast": "structure",
          "spacing-grid": "spacing",
          "layer-naming": "naming",
          "auto-layout": "autolayout"
        };
        const fallbackTitles = {
          "contrast": "Text contrast falls below WCAG AA",
          "spacing-grid": "Spacing values break the 8pt grid",
          "layer-naming": "Layers use default boilerplate names",
          "auto-layout": "Multi-child frames missing auto layout"
        };
        const fallbackGuidelines = {
          "contrast": "Check every text layer against its background before handoff. Use the contrast checker in the Audit tab.",
          "spacing-grid": "Keep all padding and gap values as multiples of 8px (or 4px for compact layouts).",
          "layer-naming": 'Rename frames, groups and shapes to describe their purpose \u2014 avoid "Frame 12" or "Rectangle 4".',
          "auto-layout": "Wrap any frame with 2+ children in an auto-layout so spacing responds automatically to content changes."
        };
        const fallbackTradeoffs = {
          "contrast": "Accessible contrast avoids legal and usability issues.",
          "spacing-grid": "Grid alignment prevents pixel-pushing in dev handoff.",
          "layer-naming": "Semantic names speed up future edits and reviews.",
          "auto-layout": "Auto layout reduces manual resizing during iterations."
        };
        const sorted = Object.entries(audit.bySkill).filter(([, s]) => s.count > 0).sort((a, b) => b[1].high * 3 + b[1].medium * 2 + b[1].low - (a[1].high * 3 + a[1].medium * 2 + a[1].low)).slice(0, 3);
        for (const [skill] of sorted) {
          fallbackNotes.push({
            topic: topicMap[skill] || "structure",
            title: fallbackTitles[skill] || `Watch out for ${skill} issues`,
            guideline: fallbackGuidelines[skill] || "Review this category before handoff.",
            tradeoffReason: fallbackTradeoffs[skill] || "Avoids rework during development.",
            targetScope: pageName.length > 20 ? "This page" : pageName
          });
        }
        if (fallbackNotes.length === 0) {
          fallbackNotes.push({
            topic: "structure",
            title: "No significant gaps found",
            guideline: "This page passed the four core rule engines. Keep it up for the next designer.",
            tradeoffReason: "Consistent quality reduces handoff friction.",
            targetScope: "General"
          });
        }
        return { notes: fallbackNotes, offline: true };
      }
    }
  };

  // src/code.ts
  var coach = new SousArtistCoach();
  figma.showUI(__html__, { width: 380, height: 640, themeColors: true });
  var currentPracticeFrameId = null;
  var currentPracticeSkill = null;
  var verifiedPracticeFrames = /* @__PURE__ */ new Set();
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "INIT_APP": {
        const state = await loadLearnerState();
        figma.ui.postMessage({
          type: "LEARNER_STATE_LOADED",
          state
        });
        break;
      }
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
          const scope = msg.scope || "PAGE";
          let facts;
          let targetName = figma.currentPage.name;
          if (scope === "SELECTION") {
            const selection = figma.currentPage.selection;
            if (selection.length === 0) {
              figma.ui.postMessage({
                type: "AUDIT_ERROR",
                error: "Please select a component or frame on the canvas to audit."
              });
              break;
            }
            const selected = selection[0];
            const isComp = selected.type === "COMPONENT" || selected.type === "INSTANCE" || selected.type === "COMPONENT_SET";
            targetName = `${isComp ? "Component" : "Frame"}: "${selected.name}"`;
            facts = await extractDesignFacts(selected);
          } else if (scope === "COMPONENTS") {
            let findComponents2 = function(parent) {
              try {
                const ch = parent.children;
                if (ch && Array.isArray(ch)) {
                  for (const child of ch) {
                    if (child.type === "COMPONENT" || child.type === "COMPONENT_SET" || child.type === "INSTANCE") {
                      componentNodes.push(child);
                    } else if (child.children) {
                      findComponents2(child);
                    }
                  }
                }
              } catch (e) {
              }
            };
            var findComponents = findComponents2;
            const componentNodes = [];
            findComponents2(figma.currentPage);
            if (componentNodes.length === 0) {
              figma.ui.postMessage({
                type: "AUDIT_ERROR",
                error: `No components or instances found on "${figma.currentPage.name}". Select a frame or audit the entire page.`
              });
              break;
            }
            targetName = `Components (${componentNodes.length}) on "${figma.currentPage.name}"`;
            facts = await extractMultipleNodesFacts(componentNodes);
          } else {
            facts = await extractDesignFacts(figma.currentPage);
          }
          const state = await loadLearnerState();
          const activeProfile = state.profiles?.find((p) => p.id === state.activeProfileId) || state.profiles?.[0];
          const audit = analyzeAll(facts, activeProfile);
          if (figma.currentPage.name !== "SousArtist Practice") {
            const failedSkills = Object.keys(audit.bySkill).filter(
              (k) => audit.bySkill[k].count > 0
            );
            if (failedSkills.length > 0) {
              const state2 = await loadLearnerState();
              const { updatedState, droppedSkills } = resetLeitnerOnAuditFailure(
                state2,
                failedSkills,
                getTodayDateString()
              );
              if (droppedSkills.length > 0) {
                await saveLearnerState(updatedState);
                figma.ui.postMessage({
                  type: "LEITNER_DROPPED",
                  droppedSkills,
                  state: updatedState
                });
              }
            }
          }
          figma.ui.postMessage({
            type: "AUDIT_RESULTS",
            audit,
            pageName: targetName
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "AUDIT_ERROR",
            error: err?.message || "Failed to audit current page."
          });
        }
        break;
      }
      case "BUILD_PRACTICE": {
        try {
          const skill = msg.skill;
          const frameId = await buildPracticeFrame(skill);
          currentPracticeFrameId = frameId;
          currentPracticeSkill = skill;
          figma.ui.postMessage({
            type: "PRACTICE_FRAME_READY",
            skill,
            frameId
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "PRACTICE_ERROR",
            error: err?.message || "Failed to setup practice frame."
          });
        }
        break;
      }
      case "VERIFY_PRACTICE": {
        try {
          const skill = msg.skill || currentPracticeSkill;
          const frameId = msg.frameId || currentPracticeFrameId;
          if (!frameId && !skill) {
            figma.ui.postMessage({
              type: "VERIFICATION_RESULT",
              result: {
                passed: false,
                skill,
                message: 'No practice frame found. Click "Set up practice frame" first.'
              }
            });
            break;
          }
          if (frameId && verifiedPracticeFrames.has(frameId)) {
            figma.ui.postMessage({
              type: "VERIFICATION_RESULT",
              result: {
                passed: false,
                alreadyCompleted: true,
                skill,
                message: 'This practice frame has already been verified! Click "Set up practice frame" to start a new exercise.'
              }
            });
            break;
          }
          const result = await verifyCurrentPractice(skill, frameId);
          if (result.passed) {
            if (frameId) {
              verifiedPracticeFrames.add(frameId);
            }
            currentPracticeFrameId = null;
            const today = getTodayDateString();
            let state = await loadLearnerState();
            const prevBox = state.skills[skill]?.box ?? 0;
            const { updatedState: stateWithXp, earnedXp } = recordLessonCompletion(
              state,
              `lesson-${skill}`,
              msg.hintsUsedCount || 0,
              today
            );
            const finalState = advanceLeitnerBox(stateWithXp, skill, today);
            await saveLearnerState(finalState);
            const newBox = finalState.skills[skill]?.box ?? 0;
            const boxAdvanced = newBox > prevBox;
            figma.ui.postMessage({
              type: "VERIFICATION_RESULT",
              result: {
                ...result,
                earnedXp,
                state: finalState,
                boxAdvanced,
                prevBox,
                newBox,
                message: boxAdvanced ? `Great work! All checks passed deterministically (+${earnedXp} XP). Advanced to Leitner Box ${newBox}/4!` : `Great work! All checks passed deterministically (+${earnedXp} XP). Retained at Box ${newBox}/4 until scheduled review on ${finalState.skills[skill]?.dueDate}.`
              }
            });
          } else {
            figma.ui.postMessage({
              type: "VERIFICATION_RESULT",
              result
            });
          }
        } catch (err) {
          figma.ui.postMessage({
            type: "VERIFICATION_RESULT",
            result: {
              passed: false,
              skill: msg.skill,
              message: err?.message || "Verification error."
            }
          });
        }
        break;
      }
      case "SELECT_NODE": {
        if (typeof msg.nodeId === "string") {
          const node = await figma.getNodeByIdAsync(msg.nodeId);
          if (node && "type" in node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
            figma.currentPage.selection = [node];
            figma.viewport.scrollAndZoomIntoView([node]);
            const mode = node.layoutMode || "NONE";
            const ch = node.children;
            const count = ch && Array.isArray(ch) ? ch.length : 0;
            figma.notify(`Selected "${node.name}" (Auto Layout: ${mode}, Children: ${count})`, { timeout: 3e3 });
          } else {
            figma.notify(`Could not find layer on canvas.`);
          }
        }
        break;
      }
      case "RECHECK_NODE": {
        if (typeof msg.nodeId === "string") {
          const node = await figma.getNodeByIdAsync(msg.nodeId);
          if (!node) {
            figma.ui.postMessage({
              type: "NODE_RECHECK_RESULT",
              nodeId: msg.nodeId,
              passed: true,
              message: "Layer was deleted or resolved."
            });
            break;
          }
          const sceneNode = node;
          const rawMode = sceneNode.layoutMode;
          const isAutoLayout = rawMode === "HORIZONTAL" || rawMode === "VERTICAL" || rawMode === "GRID";
          const ch = sceneNode.children;
          const childCount = ch && Array.isArray(ch) ? ch.length : 0;
          const spacing = sceneNode.itemSpacing;
          if (isAutoLayout || childCount < 2) {
            figma.notify(`\u2713 "${sceneNode.name}" verified! Auto Layout is active (${rawMode}).`);
            figma.ui.postMessage({
              type: "NODE_RECHECK_RESULT",
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              passed: true,
              layoutMode: rawMode || "VERTICAL",
              childCount,
              spacing: typeof spacing === "number" ? spacing : void 0,
              message: `"${sceneNode.name}" is now using Auto Layout (${rawMode || "VERTICAL"}${typeof spacing === "number" ? `, ${spacing}px gap` : ""})!`
            });
          } else {
            figma.currentPage.selection = [sceneNode];
            figma.viewport.scrollAndZoomIntoView([sceneNode]);
            figma.notify(`"${sceneNode.name}" selected: Auto Layout is still OFF. Press Shift+A!`, { timeout: 4e3 });
            figma.ui.postMessage({
              type: "NODE_RECHECK_RESULT",
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              passed: false,
              layoutMode: "NONE",
              childCount,
              message: `"${sceneNode.name}" has ${childCount} children and is still using manual positioning (Shift+A).`
            });
          }
        }
        break;
      }
      case "SET_EXPERTISE": {
        if (msg.expertise === "beginner" || msg.expertise === "intermediate" || msg.expertise === "expert") {
          const state = await loadLearnerState();
          state.expertiseLevel = msg.expertise;
          await saveLearnerState(state);
          figma.notify(`Coaching mode set to: ${msg.expertise.toUpperCase()}`);
          figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
        }
        break;
      }
      case "SET_ACTIVE_PROFILE": {
        if (typeof msg.profileId === "string") {
          const state = await loadLearnerState();
          if (state.profiles?.some((p) => p.id === msg.profileId)) {
            state.activeProfileId = msg.profileId;
            await saveLearnerState(state);
            const p = state.profiles.find((x) => x.id === msg.profileId);
            figma.notify(`Standards Profile: "${p?.name || msg.profileId}" active.`);
            figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
          }
        }
        break;
      }
      case "CREATE_STANDARDS_PROFILE": {
        if (msg.profile && typeof msg.profile === "object") {
          const state = await loadLearnerState();
          if (!state.profiles) state.profiles = [];
          state.profiles.push(msg.profile);
          state.activeProfileId = msg.profile.id;
          await saveLearnerState(state);
          figma.notify(`Standards Profile: "${msg.profile.name}" created and active.`);
          figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
        }
        break;
      }
      case "ADD_EXEMPTION": {
        if (typeof msg.nodeId === "string") {
          const state = await loadLearnerState();
          const activeProfile = state.profiles?.find((p) => p.id === state.activeProfileId) || state.profiles?.[0];
          if (activeProfile && !activeProfile.exemptions.includes(msg.nodeId)) {
            activeProfile.exemptions.push(msg.nodeId);
            await saveLearnerState(state);
            figma.notify(`Saved layer as intentional exception in "${activeProfile.name}".`);
            figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
          }
        }
        break;
      }
      case "ADD_RELAY_NOTE": {
        if (msg.note && typeof msg.note === "object") {
          const state = await loadLearnerState();
          state.relayNotes = state.relayNotes || [];
          state.relayNotes.unshift({
            id: `relay-${Date.now()}`,
            author: msg.note.author || "Designer",
            context: msg.note.context || "team",
            topic: msg.note.topic || "structure",
            title: msg.note.title || "Working Pattern",
            guideline: msg.note.guideline || "",
            tradeoffReason: msg.note.tradeoffReason || "",
            targetScope: msg.note.targetScope || "General",
            createdAt: "Just now"
          });
          await saveLearnerState(state);
          figma.notify(`Workflow Relay note added!`);
          figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
        }
        break;
      }
      case "DISMISS_RELAY_NOTE": {
        if (typeof msg.noteId === "string") {
          const state = await loadLearnerState();
          const note = state.relayNotes?.find((n) => n.id === msg.noteId);
          if (note) {
            note.dismissed = true;
            await saveLearnerState(state);
            figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
          }
        }
        break;
      }
      case "COMPLETE_ONBOARDING": {
        if (msg.expertise === "beginner" || msg.expertise === "intermediate" || msg.expertise === "expert") {
          const state = await loadLearnerState();
          state.expertiseLevel = msg.expertise;
          state.onboardingComplete = true;
          await saveLearnerState(state);
          figma.notify(`Welcome! Coaching set to: ${msg.expertise.charAt(0).toUpperCase() + msg.expertise.slice(1)}`);
          figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
        }
        break;
      }
      case "DISMISS_WITH_REASON": {
        if (typeof msg.findingId === "string" && typeof msg.reason === "string") {
          const state = await loadLearnerState();
          state.dismissedFindings = state.dismissedFindings || {};
          state.dismissedFindings[msg.findingId] = {
            reason: msg.reason,
            customNote: msg.customNote || void 0
          };
          if (msg.reason === "intentional" && msg.nodeId) {
            const activeProfile = state.profiles?.find((p) => p.id === state.activeProfileId) || state.profiles?.[0];
            if (activeProfile && !activeProfile.exemptions.includes(msg.nodeId)) {
              activeProfile.exemptions.push(msg.nodeId);
            }
          }
          await saveLearnerState(state);
          const reasonLabels = {
            "intentional": "Intentional design choice",
            "not-applicable": "Not applicable to this context",
            "remind-later": "Will revisit later"
          };
          figma.notify(reasonLabels[msg.reason] || "Exception noted.");
          figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
        }
        break;
      }
      case "RECORD_AUDIT_HISTORY": {
        if (msg.entry && typeof msg.entry === "object") {
          const state = await loadLearnerState();
          state.auditHistory = state.auditHistory || [];
          state.auditHistory.push(msg.entry);
          if (state.auditHistory.length > 20) {
            state.auditHistory = state.auditHistory.slice(-20);
          }
          await saveLearnerState(state);
        }
        break;
      }
      case "INCREMENT_INDEPENDENT_RESOLUTIONS": {
        const state = await loadLearnerState();
        state.independentResolutions = (state.independentResolutions || 0) + 1;
        await saveLearnerState(state);
        figma.ui.postMessage({ type: "LEARNER_STATE_LOADED", state });
        break;
      }
      case "NOTIFY": {
        if (typeof msg.message === "string") {
          figma.notify(msg.message, { timeout: msg.timeout || 3e3 });
        }
        break;
      }
      case "GENERATE_AI_RELAY_NOTES": {
        try {
          const audit = msg.audit;
          const pageName = msg.pageName || figma.currentPage.name;
          const { notes, offline } = await coach.generateRelayNotes(audit, pageName);
          const state = await loadLearnerState();
          state.relayNotes = state.relayNotes || [];
          for (const n of notes) {
            state.relayNotes.unshift({
              id: `relay-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              author: offline ? "SousArtist (offline)" : "SousArtist AI",
              context: "team",
              topic: n.topic,
              title: n.title,
              guideline: n.guideline,
              tradeoffReason: n.tradeoffReason || "",
              targetScope: n.targetScope || pageName,
              createdAt: "Just now"
            });
          }
          await saveLearnerState(state);
          figma.notify(`\u2728 ${notes.length} AI relay note${notes.length !== 1 ? "s" : ""} added.`);
          figma.ui.postMessage({
            type: "AI_RELAY_NOTES_READY",
            state,
            offline,
            count: notes.length
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "AI_RELAY_NOTES_ERROR",
            error: err?.message || "Failed to generate relay notes."
          });
        }
        break;
      }
      default:
        console.log("Main thread unhandled message:", msg.type);
    }
  };
})();
