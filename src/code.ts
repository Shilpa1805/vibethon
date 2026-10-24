// SousArtist - Plugin Main Thread
// Routes messages between UI and Figma document model
// Move, Measure, Manage - NEVER Make design for the user

/// <reference types="@figma/plugin-typings" />
import { extractDesignFacts } from './adapters/figma/extract';
import { analyzeAll } from './core/analyzers/index';
import { buildPracticeFrame, verifyCurrentPractice } from './adapters/figma/practice';
import { loadLearnerState, saveLearnerState } from './adapters/figma/storage';
import { advanceLeitnerBox, resetLeitnerOnAuditFailure } from './core/learner/leitner';
import { recordLessonCompletion } from './core/learner/xp';
import { getTodayDateString } from './core/learner/state';
import { SkillId } from './core/types';

figma.showUI(__html__, { width: 380, height: 640, themeColors: true });

let currentPracticeFrameId: string | null = null;
let currentPracticeSkill: SkillId | null = null;

figma.ui.onmessage = async (msg: { type: string; [key: string]: any }) => {
  switch (msg.type) {
    case 'INIT_APP': {
      const state = await loadLearnerState();
      figma.ui.postMessage({
        type: 'LEARNER_STATE_LOADED',
        state,
      });
      break;
    }

    case 'GET_SELECTION_COUNT': {
      const count = figma.currentPage.selection.length;
      figma.ui.postMessage({
        type: 'SELECTION_COUNT',
        count,
        pageName: figma.currentPage.name,
      });
      break;
    }

    case 'RUN_AUDIT': {
      try {
        const facts = await extractDesignFacts(figma.currentPage);
        const audit = analyzeAll(facts);

        // Transfer signal check: if the user failed a skill on their real file, drop to box 0!
        if (figma.currentPage.name !== 'SousArtist Practice') {
          const failedSkills = Object.keys(audit.bySkill).filter(
            (k) => audit.bySkill[k as SkillId].count > 0
          ) as SkillId[];

          if (failedSkills.length > 0) {
            const state = await loadLearnerState();
            const { updatedState, droppedSkills } = resetLeitnerOnAuditFailure(
              state,
              failedSkills,
              getTodayDateString()
            );

            if (droppedSkills.length > 0) {
              await saveLearnerState(updatedState);
              figma.ui.postMessage({
                type: 'LEITNER_DROPPED',
                droppedSkills,
                state: updatedState,
              });
            }
          }
        }

        figma.ui.postMessage({
          type: 'AUDIT_RESULTS',
          audit,
          pageName: figma.currentPage.name,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'AUDIT_ERROR',
          error: err?.message || 'Failed to audit current page.',
        });
      }
      break;
    }

    case 'BUILD_PRACTICE': {
      try {
        const skill = msg.skill as SkillId;
        const frameId = await buildPracticeFrame(skill);
        currentPracticeFrameId = frameId;
        currentPracticeSkill = skill;
        figma.ui.postMessage({
          type: 'PRACTICE_FRAME_READY',
          skill,
          frameId,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'PRACTICE_ERROR',
          error: err?.message || 'Failed to setup practice frame.',
        });
      }
      break;
    }

    case 'VERIFY_PRACTICE': {
      try {
        const skill = (msg.skill || currentPracticeSkill) as SkillId;
        const frameId = msg.frameId || currentPracticeFrameId;

        if (!frameId) {
          figma.ui.postMessage({
            type: 'VERIFICATION_RESULT',
            result: {
              passed: false,
              skill,
              message: 'No practice frame found. Click "Set up practice frame" first.',
            },
          });
          break;
        }

        const result = await verifyCurrentPractice(skill, frameId);

        if (result.passed) {
          const today = getTodayDateString();
          let state = await loadLearnerState();

          // Award XP
          const { updatedState: stateWithXp, earnedXp } = recordLessonCompletion(
            state,
            `lesson-${skill}`,
            msg.hintsUsedCount || 0,
            today
          );

          // Advance Leitner Box
          const finalState = advanceLeitnerBox(stateWithXp, skill, today);
          await saveLearnerState(finalState);

          figma.ui.postMessage({
            type: 'VERIFICATION_RESULT',
            result: {
              ...result,
              earnedXp,
              state: finalState,
            },
          });
        } else {
          figma.ui.postMessage({
            type: 'VERIFICATION_RESULT',
            result,
          });
        }
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'VERIFICATION_RESULT',
          result: {
            passed: false,
            skill: msg.skill,
            message: err?.message || 'Verification error.',
          },
        });
      }
      break;
    }

    case 'SELECT_NODE': {
      if (typeof msg.nodeId === 'string') {
        const node = figma.getNodeById(msg.nodeId);
        if (node && 'type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        }
      }
      break;
    }

    case 'NOTIFY': {
      if (typeof msg.message === 'string') {
        figma.notify(msg.message, { timeout: msg.timeout || 3000 });
      }
      break;
    }

    default:
      console.log('Main thread unhandled message:', msg.type);
  }
};
