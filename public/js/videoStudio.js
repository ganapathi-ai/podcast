/* ════════════════════════════════════════════════════════════
   videoStudio.js — Video Studio Tab Logic
════════════════════════════════════════════════════════════ */

(function VideoStudioModule() {
  // ── State ─────────────────────────────────────────────────────
  let currentJobId   = null;
  let pollTimer      = null;
  let isGenerating   = false;

  // ── DOM refs ──────────────────────────────────────────────────
  const audioStatus  = () => document.getElementById('video-audio-status');
  const audioLabel   = () => document.getElementById('video-audio-label');
  const topicEl      = () => document.getElementById('video-topic');
  const errorEl      = () => document.getElementById('video-error');
  const generateBtn  = () => document.getElementById('video-generate-btn');
  const btnLabel     = () => document.getElementById('video-btn-label');

  const progressArea = () => document.getElementById('video-progress-area');
  const progressText = () => document.getElementById('video-progress-text');
  const progressPct  = () => document.getElementById('video-progress-pct');
  const progressFill = () => document.getElementById('video-progress-fill');

  const downloadArea = () => document.getElementById('video-download-area');
  const downloadLink = () => document.getElementById('video-download-link');
  const fileInfo     = () => document.getElementById('video-file-info');
  const newBtn       = () => document.getElementById('video-new-btn');

  const previewImg   = () => document.getElementById('video-preview-img');

  // ── Update audio status from global state ─────────────────────
  function syncAudioStatus() {
    const url = window.AppState?.currentAudioUrl;
    const id  = window.AppState?.currentAudioId;
    const lbl = audioLabel();
    const box = audioStatus();

    if (url && id) {
      if (lbl) lbl.textContent = `Audio ready — ${id}`;
      box?.classList.add('has-audio');
      generateBtn()?.removeAttribute('disabled');
    } else {
      if (lbl) lbl.textContent = 'No audio — synthesize in Voice Studio first';
      box?.classList.remove('has-audio');
      generateBtn()?.setAttribute('disabled', 'true');
    }
  }

  // ── Show progress ─────────────────────────────────────────────
  function showProgress(pct, message) {
    progressArea()?.classList.remove('hidden');
    downloadArea()?.classList.add('hidden');

    const fill = progressFill();
    const txt  = progressText();
    const pEl  = progressPct();
    if (fill) fill.style.width = `${pct}%`;
    if (txt)  txt.textContent  = message || `Encoding video… (${pct}%)`;
    if (pEl)  pEl.textContent  = `${pct}%`;
  }

  // ── Show download ─────────────────────────────────────────────
  function showDownload(videoUrl, sizeMB, duration) {
    progressArea()?.classList.add('hidden');
    downloadArea()?.classList.remove('hidden');

    const link = downloadLink();
    if (link) {
      link.href = videoUrl;
      link.download = `meluko-manasa-${currentJobId}.mp4`;
    }

    const info = fileInfo();
    if (info) {
      const dur = duration ? ` • ${formatDuration(duration)}` : '';
      info.textContent = `MP4 • H.264 + AAC • 1920×1080 • ${sizeMB || '—'} MB${dur}`;
    }

    // Save to history
    const topic = topicEl()?.value?.trim() || 'Podcast Episode';
    HistoryStore.add('videos', {
      id: currentJobId,
      topic,
      videoUrl,
      sizeMB,
      createdAt: new Date().toISOString(),
    });

    showToast('🎬 Video ready for YouTube upload!', 'success', 4000);
  }

  // ── Poll job status ───────────────────────────────────────────
  function startPolling(jobId) {
    clearInterval(pollTimer);
    let lastPct = 0;

    pollTimer = setInterval(async () => {
      try {
        const res  = await fetch(`/api/generate-video/status/${jobId}`);
        const data = await res.json();

        if (data.status === 'done') {
          clearInterval(pollTimer);
          isGenerating = false;
          resetGenerateBtn();
          showDownload(data.videoUrl, data.sizeMB, null);

        } else if (data.status === 'error') {
          clearInterval(pollTimer);
          isGenerating = false;
          resetGenerateBtn();
          const errEl = errorEl();
          if (errEl) {
            errEl.textContent = `⚠ Video generation failed: ${data.error || 'Unknown error'}`;
            errEl.classList.remove('hidden');
          }
          progressArea()?.classList.add('hidden');
          showToast('Video generation failed', 'error');

        } else if (data.status === 'processing') {
          // Smoothly animate progress (estimate based on time if real pct is 0)
          const pct = data.progress || Math.min(lastPct + 2, 90);
          lastPct = pct;
          const messages = [
            'Assembling intro video…',
            'Applying Ken Burns animation…',
            'Encoding H.264 video track…',
            'Mixing AAC audio track…',
            'Finalizing YouTube-ready MP4…',
          ];
          const msgIdx = Math.floor((pct / 100) * (messages.length - 1));
          showProgress(pct, messages[Math.min(msgIdx, messages.length - 1)]);
        }

      } catch (err) {
        console.warn('[Video poll]', err.message);
      }
    }, 3000); // Poll every 3 seconds
  }

  // ── Reset generate button ─────────────────────────────────────
  function resetGenerateBtn() {
    const btn = generateBtn();
    const lbl = btnLabel();
    if (btn) btn.disabled = false;
    if (lbl) lbl.textContent = 'Generate YouTube Video';
  }

  // ── Handle generate click ─────────────────────────────────────
  async function handleGenerate() {
    if (isGenerating) return;

    const audioUrl = window.AppState?.currentAudioUrl;
    if (!audioUrl) {
      showToast('Please synthesize audio in Voice Studio first', 'error');
      return;
    }

    const topic = topicEl()?.value?.trim() || 'Meluko Manasa Podcast Episode';
    errorEl()?.classList.add('hidden');

    isGenerating = true;
    const btn = generateBtn(); if (btn) btn.disabled = true;
    const lbl = btnLabel(); if (lbl) lbl.textContent = 'Starting…';
    downloadArea()?.classList.add('hidden');
    showProgress(1, 'Sending to encoder…');

    try {
      const res  = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl, topic }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start video generation');

      currentJobId = data.jobId;
      window.AppState.currentJobId = currentJobId;

      if (lbl) lbl.textContent = 'Encoding…';
      startPolling(currentJobId);

    } catch (err) {
      console.error('[Video]', err);
      isGenerating = false;
      resetGenerateBtn();
      progressArea()?.classList.add('hidden');
      const errEl = errorEl();
      if (errEl) { errEl.textContent = `⚠ ${err.message}`; errEl.classList.remove('hidden'); }
      showToast('Video generation failed', 'error');
    }
  }

  // ── Load video from history ───────────────────────────────────
  function loadVideo(item) {
    if (!item?.videoUrl) return;
    downloadArea()?.classList.remove('hidden');
    progressArea()?.classList.add('hidden');

    const link = downloadLink();
    if (link) { link.href = item.videoUrl; link.download = `meluko-manasa-${item.id}.mp4`; }

    const info = fileInfo();
    if (info) info.textContent = `MP4 • ${item.sizeMB || '—'} MB — Click to download`;

    showToast('Video loaded from history', 'info');
  }

  // ── "Generate Another" ────────────────────────────────────────
  function handleNewVideo() {
    clearInterval(pollTimer);
    isGenerating = false;
    currentJobId = null;
    window.AppState.currentJobId = null;
    downloadArea()?.classList.add('hidden');
    progressArea()?.classList.add('hidden');
    resetGenerateBtn();
    syncAudioStatus();
    showToast('Ready for new video', 'info', 1500);
  }

  // ── Ken Burns — rotate image preview every 10s ────────────────
  const brandedImages = [
    '/assets/banner.png',
    '/assets/banner2.png',
  ];
  let imgIdx = 0;
  function rotatePreviews() {
    const img = previewImg();
    if (!img || brandedImages.length < 2) return;
    setInterval(() => {
      imgIdx = (imgIdx + 1) % brandedImages.length;
      img.style.opacity = '0';
      setTimeout(() => {
        img.src = brandedImages[imgIdx];
        img.style.opacity = '1';
      }, 400);
    }, 10000);
  }

  // ── Listen for audio ready events from Voice Studio ──────────
  // Poll AppState every 2 seconds to sync audio availability
  function watchAudioState() {
    setInterval(() => syncAudioStatus(), 2000);
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    generateBtn()?.addEventListener('click', handleGenerate);
    newBtn()?.addEventListener('click', handleNewVideo);

    // Image fade transition
    const img = previewImg();
    if (img) img.style.transition = 'opacity 0.4s ease';

    syncAudioStatus();
    watchAudioState();
    rotatePreviews();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ── Public API ────────────────────────────────────────────────
  window.VideoStudio = { loadVideo };
})();
