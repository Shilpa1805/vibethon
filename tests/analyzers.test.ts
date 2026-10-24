import { describe, it, expect } from 'vitest';
import {
  getContrastRatio,
  hexToRgb,
  analyzeContrast,
} from '../src/core/analyzers/contrast';
import { analyzeSpacing } from '../src/core/analyzers/spacing';
import { analyzeNaming, DEFAULT_NAME_REGEX } from '../src/core/analyzers/naming';
import { analyzeAutoLayout } from '../src/core/analyzers/autolayout';
import { analyzeAll } from '../src/core/analyzers/index';
import { DesignFacts, FactNode } from '../src/core/types';

describe('Contrast Analyzer (WCAG 2.1)', () => {
  it('calculates black on white as 21:1', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 1, g: 1, b: 1 };
    const ratio = getContrastRatio(black, white);
    expect(Number(ratio.toFixed(2))).toBe(21);
  });

  it('calculates #767676 on white as ~4.54:1 (passes 4.5)', () => {
    const textGray = hexToRgb('767676');
    const white = { r: 1, g: 1, b: 1 };
    const ratio = getContrastRatio(textGray, white);
    expect(ratio).toBeGreaterThan(4.5);
    expect(Number(ratio.toFixed(2))).toBeCloseTo(4.54, 1);
  });

  it('calculates #777777 on white as failing 4.5:1', () => {
    const textLightGray = hexToRgb('777777');
    const white = { r: 1, g: 1, b: 1 };
    const ratio = getContrastRatio(textLightGray, white);
    expect(ratio).toBeLessThan(4.5);
  });

  it('flags normal text with ratio < 4.5 and large text with ratio < 3.0', () => {
    const facts: DesignFacts = {
      nodes: [
        // Parent card (white background)
        {
          id: 'card-1',
          type: 'FRAME',
          name: 'Card',
          parentId: null,
          childCount: 2,
          layoutMode: 'VERTICAL',
          itemSpacing: 8,
          padding: { l: 8, r: 8, t: 8, b: 8 },
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: { r: 1, g: 1, b: 1 },
        },
        // Low contrast normal text (#A0A0A0)
        {
          id: 'text-normal',
          type: 'TEXT',
          name: 'Subtitle',
          parentId: 'card-1',
          childCount: 0,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: 14,
          fontBold: false,
          textColor: hexToRgb('A0A0A0'),
          fillColor: null,
        },
        // Large text (28px) with 3.2:1 ratio (passes 3.0 threshold for large text)
        {
          id: 'text-large-pass',
          type: 'TEXT',
          name: 'Title',
          parentId: 'card-1',
          childCount: 0,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: 28,
          fontBold: true,
          textColor: hexToRgb('8A8A8A'), // ratio ~3.4:1
          fillColor: null,
        },
      ],
    };

    const findings = analyzeContrast(facts);
    expect(findings.length).toBe(1);
    expect(findings[0].nodeId).toBe('text-normal');
    expect(findings[0].skill).toBe('contrast');
  });
});

