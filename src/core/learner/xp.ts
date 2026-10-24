// SousArtist - XP and Streak Calculation Engine

import { LearnerState } from '../types';

export function calculateLessonXp(options: {
  isFirstPass: boolean;
  hintsUsedCount: number;
  currentStreakDays: number;
}): { earnedXp: number; breakdown: { base: number; noHintBonus: number; streakBonus: number } } {
  const base = options.isFirstPass ? 10 : 5;
  const noHintBonus = options.hintsUsedCount === 0 ? 5 : 0;
  const streakBonus = Math.min(10, options.currentStreakDays * 2);

  const earnedXp = base + noHintBonus + streakBonus;

  return {
    earnedXp,
    breakdown: {
      base,
      noHintBonus,
      streakBonus,
    },
  };
}

export function updateStreak(lastActiveDate: string, today: string, currentStreak: number): number {
  if (!lastActiveDate) {
    return 1;
  }
  if (lastActiveDate === today) {
    return currentStreak; // Already logged in today
  }

  const lastDate = new Date(lastActiveDate);
  const nowDate = new Date(today);
  const diffTime = nowDate.getTime() - lastDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

  if (diffDays === 1) {
    return currentStreak + 1;
  } else if (diffDays > 1) {
    return 1; // Streak reset
  }

  return currentStreak;
}

export function recordLessonCompletion(
  state: LearnerState,
  lessonId: string,
  hintsUsedCount: number,
  today: string
): { updatedState: LearnerState; earnedXp: number } {
  const isFirstPass = !state.completedLessons.includes(lessonId);
  const newStreak = updateStreak(state.lastActiveDate, today, state.streakDays);

  const { earnedXp } = calculateLessonXp({
    isFirstPass,
    hintsUsedCount,
    currentStreakDays: newStreak,
  });

  const completed = isFirstPass ? [...state.completedLessons, lessonId] : state.completedLessons;

  const updatedState: LearnerState = {
    ...state,
    xp: state.xp + earnedXp,
    streakDays: newStreak,
    lastActiveDate: today,
    completedLessons: completed,
  };

  return {
    updatedState,
    earnedXp,
  };
}
