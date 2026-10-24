// SousArtist - Learner State Initialization & Validation

import { LearnerState, SkillId } from '../types';

export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function createDefaultLearnerState(): LearnerState {
  const today = getTodayDateString();
  return {
    xp: 0,
    streakDays: 0,
    lastActiveDate: '',
    skills: {
      'contrast': { box: 0, dueDate: today, attempts: 0 },
      'spacing-grid': { box: 0, dueDate: today, attempts: 0 },
      'layer-naming': { box: 0, dueDate: today, attempts: 0 },
      'auto-layout': { box: 0, dueDate: today, attempts: 0 },
    },
    completedLessons: [],
  };
}

export function sanitizeLearnerState(raw: any): LearnerState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultLearnerState();
  }

  const defaultState = createDefaultLearnerState();

  const xp = typeof raw.xp === 'number' && raw.xp >= 0 ? raw.xp : defaultState.xp;
  const streakDays = typeof raw.streakDays === 'number' && raw.streakDays >= 0 ? raw.streakDays : defaultState.streakDays;
  const lastActiveDate = typeof raw.lastActiveDate === 'string' ? raw.lastActiveDate : '';
  const completedLessons = Array.isArray(raw.completedLessons) ? raw.completedLessons : [];

  const skills: LearnerState['skills'] = { ...defaultState.skills };
  const validSkills: SkillId[] = ['contrast', 'spacing-grid', 'layer-naming', 'auto-layout'];

  for (const s of validSkills) {
    if (raw.skills && raw.skills[s] && typeof raw.skills[s] === 'object') {
      const box = (raw.skills[s].box >= 0 && raw.skills[s].box <= 4) ? raw.skills[s].box : 0;
      const dueDate = typeof raw.skills[s].dueDate === 'string' ? raw.skills[s].dueDate : getTodayDateString();
      const attempts = typeof raw.skills[s].attempts === 'number' ? raw.skills[s].attempts : 0;
      skills[s] = { box, dueDate, attempts };
    }
  }

  return {
    xp,
    streakDays,
    lastActiveDate,
    skills,
    completedLessons,
  };
}
