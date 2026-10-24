// SousArtist - Plugin Main Thread
// Routes messages between UI and Figma document model
// READ-ONLY on user files; moves/measures/manages, NEVER makes design.

/// <reference types="@figma/plugin-typings" />
import { extractDesignFacts } from './adapters/figma/extract';
import { analyzeAll } from './core/analyzers/index';

figma.showUI(__html__, { width: 380, height: 640, themeColors: true });

figma.ui.onmessage = async (msg: { type: string; [key: string]: any }) => {
  switch (msg.type) {
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
      console.log('Main thread received:', msg.type);
  }
};
