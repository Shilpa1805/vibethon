// SousArtist - Figma Node Fact Extractor
// Walks Figma document trees and extracts anonymized, structural DesignFacts.
// CRITICAL: Handles figma.mixed gracefully on all properties to prevent crashes.

/// <reference types="@figma/plugin-typings" />
import { DesignFacts, FactNode, RGB } from '../../core/types';

const MAX_NODE_CAP = 5000;

export async function extractDesignFacts(rootNode: SceneNode | PageNode): Promise<DesignFacts> {
  const nodes: FactNode[] = [];
  let truncated = false;

  // For dynamic-page access, ensure page contents are loaded
  if (typeof (rootNode as any).loadAsync === 'function') {
    try {
      await (rootNode as any).loadAsync();
    } catch (e) {
      console.warn('Page loadAsync skipped or failed:', e);
    }
  }

  function extractSolidColor(fills: readonly Paint[] | PluginAPI['mixed']): RGB | null {
    if (!fills || fills === figma.mixed || !Array.isArray(fills)) {
      return null;
    }
    for (const paint of fills) {
      if (paint.type === 'SOLID' && paint.visible !== false && paint.opacity !== 0) {
        return {
          r: paint.color.r,
          g: paint.color.g,
          b: paint.color.b,
        };
      }
    }
    return null;
  }

  function getHslHue(rgb: RGB | null): number | null {
    if (!rgb) return null;
    const r = rgb.r, g = rgb.g, b = rgb.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.001) return null; // grey has no hue

    let h = 0;
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    return h;
  }

  function determineType(node: SceneNode | PageNode): FactNode['type'] {
    switch (node.type) {
      case 'FRAME':
      case 'COMPONENT':
      case 'INSTANCE':
        return 'FRAME';
      case 'TEXT':
        return 'TEXT';
      case 'GROUP':
        return 'GROUP';
      case 'RECTANGLE':
      case 'ELLIPSE':
      case 'POLYGON':
      case 'STAR':
      case 'VECTOR':
      case 'LINE':
        return 'SHAPE';
      default:
        return 'OTHER';
    }
  }

  function walk(current: SceneNode | PageNode) {
    if (nodes.length >= MAX_NODE_CAP) {
      truncated = true;
      return;
    }

    // Skip root page itself from facts, but traverse its children
    if (current.type !== 'PAGE') {
      const sceneNode = current as SceneNode;
      const nodeType = determineType(sceneNode);

      let textColor: RGB | null = null;
      let fontSize: number | null = null;
      let fontBold: boolean | null = null;

      if (sceneNode.type === 'TEXT') {
        const textNode = sceneNode as TextNode;
        textColor = extractSolidColor(textNode.fills);

        if (textNode.fontSize !== figma.mixed) {
          fontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : null;
        }

        if (textNode.fontName !== figma.mixed && textNode.fontName) {
          const font = textNode.fontName as FontName;
          fontBold = /bold|black|heavy|semibold/i.test(font.style);
        }
      }

      let fillColor: RGB | null = null;
      try {
        const rawFills = (sceneNode as any).fills;
        if (rawFills && rawFills !== (figma as any).mixed) {
          fillColor = extractSolidColor(rawFills);
        }
      } catch (e) {
        // Safe fallback
      }

      let layoutMode: FactNode['layoutMode'] = 'NONE';
      let itemSpacing: number | null = null;
      let padding: FactNode['padding'] = null;

      try {
        const anyNode = sceneNode as any;
        const rawMode = anyNode.layoutMode;
        if (rawMode === 'HORIZONTAL' || rawMode === 'VERTICAL') {
          layoutMode = rawMode;
        } else if (rawMode === 'GRID') {
          layoutMode = 'VERTICAL'; // Treat GRID auto-layout as auto-layout
        }

        const rawSpacing = anyNode.itemSpacing;
        if (typeof rawSpacing === 'number' && rawSpacing !== (figma as any).mixed) {
          itemSpacing = rawSpacing;
        }

        const pl = anyNode.paddingLeft;
        const pr = anyNode.paddingRight;
        const pt = anyNode.paddingTop;
        const pb = anyNode.paddingBottom;
        if (typeof pl === 'number' || typeof pr === 'number' || typeof pt === 'number' || typeof pb === 'number') {
          padding = {
            l: typeof pl === 'number' ? pl : 0,
            r: typeof pr === 'number' ? pr : 0,
            t: typeof pt === 'number' ? pt : 0,
            b: typeof pb === 'number' ? pb : 0,
          };
        }
      } catch (e) {
        // Safe fallback for nodes without layout properties
      }

      let childCount = 0;
      try {
        const ch = (sceneNode as any).children;
        if (ch && Array.isArray(ch)) {
          childCount = ch.length;
        }
      } catch (e) {}

      const isComponent = sceneNode.type === 'COMPONENT' || sceneNode.type === 'INSTANCE' || (sceneNode as any).type === 'COMPONENT_SET';

      let width: number | undefined = undefined;
      let height: number | undefined = undefined;
      try {
        if (typeof (sceneNode as any).width === 'number') width = (sceneNode as any).width;
        if (typeof (sceneNode as any).height === 'number') height = (sceneNode as any).height;
      } catch (e) {}

      const factNode: FactNode = {
        id: sceneNode.id,
        type: nodeType,
        name: sceneNode.name || '',
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
        componentName: isComponent ? sceneNode.name : null,
      };

      nodes.push(factNode);
    }

    try {
      const children = (current as any).children;
      if (children && Array.isArray(children)) {
        for (const child of children) {
          walk(child);
          if (nodes.length >= MAX_NODE_CAP) break;
        }
      }
    } catch (e) {}
  }

  walk(rootNode);

  return {
    nodes,
    truncated,
  };
}

export async function extractMultipleNodesFacts(targetNodes: SceneNode[]): Promise<DesignFacts> {
  const combinedNodes: FactNode[] = [];
  let isTruncated = false;

  for (const node of targetNodes) {
    const facts = await extractDesignFacts(node);
    combinedNodes.push(...facts.nodes);
    if (facts.truncated || combinedNodes.length >= 5000) {
      isTruncated = true;
      break;
    }
  }

  return {
    nodes: combinedNodes.slice(0, 5000),
    truncated: isTruncated,
  };
}
