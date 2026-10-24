// SousArtist - Craft Analyzers (Optional P2 / Website Craft Tab)
// Measures purely deterministic geometric & color relationships
// Never emitted during real-file audit to keep audits taste-free.

export function getHueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

export function checkColorHarmony(
  baseHue: number | null,
  accentHue: number | null
): { passed: boolean; type: 'complementary' | 'analogous' | 'none'; distance: number | null; message: string } {
  if (baseHue === null || accentHue === null) {
    return {
      passed: false,
      type: 'none',
      distance: null,
      message: 'No hue to compare. Greys have zero chroma and neutral hue.',
    };
  }

  const d = getHueDistance(baseHue, accentHue);

  if (Math.abs(d - 180) <= 15) {
    return {
      passed: true,
      type: 'complementary',
      distance: d,
      message: `Complementary harmony detected (hue distance: ${d}°, target: 180° ± 15°).`,
    };
  }

  if (d >= 15 && d <= 45) {
    return {
      passed: true,
      type: 'analogous',
      distance: d,
      message: `Analogous harmony detected (hue distance: ${d}°, target: 15°–45°).`,
    };
  }

  return {
    passed: false,
    type: 'none',
    distance: d,
    message: `Hue distance is ${d}°. Aim for complementary (~180°) or analogous (15°–45°).`,
  };
}

export function checkGoldenRatio(width: number, height: number): {
  passed: boolean;
  ratio: number;
  message: string;
} {
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (shortSide === 0) return { passed: false, ratio: 0, message: 'Invalid dimensions.' };

  const r = longSide / shortSide;
  const error = Math.abs(r - 1.618) / 1.618;
  const passed = error <= 0.02; // within 2% tolerance

  return {
    passed,
    ratio: Number(r.toFixed(3)),
    message: passed
      ? `Golden ratio achieved (${r.toFixed(3)}:1, within 2% of 1.618).`
      : `Current ratio is ${r.toFixed(3)}:1 (target: 1.618:1 ± 2%).`,
  };
}
