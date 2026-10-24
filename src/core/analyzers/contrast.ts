// SousArtist - Contrast Analyzer (WCAG 2.1)
// Deterministic rule engine - Pure TypeScript

import { DesignFacts, FactNode, Finding, RGB } from '../types';

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

export function analyzeContrast(facts: DesignFacts): Finding[] {
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

  for (const node of facts.nodes) {
    if (node.type !== 'TEXT' || !node.textColor) continue;

    const bg = getEffectiveBackground(node);
    const ratio = getContrastRatio(node.textColor, bg);
    const isLarge = (node.fontSize !== null && node.fontSize >= 24) ||
                    (node.fontSize !== null && node.fontSize >= 18.66 && node.fontBold === true);
    const threshold = isLarge ? 3.0 : 4.5;

    if (ratio < threshold) {
      findings.push({
        id: `contrast-${node.id}`,
        skill: 'contrast',
        severity: ratio < 3.0 ? 'high' : 'medium',
        nodeId: node.id,
        measured: {
          ratio: Number(ratio.toFixed(2)),
          fontSize: node.fontSize ?? 14,
          isLarge: isLarge ? 1 : 0,
        },
        expected: {
          minRatio: threshold,
          targetLevel: isLarge ? 'WCAG Large Text (3.0:1)' : 'WCAG Normal Text (4.5:1)',
        },
      });
    }
  }

  return findings;
}
