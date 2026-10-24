// SousArtist - Figma clientStorage Adapter
// Defensive persistence for LearnerState

/// <reference types="@figma/plugin-typings" />
import { LearnerState } from '../../core/types';
import { createDefaultLearnerState, sanitizeLearnerState } from '../../core/learner/state';

const STORAGE_KEY = 'sousartist_learner_state_v1';

export async function loadLearnerState(): Promise<LearnerState> {
  try {
    const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
    return sanitizeLearnerState(raw);
  } catch (err) {
    console.warn('Failed to load from clientStorage, resetting state:', err);
    return createDefaultLearnerState();
  }
}

export async function saveLearnerState(state: LearnerState): Promise<void> {
  try {
    await figma.clientStorage.setAsync(STORAGE_KEY, state);
  } catch (err) {
    console.error('Failed to save to clientStorage:', err);
  }
}
