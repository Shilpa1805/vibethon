// SousArtist - Analyzers Aggregator
// Runs all deterministic analyzers and produces structured findings + summary

import { AuditSummary, DesignFacts, Finding, SkillId, SkillSummary, StandardsProfile, UnsupportedItem } from '../types';
import { analyzeContrast, detectUnsupportedCases } from './contrast';
import { analyzeSpacing } from './spacing';
import { analyzeNaming } from './naming';
import { analyzeAutoLayout } from './autolayout';

export { analyzeContrast, detectUnsupportedCases } from './contrast';
export { analyzeSpacing } from './spacing';
export { analyzeNaming } from './naming';
export { analyzeAutoLayout } from './autolayout';

export function analyzeAll(facts: DesignFacts, profile?: StandardsProfile): AuditSummary {
  const contrastFindings = analyzeContrast(facts, profile);
  const spacingFindings = analyzeSpacing(facts, profile);
  const namingFindings = analyzeNaming(facts, profile);
  const autoLayoutFindings = analyzeAutoLayout(facts, profile);

  const rawFindings: Finding[] = [
    ...contrastFindings,
    ...spacingFindings,
    ...namingFindings,
    ...autoLayoutFindings,
  ];

  // Filter out intentional exemptions saved in profile
  const exemptions = new Set(profile?.exemptions || []);
  let exemptedCount = 0;
  const findings: Finding[] = [];

  for (const f of rawFindings) {
    if (exemptions.has(f.nodeId)) {
      exemptedCount += 1;
    } else {
      findings.push(f);
    }
  }

  // Detect cases where deterministic rule evaluation is unsupported
  const unsupported: UnsupportedItem[] = detectUnsupportedCases(facts);

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
    unsupported,
    exemptedCount,
    profileName: profile?.name || 'Default',
  };
}
