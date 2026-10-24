// SousArtist - Output Guardrails
// Enforces Move, Measure, Manage - Never Make in code

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

const FORBIDDEN_GENERATIVE_PATTERNS = [
  /here is (a|the|your) (layout|design|palette|mockup|code|css|html|solution)/i,
  /i have (designed|created|built|drawn|generated|fixed)/i,
  /i designed/i,
  /i created/i,
  /copy and paste this (code|css|style|hex)/i,
  /use this exact (code|hex|layout|color):/i,
];

const CODE_OR_HTML_REGEX = /(```|<\/?[a-z][\s\S]*>)/i;
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function guardHint(
  text: string,
  level: number,
  expected?: Record<string, any>
): GuardResult {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: 'Empty output' };
  }

  // 1. Check for code fences or HTML tags
  if (CODE_OR_HTML_REGEX.test(text)) {
    return { ok: false, reason: 'Contains code fence or HTML tag' };
  }

  // 2. Check length (must be under 70 words)
  const words = countWords(text);
  if (words > 70) {
    return { ok: false, reason: `Word count exceeds 70 words (${words} words)` };
  }

  // 3. Check for generative creative phrases
  for (const pattern of FORBIDDEN_GENERATIVE_PATTERNS) {
    if (pattern.test(text)) {
      return { ok: false, reason: `Matches generative design pattern: ${pattern}` };
    }
  }

  // 4. At levels 1-2, cannot contain hex color
  if (level <= 2 && HEX_COLOR_REGEX.test(text)) {
    return { ok: false, reason: 'Reveals hex color at hint level <= 2' };
  }

  // 5. At levels 1-2, cannot contain exact target value from expected
  if (level <= 2 && expected) {
    for (const key of Object.keys(expected)) {
      const val = expected[key];
      if (typeof val === 'number' || typeof val === 'string') {
        const strVal = String(val);
        // Avoid flagging single common digits like "4" or "8" if part of word, but check whole word or exact threshold
        const targetRegex = new RegExp(`\\b${strVal}\\b`, 'i');
        if (targetRegex.test(text)) {
          return { ok: false, reason: `Reveals expected target value "${strVal}" at hint level <= 2` };
        }
      }
    }
  }

  return { ok: true };
}
