// SousArtist - Auto Layout Analyzer
// Deterministic rule engine - Flags multi-child frames missing auto-layout

import { DesignFacts, Finding } from '../types';

export function analyzeAutoLayout(facts: DesignFacts): Finding[] {
  const findings: Finding[] = [];

  for (const node of facts.nodes) {
    if (node.type === 'FRAME' && node.childCount >= 2 && node.layoutMode === 'NONE') {
      findings.push({
        id: `autolayout-${node.id}`,
        skill: 'auto-layout',
        severity: 'low',
        nodeId: node.id,
        measured: {
          childCount: node.childCount,
          layoutMode: 'NONE',
          frameName: node.name,
        },
        expected: {
          layoutMode: 'HORIZONTAL or VERTICAL',
          benefit: 'Responsive flex flow and predictable spacing (Shift+A)',
        },
      });
    }
  }

  return findings;
}
