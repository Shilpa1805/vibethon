import { describe, it, expect } from 'vitest';
import {
  buildStructuralFindingQuery,
  formatHintPrompt,
  formatDiagnosisPrompt,
} from '../src/core/llm/prompts';
import { escapeHtml } from '../src/ui/escape';
import { AuditSummary, Finding } from '../src/core/types';

describe('Prompt Privacy & Anti-Leak (Rule 4: Zero Content Leaks)', () => {
  const secretLayer = 'Secret Client Logo';
  const xssLayer = '"><img src=x>';

  it('buildStructuralFindingQuery never includes layer names or text content', () => {
    const query1 = buildStructuralFindingQuery('contrast', {
      ratio: 2.17,
      nodeName: secretLayer,
      currentName: xssLayer,
    });
    expect(query1).toBe('How do I improve contrast? Measured ratio 2.17 : 1.');
    expect(query1).not.toContain(secretLayer);
    expect(query1).not.toContain(xssLayer);

    const query2 = buildStructuralFindingQuery('spacing-grid', {
      property: 'itemSpacing',
      value: 13,
      nodeName: secretLayer,
    });
    expect(query2).toBe('How do I improve spacing grid? Measured itemSpacing 13px.');
    expect(query2).not.toContain(secretLayer);

    const query3 = buildStructuralFindingQuery('layer-naming', {
      currentName: 'Frame 12',
      nodeName: secretLayer,
    });
    expect(query3).toBe('How do I improve layer naming? Measured non-standard naming violation.');
    expect(query3).not.toContain(secretLayer);
    expect(query3).not.toContain('Frame 12');

    const query4 = buildStructuralFindingQuery('auto-layout', {
      childCount: 3,
      nodeName: xssLayer,
    });
    expect(query4).toBe('How do I improve auto layout? Measured 3 children without auto-layout.');
    expect(query4).not.toContain(xssLayer);
  });

  it('formatHintPrompt strips layer names, text and nodeName from measured/expected context', () => {
    const prompt = formatHintPrompt({
      skill: 'layer-naming',
      level: 1,
      measured: {
        currentName: secretLayer,
        nodeName: xssLayer,
        name: 'Confidential Internal',
        text: 'Financial Q4 Data',
        violation: 1,
      },
      expected: {
        nodeName: secretLayer,
        pattern: 'semantic',
      },
      attempts: 1,
      expertise: 'beginner',
    });

    expect(prompt).not.toContain(secretLayer);
    expect(prompt).not.toContain(xssLayer);
    expect(prompt).not.toContain('Confidential Internal');
    expect(prompt).not.toContain('Financial Q4 Data');
  });

  it('formatDiagnosisPrompt strips layer names from audit summary samples', () => {
    const findingWithSecret: Finding = {
      id: 'finding-1',
      skill: 'layer-naming',
      nodeId: 'node-1',
      nodeName: secretLayer,
      severity: 'low',
      summary: `Layer name ${secretLayer} is non-standard`,
      measured: { currentName: secretLayer, text: 'Sensitive Heading' },
      expected: { pattern: 'semantic' },
    };

    const summary: AuditSummary = {
      findings: [findingWithSecret],
      totalCount: 1,
      truncated: false,
      bySkill: {
        'contrast': { count: 0, high: 0, medium: 0, low: 0 },
        'spacing-grid': { count: 0, high: 0, medium: 0, low: 0 },
        'layer-naming': { count: 1, high: 0, medium: 0, low: 1 },
        'auto-layout': { count: 0, high: 0, medium: 0, low: 0 },
      },
    };

    const diagnosisPrompt = formatDiagnosisPrompt(summary);
    expect(diagnosisPrompt).not.toContain(secretLayer);
    expect(diagnosisPrompt).not.toContain('Sensitive Heading');
  });
});

describe('HTML Escaping in UI', () => {
  it('escapes quotes, ampersands, and HTML tags', () => {
    expect(escapeHtml('a"b<i>c')).toBe('a&quot;b&lt;i&gt;c');
    expect(escapeHtml('"><script>alert(1)</script>')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml("Bob's & Alice's")).toBe('Bob&#39;s &amp; Alice&#39;s');
  });
});
