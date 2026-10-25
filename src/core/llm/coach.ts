// SousArtist - Coach Orchestrator
// Coordinates diagnosis, graded hints, intent classification, and output guarding

import { AuditSummary, ExpertiseLevel, SkillId } from '../types';
import { LlmClient, ResilientLlmClient } from './client';
import {
  SYSTEM_PROMPT,
  getSystemPrompt,
  formatDiagnosisPrompt,
  formatHintPrompt,
  formatIntentPrompt,
} from './prompts';
import { guardHint } from './guard';
import { getCannedRedirect, getStaticHint, rankSkills } from './fallback';

export class SousArtistCoach {
  private client: LlmClient;

  constructor(client?: LlmClient) {
    this.client = client || new ResilientLlmClient();
  }

  async diagnoseGaps(summary: AuditSummary): Promise<{ order: SkillId[]; reason: string; offline: boolean }> {
    try {
      const prompt = formatDiagnosisPrompt(summary);
      const rawText = await this.client.generateText(prompt, SYSTEM_PROMPT);

      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('NO_JSON_IN_RESPONSE');

      const parsed = JSON.parse(jsonMatch[0]);
      const validSkills: SkillId[] = ['contrast', 'spacing-grid', 'layer-naming', 'auto-layout'];

      if (
        Array.isArray(parsed.order) &&
        parsed.order.length > 0 &&
        parsed.order.every((s: any) => validSkills.includes(s)) &&
        new Set(parsed.order).size === parsed.order.length &&
        typeof parsed.reason === 'string' &&
        parsed.reason.length <= 200
      ) {
        return {
          order: parsed.order,
          reason: parsed.reason,
          offline: false,
        };
      }
      throw new Error('INVALID_DIAGNOSIS_SCHEMA');
    } catch (err) {
      // Graceful offline fallback
      const fallback = rankSkills(summary);
      return {
        ...fallback,
        offline: true,
      };
    }
  }

  async getGradedHint(params: {
    skill: SkillId;
    level: number;
    measured: Record<string, number | string>;
    expected: Record<string, number | string>;
    attempts: number;
    expertise?: ExpertiseLevel;
  }): Promise<{ hint: string; level: number; guarded: boolean; offline: boolean }> {
    // Level 4 is purely static worked example per spec section 7.2
    if (params.level >= 4) {
      return {
        hint: getStaticHint(params.skill, 4),
        level: 4,
        guarded: true,
        offline: true,
      };
    }

    const systemPrompt = getSystemPrompt(params.expertise || 'intermediate');

    try {
      const prompt = formatHintPrompt(params);
      let text = await this.client.generateText(prompt, systemPrompt);

      let guardRes = guardHint(text, params.level, params.expected);
      if (!guardRes.ok) {
        // Retry once with strict reminder appended
        const retryPrompt = `${prompt}\nSTRICT WARNING: Your previous output was rejected (${guardRes.reason}). Under 60 words, NO code blocks, NO hex codes, NO target numbers.`;
        text = await this.client.generateText(retryPrompt, systemPrompt);
        guardRes = guardHint(text, params.level, params.expected);
      }

      if (guardRes.ok) {
        return {
          hint: text,
          level: params.level,
          guarded: true,
          offline: false,
        };
      }

      // If still rejected by guard, use static lesson hint
      return {
        hint: getStaticHint(params.skill, params.level),
        level: params.level,
        guarded: true,
        offline: true,
      };
    } catch (err) {
      // Offline fallback
      return {
        hint: getStaticHint(params.skill, params.level),
        level: params.level,
        guarded: true,
        offline: true,
      };
    }
  }

