// SousArtist - Spacing Grid Analyzer
// Deterministic rule engine - 4pt/8pt grid system

import { DesignFacts, Finding, StandardsProfile } from '../types';

export function analyzeSpacing(facts: DesignFacts, profile?: StandardsProfile): Finding[] {
  const findings: Finding[] = [];
  const baseGrid = profile?.spacing?.baseGrid ?? 4;
  const allowedExceptions = profile?.spacing?.allowedExceptions ?? [4, 12];

  for (const node of facts.nodes) {
    if (node.layoutMode === 'NONE') continue;

    // Check itemSpacing
    if (node.itemSpacing !== null && node.itemSpacing !== 0) {
      const isAllowed = (node.itemSpacing % baseGrid === 0) || allowedExceptions.includes(node.itemSpacing);
      if (!isAllowed) {
        const nearest = Math.max(0, Math.round(node.itemSpacing / baseGrid) * baseGrid);
        const nearest8pt = Math.max(0, Math.round(node.itemSpacing / 8) * 8);
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
            gridMultiple: baseGrid,
            recommended8pt: nearest8pt,
          },
          profileContext: profile ? `${profile.name} (${baseGrid}pt grid)` : undefined,
          summary: `Frame "${node.name}" has itemSpacing of ${node.itemSpacing}px, which violates the ${baseGrid}pt grid system.`,
          whyItMatters: 'Arbitrary pixel gaps create subconscious visual noise and cause padding discrepancies when engineers translate Figma frames to CSS flex/grid.',
          tradeoffTip: `Optical adjustments may warrant exceptions (e.g. ${allowedExceptions.join(', ')}px). Use "Dismiss (Intentional)" if this is purposeful.`,
          actionSteps: [
            `Click "Show in File" to select "${node.name}".`,
            `In Figma's right-hand Auto layout panel, find "Gap between items".`,
            `Change the gap from ${node.itemSpacing}px to ${nearest}px (nearest ${baseGrid}pt multiple).`,
            `Re-run audit to confirm clean grid alignment!`,
          ],
          shortcutTip: `Hold Shift + Arrow keys to nudge in ${baseGrid}px increments.`,
        });
      }
    }

    // Check padding (l, r, t, b)
    if (node.padding) {
      const sides: Array<keyof typeof node.padding> = ['l', 'r', 't', 'b'];
      const sideLabels = { l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' };
      for (const side of sides) {
        const val = node.padding[side];
        const isAllowed = (val % baseGrid === 0) || allowedExceptions.includes(val);
        if (val !== 0 && !isAllowed) {
          const nearest = Math.max(0, Math.round(val / baseGrid) * baseGrid);
          const nearest8pt = Math.max(0, Math.round(val / 8) * 8);
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
              gridMultiple: baseGrid,
              recommended8pt: nearest8pt,
            },
            profileContext: profile ? `${profile.name} (${baseGrid}pt grid)` : undefined,
            summary: `Frame "${node.name}" has ${sideLabels[side]} padding of ${val}px, which violates the ${baseGrid}pt grid.`,
            whyItMatters: 'Predictable spacing grids establish cohesive visual rhythm and prevent awkward asymmetric margins.',
            tradeoffTip: 'Optical spacing adjustments for nested components can be marked as Intentional to keep clean records.',
            actionSteps: [
              `Click "Show in File" to select "${node.name}".`,
              `In the right-hand Auto layout section, adjust ${sideLabels[side]} padding from ${val}px to ${nearest}px.`,
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
