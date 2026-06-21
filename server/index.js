require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Ensure output directories exist ───────────────────────────────────────
const dirs = [
  path.join(__dirname, '../output/audio'),
  path.join(__dirname, '../output/video'),
  path.join(__dirname, '../output/tmp'),
  path.join(__dirname, '../history/scripts'),
  path.join(__dirname, '../history/audio'),
  path.join(__dirname, '../history/videos'),
  path.join(__dirname, '../public/assets'),
];
dirs.forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── Copy branding assets to public/assets if not already there ────────────
const brandingSrc = path.join(__dirname, '../channel_branding');
const brandingDst = path.join(__dirname, '../public/assets');
if (fs.existsSync(brandingSrc)) {
  fs.readdirSync(brandingSrc).forEach(file => {
    const dst = path.join(brandingDst, file);
    if (!fs.existsSync(dst)) {
      fs.copyFileSync(path.join(brandingSrc, file), dst);
    }
  });
}

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/output', express.static(path.join(__dirname, '../output')));

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/generate-script', require('./routes/script'));
app.use('/api/synthesize-voice', require('./routes/tts'));
app.use('/api/generate-video', require('./routes/video'));
app.use('/api/history', require('./routes/history'));

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    channel: 'Meluko Manasa',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// ─── Catch-all: serve frontend SPA ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  =====================================================');
  console.log('    MELUKO MANASA - PODCAST STUDIO');
  console.log(`    Running at: http://localhost:${PORT}`);
  console.log(`    Gemini API: ${process.env.GEMINI_API_KEY ? '✓ Configured' : '✗ Missing (.env)'}`);
  console.log('  =====================================================');
  console.log('');
});