  classifyIntent(query: string): 'generate_design' | 'explain_concept' | 'other' {
    const q = query.toLowerCase().trim();

    // Fast-path regex for any generative design, code, copy, or automated fix requests.
    // Extended to catch indirect phrasing (e.g. "help me build", "put together a color scheme",
    // "sketch a wireframe", "write ... code", "show me what it looks like").
    const generativeRegex = /\b(design (me|a|an|the)|create (a|an|me|the)|make (a|an|me|the|this)|generate (a|an|me|the)|build (a|an|me|the)|help me build|draw (a|an|me|the)|produce (a|an|me|the)|write\s+\S*\s*(css|html|code|copy)|give me (the|a)?\s*(html|css|code|layout)|rewrite (my|the)?\s*(text|copy)|replace my|fix it for me|do it for me|palette|color scheme|colour scheme|exact hex|mockup|wireframe|hero section|dashboard|login form|login page|checkout|button with|show me what (it|the|your|my)|what (it|the corrected|the fixed) (looks?|would look)|sketch a|put together a (color|colour|layout|palette)|suggest a layout|copy for a|write component|build a \w+ page)\b/i;

    if (generativeRegex.test(q)) {
      return 'generate_design';
    }

    return 'explain_concept';
  }

  async handleUserQuery(
    query: string,
    closestSkill: SkillId = 'contrast',
    expertise: ExpertiseLevel = 'intermediate'
  ): Promise<{ response: string; intent: string; offline: boolean }> {
    const intent = this.classifyIntent(query);

    // Rule 5: If the user asks the coach to create, design, rewrite or replace something, reply with canned redirect
    if (intent === 'generate_design') {
      return {
        response: getCannedRedirect(closestSkill),
        intent: 'generate_design',
        offline: true,
      };
    }

    try {
      const systemPrompt = getSystemPrompt(expertise);
      const prompt = `The ${expertise} designer asks this conceptual question about UI design: "${query}".
Answer in at most 50 words explaining the principle, rule, or architectural tradeoff. Do NOT produce designs, CSS, or color palettes.`;
      const text = await this.client.generateText(prompt, systemPrompt);
      const guard = guardHint(text, 2);

      if (guard.ok) {
        return { response: text, intent: 'explain_concept', offline: false };
      }
    } catch (e) {
      // Ignore network errors and use conceptual explanation
    }

    // Smart contextual offline fallback if network or proxy is unavailable
    const q = query.toLowerCase();
    let offlineFallback = `Good design relies on clear hierarchy and standard rules: WCAG contrast (4.5:1), consistent 8pt spacing, and semantic layer structure. Try one of our 2-minute lessons to practice.`;
    if (closestSkill === 'auto-layout' || q.includes('auto layout') || q.includes('layout')) {
      offlineFallback = `Auto Layout (Shift+A) turns frames into responsive containers where elements reflow automatically with consistent gap and padding as content resizes.`;
    } else if (closestSkill === 'contrast' || q.includes('contrast') || q.includes('color')) {
      offlineFallback = `Color contrast ensures text is readable. WCAG AA requires at least 4.5:1 for normal text and 3.0:1 for large text against its background.`;
    } else if (closestSkill === 'spacing-grid' || q.includes('spacing') || q.includes('grid') || q.includes('8pt')) {
      offlineFallback = `An 8-point spacing grid uses multiples of 8 (8, 16, 24, 32px) to establish visual rhythm, eliminate arbitrary margins, and speed up handoff.`;
    } else if (closestSkill === 'layer-naming' || q.includes('nam') || q.includes('layer')) {
      offlineFallback = `Semantic layer naming replaces default Figma boilerplate (e.g. "Frame 12") with purposeful names (e.g. CardHeader, Avatar) to keep components maintainable.`;
    }

    return {
      response: offlineFallback,
      intent: 'explain_concept',
      offline: true,
    };
  }

