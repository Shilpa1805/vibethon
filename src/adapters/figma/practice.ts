// SousArtist - Figma Practice Frame Builder & Live Verifier
// STRICT COMPLIANCE: Operates ONLY on "SousArtist Practice" page.
// Never modifies user pages.

/// <reference types="@figma/plugin-typings" />
import { SkillId } from '../../core/types';
import { extractDesignFacts } from './extract';
import { VerificationResult, verifyPracticeFrame } from '../../core/lessons/verify';

export const PRACTICE_PAGE_NAME = 'SousArtist Practice';

export async function getOrCreatePracticePage(): Promise<PageNode> {
  let page = figma.root.children.find((p) => p.name === PRACTICE_PAGE_NAME);
  if (!page) {
    page = figma.createPage();
    page.name = PRACTICE_PAGE_NAME;
  }
  // With dynamic-page access, ensure page is loaded
  if ('loadAsync' in page && typeof (page as any).loadAsync === 'function') {
    await (page as any).loadAsync();
  }
  return page;
}

export async function buildPracticeFrame(skill: SkillId): Promise<string> {
  const practicePage = await getOrCreatePracticePage();
  await figma.setCurrentPageAsync(practicePage);

  // Load standard Figma fonts
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // Remove previous frame for this skill if present
  const existingFrame = practicePage.findChild((n) => n.name.startsWith(`[SousArtist] ${skill}`));
  if (existingFrame) {
    existingFrame.remove();
  }

  const frame = figma.createFrame();
  frame.name = `[SousArtist] ${skill} Practice`;
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  frame.cornerRadius = 8;
  frame.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.87, b: 0.9 } }];
  frame.strokeWeight = 1;

  switch (skill) {
    case 'contrast': {
      // White card with low-contrast gray text (#B0B0B0 = ~2.1:1 ratio)
      frame.resize(340, 180);
      frame.layoutMode = 'VERTICAL';
      frame.itemSpacing = 12;
      frame.paddingLeft = 24;
      frame.paddingRight = 24;
      frame.paddingTop = 24;
      frame.paddingBottom = 24;

      const title = figma.createText();
      title.characters = 'Product Card Title';
      title.fontSize = 20;
      title.fontName = { family: 'Inter', style: 'Bold' };
      title.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }]; // High contrast title

      const bodyText = figma.createText();
      bodyText.characters = 'This description text has poor contrast. Use the Fill panel to darken it until it meets WCAG AA (4.5:1).';
      bodyText.fontSize = 14;
      bodyText.fontName = { family: 'Inter', style: 'Regular' };
      // Flawed light gray: #B0B0B0 (0.69, 0.69, 0.69)
      bodyText.fills = [{ type: 'SOLID', color: { r: 0.69, g: 0.69, b: 0.69 } }];

      frame.appendChild(title);
      frame.appendChild(bodyText);
      break;
    }

    case 'spacing-grid': {
      // Auto-layout frame with non-multiple-of-4 gap (13) and padding (7/19)
      frame.resize(320, 200);
      frame.layoutMode = 'VERTICAL';
      frame.itemSpacing = 13; // Flaw: not divisible by 4
      frame.paddingLeft = 7;   // Flaw: not divisible by 4
      frame.paddingRight = 19; // Flaw: not divisible by 4
      frame.paddingTop = 7;
      frame.paddingBottom = 19;

      const rect1 = figma.createRectangle();
      rect1.name = 'CardItem1';
      rect1.resize(260, 44);
      rect1.fills = [{ type: 'SOLID', color: { r: 0.93, g: 0.94, b: 0.98 } }];
      rect1.cornerRadius = 6;

      const rect2 = figma.createRectangle();
      rect2.name = 'CardItem2';
      rect2.resize(260, 44);
      rect2.fills = [{ type: 'SOLID', color: { r: 0.88, g: 0.9, b: 0.96 } }];
      rect2.cornerRadius = 6;

      frame.appendChild(rect1);
      frame.appendChild(rect2);
      break;
    }

    case 'layer-naming': {
      // Frame with default generated Figma names
      frame.name = 'Frame 12'; // Flaw: default name
      frame.resize(300, 180);
      frame.layoutMode = 'VERTICAL';
      frame.itemSpacing = 12;
      frame.paddingLeft = 16;
      frame.paddingRight = 16;
      frame.paddingTop = 16;
      frame.paddingBottom = 16;

      const shape = figma.createRectangle();
      shape.name = 'Rectangle 4'; // Flaw: default name
      shape.resize(268, 80);
      shape.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.93, b: 0.95 } }];

      const textInner = figma.createText();
      textInner.characters = 'Rename layers in the left sidebar to meaningful names.';
      textInner.fontSize = 12;
      textInner.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];

      // Group with default name
      const group = figma.group([textInner], frame);
      group.name = 'Group 3'; // Flaw: default name

      frame.appendChild(shape);
      frame.appendChild(group);
      break;
    }

    case 'auto-layout': {
      // Manually positioned elements with layoutMode NONE
      frame.name = 'FeatureFrame';
      frame.resize(320, 180);
      frame.layoutMode = 'NONE'; // Flaw: missing auto-layout with 3 children

      const item1 = figma.createRectangle();
      item1.name = 'IconBox';
      item1.resize(40, 40);
      item1.x = 20;
      item1.y = 20;
      item1.fills = [{ type: 'SOLID', color: { r: 0.39, g: 0.4, b: 0.95 } }];
      item1.cornerRadius = 8;

      const item2 = figma.createText();
      item2.characters = 'Feature Headline';
      item2.fontSize = 16;
      item2.fontName = { family: 'Inter', style: 'Bold' };
      item2.x = 20;
      item2.y = 75;
      item2.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];

      const item3 = figma.createText();
      item3.characters = 'Select outer frame and press Shift+A to turn into Auto Layout.';
      item3.fontSize = 12;
      item3.x = 20;
      item3.y = 110;
      item3.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];

      frame.appendChild(item1);
      frame.appendChild(item2);
      frame.appendChild(item3);
      break;
    }
  }

  // Position frame cleanly on the canvas
  frame.x = 100;
  frame.y = 100;

  // Select and focus on the practice frame
  practicePage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  return frame.id;
}

export async function verifyCurrentPractice(skill: SkillId, frameId: string): Promise<VerificationResult> {
  const node = figma.getNodeById(frameId);
  if (!node || node.type !== 'FRAME') {
    return {
      passed: false,
      skill,
      remainingFindings: [],
      message: 'Practice frame was deleted or not found. Click "Set up practice frame" to recreate it.',
    };
  }

  const facts = await extractDesignFacts(node as FrameNode);
  return verifyPracticeFrame(skill, facts);
}
