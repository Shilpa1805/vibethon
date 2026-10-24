// SousArtist - UI Controller
// Move, Measure, Manage - Never Make design for the user

import { AuditSummary, Finding, LearnerState, SkillId, ExceptionReason } from '../core/types';
import { LESSONS, LessonDefinition } from '../core/lessons/lessons';
import { SousArtistCoach } from '../core/llm/coach';
import { buildStructuralFindingQuery } from '../core/llm/prompts';
import { escapeHtml } from './escape';

let learnerState: LearnerState | null = null;
let activeSkill: SkillId = 'contrast';
let activeFrameId: string | null = null;
let currentHintLevel = 0;
let hintsUsedInSession = 0;
let pendingPracticeContext: { skill: SkillId; nodeName?: string } | null = null;
const coach = new SousArtistCoach();

// Tab Switching
const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

export function switchTab(targetTab: string) {
  tabButtons.forEach((b) => {
    const isTarget = b.getAttribute('data-tab') === targetTab;
    b.classList.toggle('active', isTarget);
    b.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
  tabContents.forEach((c) => {
    c.classList.toggle('active', c.id === `tab-${targetTab}`);
  });
}

// ── Expertise Dropdown ──────────────────────────────────────────────────────
const btnExpertiseToggle = document.getElementById('btn-expertise-toggle');
const expertiseMenu = document.getElementById('expertise-menu');
const expertiseLabel = document.getElementById('expertise-label');
const expertiseIcon = document.getElementById('expertise-icon');

const EXPERTISE_META: Record<string, { icon: string; label: string }> = {
  beginner:     { icon: '🌱', label: 'Beginner' },
  intermediate: { icon: '⚡', label: 'Intermediate' },
  expert:       { icon: '👑', label: 'Expert' },
};

if (btnExpertiseToggle && expertiseMenu) {
  btnExpertiseToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = expertiseMenu.style.display !== 'none';
    closeAllDropdowns();
    if (!isOpen) expertiseMenu.style.display = 'flex';
  });

  expertiseMenu.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      const level = item.getAttribute('data-level');
      if (!level) return;
      // Update active visual
      expertiseMenu.querySelectorAll('.menu-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      // Update pill label
      const meta = EXPERTISE_META[level] || EXPERTISE_META.intermediate;
      if (expertiseLabel) expertiseLabel.textContent = meta.label;
      if (expertiseIcon) expertiseIcon.textContent = meta.icon;
      closeAllDropdowns();
      parent.postMessage({ pluginMessage: { type: 'SET_EXPERTISE', expertise: level } }, '*');
    });
  });
}

// ── Onboarding Experience Modal ─────────────────────────────────────────────
const onboardingOverlay = document.getElementById('onboarding-overlay');
document.querySelectorAll<HTMLButtonElement>('.onboarding-choice').forEach((btn) => {
  btn.addEventListener('click', () => {
    const level = btn.getAttribute('data-level');
    if (!level) return;
    if (onboardingOverlay) onboardingOverlay.style.display = 'none';
    parent.postMessage({ pluginMessage: { type: 'COMPLETE_ONBOARDING', expertise: level } }, '*');
    if (learnerState) {
      learnerState.expertiseLevel = level as any;
      learnerState.onboardingComplete = true;
      syncToolbarFromState(learnerState);
      renderPathTab();
    }
  });
});

// ── Standards Profile Dropdown ───────────────────────────────────────────────
const btnProfileToggle = document.getElementById('btn-profile-toggle');
const profileMenu = document.getElementById('profile-menu');
const profileLabel = document.getElementById('profile-label');

if (btnProfileToggle && profileMenu) {
  btnProfileToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = profileMenu.style.display !== 'none';
    closeAllDropdowns();
    if (!isOpen) profileMenu.style.display = 'flex';
  });
}

function renderProfileMenu() {
  const container = document.getElementById('profile-menu-items');
  if (!container || !learnerState) return;

  container.innerHTML = learnerState.profiles.map((p) => {
    const isActive = p.id === learnerState!.activeProfileId;
    const contextIcon = p.context === 'team' ? '👥' : p.context === 'freelance' ? '💼' : '🧪';
    return `
      <div class="menu-item ${isActive ? 'active' : ''}" data-profile-id="${escapeHtml(p.id)}" title="${escapeHtml(p.description)}">
        <strong>${contextIcon} ${escapeHtml(p.name)}</strong>
        <small>${escapeHtml(p.description)}</small>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.menu-item').forEach((item) => {
    item.addEventListener('click', () => {
      const profileId = item.getAttribute('data-profile-id');
      if (!profileId) return;
      closeAllDropdowns();
      parent.postMessage({ pluginMessage: { type: 'SET_ACTIVE_PROFILE', profileId } }, '*');
    });
  });
}

// ── Close All Dropdowns ──────────────────────────────────────────────────────
function closeAllDropdowns() {
  if (expertiseMenu) expertiseMenu.style.display = 'none';
  if (profileMenu) profileMenu.style.display = 'none';
}

document.addEventListener('click', closeAllDropdowns);

// ── Sync Toolbar from Learner State ─────────────────────────────────────────
function syncToolbarFromState(state: LearnerState) {
  // Expertise pill
  const meta = EXPERTISE_META[state.expertiseLevel] || EXPERTISE_META.intermediate;
  if (expertiseLabel) expertiseLabel.textContent = meta.label;
  if (expertiseIcon) expertiseIcon.textContent = meta.icon;
  if (expertiseMenu) {
    expertiseMenu.querySelectorAll('.menu-item').forEach((item) => {
      item.classList.toggle('active', item.getAttribute('data-level') === state.expertiseLevel);
    });
  }

  // Profile pill
  const activeProfile = state.profiles?.find((p) => p.id === state.activeProfileId);
  if (profileLabel && activeProfile) profileLabel.textContent = activeProfile.name;

  // Re-render profile dropdown items
  renderProfileMenu();

  // Audit tab banner
  const bannerName = document.getElementById('banner-profile-name');
  const bannerRules = document.getElementById('banner-profile-rules');
  const bannerExemptions = document.getElementById('banner-exemptions-badge');
  if (activeProfile) {
    if (bannerName) bannerName.textContent = activeProfile.name;
    if (bannerRules) {
      const rules = [
        `${activeProfile.spacing.baseGrid}pt grid`,
        `WCAG ${activeProfile.contrast.standard}`,
        activeProfile.naming.pattern === 'slash-hierarchy' ? 'Slash naming'
          : activeProfile.naming.pattern === 'pascal-case' ? 'PascalCase'
          : 'Clean naming',
      ].join(' · ');
      bannerRules.textContent = rules;
    }
    const exemptCount = activeProfile.exemptions?.length || 0;
    if (bannerExemptions) bannerExemptions.textContent = `${exemptCount} exemption${exemptCount !== 1 ? 's' : ''}`;
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    if (target) switchTab(target);
  });
});

// Selection Probe for M1
const btnCheckSelection = document.getElementById('btn-check-selection');
const selectionStatus = document.getElementById('selection-status');
if (btnCheckSelection) {
  btnCheckSelection.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'GET_SELECTION_COUNT' } }, '*');
    if (selectionStatus) selectionStatus.textContent = 'Querying Figma selection...';
  });
}

// Audit Tab Logic
let currentAuditScope: 'PAGE' | 'SELECTION' | 'COMPONENTS' = 'PAGE';
const scopeButtons = document.querySelectorAll<HTMLButtonElement>('.scope-btn');
const btnRunAudit = document.getElementById('btn-run-audit') as HTMLButtonElement | null;
const auditResults = document.getElementById('audit-results');

function getScopeButtonLabel(scope: 'PAGE' | 'SELECTION' | 'COMPONENTS'): string {
  if (scope === 'SELECTION') return 'Audit Selected Component (read-only)';
  if (scope === 'COMPONENTS') return 'Audit All Components on Page';
  return 'Audit Entire Page (read-only)';
}

scopeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    scopeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const scope = btn.getAttribute('data-scope') as 'PAGE' | 'SELECTION' | 'COMPONENTS';
    if (scope) {
      currentAuditScope = scope;
      if (btnRunAudit) {
        btnRunAudit.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          ${getScopeButtonLabel(currentAuditScope)}
        `;
      }
    }
  });
});

