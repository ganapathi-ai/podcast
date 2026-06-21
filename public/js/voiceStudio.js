/* ════════════════════════════════════════════════════════════
   voiceStudio.js — Voice Studio Tab Logic
════════════════════════════════════════════════════════════ */

(function VoiceStudioModule() {
  // ── Voice Presets ────────────────────────────────────────────
  const VOICE_PRESETS = [
    { id: 'telugu-male',    name: 'రాజు (Raju)',        lang: 'Telugu',  desc: 'Deep, rich Telugu narrator — Stoic documentary flow',    badge: 'TE' },
    { id: 'telugu-female',  name: 'అనన్య (Ananya)',     lang: 'Telugu',  desc: 'Warm, expressive Telugu storytelling voice',              badge: 'TE' },
    { id: 'hindi-male',     name: 'Amit',               lang: 'Hindi',   desc: 'Mature Hindi narrator, professional tone',                badge: 'HI' },
    { id: 'hindi-female',   name: 'Kirti',              lang: 'Hindi',   desc: 'Gentle, emotional Hindi storytelling',                    badge: 'HI' },
    { id: 'english-male',   name: 'Marcus',             lang: 'English', desc: 'Assertive English podcast host quality',                  badge: 'EN' },
    { id: 'english-female', name: 'Priya',              lang: 'English', desc: 'Clear, warm English narrator voice',                      badge: 'EN' },
  ];

  // ── State ────────────────────────────────────────────────────
  let activePreset    = VOICE_PRESETS[0];
  let currentAudioId  = null;
  let isSynthesizing  = false;

  // ── DOM refs ─────────────────────────────────────────────────
  const textEl          = () => document.getElementById('voice-text');
  const charCountEl     = () => document.getElementById('voice-char-count');
  const emotionEl       = () => document.getElementById('voice-emotion');
  const emotionValEl    = () => document.getElementById('emotion-val');
  const speedEl         = () => document.getElementById('voice-speed');
  const speedValEl      = () => document.getElementById('speed-val');
  const pitchEl         = () => document.getElementById('voice-pitch');
  const pitchValEl      = () => document.getElementById('pitch-val');
  const formatEl        = () => document.getElementById('voice-format');
  const synthBtn        = () => document.getElementById('voice-synthesize-btn');
  const btnLabel        = () => document.getElementById('voice-btn-label');
  const errorEl         = () => document.getElementById('voice-error');
  const playerArea      = () => document.getElementById('voice-player-area');
  const audioPlayer     = () => document.getElementById('voice-audio-player');
  const waveform        = () => document.getElementById('voice-waveform');
  const dlMp3           = () => document.getElementById('voice-download-mp3');
  const dlWav           = () => document.getElementById('voice-download-wav');
  const durationEl      = () => document.getElementById('voice-duration');
  const useInVideoBtn   = () => document.getElementById('voice-use-in-video');
  const presetsContainer = () => document.getElementById('voice-presets');

  // ── Render preset buttons ────────────────────────────────────
  function renderPresets() {
    const container = presetsContainer();
    if (!container) return;

    container.innerHTML = VOICE_PRESETS.map(preset => `
      <button class="preset-btn ${preset.id === activePreset.id ? 'active' : ''}"
              data-preset-id="${preset.id}" type="button">
        <span class="preset-radio"></span>
        <span class="preset-info">
          <span class="preset-name">${preset.name}</span>
          <span class="preset-desc">${preset.desc}</span>
        </span>
        <span class="preset-badge">${preset.badge}</span>
      </button>
    `).join('');

    container.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activePreset = VOICE_PRESETS.find(p => p.id === btn.dataset.presetId) || activePreset;
        // Sync language select if open
        const langMap = { Telugu: 'Telugu', Hindi: 'Hindi', English: 'English' };
        const voiceLang = langMap[activePreset.lang] || 'Telugu';
        // Update active class
        container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showToast(`Voice: ${activePreset.name} selected`, 'info', 1500);
      });
    });
  }

  // ── Slider live display updates ──────────────────────────────
  function initSliders() {
    speedEl()?.addEventListener('input', () => {
      const v = parseFloat(speedEl().value).toFixed(1);
      const el = speedValEl(); if (el) el.textContent = `${v}×`;
    });
    pitchEl()?.addEventListener('input', () => {
      const v = parseFloat(pitchEl().value).toFixed(2);
      const el = pitchValEl(); if (el) el.textContent = `${v}×`;
    });
    emotionEl()?.addEventListener('change', () => {
      const el = emotionValEl(); if (el) el.textContent = emotionEl().value;
    });
  }

  // ── Character count ──────────────────────────────────────────
  function updateCharCount() {
    const len = textEl()?.value?.length || 0;
    const el = charCountEl(); if (el) el.textContent = `${len.toLocaleString()} chars`;
  }

  // ── Show audio player ────────────────────────────────────────
  function showPlayer(audioUrl, audioId, duration) {
    const area = playerArea();
    if (!area) return;
    area.classList.remove('hidden');

    const player = audioPlayer();
    if (player) {
      player.src = audioUrl;
      player.load();
    }

    // Animate waveform
    const wf = waveform();
    if (wf) {
      wf.querySelectorAll('span').forEach((span, i) => {
        span.style.animationDuration = `${0.8 + Math.random() * 0.8}s`;
        span.style.animationDelay    = `${i * 0.05}s`;
      });
    }

    // Download links
    const mp3 = dlMp3();
    const wav = dlWav();
    if (mp3) { mp3.href = audioUrl; mp3.download = `meluko-manasa-${audioId}.mp3`; }
    if (wav) {
      // For WAV, call the WAV endpoint
      wav.href = `/api/synthesize-voice/download/${audioId}?format=wav`;
      wav.download = `meluko-manasa-${audioId}.wav`;
    }

    // Duration
    const durEl = durationEl();
    if (durEl && duration) {
      durEl.textContent = `Duration: ${formatDuration(duration)} | Format: MP3 192kbps + WAV 44.1kHz`;
    }

    // Update global state
    window.AppState.currentAudioUrl = audioUrl;
    window.AppState.currentAudioId  = audioId;
    currentAudioId = audioId;
  }

  // ── Synthesize voice ─────────────────────────────────────────
  async function handleSynthesize() {
    if (isSynthesizing) return;

    const text = textEl()?.value?.trim();
    if (!text) {
      const err = errorEl();
      if (err) { err.textContent = '⚠ Please enter some text to synthesize.'; err.classList.remove('hidden'); }
      textEl()?.focus();
      return;
    }
    errorEl()?.classList.add('hidden');

    // Map preset → language
    const langForPreset = activePreset.lang;

    const payload = {
      text,
      language: langForPreset,
      speed:    parseFloat(speedEl()?.value || '1.0'),
      pitch:    parseFloat(pitchEl()?.value || '1.0'),
      emotion:  emotionEl()?.value || 'Professional',
      format:   formatEl()?.value || 'mp3',
      topic:    text.substring(0, 60),
    };

    isSynthesizing = true;
    const btn = synthBtn(); if (btn) btn.disabled = true;
    const lbl = btnLabel(); if (lbl) lbl.textContent = 'Synthesizing…';

    // Hide old player
    playerArea()?.classList.add('hidden');

    try {
      const res  = await fetch('/api/synthesize-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Voice synthesis failed');
      }

      showPlayer(data.audioUrl, data.id, data.duration);

      // Save to history
      HistoryStore.add('audio', {
        id: data.id,
        topic: text.substring(0, 60),
        language: langForPreset,
        emotion: payload.emotion,
        speed: payload.speed,
        pitch: payload.pitch,
        format: data.format,
        duration: data.duration,
        audioUrl: data.audioUrl,
        createdAt: new Date().toISOString(),
      });

      showToast('✓ Voice synthesized successfully!', 'success');
    } catch (err) {
      console.error('[Voice]', err);
      const errEl = errorEl();
      if (errEl) { errEl.textContent = `⚠ ${err.message}`; errEl.classList.remove('hidden'); }
      showToast('Voice synthesis failed', 'error');
    } finally {
      isSynthesizing = false;
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = 'Synthesize Voice';
    }
  }

  // ── Use in Video Studio ──────────────────────────────────────
  function handleUseInVideo() {
    if (!window.AppState.currentAudioUrl) {
      showToast('No audio available yet — synthesize first', 'error');
      return;
    }
    document.querySelector('.tab-btn[data-tab="video"]')?.click();

    // Update video studio audio status
    const label = document.getElementById('video-audio-label');
    const box   = document.getElementById('video-audio-status');
    if (label) label.textContent = `Audio ready (${window.AppState.currentAudioId})`;
    if (box)   box.classList.add('has-audio');

    const genBtn = document.getElementById('video-generate-btn');
    if (genBtn) genBtn.disabled = false;

    showToast('Audio loaded into Video Studio', 'success');
  }

  // ── Load audio from history ──────────────────────────────────
  function loadAudio(item) {
    if (!item?.audioUrl) return;
    showPlayer(item.audioUrl, item.id, item.duration);
    window.AppState.currentAudioUrl = item.audioUrl;
    window.AppState.currentAudioId  = item.id;
    showToast('Audio loaded from history', 'info');
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    renderPresets();
    initSliders();

    textEl()?.addEventListener('input', updateCharCount);
    synthBtn()?.addEventListener('click', handleSynthesize);
    useInVideoBtn()?.addEventListener('click', handleUseInVideo);

    // Auto-fill from AppState if script was transferred
    const voiceText = textEl();
    if (voiceText && !voiceText.value && window.AppState?.currentScript) {
      // Don't auto-fill until user explicitly clicks "Use in Voice Studio"
    }

    updateCharCount();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ── Public API ───────────────────────────────────────────────
  window.VoiceStudio = { loadAudio };
})();
