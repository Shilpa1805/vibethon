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
          measured: {
            property: 'itemSpacing',
            value: node.itemSpacing,
          },
          expected: {
            gridMultiple: 4,
            recommended8pt: nearest8,
          },
        });
      }
    }

    // Check padding (l, r, t, b)
    if (node.padding) {
      const sides: Array<keyof typeof node.padding> = ['l', 'r', 't', 'b'];
      for (const side of sides) {
        const val = node.padding[side];
        if (val !== 0 && val % 4 !== 0) {
          const nearest8 = Math.max(0, Math.round(val / 8) * 8);
          findings.push({
            id: `spacing-pad-${side}-${node.id}`,
            skill: 'spacing-grid',
            severity: 'medium',
            nodeId: node.id,
            measured: {
              property: `padding-${side}`,
              value: val,
            },
            expected: {
              gridMultiple: 4,
              recommended8pt: nearest8,
            },
          });
        }
      }
    }
  }

  return findings;
}