if (btnRunAudit) {
  btnRunAudit.addEventListener('click', () => {
    btnRunAudit.disabled = true;
    btnRunAudit.textContent = currentAuditScope === 'SELECTION'
      ? 'Auditing selected component...'
      : currentAuditScope === 'COMPONENTS'
      ? 'Auditing page components...'
      : 'Auditing page layers (read-only)...';

    if (auditResults) {
      auditResults.innerHTML = `
        <div style="text-align:center; padding:24px 0; color:var(--text-secondary);">
          <div style="font-weight:600; margin-bottom:4px;">Scanning layer tree...</div>
          <div style="font-size:11px; color:var(--text-muted);">Extracting anonymized structural facts</div>
        </div>
      `;
    }
    parent.postMessage({ pluginMessage: { type: 'RUN_AUDIT', scope: currentAuditScope } }, '*');
  });
}

function renderAuditResults(audit: AuditSummary, pageName: string) {
  if (btnRunAudit) {
    btnRunAudit.disabled = false;
    btnRunAudit.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      ${getScopeButtonLabel(currentAuditScope)}
    `;
  }

  // Re-audit Delta Tracking (Step 6 of workflow specification)
  const deltaContainer = document.getElementById('reaudit-delta');
  if (deltaContainer) {
    const history = learnerState?.auditHistory || [];
    const lastEntry = history.length > 0 ? history[history.length - 1] : null;

    if (lastEntry && typeof lastEntry.totalFindings === 'number' && lastEntry.totalFindings > audit.totalCount) {
      const resolvedCount = lastEntry.totalFindings - audit.totalCount;
      deltaContainer.style.display = 'block';
      deltaContainer.innerHTML = `
        <div class="card" style="background:rgba(16,185,129,0.12); border-color:var(--success-color); padding:10px 14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:var(--success-color); font-size:13px; display:flex; align-items:center; gap:6px;">
              <span>🎉</span>
              <span>${lastEntry.totalFindings} → ${audit.totalCount} Issues Resolved!</span>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
              You fixed ${resolvedCount} design gap${resolvedCount !== 1 ? 's' : ''} by hand in Figma.
            </div>
          </div>
          <span style="font-size:12px; font-weight:700; color:var(--success-color); background:rgba(16,185,129,0.2); padding:3px 8px; border-radius:12px;">
            +${resolvedCount * 10} XP
          </span>
        </div>
      `;
      // Increment independent resolutions count for expert mastery evidence
      parent.postMessage({ pluginMessage: { type: 'INCREMENT_INDEPENDENT_RESOLUTIONS' } }, '*');
    } else {
      deltaContainer.style.display = 'none';
      deltaContainer.innerHTML = '';
    }
  }

  // Record audit history snapshot
  parent.postMessage({
    pluginMessage: {
      type: 'RECORD_AUDIT_HISTORY',
      entry: {
        timestamp: Date.now(),
        pageName,
        totalGaps: audit.totalCount,
        bySkill: {
          contrast: audit.bySkill.contrast?.count || 0,
          'spacing-grid': audit.bySkill['spacing-grid']?.count || 0,
          'layer-naming': audit.bySkill['layer-naming']?.count || 0,
          'auto-layout': audit.bySkill['auto-layout']?.count || 0,
        },
      },
    },
  }, '*');

  if (!auditResults) return;

  if (audit.totalCount === 0) {
    auditResults.innerHTML = `
      <div class="card" style="text-align:center; padding:20px; border-color:var(--success-color);">
        <div style="font-size:24px; margin-bottom:6px;">✨</div>
        <div style="font-weight:600; color:var(--success-color); font-size:14px;">Clean Page Audit!</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
          No contrast, spacing, naming, or auto-layout issues found on "${escapeHtml(pageName)}".
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  if (audit.truncated) {
    html += `
      <div class="card" style="background:rgba(245, 158, 11, 0.1); border-color:var(--warning-color); padding:10px; font-size:11px; color:var(--warning-color);">
        ⚠️ Page contains over 5,000 nodes. Audit was capped at the first 5,000 nodes.
      </div>
    `;
  }

  html += `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
      <span style="font-weight:700; font-size:13px;">Found ${audit.totalCount} Gap${audit.totalCount === 1 ? '' : 's'}</span>
      <span style="font-size:11px; color:var(--text-secondary);">${escapeHtml(pageName)}</span>
    </div>
  `;

  const skillMeta: Record<SkillId, { label: string; icon: string }> = {
    'contrast': { label: 'Color Contrast', icon: '🌓' },
    'spacing-grid': { label: 'Spacing Grid', icon: '📐' },
    'layer-naming': { label: 'Layer Naming', icon: '🏷️' },
    'auto-layout': { label: 'Auto Layout', icon: '📦' },
  };

  const skills: SkillId[] = ['contrast', 'spacing-grid', 'layer-naming', 'auto-layout'];

  for (const skill of skills) {
    const summary = audit.bySkill[skill];
    if (summary.count === 0) continue;

    const meta = skillMeta[skill];
    const skillFindings = audit.findings.filter((f) => f.skill === skill);

    html += `
      <div class="card" style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>${meta.icon}</span>
            <strong style="font-size:13px;">${meta.label}</strong>
            <span style="background:var(--bg-hover); padding:1px 6px; border-radius:10px; font-size:11px; font-weight:600;">
              ${summary.count}
            </span>
          </div>
          <span style="font-size:11px; color:var(--text-secondary);">
            ${summary.high > 0 ? `<span style="color:var(--danger-color); font-weight:700;">${summary.high} High</span>` : ''}
            ${summary.medium > 0 ? `<span style="color:var(--warning-color); font-weight:600;">${summary.medium} Med</span>` : ''}
            ${summary.low > 0 ? `<span style="color:var(--text-secondary);">${summary.low} Low</span>` : ''}
          </span>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
          ${skillFindings.map((f) => renderFindingItem(f)).join('')}
        </div>
      </div>
    `;
  }

  auditResults.innerHTML = html;

  // Wire finding header accordion toggles
  auditResults.querySelectorAll('.finding-header').forEach((hdr) => {
    hdr.addEventListener('click', (e) => {
      // Don't toggle if the user clicked the Show in File button directly
      if ((e.target as HTMLElement).closest('.btn-inspect')) return;
      const id = hdr.getAttribute('data-id');
      const details = document.getElementById(`details-${id}`);
      const arrow = document.getElementById(`arrow-${id}`);
      if (details && arrow) {
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'flex' : 'none';
        arrow.textContent = isHidden ? '▲' : '▼';
      }
    });
  });

  // Wire "Ask Coach About This" button (Rule 4: structural numbers only, never layer names or text)
  auditResults.querySelectorAll('.btn-ask-about-finding').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skill = (btn.getAttribute('data-skill') || 'contrast') as SkillId;
      const query = btn.getAttribute('data-query') || buildStructuralFindingQuery(skill, {});

      switchTab('coach');
      if (coachInput) {
        coachInput.value = query;
        sendCoachMessage();
      }
    });
  });

  // Wire "Practice in Sandbox" button with contextual link
  auditResults.querySelectorAll('.btn-study-sandbox').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skill = btn.getAttribute('data-skill') as SkillId;
      const nodeName = btn.getAttribute('data-node-name') || undefined;
      if (skill) {
        activeSkill = skill;
        pendingPracticeContext = { skill, nodeName };
        switchTab('path');
        renderPathTab();
      }
    });
  });

  // Wire Exception form toggle
  auditResults.querySelectorAll('.btn-open-exception').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const box = document.getElementById(`exception-box-${id}`);
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  // Wire Cancel Exception
  auditResults.querySelectorAll('.btn-cancel-exception').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const box = document.getElementById(`exception-box-${id}`);
      if (box) box.style.display = 'none';
    });
  });

  // Wire Confirm Exception (Intentional / Not Applicable / Remind Later)
  auditResults.querySelectorAll('.btn-confirm-exception').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const nodeId = btn.getAttribute('data-node-id');
      if (!id) return;

      const checkedRadio = document.querySelector<HTMLInputElement>(`input[name="reason-${id}"]:checked`);
      const reason = (checkedRadio?.value || 'intentional') as ExceptionReason;
      const noteInput = document.getElementById(`exception-note-${id}`) as HTMLInputElement | null;
      const customNote = noteInput?.value?.trim() || undefined;

      parent.postMessage({
        pluginMessage: {
          type: 'DISMISS_WITH_REASON',
          findingId: id,
          reason,
          customNote,
          nodeId,
        },
      }, '*');

      const card = document.getElementById(`card-${id}`);
      if (card) {
        card.style.opacity = '0.6';
        const reasonLabels: Record<string, string> = {
          'intentional': 'Intentional design choice',
          'not-applicable': 'Not applicable to context',
          'remind-later': 'Deferred to backlog',
        };
        card.innerHTML = `
          <div style="padding:10px 14px; font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
            <span>✓ Exception recorded: <strong>${reasonLabels[reason]}</strong>${customNote ? ` ("${escapeHtml(customNote)}")` : ''}</span>
            <span style="font-size:10px; color:var(--text-dim);">(Exempt from audit)</span>
          </div>
        `;
      }
      showToast(`Exception recorded: ${reason}`);
    });
  });

  // Wire Show in File buttons
  auditResults.querySelectorAll('.btn-inspect').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeId = btn.getAttribute('data-node-id');
      if (nodeId) {
        parent.postMessage({ pluginMessage: { type: 'SELECT_NODE', nodeId } }, '*');
      }
    });
  });

  // Wire Re-check buttons
  auditResults.querySelectorAll('.btn-recheck-finding').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeId = btn.getAttribute('data-node-id');
      if (nodeId) {
        btn.textContent = '⏳ Checking...';
        parent.postMessage({ pluginMessage: { type: 'RECHECK_NODE', nodeId } }, '*');
      }
    });
  });
}