describe('Spacing Grid Analyzer', () => {
  it('passes values that are multiples of 4 and 0', () => {
    const facts: DesignFacts = {
      nodes: [
        {
          id: 'frame-ok',
          type: 'FRAME',
          name: 'Toolbar',
          parentId: null,
          childCount: 3,
          layoutMode: 'HORIZONTAL',
          itemSpacing: 16,
          padding: { l: 8, r: 8, t: 0, b: 24 },
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
      ],
    };
    const findings = analyzeSpacing(facts);
    expect(findings.length).toBe(0);
  });

  it('flags non-multiples of 4 and suggests nearest multiple of 8', () => {
    const facts: DesignFacts = {
      nodes: [
        {
          id: 'frame-flawed',
          type: 'FRAME',
          name: 'BadGrid',
          parentId: null,
          childCount: 2,
          layoutMode: 'VERTICAL',
          itemSpacing: 13,
          padding: { l: 7, r: 19, t: 8, b: 0 },
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
      ],
    };
    const findings = analyzeSpacing(facts);
    // 13 itemSpacing + 7 padding l + 19 padding r = 3 findings
    expect(findings.length).toBe(3);

    const itemFinding = findings.find((f) => f.measured.property === 'itemSpacing');
    expect(itemFinding).toBeDefined();
    expect(itemFinding?.measured.value).toBe(13);
    expect(itemFinding?.expected.recommended8pt).toBe(16);

    const padLeftFinding = findings.find((f) => f.measured.property === 'padding-l');
    expect(padLeftFinding?.measured.value).toBe(7);
    expect(padLeftFinding?.expected.recommended8pt).toBe(8);

    const padRightFinding = findings.find((f) => f.measured.property === 'padding-r');
    expect(padRightFinding?.measured.value).toBe(19);
    expect(padRightFinding?.expected.recommended8pt).toBe(16);
  });
});

describe('Layer Naming Analyzer', () => {
  it('flags default Figma layer names on frames, groups, and shapes', () => {
    expect(DEFAULT_NAME_REGEX.test('Frame 12')).toBe(true);
    expect(DEFAULT_NAME_REGEX.test('Rectangle 4')).toBe(true);
    expect(DEFAULT_NAME_REGEX.test('Group 3')).toBe(true);
    expect(DEFAULT_NAME_REGEX.test('Vector')).toBe(true);
    expect(DEFAULT_NAME_REGEX.test('Star 1')).toBe(true);
    expect(DEFAULT_NAME_REGEX.test('Section 5')).toBe(true);

    expect(DEFAULT_NAME_REGEX.test('HeaderCard')).toBe(false);
    expect(DEFAULT_NAME_REGEX.test('ButtonPrimary')).toBe(false);
  });

  it('ignores TEXT nodes but flags default shape and frame names', () => {
    const facts: DesignFacts = {
      nodes: [
        {
          id: 'f-1',
          type: 'FRAME',
          name: 'Frame 12',
          parentId: null,
          childCount: 2,
          layoutMode: 'VERTICAL',
          itemSpacing: 8,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
        {
          id: 't-1',
          type: 'TEXT',
          name: 'Rectangle 4', // Even if text matches, should be ignored
          parentId: 'f-1',
          childCount: 0,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: 14,
          fontBold: false,
          textColor: { r: 0, g: 0, b: 0 },
          fillColor: null,
        },
        {
          id: 's-1',
          type: 'SHAPE',
          name: 'Rectangle 4',
          parentId: 'f-1',
          childCount: 0,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
      ],
    };

    const findings = analyzeNaming(facts);
    expect(findings.length).toBe(2);
    expect(findings.map((f) => f.nodeId)).toEqual(['f-1', 's-1']);
  });
});

describe('Auto Layout Analyzer', () => {
  it('flags frames with 2+ children and layoutMode NONE', () => {
    const facts: DesignFacts = {
      nodes: [
        {
          id: 'f-manual',
          type: 'FRAME',
          name: 'CardContainer',
          parentId: null,
          childCount: 3,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
        {
          id: 'f-single',
          type: 'FRAME',
          name: 'SingleItem',
          parentId: null,
          childCount: 1,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
        {
          id: 'f-auto',
          type: 'FRAME',
          name: 'AutoRow',
          parentId: null,
          childCount: 3,
          layoutMode: 'HORIZONTAL',
          itemSpacing: 8,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
      ],
    };

    const findings = analyzeAutoLayout(facts);
    expect(findings.length).toBe(1);
    expect(findings[0].nodeId).toBe('f-manual');
  });
});

describe('analyzeAll Aggregator', () => {
  it('combines findings and tallies bySkill summaries', () => {
    const facts: DesignFacts = {
      nodes: [
        {
          id: 'f1',
          type: 'FRAME',
          name: 'Frame 1',
          parentId: null,
          childCount: 2,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: null,
        },
      ],
    };

    const summary = analyzeAll(facts);
    expect(summary.totalCount).toBe(2); // Frame 1 naming violation + missing auto-layout
    expect(summary.bySkill['layer-naming'].count).toBe(1);
    expect(summary.bySkill['auto-layout'].count).toBe(1);
    expect(summary.bySkill['contrast'].count).toBe(0);
  });
});