  /**
   * Analyse an audit summary and produce 2-3 structured Workflow Relay notes for the next designer.
   * Output schema: { notes: Array<{ topic, title, guideline, tradeoffReason, targetScope }> }
   * Falls back to deterministic notes based on top findings if the LLM is unavailable.
   */
  async generateRelayNotes(
    audit: AuditSummary,
    pageName: string
  ): Promise<{ notes: Array<{ topic: string; title: string; guideline: string; tradeoffReason: string; targetScope: string }>; offline: boolean }> {
    // Build a concise, structural-only prompt (no design content, no hex values)
    const counts = Object.entries(audit.bySkill)
      .filter(([, s]) => s.count > 0)
      .map(([k, s]) => `${k}: ${s.high}H/${s.medium}M/${s.low}L`)
      .join(', ');

    const prompt = `You are SousArtist, a design coach who writes workflow relay notes — short handoff messages for the next designer.

Page audited: "${pageName}".
Gap summary (rule: highSeverity H / medium M / low L): ${counts || 'none'}.
Total findings: ${audit.totalCount}.

Write exactly 2-3 relay notes as a JSON array. Each note must cover a DIFFERENT gap category above.
Schema for each: { "topic": one of [structure|naming|spacing|overrides|autolayout], "title": string ≤10 words, "guideline": string ≤30 words describing the recurring pattern to watch for, "tradeoffReason": string ≤20 words on why it matters, "targetScope": string ≤6 words }.

STRICT RULES:
- No hex codes, no CSS, no code blocks.
- Only mention structural observations from the audit counts above.
- Return ONLY valid JSON: { "notes": [...] }`;

    try {
      const rawText = await this.client.generateText(prompt, SYSTEM_PROMPT);
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('NO_JSON');

      const parsed = JSON.parse(jsonMatch[0]);
      const validTopics = ['structure', 'naming', 'spacing', 'overrides', 'autolayout'];

      if (
        Array.isArray(parsed.notes) &&
        parsed.notes.length >= 1 &&
        parsed.notes.every((n: any) =>
          validTopics.includes(n.topic) &&
          typeof n.title === 'string' &&
          typeof n.guideline === 'string'
        )
      ) {
        return { notes: parsed.notes.slice(0, 3), offline: false };
      }
      throw new Error('INVALID_SCHEMA');
    } catch (_) {
      // Deterministic offline fallback: one note per top failing skill
      const fallbackNotes: Array<{ topic: string; title: string; guideline: string; tradeoffReason: string; targetScope: string }> = [];

      const topicMap: Record<string, string> = {
        'contrast': 'structure',
        'spacing-grid': 'spacing',
        'layer-naming': 'naming',
        'auto-layout': 'autolayout',
      };

      const fallbackTitles: Record<string, string> = {
        'contrast': 'Text contrast falls below WCAG AA',
        'spacing-grid': 'Spacing values break the 8pt grid',
        'layer-naming': 'Layers use default boilerplate names',
        'auto-layout': 'Multi-child frames missing auto layout',
      };

      const fallbackGuidelines: Record<string, string> = {
        'contrast': 'Check every text layer against its background before handoff. Use the contrast checker in the Audit tab.',
        'spacing-grid': 'Keep all padding and gap values as multiples of 8px (or 4px for compact layouts).',
        'layer-naming': 'Rename frames, groups and shapes to describe their purpose — avoid "Frame 12" or "Rectangle 4".',
        'auto-layout': 'Wrap any frame with 2+ children in an auto-layout so spacing responds automatically to content changes.',
      };

      const fallbackTradeoffs: Record<string, string> = {
        'contrast': 'Accessible contrast avoids legal and usability issues.',
        'spacing-grid': 'Grid alignment prevents pixel-pushing in dev handoff.',
        'layer-naming': 'Semantic names speed up future edits and reviews.',
        'auto-layout': 'Auto layout reduces manual resizing during iterations.',
      };

      const sorted = Object.entries(audit.bySkill)
        .filter(([, s]) => s.count > 0)
        .sort((a, b) => (b[1].high * 3 + b[1].medium * 2 + b[1].low) - (a[1].high * 3 + a[1].medium * 2 + a[1].low))
        .slice(0, 3);

      for (const [skill] of sorted) {
        fallbackNotes.push({
          topic: topicMap[skill] || 'structure',
          title: fallbackTitles[skill] || `Watch out for ${skill} issues`,
          guideline: fallbackGuidelines[skill] || 'Review this category before handoff.',
          tradeoffReason: fallbackTradeoffs[skill] || 'Avoids rework during development.',
          targetScope: pageName.length > 20 ? 'This page' : pageName,
        });
      }

      if (fallbackNotes.length === 0) {
        fallbackNotes.push({
          topic: 'structure',
          title: 'No significant gaps found',
          guideline: 'This page passed the four core rule engines. Keep it up for the next designer.',
          tradeoffReason: 'Consistent quality reduces handoff friction.',
          targetScope: 'General',
        });
      }

      return { notes: fallbackNotes, offline: true };
    }
  }
}
