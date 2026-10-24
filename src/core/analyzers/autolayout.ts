// SousArtist - Auto Layout Analyzer
// Deterministic rule engine - Flags multi-child frames missing auto-layout

import { DesignFacts, Finding, StandardsProfile } from '../types';

export function analyzeAutoLayout(facts: DesignFacts, profile?: StandardsProfile): Finding[] {
  const findings: Finding[] = [];
  const minChildren = 2;

  for (const node of facts.nodes) {
    if (node.type === 'FRAME' && node.childCount >= minChildren && node.layoutMode === 'NONE') {
      findings.push({
        id: `autolayout-${node.id}`,
        skill: 'auto-layout',
        severity: 'low',
        nodeId: node.id,
        nodeName: node.name || 'Frame',
        nodeType: 'FRAME',
        measured: {
          childCount: node.childCount,
          layoutMode: 'NONE',
          frameName: node.name,
        },
        expected: {
          layoutMode: 'HORIZONTAL or VERTICAL',
          benefit: 'Responsive flex flow and predictable spacing (Shift+A)',
        },
        profileContext: profile ? profile.name : undefined,
        summary: `Frame "${node.name}" contains ${node.childCount} child elements using manual absolute positioning instead of Auto Layout.`,
        whyItMatters: 'Without Auto Layout, dynamic content changes (like longer text or screen resizing) cause elements to overlap or misalign, requiring tedious manual tweaking and slowing down responsive coding.',
        tradeoffTip: 'Freeform canvas artboards, decorative illustrations, or badge overlays can use absolute positioning. Use "Dismiss (Intentional)" to mark valid exceptions.',
        actionSteps: [
          `Click "Show in File" to highlight "${node.name}" on your canvas.`,
          `Press "Shift + A" (or click the "+" icon next to Auto layout in the right sidebar).`,
          `Choose your layout flow: Vertical (top-to-bottom stack) or Horizontal (side-by-side row).`,
          `Set gap and padding to multiples of 4 or 8 (e.g., 12px or 16px).`,
          `Re-run audit to confirm responsive alignment!`,
        ],
        shortcutTip: 'Press "Shift + A" to instantly convert any selection or frame into Auto Layout.',
      });
    }
  }

  return findings;
}
