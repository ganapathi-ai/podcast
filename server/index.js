require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Catch unhandled errors so server never silently dies ─────
process.on('uncaughtException',  err => { console.error('[CRASH] Uncaught:', err.message); });
process.on('unhandledRejection', err => { console.error('[CRASH] Unhandled promise:', err?.message || err); });

// ── Ensure output/history directories exist ───────────────────
const dirs = [
  path.join(__dirname, '../output/audio'),
  path.join(__dirname, '../output/video'),
  path.join(__dirname, '../output/tmp'),
  path.join(__dirname, '../history/scripts'),
  path.join(__dirname, '../history/audio'),
  path.join(__dirname, '../history/videos'),
  path.join(__dirname, '../public/assets'),
];
dirs.forEach(d => {
  try { fs.mkdirSync(d, { recursive: true }); }
  catch(e) { console.warn('[DIR]', d, e.message); }
});

// ── Copy branding assets to public/assets ────────────────────
const brandingSrc = path.join(__dirname, '../channel_branding');
const brandingDst = path.join(__dirname, '../public/assets');
const CLEAN_NAMES = {
  'watermark-removed-generate_YouTube_video_entry_f.mp4': 'intro.mp4',
};
if (fs.existsSync(brandingSrc)) {
  fs.readdirSync(brandingSrc).forEach(file => {
    const destName = CLEAN_NAMES[file] || file;
    const dst = path.join(brandingDst, destName);
    try {
      if (!fs.existsSync(dst)) {
        fs.copyFileSync(path.join(brandingSrc, file), dst);
        console.log(`[Assets] Copied: ${file} → ${destName}`);
      }
    } catch(e) { console.warn('[Assets] Could not copy:', file, e.message); }
  });
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/output', express.static(path.join(__dirname, '../output')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/generate-script',  require('./routes/script'));
app.use('/api/synthesize-voice', require('./routes/tts'));
app.use('/api/generate-video',   require('./routes/video'));
app.use('/api/history',          require('./routes/history'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  res.json({
    status:        'ok',
    channel:       'Meluko Manasa',
    aiConfigured:  hasGemini || hasOpenAI,
    provider:      hasGemini ? 'gemini-2.5-flash' : hasOpenAI ? 'gpt-4o-mini' : 'none',
    geminiReady:   hasGemini,
    openaiReady:   hasOpenAI,
    timestamp:     new Date().toISOString()
  });
});

// ── Catch-all: serve SPA ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const aiStatus  = hasGemini ? '✓ Gemini 2.5 Flash (primary)' :
                    hasOpenAI ? '✓ OpenAI GPT-4o-mini (fallback)' :
                    '✗ MISSING — add GEMINI_API_KEY to .env';
  console.log('');
  console.log('  =====================================================');
  console.log('    MELUKO MANASA - PODCAST STUDIO');
  console.log(`    Running at: http://localhost:${PORT}`);
  console.log(`    AI Engine : ${aiStatus}`);
  console.log('  =====================================================');
  console.log('');
  console.log('  Ready! Ctrl+C to stop.');
  console.log('');
});
