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
        nodeName: node.name,
        nodeType: node.type,
        measured: {
          currentName: node.name,
          nodeType: node.type,
        },
        expected: {
          guideline: 'Semantic name describing purpose (e.g. CardHeader, IconWrapper, PrimaryBtn)',
        },
        summary: `${node.type} "${node.name}" uses a default Figma generated name that obscures its functional role.`,
        whyItMatters: 'Default names like "Frame 12" or "Rectangle 4" slow down team collaboration, create confusion during component handoff, and make design systems harder to maintain.',
        actionSteps: [
          `Click "Locate" to highlight "${node.name}".`,
          `Press "Cmd / Ctrl + R" (or double-click the layer name in Figma's left panel).`,
          `Rename it using PascalCase or clear descriptive nouns (e.g. "UserProfileCard", "ThumbnailWrapper", or "ActionBtn").`,
          `Re-run audit to confirm!`,
        ],
        shortcutTip: 'Press "Cmd / Ctrl + R" to open the Rename dialog (supports batch rename).',
      });
    }
  }

  return findings;
}
