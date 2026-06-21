/* ════════════════════════════════════════════════════════════
   scriptGenerator.js — AI Script Generator Tab Logic
════════════════════════════════════════════════════════════ */

(function ScriptGeneratorModule() {
  // ── State ───────────────────────────────────────────────────
  let currentScript = null;
  let currentScriptId = null;

  // ── DOM refs ─────────────────────────────────────────────────
  const form          = () => document.getElementById('script-form');
  const topicEl       = () => document.getElementById('script-topic');
  const keywordEl     = () => document.getElementById('script-keyword');
  const languageEl    = () => document.getElementById('script-language');
  const lengthEl      = () => document.getElementById('script-length');
  const typeEl        = () => document.getElementById('script-type');
  const styleEl       = () => document.getElementById('script-style');
  const errorEl       = () => document.getElementById('script-error');
  const generateBtn   = () => document.getElementById('script-generate-btn');
  const btnLabel      = () => document.getElementById('script-btn-label');
  const emptyEl       = () => document.getElementById('script-empty');
  const loadingEl     = () => document.getElementById('script-loading');
  const resultEl      = () => document.getElementById('script-result');
  const blocksEl      = () => document.getElementById('script-blocks');
  const metaEl        = () => document.getElementById('script-meta');
  const copyAllBtn    = () => document.getElementById('script-copy-all');
  const useVoiceBtn   = () => document.getElementById('use-in-voice-btn');

  // ── Show / Hide states ───────────────────────────────────────
  function showEmpty()   { emptyEl()?.classList.remove('hidden'); loadingEl()?.classList.add('hidden');   resultEl()?.classList.add('hidden'); }
  function showLoading() { emptyEl()?.classList.add('hidden');    loadingEl()?.classList.remove('hidden'); resultEl()?.classList.add('hidden'); }
  function showResult()  { emptyEl()?.classList.add('hidden');    loadingEl()?.classList.add('hidden');    resultEl()?.classList.remove('hidden'); }

  // ── Build HTML for one script block ─────────────────────────
  function buildBlock(tagClass, tagLabel, title, content, retention = null) {
    return `
      <div class="script-block">
        <span class="block-tag ${tagClass}">${tagLabel}</span>
        ${title ? `<p class="block-title">${escapeHtml(title)}</p>` : ''}
        <p class="block-content">${escapeHtml(content)}</p>
        ${retention ? `
          <div class="block-retention">
            <span class="retention-label">🔔 Retention Alert: </span>${escapeHtml(retention)}
          </div>` : ''}
      </div>`;
  }

  // ── Render full script output ────────────────────────────────
  function renderScript(data, topic, language, lengthOption) {
    const blocks = document.createDocumentFragment();
    const container = blocksEl();
    if (!container) return;

    const wordCount = data.wordCount || '—';
    const estimated = data.estimatedSeconds
      ? formatDuration(data.estimatedSeconds)
      : '—';

    // Meta line
    const meta = metaEl();
    if (meta) {
      meta.textContent = `${language} • ~${wordCount} words • est. ${estimated} read time`;
    }

    // Build all blocks as HTML string
    let html = '';

    if (data.hook) {
      html += buildBlock('tag-hook', '⚡ Hook (0–5 sec)', null, data.hook);
    }
    if (data.intro) {
      html += buildBlock('tag-intro', '🎙 Intro', null, data.intro);
    }
    (data.sections || []).forEach((sec, i) => {
      html += buildBlock(
        'tag-section',
        `📖 Section ${i + 1}`,
        sec.title,
        sec.content,
        sec.retentionTrigger
      );
    });
    if (data.cta) {
      html += buildBlock('tag-cta', '🔔 Call to Action', null, data.cta);
    }
    if (data.outro) {
      html += buildBlock('tag-outro', '🕊 Outro', null, data.outro);
    }

    container.innerHTML = html;
    showResult();

    // Show "Use in Voice Studio" button
    useVoiceBtn()?.classList.remove('hidden');
  }

  // ── Build full text for clipboard ───────────────────────────
  function buildFullText(data) {
    const parts = [];
    if (data.hook)  parts.push(`[HOOK]\n${data.hook}`);
    if (data.intro) parts.push(`[INTRO]\n${data.intro}`);
    (data.sections || []).forEach((s, i) => {
      parts.push(`[SECTION ${i + 1}: ${s.title}]\n${s.content}${s.retentionTrigger ? '\n⚡ ' + s.retentionTrigger : ''}`);
    });
    if (data.cta)   parts.push(`[CTA]\n${data.cta}`);
    if (data.outro) parts.push(`[OUTRO]\n${data.outro}`);
    return parts.join('\n\n');
  }

  // ── Form submit → Generate script ───────────────────────────
  function handleGenerate(e) {
    e.preventDefault();

    const topic    = topicEl()?.value?.trim();
    const keyword  = keywordEl()?.value?.trim();
    const language = languageEl()?.value || 'Telugu';
    const length   = lengthEl()?.value || '5 minutes';
    const type     = typeEl()?.value || 'Podcast';
    const style    = styleEl()?.value || 'Storytelling';

    const errEl = errorEl();
    if (!topic) {
      if (errEl) { errEl.textContent = '⚠ Please enter a topic or idea for the script.'; errEl.classList.remove('hidden'); }
      topicEl()?.focus();
      return;
    }
    errEl?.classList.add('hidden');

    // Set loading state
    const btn = generateBtn();
    const lbl = btnLabel();
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'Writing script…';
    showLoading();

    fetch('/api/generate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic, keyword,
        contentType: type,
        scriptStyle: style,
        language, lengthOption: length,
      }),
    })
      .then(res => res.json().then(d => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Script generation failed');

        currentScript = data;
        currentScriptId = data.id;

        // Update global state
        window.AppState.currentScript = data;

        // Save to history
        HistoryStore.add('scripts', {
          id: data.id || `script_local_${Date.now()}`,
          topic,
          language,
          lengthOption: length,
          wordCount: data.wordCount,
          estimatedSeconds: data.estimatedSeconds,
          createdAt: new Date().toISOString(),
          script: data,
        });

        renderScript(data, topic, language, length);
        showToast('✓ Script generated successfully!', 'success');
      })
      .catch(err => {
        console.error('[Script]', err);
        showEmpty();
        if (errEl) { errEl.textContent = `⚠ ${err.message}`; errEl.classList.remove('hidden'); }
        showToast('Script generation failed', 'error');
      })
      .finally(() => {
        if (btn) btn.disabled = false;
        if (lbl) lbl.textContent = 'Generate AI Script';
      });
  }

  // ── Copy all to clipboard ────────────────────────────────────
  function handleCopyAll() {
    if (!currentScript) return;
    const text = buildFullText(currentScript);
    navigator.clipboard.writeText(text)
      .then(() => {
        const btn = copyAllBtn();
        if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy All`; }, 2000); }
        showToast('Script copied to clipboard', 'success');
      })
      .catch(() => showToast('Copy failed', 'error'));
  }

  // ── Use in Voice Studio ─────────────────────────────────────
  function handleUseInVoice() {
    if (!currentScript) return;
    const fullText = buildFullText(currentScript);
    window.AppState.currentScript = currentScript;
    // Switch tab and populate voice text
    document.querySelector('.tab-btn[data-tab="voice"]')?.click();
    const voiceText = document.getElementById('voice-text');
    if (voiceText) {
      voiceText.value = fullText;
      voiceText.dispatchEvent(new Event('input'));
    }
    showToast('Script loaded into Voice Studio', 'success');
  }

  // ── Load script from history ─────────────────────────────────
  function loadScript(historyItem) {
    if (!historyItem?.script) return;
    currentScript = historyItem.script;
    currentScriptId = historyItem.id;

    // Restore form values
    const topic = topicEl(); if (topic) topic.value = historyItem.topic || '';
    const lang  = languageEl(); if (lang) lang.value = historyItem.language || 'Telugu';
    const len   = lengthEl(); if (len) len.value = historyItem.lengthOption || '5 minutes';

    renderScript(historyItem.script, historyItem.topic, historyItem.language, historyItem.lengthOption);
    showToast('Script loaded from history', 'info');
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    form()?.addEventListener('submit', handleGenerate);
    copyAllBtn()?.addEventListener('click', handleCopyAll);
    useVoiceBtn()?.addEventListener('click', handleUseInVoice);
    showEmpty();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ── Public API ───────────────────────────────────────────────
  window.ScriptGenerator = { loadScript };
})();
