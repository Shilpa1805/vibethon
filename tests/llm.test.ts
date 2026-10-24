import { describe, it, expect } from 'vitest';
import { rankSkills, getCannedRedirect } from '../src/core/llm/fallback';
import { SousArtistCoach } from '../src/core/llm/coach';
import { AuditSummary } from '../src/core/types';

describe('Fallback & Skill Ranking', () => {
  it('ranks skills strictly by weighted severity score (high*3 + med*2 + low)', () => {
    const summary: AuditSummary = {
      findings: [],
      totalCount: 5,
      truncated: false,
      bySkill: {
        'contrast': { count: 1, high: 1, medium: 0, low: 0 }, // score = 1*3 = 3
        'spacing-grid': { count: 3, high: 0, medium: 3, low: 0 }, // score = 3*2 = 6
        'layer-naming': { count: 2, high: 0, medium: 0, low: 2 }, // score = 2*1 = 2
        'auto-layout': { count: 0, high: 0, medium: 0, low: 0 }, // score = 0
      },
    };

    const result = rankSkills(summary);
    // spacing-grid (6) > contrast (3) > layer-naming (2) > auto-layout (0)
    expect(result.order).toEqual(['spacing-grid', 'contrast', 'layer-naming', 'auto-layout']);
    expect(result.reason).toContain('spacing');
  });

  it('provides canned redirect matching spec section 7.5', () => {
    const redirect = getCannedRedirect('contrast');
    expect(redirect).toBe(
      "I coach, I don't create. The design stays yours. Want a 2-minute lesson on contrast so you can do this faster yourself?"
    );
  });
});

describe('SousArtistCoach Orchestration', () => {
  it('instantly returns canned redirect for creative design requests without calling LLM', async () => {
    const coach = new SousArtistCoach();
    const result = await coach.handleUserQuery('Can you design me a hero section?', 'contrast');

    expect(result.intent).toBe('generate_design');
    expect(result.response).toContain("I coach, I don't create");
  });

  it('serves level 4 static worked example without LLM dependency', async () => {
    const coach = new SousArtistCoach();
    const result = await coach.getGradedHint({
      skill: 'contrast',
      level: 4,
      measured: { ratio: 2.1 },
      expected: { minRatio: 4.5 },
      attempts: 2,
    });

    expect(result.level).toBe(4);
    expect(result.offline).toBe(true);
    expect(result.hint).toContain('#767676');
  });

  it('falls back to deterministic skill ranking on offline or invalid LLM response', async () => {
    const mockClient = {
      generateText: async () => 'Not a valid JSON format',
    };
    const coach = new SousArtistCoach(mockClient as any);

    const summary: AuditSummary = {
      findings: [],
      totalCount: 1,
      truncated: false,
      bySkill: {
        'contrast': { count: 1, high: 1, medium: 0, low: 0 },
        'spacing-grid': { count: 0, high: 0, medium: 0, low: 0 },
        'layer-naming': { count: 0, high: 0, medium: 0, low: 0 },
        'auto-layout': { count: 0, high: 0, medium: 0, low: 0 },
      },
    };

    const diag = await coach.diagnoseGaps(summary);
    expect(diag.offline).toBe(true);
    expect(diag.order[0]).toBe('contrast');
  });
});
