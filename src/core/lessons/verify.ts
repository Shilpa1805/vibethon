// SousArtist - Deterministic Lesson Verification
// Re-uses the exact same deterministic analyzers on the practice frame
// Passes when zero findings remain for that skill

import { DesignFacts, Finding, SkillId } from '../types';
import { analyzeContrast } from '../analyzers/contrast';
import { analyzeSpacing } from '../analyzers/spacing';
import { analyzeNaming } from '../analyzers/naming';
import { analyzeAutoLayout } from '../analyzers/autolayout';

export interface VerificationResult {
  passed: boolean;
  skill: SkillId;
  remainingFindings: Finding[];
  message: string;
}

export function verifyPracticeFrame(skill: SkillId, facts: DesignFacts): VerificationResult {
  let findings: Finding[] = [];

  switch (skill) {
    case 'contrast':
      findings = analyzeContrast(facts);
      break;
    case 'spacing-grid':
      findings = analyzeSpacing(facts);
      break;
    case 'layer-naming':
      findings = analyzeNaming(facts);
      break;
    case 'auto-layout':
      findings = analyzeAutoLayout(facts);
      break;
  }

  const passed = findings.length === 0;

  let message = '';
  if (passed) {
    message = 'Great work! All checks passed deterministically.';
  } else {
    const first = findings[0];
    if (skill === 'contrast') {
      message = `Contrast ratio is currently ${first.measured.ratio}:1 (needs at least ${first.expected.minRatio}:1).`;
    } else if (skill === 'spacing-grid') {
      message = `${first.measured.property} is ${first.measured.value}px (use multiple of 4, e.g. ${first.expected.recommended8pt}px).`;
    } else if (skill === 'layer-naming') {
      message = `Layer "${first.measured.currentName}" still has a default Figma name. Rename it to describe its purpose.`;
    } else if (skill === 'auto-layout') {
      message = `Frame still has layoutMode NONE. Apply Auto Layout (Shift+A).`;
    }
  }

  return {
    passed,
    skill,
    remainingFindings: findings,
    message,
  };
}