function renderFindingItem(f: Finding): string {
  let measuredStr = '';
  let layerIcon = '📦';
  if (f.skill === 'contrast') {
    measuredStr = `Contrast Ratio: ${f.measured.ratio}:1 (needs ${f.expected.minRatio}:1)`;
    layerIcon = '🔤';
  } else if (f.skill === 'spacing-grid') {
    measuredStr = `${f.measured.property}: ${f.measured.value}px (use multiple of 4/8, e.g. ${f.expected.recommended8pt}px)`;
    layerIcon = '📐';
  } else if (f.skill === 'layer-naming') {
    measuredStr = `Name: "${escapeHtml(f.measured.currentName)}"`;
    layerIcon = '🏷️';
  } else if (f.skill === 'auto-layout') {
    measuredStr = `${f.measured.childCount} children without Auto Layout`;
    layerIcon = '📦';
  }

  const severityColor = f.severity === 'high' ? 'var(--danger-color)' : f.severity === 'medium' ? 'var(--warning-color)' : 'var(--text-secondary)';
  const nodeTitle = f.nodeName ? `"${escapeHtml(f.nodeName)}"` : 'Selected Layer';
  const expertise = learnerState?.expertiseLevel || 'intermediate';

  // Skill-level trade-off explanation
  const skillTradeoffs: Record<SkillId, string> = {
    'contrast': 'Higher contrast improves outdoor and low-vision accessibility, but pure black on pure white (#000 on #FFF) can cause halation. Use dark charcoal (#1F2937) to meet AA comfortably.',
    'spacing-grid': '8pt grids guarantee clean integer rendering across 1x/2x/3x screen densities. 4pt increments provide essential density for compact components like badges or tables.',
    'layer-naming': 'Semantic naming takes seconds now but saves hours in engineering handoff, token synchronization, and multi-designer file clarity.',
    'auto-layout': 'Auto Layout guarantees multi-device responsive wrapping and padding. Fixed frames should be reserved solely for freeform illustrations or non-responsive icons.',
  };
  const tradeoffText = f.tradeoffTip || skillTradeoffs[f.skill] || '';
  const structuralQuery = buildStructuralFindingQuery(f.skill, f.measured);

  // Render body based on expertise level
  let detailsBody = '';

  if (expertise === 'expert') {
    // EXPERT: High-density compact view!
    detailsBody = `
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-primary); padding:6px 10px; border-radius:4px; border:1px solid var(--border-color); font-size:11px;">
          <div><strong style="color:var(--text-secondary);">Measured:</strong> <span style="color:var(--text-primary); font-family:monospace;">${escapeHtml(JSON.stringify(f.measured).replace(/[{}"]/g, ''))}</span></div>
          <div><strong style="color:var(--text-secondary);">Expected:</strong> <span style="color:var(--accent-color); font-family:monospace;">${escapeHtml(JSON.stringify(f.expected).replace(/[{}"]/g, ''))}</span></div>
        </div>

        ${tradeoffText ? `
          <div style="font-size:11px; color:var(--text-muted); line-height:1.4; padding:2px 4px;">
            ⚖️ <strong style="color:var(--text-secondary);">Trade-off:</strong> ${escapeHtml(tradeoffText)}
          </div>
        ` : ''}

        ${f.shortcutTip ? `
          <div style="font-size:10px; color:var(--text-muted); padding:2px 4px;">
            ⚡ <strong>Shortcut:</strong> ${escapeHtml(f.shortcutTip)}
          </div>
        ` : ''}
      </div>
    `;
  } else if (expertise === 'intermediate') {
    // INTERMEDIATE: Balanced view with diagnostic + fix steps + tradeoff
    detailsBody = `
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom:2px;">
            🔍 Diagnostic
          </div>
          <div style="color:var(--text-primary); font-size:12px; line-height:1.4;">
            ${escapeHtml(f.summary || measuredStr)}
          </div>
        </div>

        ${f.actionSteps && f.actionSteps.length > 0 ? `
          <div style="background:var(--bg-primary); padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--accent-color); margin-bottom:4px;">
              🛠️ Action Steps
            </div>
            <ol style="padding-left:18px; margin:0; font-size:11px; line-height:1.5; color:var(--text-primary);">
              ${f.actionSteps.slice(0, 3).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
            </ol>
          </div>
        ` : ''}

        ${tradeoffText ? `
          <div style="font-size:11px; color:var(--text-muted); line-height:1.4;">
            ⚖️ <strong>Trade-off:</strong> ${escapeHtml(tradeoffText)}
          </div>
        ` : ''}

        ${f.shortcutTip ? `
          <div style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
            <span>⚡</span>
            <span><strong>Shortcut:</strong> ${escapeHtml(f.shortcutTip)}</span>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    // BEGINNER: Full educational scaffolding
    detailsBody = `
      <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom:2px;">
            🔍 Component Diagnostic
          </div>
          <div style="color:var(--text-primary); font-size:12px; line-height:1.4;">
            ${escapeHtml(f.summary || measuredStr)}
          </div>
        </div>

        ${f.whyItMatters ? `
          <div>
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom:2px;">
              💡 Why It Matters for This Component
            </div>
            <div style="color:var(--text-muted); font-size:11px; line-height:1.4;">
              ${escapeHtml(f.whyItMatters)}
            </div>
          </div>
        ` : ''}

        ${f.actionSteps && f.actionSteps.length > 0 ? `
          <div style="background:var(--bg-primary); padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--success-color); margin-bottom:4px;">
              🛠️ Guided Fix Steps (Do in Figma)
            </div>
            <ol style="padding-left:18px; margin:0; font-size:11px; line-height:1.5; color:var(--text-primary);">
              ${f.actionSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
            </ol>
          </div>
        ` : ''}

        ${tradeoffText ? `
          <div style="font-size:11px; color:var(--text-muted); line-height:1.4;">
            ⚖️ <strong>Design Trade-off:</strong> ${escapeHtml(tradeoffText)}
          </div>
        ` : ''}

        ${f.shortcutTip ? `
          <div style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
            <span>⚡</span>
            <span><strong>Shortcut:</strong> ${escapeHtml(f.shortcutTip)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  return `
    <div class="finding-card" id="card-${escapeHtml(f.id)}" style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; overflow:hidden; font-size:12px; transition:border-color 0.2s ease;">
      <!-- Header Row -->
      <div style="padding:10px 12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" class="finding-header" data-id="${escapeHtml(f.id)}">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${severityColor}; flex-shrink:0;"></span>
          <span style="font-size:14px; flex-shrink:0;">${layerIcon}</span>
          <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <strong style="color:var(--text-primary); font-size:12px;">${nodeTitle}</strong>
            <span style="color:var(--text-secondary); font-size:11px; margin-left:4px;">${escapeHtml(measuredStr)}</span>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:8px;">
          <button class="btn-inspect" data-node-id="${escapeHtml(f.nodeId)}" style="background:var(--bg-hover); border:1px solid var(--border-color); color:var(--accent-color); padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;" title="Highlight this layer in Figma">
            🎯 Show in File
          </button>
          <span class="finding-toggle-arrow" id="arrow-${escapeHtml(f.id)}" style="font-size:10px; color:var(--text-muted); width:14px; text-align:center;">▼</span>
        </div>
      </div>

      <!-- Expandable Component Betterment Body -->
      <div class="finding-details" id="details-${escapeHtml(f.id)}" style="padding:0 12px 12px; border-top:1px solid var(--border-color); background:var(--bg-card); display:flex; flex-direction:column; gap:8px;">
        ${detailsBody}

        <!-- Direct Actions -->
        <div style="display:flex; gap:6px; margin-top:4px; padding-top:6px; border-top:1px solid var(--border-color); flex-wrap:wrap; align-items:center;">
          <button class="btn-recheck-finding btn-primary" data-node-id="${escapeHtml(f.nodeId)}" data-id="${escapeHtml(f.id)}" style="padding:4px 8px; font-size:11px; font-weight:600;" title="Re-check this component right now">
            ↻ Re-check
          </button>
          ${expertise === 'beginner' ? `
            <button class="btn-ask-about-finding btn-secondary" data-skill="${escapeHtml(f.skill)}" data-query="${escapeHtml(structuralQuery)}" style="padding:4px 8px; font-size:11px;">
              💬 Ask Coach
            </button>
          ` : ''}
          <button class="btn-open-exception btn-secondary" data-id="${escapeHtml(f.id)}" style="padding:4px 8px; font-size:11px;" title="Record intentional exception or defer">
            ✓ Exception
          </button>
          <button class="btn-study-sandbox btn-secondary" data-skill="${escapeHtml(f.skill)}" data-node-name="${escapeHtml(f.nodeName || '')}" style="padding:4px 8px; font-size:11px;" title="Open isolated 2-minute practice lesson">
            📚 Practice
          </button>
        </div>

        <!-- Inline Exception Selector (Hidden until clicked) -->
        <div class="exception-box" id="exception-box-${escapeHtml(f.id)}" style="display:none; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:6px; padding:10px; margin-top:4px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">Record Design Exception</div>
          <div style="display:flex; flex-direction:column; gap:4px; font-size:11px; color:var(--text-secondary);">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="reason-${escapeHtml(f.id)}" value="intentional" checked />
              <span><strong>Intentional design choice</strong> (brand nuance / optical fit)</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="reason-${escapeHtml(f.id)}" value="not-applicable" />
              <span><strong>Not applicable</strong> (decorative illustration / canvas scratch)</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="reason-${escapeHtml(f.id)}" value="remind-later" />
              <span><strong>Remind me later</strong> (defer to backlog)</span>
            </label>
          </div>
          <input type="text" id="exception-note-${escapeHtml(f.id)}" placeholder="Optional custom note (e.g. approved by lead)..." style="margin-top:6px; width:100%; box-sizing:border-box; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); padding:4px 8px; border-radius:4px; font-size:11px;" />
          <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:8px;">
            <button class="btn-secondary btn-cancel-exception" data-id="${escapeHtml(f.id)}" style="padding:3px 8px; font-size:10px;">Cancel</button>
            <button class="btn-primary btn-confirm-exception" data-id="${escapeHtml(f.id)}" data-node-id="${escapeHtml(f.nodeId)}" style="padding:3px 10px; font-size:10px;">Save Exception</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Path Tab Logic & Rendering
export function renderPathTab() {
  const xpEl = document.getElementById('stat-xp');
  const streakEl = document.getElementById('stat-streak');
  const pathContainer = document.getElementById('path-container');
  const dailyGoalText = document.getElementById('daily-goal-text');
  const dailyGoalBar = document.getElementById('daily-goal-bar');

  if (learnerState) {
    if (xpEl) xpEl.textContent = `${learnerState.xp} XP`;
    if (streakEl) streakEl.textContent = `${learnerState.streakDays}d`;

    const completedCount = learnerState.completedLessons.length;
    if (dailyGoalText) {
      dailyGoalText.textContent = completedCount > 0 ? '1 / 1 completed' : '0 / 1 completed';
    }
    if (dailyGoalBar) {
      dailyGoalBar.style.width = completedCount > 0 ? '100%' : '0%';
    }
  }

  if (!pathContainer) return;

  const skills: SkillId[] = ['contrast', 'spacing-grid', 'layer-naming', 'auto-layout'];
  const skillIcons: Record<SkillId, string> = {
    'contrast': '🌓',
    'spacing-grid': '📐',
    'layer-naming': '🏷️',
    'auto-layout': '📦',
  };

  let html = '';

  if (pendingPracticeContext) {
    html += `
      <div class="card" style="background:rgba(59,130,246,0.1); border-color:var(--accent-color); padding:10px 12px; margin-bottom:10px; font-size:11px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:var(--accent-color);">🎯 Contextual Practice Challenge:</strong>
          <div style="color:var(--text-secondary); margin-top:2px;">
            Targeting flaw on "${escapeHtml(pendingPracticeContext.nodeName || 'layer')}" (${escapeHtml(LESSONS[activeSkill].title)}). Fix it safely on the practice canvas first!
          </div>
        </div>
        <button id="btn-dismiss-context-challenge" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:2px 4px;">✕</button>
      </div>
    `;
  }

  for (const skill of skills) {
    const lesson = LESSONS[skill];
    const skillData = learnerState?.skills[skill] || { box: 0, dueDate: '', attempts: 0 };
    const isSelected = skill === activeSkill;
    const isMastered = skillData.box >= 4;

    html += `
      <div class="card ${isSelected ? 'selected' : ''}" id="lesson-card-${skill}" style="border-color:${isSelected ? 'var(--accent-color)' : 'var(--border-color)'};">
        <div class="lesson-header" data-skill="${skill}" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="font-size:18px;">${skillIcons[skill]}</div>
            <div>
              <div style="font-weight:700; font-size:13px;">${lesson.title}</div>
              <div style="font-size:11px; color:var(--text-secondary);">
                Leitner Box ${skillData.box}/4 ${isMastered ? '• Mastered 🏆' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${skill === 'contrast' ? `<span class="badge-tag" style="background:rgba(16,185,129,0.15); color:var(--success-color);">Recommended</span>` : ''}
            <span style="font-size:12px; color:var(--text-secondary);">${isSelected ? '▲' : '▼'}</span>
          </div>
        </div>

        ${isSelected ? renderActiveLessonPanel(lesson) : ''}
      </div>
    `;
  }

  // Mastery Evidence & Human Agency Section (Spec item: Evidence tracking for independent mastery)
  const masteredCount = Object.values(learnerState?.skills || {}).filter((s) => s.box >= 4).length;
  const resolutionsCount = learnerState?.independentResolutions || 0;

  html += `
    <div class="card" style="margin-top:12px; background:var(--bg-secondary); border-color:var(--border-color); display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="font-size:12px; color:var(--text-primary);">Human Agency & Mastery Evidence</strong>
        <span style="font-size:10px; font-weight:700; background:rgba(16,185,129,0.15); color:var(--success-color); padding:2px 6px; border-radius:10px;">
          Never Make
        </span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px;">
        <div style="background:var(--bg-primary); padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
          <div style="font-size:18px; font-weight:700; color:var(--accent-color);">${resolutionsCount}</div>
          <div style="color:var(--text-secondary); margin-top:1px;">Independent Fixes</div>
        </div>
        <div style="background:var(--bg-primary); padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
          <div style="font-size:18px; font-weight:700; color:var(--success-color);">${masteredCount} / 4</div>
          <div style="color:var(--text-secondary); margin-top:1px;">Skills Mastered</div>
        </div>
      </div>

      <div style="font-size:10px; color:var(--text-muted); line-height:1.4;">
        🔒 All visual choices remain 100% yours. SousArtist verifies and coaches, but never generates art or code.
      </div>
    </div>
  `;

  pathContainer.innerHTML = html;

  const btnDismissContext = document.getElementById('btn-dismiss-context-challenge');
  if (btnDismissContext) {
    btnDismissContext.addEventListener('click', () => {
      pendingPracticeContext = null;
      renderPathTab();
    });
  }

  pathContainer.querySelectorAll('.lesson-header').forEach((el) => {
    el.addEventListener('click', () => {
      const skill = el.getAttribute('data-skill') as SkillId;
      if (skill) {
        activeSkill = skill;
        currentHintLevel = 0;
        renderPathTab();
      }
    });
  });

  const btnSetup = document.getElementById('btn-setup-practice');
  const btnVerify = document.getElementById('btn-verify-practice');
  const btnHint = document.getElementById('btn-request-hint');

  if (btnSetup) {
    btnSetup.addEventListener('click', () => {
      btnSetup.textContent = 'Setting up frame in "SousArtist Practice"...';
      parent.postMessage({ pluginMessage: { type: 'BUILD_PRACTICE', skill: activeSkill } }, '*');
    });
  }

  if (btnVerify) {
    btnVerify.addEventListener('click', () => {
      btnVerify.textContent = 'Checking work deterministically...';
      parent.postMessage({
        pluginMessage: {
          type: 'VERIFY_PRACTICE',
          skill: activeSkill,
          frameId: activeFrameId,
          hintsUsedCount: hintsUsedInSession,
        },
      }, '*');
    });
  }

  if (btnHint) {
    btnHint.addEventListener('click', async () => {
      if (currentHintLevel < 4) {
        currentHintLevel += 1;
        hintsUsedInSession += 1;
      }
      await renderHintBox();
    });
  }
}

function renderActiveLessonPanel(lesson: LessonDefinition): string {
  return `
    <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border-color); display:flex; flex-direction:column; gap:12px;">
      <div>
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom:4px;">Goal</div>
        <div style="font-size:12px; line-height:1.4;">${lesson.goal}</div>
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn-primary" id="btn-setup-practice" style="flex:1;">
          Set up practice frame
        </button>
        <button class="btn-secondary" id="btn-verify-practice" style="flex:1;">
          Check my work
        </button>
      </div>

      <div id="verification-result-box"></div>

      <!-- Hint Section -->
      <div class="card" style="background:var(--bg-primary); padding:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:600; font-size:11px; color:var(--text-secondary);">
            Hint Ladder ${currentHintLevel > 0 ? `(Level ${currentHintLevel}/4)` : ''}
          </span>
          <button class="btn-secondary" id="btn-request-hint" style="padding:2px 8px; font-size:11px;">
            ${currentHintLevel === 0 ? 'Need a hint?' : currentHintLevel < 4 ? 'Next hint level' : 'Worked example'}
          </button>
        </div>
        <div id="hint-content-box" style="margin-top:6px; font-size:12px; color:var(--text-primary); line-height:1.4;">
          ${getHintText(lesson, currentHintLevel)}
        </div>
      </div>

      <!-- Shortcut tip -->
      <div style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
        <span>💡</span>
        <span>${lesson.shortcutTip}</span>
      </div>
    </div>
  `;
}

function getHintText(lesson: LessonDefinition, level: number): string {
  if (level === 0) {
    return '<span style="color:var(--text-muted);">Try fixing the frame by hand in Figma first. Hints guide your thinking without revealing the solution.</span>';
  }
  if (level === 1) {
    return `<strong>Level 1 (Socratic):</strong> ${lesson.staticHints[0]}`;
  }
  if (level === 2) {
    return `<strong>Level 2 (Rule details):</strong> ${lesson.staticHints[1]}`;
  }
  if (level === 3) {
    return `<strong>Level 3 (Action steps):</strong> ${lesson.staticHints[2]}`;
  }
  return `<strong>Level 4 (Worked Example):</strong> ${lesson.workedExample}`;
}

async function renderHintBox() {
  const box = document.getElementById('hint-content-box');
  const btn = document.getElementById('btn-request-hint');
  const lesson = LESSONS[activeSkill];
  if (!box || !lesson) return;

  if (currentHintLevel === 0) {
    box.innerHTML = getHintText(lesson, 0);
    return;
  }

  // Fetch online graded hint if level 1..3, falling back safely
  if (currentHintLevel < 4) {
    box.innerHTML = '<span style="color:var(--text-muted);">Generating graded coaching hint...</span>';
    const hintRes = await coach.getGradedHint({
      skill: activeSkill,
      level: currentHintLevel,
      measured: { ratio: 2.1 },
      expected: { minRatio: 4.5 },
      attempts: hintsUsedInSession,
    });
    box.innerHTML = `<strong>Level ${currentHintLevel}:</strong> ${escapeHtml(hintRes.hint)} ${hintRes.offline ? '<span style="font-size:10px; color:var(--text-muted);">(offline hint)</span>' : ''}`;
  } else {
    box.innerHTML = `<strong>Level 4 (Worked Example):</strong> ${escapeHtml(lesson.workedExample)}`;
  }

  if (btn) {
    btn.textContent = currentHintLevel < 4 ? 'Next hint level' : 'Worked example';
  }
}

// Coach Tab Chat Implementation
const coachInput = document.getElementById('coach-input') as HTMLInputElement | null;
const btnCoachSend = document.getElementById('btn-coach-send') as HTMLButtonElement | null;
const coachChat = document.getElementById('coach-chat');

async function sendCoachMessage() {
  if (!coachInput || !coachChat) return;
  const text = coachInput.value.trim();
  if (!text) return;

  coachInput.value = '';

  // Append user bubble
  const userBubble = document.createElement('div');
  userBubble.style.cssText = 'background:var(--accent-color); color:#fff; padding:8px 12px; border-radius:12px 12px 2px 12px; max-width:85%; align-self:flex-end; font-size:12px; margin-left:auto;';
  userBubble.textContent = text;
  coachChat.appendChild(userBubble);
  coachChat.scrollTop = coachChat.scrollHeight;

  // Typing indicator
  const typingBubble = document.createElement('div');
  typingBubble.style.cssText = 'background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-secondary); padding:6px 10px; border-radius:12px 12px 12px 2px; max-width:85%; font-size:11px;';
  typingBubble.textContent = 'Coach is thinking...';
  coachChat.appendChild(typingBubble);
  coachChat.scrollTop = coachChat.scrollHeight;

  const result = await coach.handleUserQuery(text, activeSkill);

  coachChat.removeChild(typingBubble);

  // Coach response bubble
  const coachBubble = document.createElement('div');
  coachBubble.style.cssText = `background:var(--bg-card); border:1px solid ${result.intent === 'generate_design' ? 'var(--accent-color)' : 'var(--border-color)'}; color:var(--text-primary); padding:10px 12px; border-radius:12px 12px 12px 2px; max-width:90%; font-size:12px; line-height:1.4;`;

  if (result.intent === 'generate_design') {
    coachBubble.innerHTML = `
      <div style="font-weight:700; color:var(--accent-color); font-size:11px; margin-bottom:4px; text-transform:uppercase;">Coaching Boundary</div>
      <div>${escapeHtml(result.response)}</div>
    `;
  } else {
    coachBubble.textContent = result.response;
  }

  coachChat.appendChild(coachBubble);
  coachChat.scrollTop = coachChat.scrollHeight;
}

if (btnCoachSend) {
  btnCoachSend.addEventListener('click', sendCoachMessage);
}

if (coachInput) {
  coachInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendCoachMessage();
    }
  });
}

// ── Relay Tab Rendering ─────────────────────────────────────────────────────
function renderRelayTab(state: LearnerState) {
  const relayList = document.getElementById('relay-list');
  const relayCount = document.getElementById('relay-count');
  if (!relayList) return;

  const activeNotes = (state.relayNotes || []).filter((n) => !n.dismissed);
  if (relayCount) relayCount.textContent = String(activeNotes.length);

  if (activeNotes.length === 0) {
    relayList.innerHTML = `
      <div class="card" style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">
        No relay patterns yet. Leave a note for your team with <strong>+ Leave Note</strong>.
      </div>
    `;
    return;
  }

  const topicColors: Record<string, string> = {
    structure: '#6366f1',
    naming: '#10b981',
    spacing: '#f59e0b',
    overrides: '#ec4899',
    autolayout: '#3b82f6',
  };

  relayList.innerHTML = activeNotes.map((note) => {
    const color = topicColors[note.topic] || 'var(--accent-color)';
    return `
      <div class="relay-card" data-note-id="${escapeHtml(note.id)}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span class="relay-topic-tag" style="background:${color}22; color:${color};">${escapeHtml(note.topic)}</span>
              ${note.targetScope ? `<span style="font-size:10px; color:var(--text-muted); background:var(--bg-hover); padding:2px 6px; border-radius:4px;">${escapeHtml(note.targetScope)}</span>` : ''}
            </div>
            <strong style="font-size:12px; color:var(--text-primary);">${escapeHtml(note.title)}</strong>
          </div>
          <button class="btn-dismiss-relay" data-note-id="${escapeHtml(note.id)}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:2px; flex-shrink:0;" title="Dismiss note">✕</button>
        </div>

        <div style="font-size:12px; color:var(--text-secondary); line-height:1.4;">${escapeHtml(note.guideline)}</div>

        ${note.tradeoffReason ? `
          <div style="font-size:11px; color:var(--text-muted); display:flex; gap:6px; align-items:flex-start; background:var(--bg-primary); padding:6px 8px; border-radius:5px; border:1px solid var(--border-color);">
            <span style="flex-shrink:0;">⚖️</span>
            <span><strong>Why:</strong> ${escapeHtml(note.tradeoffReason)}</span>
          </div>
        ` : ''}

        <div style="font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
          <span>by ${escapeHtml(note.author)}</span>
          <span>${escapeHtml(note.createdAt)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Wire dismiss buttons
  relayList.querySelectorAll('.btn-dismiss-relay').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.getAttribute('data-note-id');
      if (noteId) {
        parent.postMessage({ pluginMessage: { type: 'DISMISS_RELAY_NOTE', noteId } }, '*');
      }
    });
  });
}

// ── Relay Form Wiring ────────────────────────────────────────────────────────
const btnAddRelay = document.getElementById('btn-add-relay-pattern');
const relayForm = document.getElementById('relay-form');
const btnCancelRelay = document.getElementById('btn-cancel-relay');
const btnSaveRelay = document.getElementById('btn-save-relay');

if (btnAddRelay && relayForm) {
  btnAddRelay.addEventListener('click', () => {
    relayForm.style.display = 'flex';
    btnAddRelay.style.display = 'none';
  });
}

if (btnCancelRelay && relayForm && btnAddRelay) {
  btnCancelRelay.addEventListener('click', () => {
    relayForm.style.display = 'none';
    btnAddRelay.style.display = '';
    clearRelayForm();
  });
}

if (btnSaveRelay) {
  btnSaveRelay.addEventListener('click', () => {
    const title = (document.getElementById('relay-title') as HTMLInputElement)?.value?.trim();
    const guideline = (document.getElementById('relay-guideline') as HTMLTextAreaElement)?.value?.trim();
    const tradeoff = (document.getElementById('relay-tradeoff') as HTMLInputElement)?.value?.trim();

    if (!title || !guideline) {
      showToast('Please fill in the title and guideline fields.');
      return;
    }

    parent.postMessage({
      pluginMessage: {
        type: 'ADD_RELAY_NOTE',
        note: {
          title,
          guideline,
          tradeoffReason: tradeoff || '',
          author: 'You',
          context: learnerState?.activeProfileId?.includes('team') ? 'team' : 'personal',
          topic: 'structure',
          targetScope: 'General',
        },
      },
    }, '*');

    if (relayForm) relayForm.style.display = 'none';
    if (btnAddRelay) (btnAddRelay as HTMLElement).style.display = '';
    clearRelayForm();
  });
}

function clearRelayForm() {
  const title = document.getElementById('relay-title') as HTMLInputElement | null;
  const guideline = document.getElementById('relay-guideline') as HTMLTextAreaElement | null;
  const tradeoff = document.getElementById('relay-tradeoff') as HTMLInputElement | null;
  if (title) title.value = '';
  if (guideline) guideline.value = '';
  if (tradeoff) tradeoff.value = '';
}

// ── Unsupported Items Notice ─────────────────────────────────────────────────
function renderUnsupportedNotice(audit: AuditSummary) {
  const container = document.getElementById('unsupported-container');
  if (!container) return;

  const items = audit.unsupported || [];
  if (items.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="unsupported-notice">
      <div style="font-weight:700; margin-bottom:4px; color:var(--text-secondary);">ℹ️ ${items.length} layer${items.length !== 1 ? 's' : ''} skipped (unsupported fill type)</div>
      <div style="font-size:10px; color:var(--text-muted); line-height:1.4;">
        Gradient, image, or mixed fills cannot be analyzed for contrast offline.
        ${items.slice(0, 3).map((i) => `<br>• "${escapeHtml(i.nodeName)}"`).join('')}
        ${items.length > 3 ? `<br>• …and ${items.length - 3} more` : ''}
      </div>
    </div>
  `;
}

// Window Message Dispatcher
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'LEARNER_STATE_LOADED': {
      learnerState = msg.state;
      if (onboardingOverlay) {
        onboardingOverlay.style.display = msg.state?.onboardingComplete ? 'none' : 'flex';
      }
      syncToolbarFromState(msg.state);
      renderPathTab();
      renderRelayTab(msg.state);
      break;
    }

    case 'SELECTION_COUNT': {
      if (selectionStatus) {
        selectionStatus.textContent = `Selected: ${msg.count} node(s) on page "${msg.pageName}".`;
      }
      break;
    }

    case 'AUDIT_RESULTS': {
      renderAuditResults(msg.audit, msg.pageName);
      renderUnsupportedNotice(msg.audit);
      break;
    }

    case 'NODE_RECHECK_RESULT': {
      const card = document.getElementById(`card-autolayout-${msg.nodeId}`) || document.getElementById(`card-${msg.nodeId}`);
      if (card && msg.passed) {
        card.style.borderColor = 'var(--success-color)';
        card.style.background = 'rgba(16, 185, 129, 0.08)';
        card.innerHTML = `
          <div style="padding:12px; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:var(--success-color); font-size:12px;">✓ Auto Layout Verified & Active!</strong>
              <span style="font-size:11px; font-weight:700; color:var(--success-color);">+10 XP</span>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
              ${escapeHtml(msg.message)}
            </div>
          </div>
        `;
        showToast(`✓ "${escapeHtml(msg.nodeName)}" verified! Auto Layout is active.`);
      } else if (card && !msg.passed) {
        const recheckBtn = card.querySelector('.btn-recheck-finding') as HTMLButtonElement | null;
        if (recheckBtn) recheckBtn.textContent = '↻ Re-check';
        showToast(msg.message);
      }
      break;
    }

    case 'AUDIT_ERROR': {
      if (btnRunAudit) {
        btnRunAudit.disabled = false;
        btnRunAudit.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          ${getScopeButtonLabel(currentAuditScope)}
        `;
      }
      showToast(msg.error || 'Audit encountered an issue.');
      break;
    }

    case 'PRACTICE_FRAME_READY': {
      activeFrameId = msg.frameId;
      const btnSetup = document.getElementById('btn-setup-practice');
      if (btnSetup) btnSetup.textContent = 'Frame ready on "SousArtist Practice"';
      showToast(`Practice frame created on "SousArtist Practice" page.`);
      break;
    }

    case 'VERIFICATION_RESULT': {
      const btnVerify = document.getElementById('btn-verify-practice');
      if (btnVerify) btnVerify.textContent = 'Check my work';

      const resBox = document.getElementById('verification-result-box');
      if (resBox) {
        if (msg.result.passed) {
          resBox.innerHTML = `
            <div class="card" style="background:rgba(16,185,129,0.1); border-color:var(--success-color); padding:10px;">
              <div style="font-weight:700; color:var(--success-color); font-size:13px; display:flex; justify-content:space-between;">
                <span>✓ Verified by Rule Engine!</span>
                <span>+${msg.result.earnedXp || 10} XP</span>
              </div>
              <div style="font-size:12px; margin-top:4px;">${escapeHtml(msg.result.message)}</div>
            </div>
          `;
          if (msg.result.state) {
            learnerState = msg.result.state;
            const xpEl = document.getElementById('stat-xp');
            if (xpEl && learnerState) xpEl.textContent = `${learnerState.xp} XP`;
          }
        } else {
          resBox.innerHTML = `
            <div class="card" style="background:rgba(245,158,11,0.1); border-color:var(--warning-color); padding:10px;">
              <div style="font-weight:700; color:var(--warning-color); font-size:13px;">
                Needs Adjustment
              </div>
              <div style="font-size:12px; margin-top:4px;">${escapeHtml(msg.result.message)}</div>
            </div>
          `;
        }
      }
      break;
    }

    case 'LEITNER_DROPPED': {
      learnerState = msg.state;
      showToast(`Transfer check: Gaps found on real page. Dropped ${msg.droppedSkills.join(', ')} to Box 0.`);
      renderPathTab();
      break;
    }

    case 'TOAST': {
      showToast(msg.message);
      break;
    }
  }
};

export function showToast(message: string, durationMs = 3500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, durationMs);
}

// Initialize on launch
parent.postMessage({ pluginMessage: { type: 'INIT_APP' } }, '*');
