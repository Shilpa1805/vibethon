// SousArtist - Coach Orchestrator
// Coordinates diagnosis, graded hints, intent classification, and output guarding

import { AuditSummary, SkillId } from '../types';
import { LlmClient, ResilientLlmClient } from './client';
import {
  SYSTEM_PROMPT,
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

    try {
      const prompt = formatHintPrompt(params);
      let text = await this.client.generateText(prompt, SYSTEM_PROMPT);

      let guardRes = guardHint(text, params.level, params.expected);
      if (!guardRes.ok) {
        // Retry once with strict reminder appended
        const retryPrompt = `${prompt}\nSTRICT WARNING: Your previous output was rejected (${guardRes.reason}). Under 60 words, NO code blocks, NO hex codes, NO target numbers.`;
        text = await this.client.generateText(retryPrompt, SYSTEM_PROMPT);
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

    // Fast-path regex for any generative design, code, copy, or automated fix requests
    const generativeRegex = /\b(design (me|a|an|the)|create (a|an|me|the)|make (a|an|me|the|this)|generate (a|an|me|the)|build (a|an|me|the)|draw (a|an|me|the)|produce (a|an|me|the)|write (the|a|my)?\s*(css|html|code|copy)|give me (the|a)?\s*(html|css|code|layout)|rewrite (my|the)?\s*(text|copy)|replace my|fix it for me|do it for me|palette|exact hex|mockup|hero section|dashboard|login form|login page|checkout|button with)\b/i;

    if (generativeRegex.test(q)) {
      return 'generate_design';
    }

    return 'explain_concept';
  }

  async handleUserQuery(query: string, closestSkill: SkillId = 'contrast'): Promise<{ response: string; intent: string; offline: boolean }> {
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
      const prompt = `The beginner asks this conceptual question about UI design: "${query}".
Answer in at most 50 words explaining the core principle or rule. Do NOT produce designs, CSS, or color palettes.`;
      const text = await this.client.generateText(prompt, SYSTEM_PROMPT);
      const guard = guardHint(text, 2);

      if (guard.ok) {
        return { response: text, intent: 'explain_concept', offline: false };
      }
    } catch (e) {
      // Ignore network errors and use conceptual explanation
    }

    // Default conceptual response
    return {
      response: `Good design relies on clear hierarchy and standard rules: WCAG contrast (4.5:1), consistent 8pt spacing, and semantic layer structure. Try one of our 2-minute lessons to practice.`,
      intent: 'explain_concept',
      offline: true,
    };
  }
}
