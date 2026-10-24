// SousArtist - Layer Naming Analyzer
// Deterministic rule engine - Flags default generated layer names

import { DesignFacts, Finding, StandardsProfile } from '../types';

export const DEFAULT_NAME_REGEX = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Section)\s?\d*$/i;

export function analyzeNaming(facts: DesignFacts, profile?: StandardsProfile): Finding[] {
  const findings: Finding[] = [];
  const pattern = profile?.naming?.pattern ?? 'default-check';

  for (const node of facts.nodes) {
    // Ignore TEXT nodes (Figma names them after their text content)
    if (node.type === 'TEXT') continue;

    // Only inspect FRAME, GROUP, and SHAPE nodes
    if (node.type !== 'FRAME' && node.type !== 'GROUP' && node.type !== 'SHAPE') continue;

    const trimmed = node.name.trim();
    let isViolation = false;
    let expectedGuideline = 'Semantic name describing purpose (e.g. CardHeader, IconWrapper, PrimaryBtn)';
    let summaryText = `${node.type} "${node.name}" uses a default Figma generated name that obscures its functional role.`;

    if (DEFAULT_NAME_REGEX.test(trimmed)) {
      isViolation = true;
    } else if (pattern === 'slash-hierarchy' && node.isComponent && !trimmed.includes('/')) {
      isViolation = true;
      expectedGuideline = 'Slash-hierarchy pattern: e.g. "Button/Primary", "Input/Active", "Card/Header"';
      summaryText = `Component "${node.name}" does not use the project's slash-hierarchy naming convention (Category/Name).`;
    } else if (pattern === 'pascal-case' && node.isComponent && !/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
      isViolation = true;
      expectedGuideline = 'PascalCase pattern: e.g. "PrimaryButton", "HeroCard", "NavMenu"';
      summaryText = `Component "${node.name}" does not follow the project's PascalCase convention.`;
    }

    if (isViolation) {
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
          guideline: expectedGuideline,
        },
        profileContext: profile ? `${profile.name} (${pattern})` : undefined,
        summary: summaryText,
        whyItMatters: 'Descriptive names slow down team collaboration, create confusion during component handoff, and make design systems harder to maintain.',
        tradeoffTip: 'Temporary scratch layers can be named loosely, but components and export assets should strictly adhere to team naming standards.',
        actionSteps: [
          `Click "Show in File" to highlight "${node.name}".`,
          `Press "Cmd / Ctrl + R" (or double-click the layer name in Figma's left panel).`,
          `Rename it using ${expectedGuideline}.`,
          `Re-run audit to confirm!`,
        ],
        shortcutTip: 'Press "Cmd / Ctrl + R" to open the Rename dialog (supports batch rename).',
      });
    }
  }

  return findings;
}
