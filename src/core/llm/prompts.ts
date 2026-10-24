// SousArtist - System Prompts and Formatter
// Move, Measure, Manage - Never Make

import { AuditSummary, ExpertiseLevel, SkillId } from '../types';

export const SYSTEM_PROMPT = `You are SousArtist, a design coach for beginners. You teach; you never create.
Rules:
- Never produce designs, layouts, color palettes, copy, HTML, CSS, or code for the learner's work.
- Use only the numbers provided in CONTEXT. Do not invent measurements.
- Follow the requested hint level exactly. At levels 1-2, do not reveal the target value.
- At most 60 words. Plain, encouraging language. No emoji.
- If asked to design or fix something for the user, say you coach rather than create, and point to a lesson.
Output: plain text only (hints) or JSON matching the given schema (diagnosis).`;

export function getSystemPrompt(expertise: ExpertiseLevel = 'intermediate'): string {
  switch (expertise) {
    case 'beginner':
      return `You are SousArtist, a dedicated, patient design teacher for beginners.
Your coaching style: Explain foundational terminology clearly, break down problems into step-by-step guidance, ask gentle Socratic questions to build intuition, and provide extra encouragement.
Rules:
- Never produce designs, layouts, palettes, code, HTML, or CSS.
- Under 65 words. Plain, encouraging language. No emoji.
- Use only the numbers provided in CONTEXT.`;

    case 'expert':
      return `You are SousArtist, a peer design systems coworker for senior designers.
Your coaching style: Be brief and pragmatic. Assume full familiarity with Figma and design fundamentals. Focus on edge cases, tokens, component reusability, and handoff tradeoffs.
Rules:
- Never produce designs, layouts, palettes, code, HTML, or CSS.
- Under 45 words. Sharp, professional, peer-to-peer.
- Discuss tradeoffs and edge cases. Skip basic definitions.`;

    case 'intermediate':
    default:
      return `You are SousArtist, a supportive coach for intermediate designers.
Your coaching style: Give concise, professional explanations and actionable hints, leaving room for independent problem-solving. Reference design systems and UX standards.
Rules:
- Never produce designs, layouts, palettes, code, HTML, or CSS.
- Under 50 words. Direct and constructive. No emoji.
- Use only the numbers provided in CONTEXT.`;
  }
}

export function buildStructuralFindingQuery(skill: SkillId, measured: Record<string, any>): string {
  switch (skill) {
    case 'contrast':
      return `How do I improve contrast? Measured ratio ${measured?.ratio ?? ''} : 1.`;
    case 'spacing-grid':
      return `How do I improve spacing grid? Measured ${measured?.property ?? 'spacing'} ${measured?.value ?? ''}px.`;
    case 'layer-naming':
      return `How do I improve layer naming? Measured non-standard naming violation.`;
    case 'auto-layout':
      return `How do I improve auto layout? Measured ${measured?.childCount ?? ''} children without auto-layout.`;
    default:
      return `How do I improve ${skill}?`;
  }
}

export function formatHintPrompt(params: {
  skill: SkillId;
  level: number;
  measured: Record<string, number | string>;
  expected: Record<string, number | string>;
  attempts: number;
  expertise?: ExpertiseLevel;
}): string {
  const expertise = params.expertise || 'intermediate';

  // Strip any layer names or raw text to guarantee Rule 4 (Zero Content Leaks)
  const safeMeasured: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(params.measured || {})) {
    if (k === 'currentName' || k === 'name' || k === 'text' || k === 'nodeName') continue;
    safeMeasured[k] = v;
  }

  const safeExpected: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(params.expected || {})) {
    if (k === 'nodeName' || k === 'name' || k === 'text') continue;
    safeExpected[k] = v;
  }

  return `Provide a Level ${params.level} coaching hint for the skill "${params.skill}" tailored for a ${expertise} designer.
CONTEXT NUMBERS:
- Measured: ${JSON.stringify(safeMeasured)}
- Target threshold: ${JSON.stringify(safeExpected)}
- Attempts so far: ${params.attempts}
- Designer Expertise: ${expertise}

REQUIREMENTS FOR LEVEL ${params.level}:
${
  params.level === 1
    ? (expertise === 'beginner'
        ? '- Ask a patient Socratic question explaining the visual concept. Do NOT reveal target numbers.'
        : expertise === 'expert'
        ? '- Note the measurement anomaly and briefly mention the token/tradeoff. Do NOT reveal solution.'
        : '- Ask a thoughtful Socratic question about the visual rhythm or readability. Do NOT reveal any target numbers.')
    : params.level === 2
    ? (expertise === 'beginner'
        ? '- Name the design rule and explain why it matters, citing the measured value. Do NOT reveal the solution.'
        : expertise === 'expert'
        ? '- Point directly to the design system rule and tradeoff. Do NOT reveal exact fix values.'
        : '- Name the exact design rule and mention the measured value. Do NOT reveal the final solution value.')
    : '- Guide with specific tool actions (which Figma panel, shortcut, or setting to adjust). State rule thresholds, but NEVER provide an exact hex code or layout coordinates.'
}
Remember: Under 60 words. No code blocks. Tone matching ${expertise} level.`;
}

export function formatDiagnosisPrompt(summary: AuditSummary): string {
  // Only structural counts and at most 3 anonymized examples per skill leave the file
  const anonymizedPayload: Record<string, any> = {};

  const skills: SkillId[] = ['contrast', 'spacing-grid', 'layer-naming', 'auto-layout'];
  for (const skill of skills) {
    const stats = summary.bySkill[skill];
    const samples = summary.findings
      .filter((f) => f.skill === skill)
      .slice(0, 3)
      .map((f) => {
        // Strip any layer names or raw text to guarantee Rule 4 (Zero Content Leaks)
        const safeMeasured: Record<string, any> = {};
        for (const [k, v] of Object.entries(f.measured || {})) {
          if (k === 'currentName' || k === 'name' || k === 'text' || k === 'nodeName') continue;
          safeMeasured[k] = v;
        }
        const safeExpected: Record<string, any> = {};
        for (const [k, v] of Object.entries(f.expected || {})) {
          if (k === 'nodeName' || k === 'name' || k === 'text') continue;
          safeExpected[k] = v;
        }
        return { measured: safeMeasured, expected: safeExpected };
      });

    anonymizedPayload[skill] = {
      counts: stats,
      examples: samples,
    };
  }

  return `Given this audit of design gaps, prioritize which skill the beginner should learn first.
CONTEXT:
${JSON.stringify(anonymizedPayload, null, 2)}

OUTPUT FORMAT: Return strictly a valid JSON object matching:
{
  "order": ["contrast", "spacing-grid", "layer-naming", "auto-layout"],
  "reason": "Short explanation under 200 characters explaining why this skill was picked first."
}`;
}

export function formatIntentPrompt(query: string): string {
  return `Classify the user intent into exactly one of three categories:
1. "generate_design" - if they ask to create, design, build, draw, code, write CSS/HTML, generate a palette, or fix it for them.
2. "explain_concept" - if they ask about design principles, rules, WCAG, 8pt grid, or how to use a tool.
3. "other" - for greetings, general chat, or off-topic questions.

USER MESSAGE: "${query}"

Respond with ONLY the category string: "generate_design", "explain_concept", or "other".`;
}
