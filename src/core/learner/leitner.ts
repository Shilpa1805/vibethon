// SousArtist - Spaced Repetition (Leitner System)
// Boxes 0..4 with review intervals [1, 3, 7, 14, 30] days
// Transfer signal: Audit failure on a real page resets that skill to Box 0

import { LearnerState, SkillId } from '../types';

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function isSkillDue(
  skillData: { box: number; dueDate: string } | undefined,
  currentDate: string
): boolean {
  if (!skillData || skillData.box === 0) return true;
  if (!skillData.dueDate) return true;
  return currentDate >= skillData.dueDate;
}

export function advanceLeitnerBox(
  state: LearnerState,
  skill: SkillId,
  currentDate: string
): LearnerState {
  const skillData = state.skills[skill] || { box: 0, dueDate: currentDate, attempts: 0 };

  // Only advance to higher Leitner box if unranked (Box 0) or if scheduled review is due.
  // Practicing early reinforces attempts without artificially skipping spaced intervals.
  const isDue = isSkillDue(skillData, currentDate);

  if (!isDue) {
    return {
      ...state,
      skills: {
        ...state.skills,
        [skill]: {
          ...skillData,
          attempts: skillData.attempts + 1,
        },
      },
    };
  }

  const nextBox = Math.min(4, skillData.box + 1) as 0 | 1 | 2 | 3 | 4;
  const interval = REVIEW_INTERVALS_DAYS[nextBox];
  const nextDueDate = addDays(currentDate, interval);

  return {
    ...state,
    skills: {
      ...state.skills,
      [skill]: {
        box: nextBox,
        dueDate: nextDueDate,
        attempts: skillData.attempts + 1,
      },
    },
  };
}

export function resetLeitnerOnAuditFailure(
  state: LearnerState,
  failedSkills: SkillId[],
  currentDate: string
): { updatedState: LearnerState; droppedSkills: SkillId[] } {
  let changed = false;
  const newSkills = { ...state.skills };
  const droppedSkills: SkillId[] = [];

  for (const s of failedSkills) {
    if (newSkills[s] && newSkills[s].box > 0) {
      droppedSkills.push(s);
      newSkills[s] = {
        box: 0,
        dueDate: currentDate,
        attempts: newSkills[s].attempts,
      };
      changed = true;
    }
  }

  return {
    updatedState: changed ? { ...state, skills: newSkills } : state,
    droppedSkills,
  };
}
