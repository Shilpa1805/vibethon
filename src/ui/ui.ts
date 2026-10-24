// SousArtist - UI Script

// Tab navigation
const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    if (!targetTab) return;

    tabButtons.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    tabContents.forEach((c) => c.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const content = document.getElementById(`tab-${targetTab}`);
    if (content) {
      content.classList.add('active');
    }
  });
});

// Selection button probe (Milestone 1 requirement)
const btnCheckSelection = document.getElementById('btn-check-selection');
const selectionStatus = document.getElementById('selection-status');

if (btnCheckSelection) {
  btnCheckSelection.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'GET_SELECTION_COUNT' } }, '*');
    if (selectionStatus) {
      selectionStatus.textContent = 'Querying Figma selection...';
    }
  });
}

// Receive messages from plugin main thread
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'SELECTION_COUNT': {
      if (selectionStatus) {
        selectionStatus.textContent = `Selected: ${msg.count} node(s) on page "${msg.pageName}".`;
      }
      break;
    }
    case 'TOAST': {
      showToast(msg.message);
      break;
    }
  }
};

function showToast(message: string, durationMs = 3500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, durationMs);
}
