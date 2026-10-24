// SousArtist - Deterministic Fallback & Redirect Engine
// Ensures 100% functionality offline without network or LLM dependency

import { AuditSummary, SkillId } from '../types';
import { LESSONS } from '../lessons/lessons';

export function rankSkills(summary: AuditSummary): { order: SkillId[]; reason: string } {
  const allSkills: SkillId[] = ['contrast', 'spacing-grid', 'layer-naming', 'auto-layout'];

  // Sort by weighted severity score: high * 3 + medium * 2 + low
  const scored = allSkills.map((skill) => {
    const stats = summary.bySkill[skill] || { count: 0, high: 0, medium: 0, low: 0 };
    const score = stats.high * 3 + stats.medium * 2 + stats.low;
    return { skill, score, count: stats.count };
  });

  scored.sort((a, b) => b.score - a.score);

  const order = scored.map((s) => s.skill);
  const topSkill = scored[0];

  let reason = 'Prioritized based on highest severity gaps found in your audit.';
  if (topSkill.count === 0) {
    reason = 'No active violations found. Starting with foundational contrast principles.';
  } else if (topSkill.skill === 'contrast') {
    reason = 'Contrast gaps impact readability and accessibility directly. Fix these first.';
  } else if (topSkill.skill === 'spacing-grid') {
    reason = 'Inconsistent spacing disrupts visual hierarchy and alignment across your card layout.';
  } else if (topSkill.skill === 'layer-naming') {
    reason = 'Default layer names slow down developer handoff and component maintenance.';
  } else if (topSkill.skill === 'auto-layout') {
    reason = 'Converting manual frames to Auto Layout establishes responsive behavior early.';
  }

  return {
    order,
    reason,
  };
}

export function getCannedRedirect(closestSkill: SkillId = 'contrast'): string {
  const titles: Record<SkillId, string> = {
    'contrast': 'contrast',
    'spacing-grid': 'the 8pt spacing grid',
    'layer-naming': 'semantic layer naming',
    'auto-layout': 'auto layout',
  };
  return `I coach, I don't create. The design stays yours. Want a 2-minute lesson on ${titles[closestSkill]} so you can do this faster yourself?`;
}

export function getStaticHint(skill: SkillId, level: number): string {
  const lesson = LESSONS[skill];
  if (!lesson) {
    return 'Review the core rule in the design guidelines.';
  }
  if (level <= 1) return lesson.staticHints[0];
  if (level === 2) return lesson.staticHints[1];
  if (level === 3) return lesson.staticHints[2];
  return lesson.workedExample;
}
