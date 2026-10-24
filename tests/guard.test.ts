import { describe, it, expect } from 'vitest';
import { guardHint, countWords } from '../src/core/llm/guard';

describe('Output Guardrail (guardHint)', () => {
  it('accepts compliant coaching hints', () => {
    const hint = 'Notice how the text blends with the background. Consider testing the contrast in brighter lighting.';
    const res = guardHint(hint, 1);
    expect(res.ok).toBe(true);
  });

  it('rejects text containing code fences or HTML tags', () => {
    const codeHint = 'Here is the CSS to fix it: ```css color: #000; ```';
    expect(guardHint(codeHint, 1).ok).toBe(false);

    const htmlHint = 'Wrap your layer in a <div> element.';
    expect(guardHint(htmlHint, 1).ok).toBe(false);
  });

  it('rejects output exceeding 70 words', () => {
    const longText = new Array(75).fill('word').join(' ');
    expect(countWords(longText)).toBe(75);
    const res = guardHint(longText, 1);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('exceeds 70 words');
  });

  it('rejects hex colors at hint levels 1, 2, and 3', () => {
    const hexHint = 'Change the text color to #333333 for better visibility.';
    const resLevel2 = guardHint(hexHint, 2);
    expect(resLevel2.ok).toBe(false);
    expect(resLevel2.reason).toContain('hex color');

    const resLevel3 = guardHint(hexHint, 3);
    expect(resLevel3.ok).toBe(false);
    expect(resLevel3.reason).toContain('hex color');
  });

  it('allows rule thresholds like 4.5 : 1 at level 3', () => {
    const thresholdHint = 'WCAG AA needs 4.5 : 1 contrast ratio to be accessible.';
    const res = guardHint(thresholdHint, 3, { minRatio: 4.5 });
    expect(res.ok).toBe(true);
  });

  it('rejects expected target values at hint levels 1 and 2, but does not flag 4x5', () => {
    const valHint = 'You should adjust this so it reaches 4.5 ratio.';
    const res = guardHint(valHint, 1, { minRatio: 4.5 });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('expected target value');

    // 4x5 is not flagged for expected 4.5
    const falsePositiveCheck = guardHint('The dimension is 4x5 pixels.', 1, { minRatio: 4.5 });
    expect(falsePositiveCheck.ok).toBe(true);
  });

  it('does not throw when expected string contains parentheses or regex metacharacters', () => {
    expect(() => {
      guardHint('Check your layer structure carefully.', 1, { pattern: 'Frame (copy)' });
    }).not.toThrow();
  });

  it('rejects generative design phrasing', () => {
    const generativePhrases = [
      'Here is a layout for your card that will look much better.',
      'I have designed a new button component for you.',
      'Copy and paste this CSS into your styles.',
      'Here is your design with the right colors.',
    ];

    for (const phrase of generativePhrases) {
      const res = guardHint(phrase, 3);
      expect(res.ok).toBe(false);
      expect(res.reason).toContain('generative design pattern');
    }
  });
});
