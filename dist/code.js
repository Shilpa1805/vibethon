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
        const fontSizeStr = node.fontSize ? `${node.fontSize}px` : "text";
        const styleStr = isLarge ? "large text" : "normal text";
        findings.push({
          id: `contrast-${node.id}`,
          skill: "contrast",
          severity: ratio < 3 ? "high" : "medium",
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
            targetLevel: isLarge ? "WCAG Large Text (3.0:1)" : "WCAG Normal Text (4.5:1)"
          },
          summary: `Text "${node.name}" (${fontSizeStr}) has ${ratio.toFixed(1)}:1 contrast against its background. WCAG AA requires at least ${threshold}:1 for ${styleStr}.`,
          whyItMatters: "Fails WCAG AA accessibility standards. Low contrast causes text to wash out under glare or dim lighting, and makes reading difficult for people with vision impairments or color blindness.",
          actionSteps: [
            `Click "Locate" to select "${node.name}" in your Figma canvas.`,
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
            nodeName: node.name || "Auto Layout Frame",
            nodeType: node.type,
            measured: {
              property: "itemSpacing",
              value: node.itemSpacing
            },
            expected: {
              gridMultiple: 4,
              recommended8pt: nearest8
            },
            summary: `Frame "${node.name}" has itemSpacing of ${node.itemSpacing}px, which violates the 4pt/8pt grid system.`,
            whyItMatters: "Arbitrary pixel gaps create subconscious visual noise and cause padding discrepancies when engineers translate Figma frames to CSS flex/grid.",
            actionSteps: [
              `Click "Locate" to select "${node.name}".`,
              `In Figma's right-hand Auto layout panel, find "Gap between items".`,
              `Change the gap from ${node.itemSpacing}px to ${nearest8}px (nearest 8pt multiple) or a multiple of 4.`,
              `Re-run audit to confirm clean grid alignment!`
            ],
            shortcutTip: "Hold Shift + Arrow keys to nudge in 8px increments."
          });
        }
      }
      if (node.padding) {
        const sides = ["l", "r", "t", "b"];
        const sideLabels = { l: "Left", r: "Right", t: "Top", b: "Bottom" };
        for (const side of sides) {
          const val = node.padding[side];
          if (val !== 0 && val % 4 !== 0) {
            const nearest8 = Math.max(0, Math.round(val / 8) * 8);
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
                gridMultiple: 4,
                recommended8pt: nearest8
              },
              summary: `Frame "${node.name}" has ${sideLabels[side]} padding of ${val}px, which is not divisible by 4.`,
              whyItMatters: "Predictable spacing grids (4, 8, 16, 24px) establish cohesive visual rhythm and prevent awkward asymmetric margins.",
              actionSteps: [
                `Click "Locate" to select "${node.name}".`,
                `In the right-hand Auto layout section, adjust ${sideLabels[side]} padding from ${val}px to ${nearest8}px.`,
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
          nodeName: node.name,
          nodeType: node.type,
          measured: {
            currentName: node.name,
            nodeType: node.type
          },
          expected: {
            guideline: "Semantic name describing purpose (e.g. CardHeader, IconWrapper, PrimaryBtn)"
          },
          summary: `${node.type} "${node.name}" uses a default Figma generated name that obscures its functional role.`,
          whyItMatters: 'Default names like "Frame 12" or "Rectangle 4" slow down team collaboration, create confusion during component handoff, and make design systems harder to maintain.',
          actionSteps: [
            `Click "Locate" to highlight "${node.name}".`,
            `Press "Cmd / Ctrl + R" (or double-click the layer name in Figma's left panel).`,
            `Rename it using PascalCase or clear descriptive nouns (e.g. "UserProfileCard", "ThumbnailWrapper", or "ActionBtn").`,
            `Re-run audit to confirm!`
          ],
          shortcutTip: 'Press "Cmd / Ctrl + R" to open the Rename dialog (supports batch rename).'
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
          summary: `Frame "${node.name}" contains ${node.childCount} child elements using manual absolute positioning instead of Auto Layout.`,
          whyItMatters: "Without Auto Layout, dynamic content changes (like longer text or screen resizing) cause elements to overlap or misalign, requiring tedious manual tweaking and slowing down responsive coding.",
          actionSteps: [
            `Click "Locate" to highlight "${node.name}" on your canvas.`,
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
    const existingFrame = practicePage.findChild((n) => n.name.startsWith(`[SousArtist] ${skill}`));
    if (existingFrame) {
      existingFrame.remove();
    }
    const frame = figma.createFrame();
    frame.name = `[SousArtist] ${skill} Practice`;
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
    const node = await figma.getNodeByIdAsync(frameId);
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
  function createDefaultLearnerState() {
    const today = getTodayDateString();
    return {
      xp: 0,
      streakDays: 0,
      lastActiveDate: "",
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
    return {
      xp,
      streakDays,
      lastActiveDate,
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
  function advanceLeitnerBox(state, skill, currentDate) {
    const skillData = state.skills[skill] || { box: 0, dueDate: currentDate, attempts: 0 };
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

  // src/code.ts
  figma.showUI(__html__, { width: 380, height: 640, themeColors: true });
  var currentPracticeFrameId = null;
  var currentPracticeSkill = null;
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
          const audit = analyzeAll(facts);
          if (figma.currentPage.name !== "SousArtist Practice") {
            const failedSkills = Object.keys(audit.bySkill).filter(
              (k) => audit.bySkill[k].count > 0
            );
            if (failedSkills.length > 0) {
              const state = await loadLearnerState();
              const { updatedState, droppedSkills } = resetLeitnerOnAuditFailure(
                state,
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
          if (!frameId) {
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
          const result = await verifyCurrentPractice(skill, frameId);
          if (result.passed) {
            const today = getTodayDateString();
            let state = await loadLearnerState();
            const { updatedState: stateWithXp, earnedXp } = recordLessonCompletion(
              state,
              `lesson-${skill}`,
              msg.hintsUsedCount || 0,
              today
            );
            const finalState = advanceLeitnerBox(stateWithXp, skill, today);
            await saveLearnerState(finalState);
            figma.ui.postMessage({
              type: "VERIFICATION_RESULT",
              result: {
                ...result,
                earnedXp,
                state: finalState
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
        console.log("Main thread unhandled message:", msg.type);
    }
  };
})();
