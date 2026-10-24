import { describe, it, expect } from 'vitest';
import { getHueDistance, checkColorHarmony, checkGoldenRatio } from '../src/core/analyzers/craft';

describe('Craft Analyzers: Hue Distance & Harmony', () => {
  it('calculates correct circular hue distances', () => {
    expect(getHueDistance(210, 30)).toBe(180);
    expect(getHueDistance(350, 10)).toBe(20);
    expect(getHueDistance(0, 180)).toBe(180);
  });

  it('verifies complementary and analogous harmonies', () => {
    // 210 and 30 are 180 apart -> complementary
    const comp = checkColorHarmony(210, 30);
    expect(comp.passed).toBe(true);
    expect(comp.type).toBe('complementary');

    // 210 and 230 are 20 apart -> analogous
    const ana = checkColorHarmony(210, 230);
    expect(ana.passed).toBe(true);
    expect(ana.type).toBe('analogous');

    // Null hues (grey)
    const grey = checkColorHarmony(null, 120);
    expect(grey.passed).toBe(false);
    expect(grey.message).toContain('No hue to compare');
  });

  it('checks golden ratio tolerance within 2%', () => {
    // 162 / 100 = 1.62 (within 2% of 1.618)
    const passRatio = checkGoldenRatio(162, 100);
    expect(passRatio.passed).toBe(true);

    // 150 / 100 = 1.50 (fails 1.618 tolerance)
    const failRatio = checkGoldenRatio(150, 100);
    expect(failRatio.passed).toBe(false);
  });
});
