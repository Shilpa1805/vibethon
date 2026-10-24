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
  if ('loadAsync' in rootNode && typeof (rootNode as any).loadAsync === 'function') {
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
      if ('fills' in sceneNode) {
        fillColor = extractSolidColor((sceneNode as any).fills);
      }

      let layoutMode: FactNode['layoutMode'] = 'NONE';
      let itemSpacing: number | null = null;
      let padding: FactNode['padding'] = null;

      if ('layoutMode' in sceneNode) {
        const frame = sceneNode as FrameNode;
        if (frame.layoutMode === 'HORIZONTAL' || frame.layoutMode === 'VERTICAL') {
          layoutMode = frame.layoutMode;
        }

        if ('itemSpacing' in frame && (frame as any).itemSpacing !== figma.mixed) {
          itemSpacing = typeof frame.itemSpacing === 'number' ? frame.itemSpacing : null;
        }

        const l = 'paddingLeft' in frame && typeof frame.paddingLeft === 'number' ? frame.paddingLeft : 0;
        const r = 'paddingRight' in frame && typeof frame.paddingRight === 'number' ? frame.paddingRight : 0;
        const t = 'paddingTop' in frame && typeof frame.paddingTop === 'number' ? frame.paddingTop : 0;
        const b = 'paddingBottom' in frame && typeof frame.paddingBottom === 'number' ? frame.paddingBottom : 0;
        padding = { l, r, t, b };
      }

      const childCount = 'children' in sceneNode && Array.isArray(sceneNode.children)
        ? sceneNode.children.length
        : 0;

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
        width: 'width' in sceneNode ? sceneNode.width : undefined,
        height: 'height' in sceneNode ? sceneNode.height : undefined,
        hue: getHslHue(textColor || fillColor),
      };

      nodes.push(factNode);
    }

    if ('children' in current && Array.isArray(current.children)) {
      for (const child of current.children) {
        walk(child);
        if (nodes.length >= MAX_NODE_CAP) break;
      }
    }
  }

  walk(rootNode);

  return {
    nodes,
    truncated,
  };
}
