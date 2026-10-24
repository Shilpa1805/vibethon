// SousArtist - Learner State Initialization & Validation

import { ExpertiseLevel, LearnerState, SkillId, StandardsProfile, WorkflowRelayNote, AuditHistoryEntry } from '../types';

export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function getDefaultStandardsProfiles(): StandardsProfile[] {
  return [
    {
      id: 'profile-personal',
      name: 'Personal Learning',
      context: 'personal',
      description: 'Educational baseline: standard 8pt spacing grid, WCAG AA (4.5:1), and clean layer naming.',
      spacing: {
        baseGrid: 8,
        allowedExceptions: [4, 12],
      },
      naming: {
        pattern: 'default-check',
        forbiddenDefaults: true,
      },
      contrast: {
        standard: 'AA',
        minNormalRatio: 4.5,
        minLargeRatio: 3.0,
      },
      autoLayout: {
        strictness: 'containers-only',
      },
      exemptions: [],
    },
    {
      id: 'profile-team',
      name: 'Acme Core (Team DS)',
      context: 'team',
      description: 'Strict team conventions: rigid 8pt grid, slash-hierarchy naming (e.g. Button/Primary), full Auto Layout.',
      spacing: {
        baseGrid: 8,
        allowedExceptions: [],
      },
      naming: {
        pattern: 'slash-hierarchy',
        forbiddenDefaults: true,
      },
      contrast: {
        standard: 'AA',
        minNormalRatio: 4.5,
        minLargeRatio: 3.0,
      },
      autoLayout: {
        strictness: 'all-multi-child',
      },
      exemptions: [],
    },
    {
      id: 'profile-freelance',
      name: 'Fintech App (Client A)',
      context: 'freelance',
      description: 'High-contrast accessible standard: WCAG AAA (7.0:1), compact 4pt spacing increments, PascalCase naming.',
      spacing: {
        baseGrid: 4,
        allowedExceptions: [],
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
        strictness: 'containers-only',
      },
      exemptions: [],
    },
  ];
}

export function getDefaultWorkflowRelayNotes(): WorkflowRelayNote[] {
  return [
    {
      id: 'relay-1',
      author: 'Elena (Outgoing Lead)',
      context: 'team',
      topic: 'overrides',
      title: 'Swap icons via component properties, do not detach',
      guideline: 'Use the instance swap property on icon slots instead of copy-pasting new vector icons into buttons.',
      tradeoffReason: 'Prevents detaching instances, preserving text and padding overrides across dark mode updates.',
      targetScope: 'Button / Action',
      createdAt: 'Yesterday',
    },
    {
      id: 'relay-2',
      author: 'Marcus (Design Ops)',
      context: 'team',
      topic: 'spacing',
      title: 'Modal dialogs use 24px outer margin, 16px inner gap',
      guideline: 'Keep vertical stacks inside cards to 16px item spacing to align with mobile viewport bounds.',
      tradeoffReason: 'Maintains touch targets for handheld ergonomics and avoids awkward scrolling on small screens.',
      targetScope: 'Card / Modal',
      createdAt: '2 days ago',
    },
  ];
}

export function createDefaultLearnerState(): LearnerState {
  const today = getTodayDateString();
  const profiles = getDefaultStandardsProfiles();
  return {
    xp: 0,
    streakDays: 0,
    lastActiveDate: '',
    expertiseLevel: 'intermediate',
    activeProfileId: profiles[0].id,
    profiles,
    relayNotes: getDefaultWorkflowRelayNotes(),
    exemptions: [],
    onboardingComplete: false,
    independentResolutions: 0,
    auditHistory: [],
    dismissedFindings: {},
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

  const expertiseLevel: ExpertiseLevel =
    raw.expertiseLevel === 'beginner' || raw.expertiseLevel === 'expert' || raw.expertiseLevel === 'intermediate'
      ? raw.expertiseLevel
      : 'intermediate';

  const profiles: StandardsProfile[] = Array.isArray(raw.profiles) && raw.profiles.length > 0
    ? raw.profiles
    : defaultState.profiles;

  const activeProfileId = typeof raw.activeProfileId === 'string' && profiles.some(p => p.id === raw.activeProfileId)
    ? raw.activeProfileId
    : profiles[0].id;

  const relayNotes: WorkflowRelayNote[] = Array.isArray(raw.relayNotes)
    ? raw.relayNotes
    : defaultState.relayNotes;

  const exemptions: string[] = Array.isArray(raw.exemptions)
    ? raw.exemptions
    : [];

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

  const onboardingComplete = typeof raw.onboardingComplete === 'boolean' ? raw.onboardingComplete : false;
  const independentResolutions = typeof raw.independentResolutions === 'number' ? raw.independentResolutions : 0;
  const auditHistory: AuditHistoryEntry[] = Array.isArray(raw.auditHistory) ? raw.auditHistory : [];
  const dismissedFindings = (raw.dismissedFindings && typeof raw.dismissedFindings === 'object')
    ? raw.dismissedFindings
    : {};

  return {
    xp,
    streakDays,
    lastActiveDate,
    expertiseLevel,
    activeProfileId,
    profiles,
    relayNotes,
    exemptions,
    onboardingComplete,
    independentResolutions,
    auditHistory,
    dismissedFindings,
    skills,
    completedLessons,
  };
}
