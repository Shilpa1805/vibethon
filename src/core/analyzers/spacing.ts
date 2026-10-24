// SousArtist - Spacing Grid Analyzer
// Deterministic rule engine - 4pt/8pt grid system

import { DesignFacts, Finding } from '../types';

export function analyzeSpacing(facts: DesignFacts): Finding[] {
  const findings: Finding[] = [];

  for (const node of facts.nodes) {
    if (node.layoutMode === 'NONE') continue;

    // Check itemSpacing
    if (node.itemSpacing !== null && node.itemSpacing !== 0) {
      if (node.itemSpacing % 4 !== 0) {
        const nearest8 = Math.max(0, Math.round(node.itemSpacing / 8) * 8);
        findings.push({
          id: `spacing-item-${node.id}`,
          skill: 'spacing-grid',
          severity: 'medium',
          nodeId: node.id,
          nodeName: node.name || 'Auto Layout Frame',
          nodeType: node.type,
          measured: {
            property: 'itemSpacing',
            value: node.itemSpacing,
          },
          expected: {
            gridMultiple: 4,
            recommended8pt: nearest8,
          },
          summary: `Frame "${node.name}" has itemSpacing of ${node.itemSpacing}px, which violates the 4pt/8pt grid system.`,
          whyItMatters: 'Arbitrary pixel gaps create subconscious visual noise and cause padding discrepancies when engineers translate Figma frames to CSS flex/grid.',
          actionSteps: [
            `Click "Locate" to select "${node.name}".`,
            `In Figma's right-hand Auto layout panel, find "Gap between items".`,
            `Change the gap from ${node.itemSpacing}px to ${nearest8}px (nearest 8pt multiple) or a multiple of 4.`,
            `Re-run audit to confirm clean grid alignment!`,
          ],
          shortcutTip: 'Hold Shift + Arrow keys to nudge in 8px increments.',
        });
      }
    }

    // Check padding (l, r, t, b)
    if (node.padding) {
      const sides: Array<keyof typeof node.padding> = ['l', 'r', 't', 'b'];
      const sideLabels = { l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' };
      for (const side of sides) {
        const val = node.padding[side];
        if (val !== 0 && val % 4 !== 0) {
          const nearest8 = Math.max(0, Math.round(val / 8) * 8);
          findings.push({
            id: `spacing-pad-${side}-${node.id}`,
            skill: 'spacing-grid',
            severity: 'medium',
            nodeId: node.id,
            nodeName: node.name || 'Auto Layout Frame',
            nodeType: node.type,
            measured: {
              property: `padding-${side}`,
              value: val,
            },
            expected: {
              gridMultiple: 4,
              recommended8pt: nearest8,
            },
            summary: `Frame "${node.name}" has ${sideLabels[side]} padding of ${val}px, which is not divisible by 4.`,
            whyItMatters: 'Predictable spacing grids (4, 8, 16, 24px) establish cohesive visual rhythm and prevent awkward asymmetric margins.',
            actionSteps: [
              `Click "Locate" to select "${node.name}".`,
              `In the right-hand Auto layout section, adjust ${sideLabels[side]} padding from ${val}px to ${nearest8}px.`,
              `Re-run audit to verify!`,
            ],
            shortcutTip: 'Standard padding progression: 8px (compact), 16px (card default), 24px (spacious).',
          });
        }
      }
    }
  }

  return findings;
}
