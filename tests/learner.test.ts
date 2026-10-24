import { describe, it, expect } from 'vitest';
import {
  advanceLeitnerBox,
  resetLeitnerOnAuditFailure,
  REVIEW_INTERVALS_DAYS,
} from '../src/core/learner/leitner';
import {
  calculateLessonXp,
  updateStreak,
  recordLessonCompletion,
} from '../src/core/learner/xp';
import {
  createDefaultLearnerState,
  sanitizeLearnerState,
} from '../src/core/learner/state';
import { verifyPracticeFrame } from '../src/core/lessons/verify';
import { hexToRgb, analyzeContrast } from '../src/core/analyzers/contrast';
import { analyzeSpacing } from '../src/core/analyzers/spacing';
import { DesignFacts, StandardsProfile } from '../src/core/types';

describe('Leitner Spaced Repetition', () => {
  it('advances box by 1 on pass and caps at box 4 with review intervals', () => {
    let state = createDefaultLearnerState();
    expect(state.skills['contrast'].box).toBe(0);

    // Box 0 -> Box 1
    state = advanceLeitnerBox(state, 'contrast', '2026-10-24');
    expect(state.skills['contrast'].box).toBe(1);
    expect(state.skills['contrast'].dueDate).toBe('2026-10-27'); // +3 days for box 1

    // Box 1 -> Box 2
    state = advanceLeitnerBox(state, 'contrast', '2026-10-27');
    expect(state.skills['contrast'].box).toBe(2);
    expect(state.skills['contrast'].dueDate).toBe('2026-11-03'); // +7 days for box 2

    // Box 2 -> 3 -> 4
    state = advanceLeitnerBox(state, 'contrast', '2026-11-03');
    expect(state.skills['contrast'].box).toBe(3);
    state = advanceLeitnerBox(state, 'contrast', '2026-11-17');
    expect(state.skills['contrast'].box).toBe(4);

    // Capped at 4
    state = advanceLeitnerBox(state, 'contrast', '2026-12-17');
    expect(state.skills['contrast'].box).toBe(4);
  });

  it('resets a mastered skill to Box 0 upon real-file audit failure (transfer check)', () => {
    let state = createDefaultLearnerState();
    state = advanceLeitnerBox(state, 'contrast', '2026-10-24');
    state = advanceLeitnerBox(state, 'contrast', '2026-10-27');
    expect(state.skills['contrast'].box).toBe(2);

    const { updatedState, droppedSkills } = resetLeitnerOnAuditFailure(state, ['contrast'], '2026-10-28');
    expect(droppedSkills).toEqual(['contrast']);
    expect(updatedState.skills['contrast'].box).toBe(0);
    expect(updatedState.skills['contrast'].dueDate).toBe('2026-10-28');
  });
});

describe('XP & Streak Math', () => {
  it('awards 10 XP base + 5 no-hint bonus + streak bonus on first pass', () => {
    const result = calculateLessonXp({
      isFirstPass: true,
      hintsUsedCount: 0,
      currentStreakDays: 3,
    });
    // 10 base + 5 no-hint + (3 * 2) = 21 XP
    expect(result.earnedXp).toBe(21);
    expect(result.breakdown.base).toBe(10);
    expect(result.breakdown.noHintBonus).toBe(5);
    expect(result.breakdown.streakBonus).toBe(6);
  });

  it('awards 5 XP base without no-hint bonus if hints were used', () => {
    const result = calculateLessonXp({
      isFirstPass: false,
      hintsUsedCount: 2,
      currentStreakDays: 1,
    });
    // 5 base + 0 no-hint + 2 streak = 7 XP
    expect(result.earnedXp).toBe(7);
  });

  it('caps streak bonus at +10 XP', () => {
    const result = calculateLessonXp({
      isFirstPass: true,
      hintsUsedCount: 0,
      currentStreakDays: 10,
    });
    // 10 base + 5 no-hint + min(10, 20) = 25 XP
    expect(result.earnedXp).toBe(25);
    expect(result.breakdown.streakBonus).toBe(10);
  });

  it('increments streak if active yesterday, resets if missed', () => {
    expect(updateStreak('2026-10-23', '2026-10-24', 2)).toBe(3);
    expect(updateStreak('2026-10-24', '2026-10-24', 3)).toBe(3); // already logged today
    expect(updateStreak('2026-10-20', '2026-10-24', 5)).toBe(1); // missed days -> resets
  });
});

