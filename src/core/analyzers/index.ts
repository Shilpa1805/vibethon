// SousArtist - Analyzers Aggregator
// Runs all deterministic analyzers and produces structured findings + summary

import { AuditSummary, DesignFacts, Finding, SkillId, SkillSummary } from '../types';
import { analyzeContrast } from './contrast';
import { analyzeSpacing } from './spacing';
import { analyzeNaming } from './naming';
import { analyzeAutoLayout } from './autolayout';

export { analyzeContrast } from './contrast';
export { analyzeSpacing } from './spacing';
export { analyzeNaming } from './naming';
export { analyzeAutoLayout } from './autolayout';

export function analyzeAll(facts: DesignFacts): AuditSummary {
  const contrastFindings = analyzeContrast(facts);
  const spacingFindings = analyzeSpacing(facts);
  const namingFindings = analyzeNaming(facts);
  const autoLayoutFindings = analyzeAutoLayout(facts);

  const findings: Finding[] = [
    ...contrastFindings,
    ...spacingFindings,
    ...namingFindings,
    ...autoLayoutFindings,
  ];

  const emptySummary = (): SkillSummary => ({
    count: 0,
    high: 0,
    medium: 0,
    low: 0,
  });

  const bySkill: Record<SkillId, SkillSummary> = {
    'contrast': emptySummary(),
    'spacing-grid': emptySummary(),
    'layer-naming': emptySummary(),
    'auto-layout': emptySummary(),
  };

  for (const f of findings) {
    if (bySkill[f.skill]) {
      bySkill[f.skill].count += 1;
      bySkill[f.skill][f.severity] += 1;
    }
  }

  return {
    findings,
    bySkill,
    totalCount: findings.length,
    truncated: Boolean(facts.truncated),
  };
}
