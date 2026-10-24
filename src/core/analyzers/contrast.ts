// SousArtist - Contrast Analyzer (WCAG 2.1)
// Deterministic rule engine - Pure TypeScript

import { DesignFacts, FactNode, Finding, RGB, StandardsProfile, UnsupportedItem } from '../types';

export function linearizeChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(rgb: RGB): number {
  const r = linearizeChannel(rgb.r);
  const g = linearizeChannel(rgb.g);
  const b = linearizeChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(fg: RGB, bg: RGB): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

export function rgbToHex(rgb: RGB): string {
  const r = Math.round(rgb.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

export function analyzeContrast(facts: DesignFacts, profile?: StandardsProfile): Finding[] {
  const findings: Finding[] = [];
  const nodeMap = new Map<string, FactNode>();
  for (const node of facts.nodes) {
    nodeMap.set(node.id, node);
  }

  // Find effective background for each text node
  function getEffectiveBackground(node: FactNode): RGB {
    let curr = node.parentId ? nodeMap.get(node.parentId) : null;
    while (curr) {
      if (curr.fillColor) {
        return curr.fillColor;
      }
      curr = curr.parentId ? nodeMap.get(curr.parentId) : null;
    }
    // Default to pure white canvas background
    return { r: 1, g: 1, b: 1 };
  }

  const minNormal = profile?.contrast?.minNormalRatio ?? 4.5;
  const minLarge = profile?.contrast?.minLargeRatio ?? 3.0;
  const standardName = profile?.contrast?.standard ?? 'AA';

  for (const node of facts.nodes) {
    if (node.type !== 'TEXT' || !node.textColor) continue;

    const bg = getEffectiveBackground(node);
    const ratio = getContrastRatio(node.textColor, bg);
    const isLarge = (node.fontSize !== null && node.fontSize >= 24) ||
                    (node.fontSize !== null && node.fontSize >= 18.66 && node.fontBold === true);
    const threshold = isLarge ? minLarge : minNormal;

    if (ratio < threshold) {
      const fontSizeStr = node.fontSize ? `${node.fontSize}px` : 'text';
      const styleStr = isLarge ? 'large text' : 'normal text';

      findings.push({
        id: `contrast-${node.id}`,
        skill: 'contrast',
        severity: ratio < (isLarge ? 2.5 : 3.0) ? 'high' : 'medium',
        nodeId: node.id,
        nodeName: node.name || 'Text Layer',
        nodeType: 'TEXT',
        measured: {
          ratio: Number(ratio.toFixed(2)),
          fontSize: node.fontSize ?? 14,
          isLarge: isLarge ? 1 : 0,
        },
        expected: {
          minRatio: threshold,
          targetLevel: `WCAG ${standardName} (${threshold}:1)`,
        },
        profileContext: profile ? `${profile.name} (WCAG ${standardName})` : undefined,
        summary: `Text "${node.name}" (${fontSizeStr}) has ${ratio.toFixed(1)}:1 contrast against its background. Standard requires at least ${threshold}:1 for ${styleStr}.`,
        whyItMatters: `Fails WCAG ${standardName} accessibility standards. Low contrast causes text to wash out under glare or dim lighting, and makes reading difficult for people with vision impairments or color blindness.`,
        tradeoffTip: 'If low contrast was intentionally chosen for disabled state or watermarks, mark it as Dismiss (Intentional).',
        actionSteps: [
          `Click "Show in File" to select "${node.name}" in your Figma canvas.`,
          `In Figma's right-hand panel, go to the "Fill" section.`,
          `Adjust the text color or container background to increase the luminance difference until contrast reaches at least ${threshold}:1.`,
          `Re-run audit to verify the fix passes!`,
        ],
        shortcutTip: 'Press "I" to open the Eyedropper and sample a high-contrast color.',
      });
    }
  }

  return findings;
}

export function detectUnsupportedCases(facts: DesignFacts): UnsupportedItem[] {
  const unsupported: UnsupportedItem[] = [];
  for (const node of facts.nodes) {
    if (node.type === 'TEXT' && (node.hasUnsupportedFill || !node.textColor)) {
      unsupported.push({
        nodeId: node.id,
        nodeName: node.name || 'Text',
        skill: 'contrast',
        reason: 'Layer has image or gradient fill; deterministic offline contrast measurement is skipped.',
      });
    }
  }
  return unsupported;
}