describe('Learner State Sanitization', () => {
  it('recovers safely from malformed or missing storage payload', () => {
    const recovered = sanitizeLearnerState(null);
    expect(recovered.xp).toBe(0);
    expect(recovered.skills['contrast'].box).toBe(0);

    const partial = sanitizeLearnerState({ xp: 120, skills: { contrast: { box: 3 } } });
    expect(partial.xp).toBe(120);
    expect(partial.skills['contrast'].box).toBe(3);
    expect(partial.skills['spacing-grid'].box).toBe(0);
  });
});

describe('Deterministic Lesson Verification', () => {
  it('fails contrast verification when text is light gray, passes when darkened', () => {
    const flawedFacts: DesignFacts = {
      nodes: [
        {
          id: 'card',
          type: 'FRAME',
          name: 'Card',
          parentId: null,
          childCount: 1,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: { r: 1, g: 1, b: 1 },
        },
        {
          id: 'txt',
          type: 'TEXT',
          name: 'Description',
          parentId: 'card',
          childCount: 0,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: 14,
          fontBold: false,
          textColor: hexToRgb('B0B0B0'),
          fillColor: null,
        },
      ],
    };

    const failRes = verifyPracticeFrame('contrast', flawedFacts);
    expect(failRes.passed).toBe(false);

    // Learner fixes color to #1F2937
    const fixedFacts: DesignFacts = {
      ...flawedFacts,
      nodes: [
        flawedFacts.nodes[0],
        { ...flawedFacts.nodes[1], textColor: hexToRgb('1F2937') },
      ],
    };

    const passRes = verifyPracticeFrame('contrast', fixedFacts);
    expect(passRes.passed).toBe(true);
  });
});

describe('Institutional Standards & Custom Constraints', () => {
  it('enforces custom institutional constraints (WCAG AAA ratio 7:1 and 4pt grid with exceptions)', () => {
    const customInstitution: StandardsProfile = {
      id: 'profile-stanford-health',
      name: 'Stanford Health System',
      context: 'team',
      description: 'Strict medical accessibility and 4pt layout system',
      spacing: {
        baseGrid: 4,
        allowedExceptions: [2, 6],
      },
      naming: {
        pattern: 'pascal-case',
        forbiddenDefaults: true,
      },
      contrast: {
        standard: 'AAA',
        minNormalRatio: 7.0,
        minLargeRatio: 4.5,
      },
      autoLayout: {
        strictness: 'all-multi-child',
      },
      exemptions: [],
    };

    const facts: DesignFacts = {
      nodes: [
        {
          id: 'card',
          type: 'FRAME',
          name: 'CardContainer',
          parentId: null,
          childCount: 2,
          layoutMode: 'VERTICAL',
          itemSpacing: 6, // 6 is not multiple of 4, but is an allowed exception [2, 6]!
          padding: { l: 8, r: 8, t: 8, b: 8 },
          fontSize: null,
          fontBold: null,
          textColor: null,
          fillColor: { r: 1, g: 1, b: 1 },
        },
        {
          id: 'text-node',
          type: 'TEXT',
          name: 'PatientLabel',
          parentId: 'card',
          childCount: 0,
          layoutMode: 'NONE',
          itemSpacing: null,
          padding: null,
          fontSize: 14,
          fontBold: false,
          textColor: hexToRgb('767676'), // ~4.54:1 (passes AA 4.5, fails AAA 7.0)
          fillColor: null,
        },
      ],
    };

    // Under default profile (AA), #767676 text passes
    const aaFindings = analyzeContrast(facts);
    expect(aaFindings.length).toBe(0);

    // Under custom institution profile (AAA), #767676 fails because ratio < 7.0:1
    const aaaFindings = analyzeContrast(facts, customInstitution);
    expect(aaaFindings.length).toBe(1);
    expect(aaaFindings[0].expected.minRatio).toBe(7.0);

    // Spacing with itemSpacing = 6px passes because 6 is in allowedExceptions [2, 6]
    const spacingFindings = analyzeSpacing(facts, customInstitution);
    expect(spacingFindings.length).toBe(0);
  });
});

