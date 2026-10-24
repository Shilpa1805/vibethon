// SousArtist - Core Data Model & Types
// Pure TypeScript - No Figma imports allowed in core

export type SkillId = 'contrast' | 'spacing-grid' | 'layer-naming' | 'auto-layout';
export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert';
export type WorkContext = 'personal' | 'team' | 'freelance';
export type ExceptionReason = 'intentional' | 'not-applicable' | 'remind-later';

export type RGB = { r: number; g: number; b: number }; // 0..1 channels

export interface FactNode {
  id: string;
  type: 'FRAME' | 'TEXT' | 'SHAPE' | 'GROUP' | 'OTHER';
  name: string;
  parentId: string | null;
  childCount: number;
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing: number | null;
  padding: { l: number; r: number; t: number; b: number } | null;
  fontSize: number | null;        // null if mixed or not text
  fontBold: boolean | null;
  textColor: RGB | null;          // solid fills only, else null
  fillColor: RGB | null;          // solid visible fill only, else null
  hasUnsupportedFill?: boolean;   // e.g. image, gradient, or mixed fills
  width?: number;
  height?: number;
  hue?: number | null;            // 0..360, null if grey or non-solid
  isComponent?: boolean;
  componentName?: string | null;
}

export interface DesignFacts {
  nodes: FactNode[];
  truncated?: boolean;
}

export interface Finding {
  id: string;
  skill: SkillId;
  severity: 'high' | 'medium' | 'low';
  nodeId: string;
  nodeName?: string;
  nodeType?: string;
  measured: Record<string, number | string>;
  expected: Record<string, number | string>;
  summary?: string;
  whyItMatters?: string;
  actionSteps?: string[];
  shortcutTip?: string;
  profileContext?: string;
  tradeoffTip?: string;          // For Intermediate/Expert coaching
}

export interface UnsupportedItem {
  nodeId: string;
  nodeName: string;
  skill: SkillId;
  reason: string;
}

export interface SkillSummary {
  count: number;
  high: number;
  medium: number;
  low: number;
}

export interface AuditSummary {
  findings: Finding[];
  bySkill: Record<SkillId, SkillSummary>;
  totalCount: number;
  truncated: boolean;
  unsupported?: UnsupportedItem[];
  exemptedCount?: number;
  profileName?: string;
}

export interface StandardsProfile {
  id: string;
  name: string;
  context: WorkContext;
  description: string;
  spacing: {
    baseGrid: 4 | 8;
    allowedExceptions: number[];
  };
  naming: {
    pattern: 'default-check' | 'pascal-case' | 'slash-hierarchy';
    forbiddenDefaults: boolean;
  };
  contrast: {
    standard: 'AA' | 'AAA';
    minNormalRatio: number;
    minLargeRatio: number;
  };
  autoLayout: {
    strictness: 'containers-only' | 'all-multi-child';
  };
  exemptions: string[]; // List of exempted node IDs
}

export interface WorkflowRelayNote {
  id: string;
  author: string;
  context: WorkContext;
  topic: 'structure' | 'naming' | 'spacing' | 'overrides' | 'autolayout';
  title: string;
  guideline: string;
  tradeoffReason: string;
  targetScope: string;
  createdAt: string;
  dismissed?: boolean;
}

export interface AuditHistoryEntry {
  timestamp: string;
  scope: string;
  totalFindings: number;
  bySkill: Record<SkillId, number>;
}

export interface LearnerState {
  xp: number;
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  expertiseLevel: ExpertiseLevel;
  activeProfileId: string;
  profiles: StandardsProfile[];
  relayNotes: WorkflowRelayNote[];
  exemptions: string[];
  onboardingComplete: boolean;
  independentResolutions: number;   // Issues resolved without hints (mastery evidence)
  auditHistory: AuditHistoryEntry[]; // Before/after tracking
  dismissedFindings: Record<string, { reason: ExceptionReason; customNote?: string }>;
  skills: Record<SkillId, {
    box: 0 | 1 | 2 | 3 | 4;
    dueDate: string;
    attempts: number;
  }>;
  completedLessons: string[];
}
