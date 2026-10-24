// SousArtist - Plugin Main Thread
// Routes messages between UI and Figma document model
// Move, Measure, Manage - NEVER Make design for the user

/// <reference types="@figma/plugin-typings" />
import { extractDesignFacts, extractMultipleNodesFacts } from './adapters/figma/extract';
import { analyzeAll } from './core/analyzers/index';
import { buildPracticeFrame, verifyCurrentPractice } from './adapters/figma/practice';
import { loadLearnerState, saveLearnerState } from './adapters/figma/storage';
import { advanceLeitnerBox, resetLeitnerOnAuditFailure } from './core/learner/leitner';
import { recordLessonCompletion } from './core/learner/xp';
import { getTodayDateString } from './core/learner/state';
import { DesignFacts, SkillId, ExceptionReason } from './core/types';

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
        const scope = msg.scope || 'PAGE';
        let facts: DesignFacts;
        let targetName = figma.currentPage.name;

        if (scope === 'SELECTION') {
          const selection = figma.currentPage.selection;
          if (selection.length === 0) {
            figma.ui.postMessage({
              type: 'AUDIT_ERROR',
              error: 'Please select a component or frame on the canvas to audit.',
            });
            break;
          }
          const selected = selection[0];
          const isComp = selected.type === 'COMPONENT' || selected.type === 'INSTANCE' || (selected as any).type === 'COMPONENT_SET';
          targetName = `${isComp ? 'Component' : 'Frame'}: "${selected.name}"`;
          facts = await extractDesignFacts(selected);
        } else if (scope === 'COMPONENTS') {
          const componentNodes: SceneNode[] = [];
          function findComponents(parent: PageNode | SceneNode) {
            try {
              const ch = (parent as any).children;
              if (ch && Array.isArray(ch)) {
                for (const child of ch) {
                  if (child.type === 'COMPONENT' || child.type === 'COMPONENT_SET' || child.type === 'INSTANCE') {
                    componentNodes.push(child);
                  } else if ((child as any).children) {
                    findComponents(child);
                  }
                }
              }
            } catch (e) {}
          }
          findComponents(figma.currentPage);

          if (componentNodes.length === 0) {
            figma.ui.postMessage({
              type: 'AUDIT_ERROR',
              error: `No components or instances found on "${figma.currentPage.name}". Select a frame or audit the entire page.`,
            });
            break;
          }

          targetName = `Components (${componentNodes.length}) on "${figma.currentPage.name}"`;
          facts = await extractMultipleNodesFacts(componentNodes);
        } else {
          facts = await extractDesignFacts(figma.currentPage);
        }

        const state = await loadLearnerState();
        const activeProfile = state.profiles?.find(p => p.id === state.activeProfileId) || state.profiles?.[0];

        const audit = analyzeAll(facts, activeProfile);

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
          pageName: targetName,
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
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (node && 'type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
          const mode = (node as any).layoutMode || 'NONE';
          const ch = (node as any).children;
          const count = ch && Array.isArray(ch) ? ch.length : 0;
          figma.notify(`Selected "${node.name}" (Auto Layout: ${mode}, Children: ${count})`, { timeout: 3000 });
        } else {
          figma.notify(`Could not find layer on canvas.`);
        }
      }
      break;
    }

    case 'RECHECK_NODE': {
      if (typeof msg.nodeId === 'string') {
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (!node) {
          figma.ui.postMessage({
            type: 'NODE_RECHECK_RESULT',
            nodeId: msg.nodeId,
            passed: true,
            message: 'Layer was deleted or resolved.',
          });
          break;
        }

        const sceneNode = node as SceneNode;
        const rawMode = (sceneNode as any).layoutMode;
        const isAutoLayout = rawMode === 'HORIZONTAL' || rawMode === 'VERTICAL' || rawMode === 'GRID';
        const ch = (sceneNode as any).children;
        const childCount = ch && Array.isArray(ch) ? ch.length : 0;
        const spacing = (sceneNode as any).itemSpacing;

        if (isAutoLayout || childCount < 2) {
          figma.notify(`✓ "${sceneNode.name}" verified! Auto Layout is active (${rawMode}).`);
          figma.ui.postMessage({
            type: 'NODE_RECHECK_RESULT',
            nodeId: sceneNode.id,
            nodeName: sceneNode.name,
            passed: true,
            layoutMode: rawMode || 'VERTICAL',
            childCount,
            spacing: typeof spacing === 'number' ? spacing : undefined,
            message: `"${sceneNode.name}" is now using Auto Layout (${rawMode || 'VERTICAL'}${typeof spacing === 'number' ? `, ${spacing}px gap` : ''})!`,
          });
        } else {
          figma.currentPage.selection = [sceneNode];
          figma.viewport.scrollAndZoomIntoView([sceneNode]);
          figma.notify(`"${sceneNode.name}" selected: Auto Layout is still OFF. Press Shift+A!`, { timeout: 4000 });
          figma.ui.postMessage({
            type: 'NODE_RECHECK_RESULT',
            nodeId: sceneNode.id,
            nodeName: sceneNode.name,
            passed: false,
            layoutMode: 'NONE',
            childCount,
            message: `"${sceneNode.name}" has ${childCount} children and is still using manual positioning (Shift+A).`,
          });
        }
      }
      break;
    }

    case 'SET_EXPERTISE': {
      if (msg.expertise === 'beginner' || msg.expertise === 'intermediate' || msg.expertise === 'expert') {
        const state = await loadLearnerState();
        state.expertiseLevel = msg.expertise;
        await saveLearnerState(state);
        figma.notify(`Coaching mode set to: ${msg.expertise.toUpperCase()}`);
        figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
      }
      break;
    }

    case 'SET_ACTIVE_PROFILE': {
      if (typeof msg.profileId === 'string') {
        const state = await loadLearnerState();
        if (state.profiles?.some(p => p.id === msg.profileId)) {
          state.activeProfileId = msg.profileId;
          await saveLearnerState(state);
          const p = state.profiles.find(x => x.id === msg.profileId);
          figma.notify(`Standards Profile: "${p?.name || msg.profileId}" active.`);
          figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
        }
      }
      break;
    }

    case 'ADD_EXEMPTION': {
      if (typeof msg.nodeId === 'string') {
        const state = await loadLearnerState();
        const activeProfile = state.profiles?.find(p => p.id === state.activeProfileId) || state.profiles?.[0];
        if (activeProfile && !activeProfile.exemptions.includes(msg.nodeId)) {
          activeProfile.exemptions.push(msg.nodeId);
          await saveLearnerState(state);
          figma.notify(`Saved layer as intentional exception in "${activeProfile.name}".`);
          figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
        }
      }
      break;
    }

    case 'ADD_RELAY_NOTE': {
      if (msg.note && typeof msg.note === 'object') {
        const state = await loadLearnerState();
        state.relayNotes = state.relayNotes || [];
        state.relayNotes.unshift({
          id: `relay-${Date.now()}`,
          author: msg.note.author || 'Designer',
          context: msg.note.context || 'team',
          topic: msg.note.topic || 'structure',
          title: msg.note.title || 'Working Pattern',
          guideline: msg.note.guideline || '',
          tradeoffReason: msg.note.tradeoffReason || '',
          targetScope: msg.note.targetScope || 'General',
          createdAt: 'Just now',
        });
        await saveLearnerState(state);
        figma.notify(`Workflow Relay note added!`);
        figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
      }
      break;
    }

    case 'DISMISS_RELAY_NOTE': {
      if (typeof msg.noteId === 'string') {
        const state = await loadLearnerState();
        const note = state.relayNotes?.find(n => n.id === msg.noteId);
        if (note) {
          note.dismissed = true;
          await saveLearnerState(state);
          figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
        }
      }
      break;
    }

    case 'COMPLETE_ONBOARDING': {
      if (msg.expertise === 'beginner' || msg.expertise === 'intermediate' || msg.expertise === 'expert') {
        const state = await loadLearnerState();
        state.expertiseLevel = msg.expertise;
        state.onboardingComplete = true;
        await saveLearnerState(state);
        figma.notify(`Welcome! Coaching set to: ${msg.expertise.charAt(0).toUpperCase() + msg.expertise.slice(1)}`);
        figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
      }
      break;
    }

    case 'DISMISS_WITH_REASON': {
      if (typeof msg.findingId === 'string' && typeof msg.reason === 'string') {
        const state = await loadLearnerState();
        state.dismissedFindings = state.dismissedFindings || {};
        state.dismissedFindings[msg.findingId] = {
          reason: msg.reason as ExceptionReason,
          customNote: msg.customNote || undefined,
        };
        // Also add to profile exemptions if 'intentional'
        if (msg.reason === 'intentional' && msg.nodeId) {
          const activeProfile = state.profiles?.find(p => p.id === state.activeProfileId) || state.profiles?.[0];
          if (activeProfile && !activeProfile.exemptions.includes(msg.nodeId)) {
            activeProfile.exemptions.push(msg.nodeId);
          }
        }
        await saveLearnerState(state);
        const reasonLabels: Record<string, string> = {
          'intentional': 'Intentional design choice',
          'not-applicable': 'Not applicable to this context',
          'remind-later': 'Will revisit later',
        };
        figma.notify(reasonLabels[msg.reason] || 'Exception noted.');
        figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
      }
      break;
    }

    case 'RECORD_AUDIT_HISTORY': {
      if (msg.entry && typeof msg.entry === 'object') {
        const state = await loadLearnerState();
        state.auditHistory = state.auditHistory || [];
        state.auditHistory.push(msg.entry);
        // Keep last 20 entries max
        if (state.auditHistory.length > 20) {
          state.auditHistory = state.auditHistory.slice(-20);
        }
        await saveLearnerState(state);
      }
      break;
    }

    case 'INCREMENT_INDEPENDENT_RESOLUTIONS': {
      const state = await loadLearnerState();
      state.independentResolutions = (state.independentResolutions || 0) + 1;
      await saveLearnerState(state);
      figma.ui.postMessage({ type: 'LEARNER_STATE_LOADED', state });
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
