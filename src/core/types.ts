// SousArtist - Core Data Model & Types
// Pure TypeScript - No Figma imports allowed in core

export type SkillId = 'contrast' | 'spacing-grid' | 'layer-naming' | 'auto-layout';

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
  measured: Record<string, number | string>;
  expected: Record<string, number | string>;
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
}

export interface LearnerState {
  xp: number;
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  skills: Record<SkillId, {
    box: 0 | 1 | 2 | 3 | 4;
    dueDate: string;
    attempts: number;
  }>;
  completedLessons: string[];
}
