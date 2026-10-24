// SousArtist - Layer Naming Analyzer
// Deterministic rule engine - Flags default generated layer names

import { DesignFacts, Finding } from '../types';

export const DEFAULT_NAME_REGEX = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Section)\s?\d*$/i;

export function analyzeNaming(facts: DesignFacts): Finding[] {
  const findings: Finding[] = [];

  for (const node of facts.nodes) {
    // Ignore TEXT nodes (Figma names them after their text content)
    if (node.type === 'TEXT') continue;

    // Only inspect FRAME, GROUP, and SHAPE nodes
    if (node.type !== 'FRAME' && node.type !== 'GROUP' && node.type !== 'SHAPE') continue;

    if (DEFAULT_NAME_REGEX.test(node.name.trim())) {
      findings.push({
        id: `naming-${node.id}`,
        skill: 'layer-naming',
        severity: 'low',
        nodeId: node.id,
        measured: {
          currentName: node.name,
          nodeType: node.type,
        },
        expected: {
          guideline: 'Semantic name describing purpose (e.g. CardHeader, IconWrapper, PrimaryBtn)',
        },
      });
    }
  }

  return findings;
}
