/* ════════════════════════════════════════════════════════════
   app.js — Tab Router, History Store, Global State, Toast
════════════════════════════════════════════════════════════ */

// ── Global shared state ─────────────────────────────────────
window.AppState = {
  currentScript: null,     // Latest generated script object
  currentAudioUrl: null,   // Latest synthesized audio URL
  currentAudioId: null,    // Latest audio file ID
  currentJobId: null,      // Latest video generation job ID
};

// ── History Store (localStorage, max 50 per type) ───────────
window.HistoryStore = {
  _key: 'mm_history',

  _get() {
    try { return JSON.parse(localStorage.getItem(this._key) || '{}'); }
    catch { return {}; }
  },

  _save(data) {
    try { localStorage.setItem(this._key, JSON.stringify(data)); }
    catch (e) { console.warn('HistoryStore save error:', e); }
  },

  add(type, item) {
    const data = this._get();
    if (!data[type]) data[type] = [];
    data[type].unshift({ ...item, _ts: Date.now() });
    if (data[type].length > 50) data[type] = data[type].slice(0, 50);
    this._save(data);
    return data[type][0];
  },

  getAll(type) {
    const data = this._get();
    return (data[type] || []).sort((a, b) => b._ts - a._ts);
  },

  remove(type, id) {
    const data = this._get();
    if (data[type]) data[type] = data[type].filter(i => i.id !== id);
    this._save(data);
    // Also tell server
    fetch(`/api/history/${type}/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  clear(type) {
    const data = this._get();
    data[type] = [];
    this._save(data);
  },
};

// ── Toast Notification ───────────────────────────────────────
window.showToast = function(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, duration);
};

// ── Tab Router ───────────────────────────────────────────────
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const panel = document.getElementById(`tab-${target}`);
      if (panel) panel.classList.add('active');

      // Save active tab
      try { sessionStorage.setItem('mm_active_tab', target); } catch {}
    });
  });

  // Restore last active tab
  try {
    const last = sessionStorage.getItem('mm_active_tab');
    if (last) {
      const btn = document.querySelector(`.tab-btn[data-tab="${last}"]`);
      if (btn) btn.click();
    }
  } catch {}
}

// ── History Sidebar ───────────────────────────────────────────
function initHistorySidebar() {
  const historyBtn   = document.getElementById('history-btn');
  const closeBtn     = document.getElementById('history-close-btn');
  const sidebar      = document.getElementById('history-sidebar');
  const overlay      = document.getElementById('history-overlay');
  const sidebarTabs  = document.querySelectorAll('.sidebar-tab');
  const historyLists = document.querySelectorAll('.history-list');

  function openSidebar() {
    sidebar.classList.remove('hidden');
    overlay.classList.remove('hidden');
    refreshHistoryPanel();
  }

  function closeSidebar() {
    sidebar.classList.add('hidden');
    overlay.classList.add('hidden');
  }

  historyBtn?.addEventListener('click', openSidebar);
  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // Sidebar sub-tabs
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sidebarTabs.forEach(t => t.classList.remove('active'));
      historyLists.forEach(l => l.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.htab;
      const list = document.getElementById(`history-${target}`);
      if (list) list.classList.add('active');
    });
  });
}

// ── Render History Lists ──────────────────────────────────────
function refreshHistoryPanel() {
  renderHistoryList('scripts',
    HistoryStore.getAll('scripts'),
    renderScriptItem
  );
  renderHistoryList('audio',
    HistoryStore.getAll('audio'),
    renderAudioItem
  );
  renderHistoryList('videos',
    HistoryStore.getAll('videos'),
    renderVideoItem
  );

  // Also fetch from server and merge
  fetch('/api/history')
    .then(r => r.json())
    .then(data => {
      // Merge server history into localStorage
      if (data.scripts?.length) {
        data.scripts.forEach(s => {
          const existing = HistoryStore.getAll('scripts').find(i => i.id === s.id);
          if (!existing) HistoryStore.add('scripts', s);
        });
      }
      if (data.audio?.length) {
        data.audio.forEach(a => {
          const existing = HistoryStore.getAll('audio').find(i => i.id === a.id);
          if (!existing) HistoryStore.add('audio', a);
        });
      }
      // Re-render after merge
      renderHistoryList('scripts', HistoryStore.getAll('scripts'), renderScriptItem);
      renderHistoryList('audio', HistoryStore.getAll('audio'), renderAudioItem);
      renderHistoryList('videos', HistoryStore.getAll('videos'), renderVideoItem);
    })
    .catch(() => {});
}

function renderHistoryList(type, items, renderFn) {
  const container = document.getElementById(`history-${type}`);
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="history-empty">No ${type} history yet</div>`;
    return;
  }

  container.innerHTML = items.map(item => renderFn(item, type)).join('');

  // Attach click and delete handlers
  container.querySelectorAll('.history-item[data-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.history-del')) return;
      handleHistoryItemClick(type, el.dataset.id);
      document.getElementById('history-sidebar').classList.add('hidden');
      document.getElementById('history-overlay').classList.add('hidden');
    });
    el.querySelector('.history-del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      HistoryStore.remove(type, el.dataset.id);
      el.remove();
      showToast('Deleted from history', 'info');
    });
  });
}

