// SousArtist - UI Controller
// Move, Measure, Manage - Never Make design for the user

import { AuditSummary, Finding, LearnerState, SkillId } from '../core/types';
import { LESSONS, LessonDefinition } from '../core/lessons/lessons';
import { SousArtistCoach } from '../core/llm/coach';

let learnerState: LearnerState | null = null;
let activeSkill: SkillId = 'contrast';
let activeFrameId: string | null = null;
let currentHintLevel = 0;
let hintsUsedInSession = 0;
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
const btnRunAudit = document.getElementById('btn-run-audit') as HTMLButtonElement | null;
const auditResults = document.getElementById('audit-results');

if (btnRunAudit) {
  btnRunAudit.addEventListener('click', () => {
    btnRunAudit.disabled = true;
    btnRunAudit.textContent = 'Auditing page layers (read-only)...';
    if (auditResults) {
      auditResults.innerHTML = `
        <div style="text-align:center; padding:24px 0; color:var(--text-secondary);">
          <div style="font-weight:600; margin-bottom:4px;">Scanning layer tree...</div>
          <div style="font-size:11px; color:var(--text-muted);">Extracting anonymized structural facts</div>
        </div>
      `;
    }
    parent.postMessage({ pluginMessage: { type: 'RUN_AUDIT' } }, '*');
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
      Audit this page (read-only)
    `;
  }

  if (!auditResults) return;

  if (audit.totalCount === 0) {
    auditResults.innerHTML = `
      <div class="card" style="text-align:center; padding:20px; border-color:var(--success-color);">
        <div style="font-size:24px; margin-bottom:6px;">✨</div>
        <div style="font-weight:600; color:var(--success-color); font-size:14px;">Clean Page Audit!</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
          No contrast, spacing, naming, or auto-layout issues found on "${pageName}".
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
      <span style="font-size:11px; color:var(--text-secondary);">${pageName}</span>
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
          <button class="btn-secondary btn-study" data-skill="${skill}" style="padding:4px 8px; font-size:11px;">
            Study this
          </button>
        </div>

        <div style="display:flex; gap:6px; font-size:11px;">
          ${summary.high > 0 ? `<span style="color:var(--danger-color); font-weight:600;">${summary.high} High</span>` : ''}
          ${summary.medium > 0 ? `<span style="color:var(--warning-color); font-weight:600;">${summary.medium} Med</span>` : ''}
          ${summary.low > 0 ? `<span style="color:var(--text-secondary); font-weight:600;">${summary.low} Low</span>` : ''}
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto;">
          ${skillFindings.slice(0, 5).map((f) => renderFindingItem(f)).join('')}
          ${skillFindings.length > 5 ? `<div style="font-size:11px; color:var(--text-muted); text-align:center;">+${skillFindings.length - 5} more</div>` : ''}
        </div>
      </div>
    `;
  }

  auditResults.innerHTML = html;

  auditResults.querySelectorAll('.btn-study').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skill = btn.getAttribute('data-skill') as SkillId;
      if (skill) {
        activeSkill = skill;
        switchTab('path');
        renderPathTab();
      }
    });
  });

  auditResults.querySelectorAll('.btn-inspect').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nodeId = btn.getAttribute('data-node-id');
      if (nodeId) {
        parent.postMessage({ pluginMessage: { type: 'SELECT_NODE', nodeId } }, '*');
      }
    });
  });
}

function renderFindingItem(f: Finding): string {
  let measuredStr = '';
  if (f.skill === 'contrast') {
    measuredStr = `Ratio: ${f.measured.ratio}:1 (needs ${f.expected.minRatio}:1)`;
  } else if (f.skill === 'spacing-grid') {
    measuredStr = `${f.measured.property}: ${f.measured.value}px (use ${f.expected.recommended8pt}px)`;
  } else if (f.skill === 'layer-naming') {
    measuredStr = `Name: "${f.measured.currentName}"`;
  } else if (f.skill === 'auto-layout') {
    measuredStr = `${f.measured.childCount} children without auto-layout`;
  }

  const severityColor = f.severity === 'high' ? 'var(--danger-color)' : f.severity === 'medium' ? 'var(--warning-color)' : 'var(--text-secondary)';

  return `
    <div style="background:var(--bg-primary); border:1px solid var(--border-color); border-radius:4px; padding:6px 8px; display:flex; justify-content:space-between; align-items:center; font-size:11px;">
      <div>
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${severityColor}; margin-right:4px;"></span>
        <span>${measuredStr}</span>
      </div>
      <button class="btn-inspect" data-node-id="${f.nodeId}" style="background:none; border:none; color:var(--accent-color); cursor:pointer; font-size:11px; text-decoration:underline;">
        Locate
      </button>
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

  pathContainer.innerHTML = html;

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
    box.innerHTML = `<strong>Level ${currentHintLevel}:</strong> ${hintRes.hint} ${hintRes.offline ? '<span style="font-size:10px; color:var(--text-muted);">(offline hint)</span>' : ''}`;
  } else {
    box.innerHTML = `<strong>Level 4 (Worked Example):</strong> ${lesson.workedExample}`;
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
      <div>${result.response}</div>
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

// Window Message Dispatcher
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'LEARNER_STATE_LOADED': {
      learnerState = msg.state;
      renderPathTab();
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
      break;
    }

    case 'AUDIT_ERROR': {
      if (btnRunAudit) {
        btnRunAudit.disabled = false;
        btnRunAudit.textContent = 'Audit this page (read-only)';
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
              <div style="font-size:12px; margin-top:4px;">${msg.result.message}</div>
            </div>
          `;
          if (msg.result.state) {
            learnerState = msg.result.state;
            const xpEl = document.getElementById('stat-xp');
            if (xpEl) xpEl.textContent = `${learnerState.xp} XP`;
          }
        } else {
          resBox.innerHTML = `
            <div class="card" style="background:rgba(245,158,11,0.1); border-color:var(--warning-color); padding:10px;">
              <div style="font-weight:700; color:var(--warning-color); font-size:13px;">
                Needs Adjustment
              </div>
              <div style="font-size:12px; margin-top:4px;">${msg.result.message}</div>
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
