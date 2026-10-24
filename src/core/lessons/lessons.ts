// SousArtist - Lesson Definitions (MVP: 4 Core Lessons)
// Move, Measure, Manage - Never Make design for the user

import { SkillId } from '../types';

export interface LessonDefinition {
  id: string;
  skill: SkillId;
  title: string;
  goal: string;
  shortcutTip: string;
  staticHints: [string, string, string]; // Levels 1, 2, 3
  workedExample: string;                // Level 4
}

export const LESSONS: Record<SkillId, LessonDefinition> = {
  'contrast': {
    id: 'lesson-contrast',
    skill: 'contrast',
    title: 'Color Contrast & Readability',
    goal: 'Change the light gray text color on this white card until contrast ratio reaches at least 4.5:1 (WCAG AA).',
    shortcutTip: 'Press "I" to open the Eyedropper and sample darker tones.',
    staticHints: [
      'Is the text easily readable against the white background, or does it blend into the card?',
      'WCAG AA requires a 4.5:1 ratio for normal text. Currently this gray is about 2.1:1.',
      'Select the text layer, open the Fill section in the right sidebar, and choose a darker tone like #4B5563 or darker.',
    ],
    workedExample: 'On pure white (#FFFFFF), #767676 reaches exactly 4.54:1 (AA minimum), while #1F2937 delivers a crisp 13.5:1 ratio.',
  },

  'spacing-grid': {
    id: 'lesson-spacing-grid',
    skill: 'spacing-grid',
    title: '8-Point Spacing Grid',
    goal: 'Adjust the container item spacing and padding to multiples of 4 (preferably 8) so the card aligns with the grid.',
    shortcutTip: 'Hold Shift + Arrow keys to nudge values in 8px increments.',
    staticHints: [
      'Do the gaps and margins feel consistent, or do the odd numbers break the visual rhythm?',
      'The itemSpacing is currently 13px and padding is 7px and 19px. In an 8-point system, spacing values should be multiples of 4 or 8.',
      'Select the container frame. In the Auto layout panel, change the gap to 16px and horizontal/vertical padding to 16px or 24px.',
    ],
    workedExample: 'Standard 8pt scale uses 8px (small), 16px (medium), 24px (large), and 32px (xlarge). 4px is reserved for tight micro-elements.',
  },

  'layer-naming': {
    id: 'lesson-layer-naming',
    skill: 'layer-naming',
    title: 'Semantic Layer Naming',
    goal: 'Rename the default Figma names (Frame 12, Rectangle 4, Group 3) to descriptive names indicating their purpose.',
    shortcutTip: 'Press Cmd/Ctrl + R to quickly batch-rename selected layers.',
    staticHints: [
      'If a teammate inspected this file, would the layer names clearly explain what each element represents?',
      'Default names like "Frame 12" and "Rectangle 4" create clutter and slow down developer handoff.',
      'Double-click each layer in the left sidebar (or press Cmd/Ctrl+R) and rename them meaningfully, such as "CardContainer", "MediaThumbnail", or "HeaderGroup".',
    ],
    workedExample: 'Use component-oriented naming: "UserProfileCard" for the parent frame, "AvatarImage" for the media shape, and "CardHeader" for the text group.',
  },

  'auto-layout': {
    id: 'lesson-auto-layout',
    skill: 'auto-layout',
    title: 'Responsive Auto Layout',
    goal: 'Convert this frame with manually positioned elements into an Auto Layout frame so it adapts responsively.',
    shortcutTip: 'Press Shift + A to instantly turn any selection or frame into Auto Layout.',
    staticHints: [
      'What happens if the text expands or elements resize? Do they adapt or overlap?',
      'The container has 3 child elements using absolute manual coordinates instead of an active layout flow.',
      'Select the outer frame and press Shift+A, or click "+" next to Auto layout in the right sidebar. Choose Vertical direction.',
    ],
    workedExample: 'Auto layout with Vertical direction and 12px gap ensures items stack cleanly and reflow when content changes.',
  },
};