function renderScriptItem(item) {
  const date = new Date(item.createdAt || item._ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="history-item" data-id="${item.id}" title="Click to load this script">
      <button class="history-del" title="Delete">✕</button>
      <div class="history-item-title">${escapeHtml(item.topic?.substring(0, 60) || 'Untitled Script')}</div>
      <div class="history-item-meta">${date}</div>
      <div class="history-item-tags">
        <span class="history-tag">${item.language || 'Telugu'}</span>
        <span class="history-tag">${item.lengthOption || ''}</span>
        ${item.wordCount ? `<span class="history-tag">${item.wordCount}w</span>` : ''}
      </div>
    </div>`;
}

function renderAudioItem(item) {
  const date = new Date(item.createdAt || item._ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dur = item.duration ? `${Math.round(item.duration)}s` : '';
  return `
    <div class="history-item" data-id="${item.id}" title="Click to load this audio">
      <button class="history-del" title="Delete">✕</button>
      <div class="history-item-title">${escapeHtml(item.topic?.substring(0, 60) || 'Audio Session')}</div>
      <div class="history-item-meta">${date}</div>
      <div class="history-item-tags">
        <span class="history-tag">${item.language || 'Telugu'}</span>
        ${dur ? `<span class="history-tag">${dur}</span>` : ''}
        <span class="history-tag">${(item.format || 'mp3').toUpperCase()}</span>
      </div>
    </div>`;
}

function renderVideoItem(item) {
  const date = new Date(item.createdAt || item._ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="history-item" data-id="${item.id}" title="Click to view this video">
      <button class="history-del" title="Delete">✕</button>
      <div class="history-item-title">${escapeHtml(item.topic?.substring(0, 60) || 'Video')}</div>
      <div class="history-item-meta">${date}</div>
      <div class="history-item-tags">
        ${item.sizeMB ? `<span class="history-tag">${item.sizeMB} MB</span>` : ''}
        <span class="history-tag">MP4</span>
        <span class="history-tag">YouTube Ready</span>
      </div>
    </div>`;
}

function handleHistoryItemClick(type, id) {
  if (type === 'scripts') {
    const item = HistoryStore.getAll('scripts').find(i => i.id === id);
    if (item?.script) {
      window.AppState.currentScript = item.script;
      // Switch to script tab and load result
      document.querySelector('.tab-btn[data-tab="script"]')?.click();
      if (window.ScriptGenerator?.loadScript) {
        window.ScriptGenerator.loadScript(item);
      }
    }
  } else if (type === 'audio') {
    const item = HistoryStore.getAll('audio').find(i => i.id === id);
    if (item?.audioUrl) {
      document.querySelector('.tab-btn[data-tab="voice"]')?.click();
      if (window.VoiceStudio?.loadAudio) {
        window.VoiceStudio.loadAudio(item);
      }
    }
  } else if (type === 'videos') {
    const item = HistoryStore.getAll('videos').find(i => i.id === id);
    if (item?.videoUrl) {
      document.querySelector('.tab-btn[data-tab="video"]')?.click();
      if (window.VideoStudio?.loadVideo) {
        window.VideoStudio.loadVideo(item);
      }
    }
  }
}

// ── API Health Check ──────────────────────────────────────────
async function checkApiHealth() {
  const badge = document.getElementById('api-status');
  const label = badge?.querySelector('.api-label');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.geminiConfigured) {
      badge?.classList.replace('checking', 'ok');
      if (label) label.textContent = 'Gemini Ready';
    } else {
      badge?.classList.replace('checking', 'error');
      if (label) label.textContent = 'API Key Missing';
      showToast('⚠ Add GEMINI_API_KEY to your .env file', 'error', 5000);
    }
  } catch {
    badge?.classList.replace('checking', 'error');
    if (label) label.textContent = 'Server Offline';
  }
}

// ── Range slider visual fill update ──────────────────────────
function initRangeSliders() {
  document.querySelectorAll('.field-range').forEach(input => {
    function update() {
      const min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
      const pct = ((val - min) / (max - min)) * 100;
      input.style.setProperty('--val', `${pct}%`);
    }
    input.addEventListener('input', update);
    update();
  });
}

// ── Utility: escape HTML ─────────────────────────────────────
window.escapeHtml = function(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// ── Utility: format duration ──────────────────────────────────
window.formatDuration = function(seconds) {
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initHistorySidebar();
  initRangeSliders();
  checkApiHealth();
  console.log('🎙 Meluko Manasa Podcast Studio — Ready');
});
