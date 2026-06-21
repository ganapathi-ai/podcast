const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const HISTORY_DIRS = {
  scripts: path.join(__dirname, '../../history/scripts'),
  audio: path.join(__dirname, '../../history/audio'),
  videos: path.join(__dirname, '../../history/videos'),
};

function loadHistory(type, limit = 50) {
  const dir = HISTORY_DIRS[type];
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

// GET /api/history — all history
router.get('/', (req, res) => {
  res.json({
    scripts: loadHistory('scripts'),
    audio: loadHistory('audio'),
    videos: loadHistory('videos'),
  });
});

// GET /api/history/scripts
router.get('/scripts', (req, res) => res.json(loadHistory('scripts')));

// GET /api/history/audio
router.get('/audio', (req, res) => res.json(loadHistory('audio')));

// GET /api/history/videos
router.get('/videos', (req, res) => res.json(loadHistory('videos')));

// DELETE /api/history/scripts/:id
router.delete('/scripts/:id', (req, res) => {
  const file = path.join(HISTORY_DIRS.scripts, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

// DELETE /api/history/audio/:id
router.delete('/audio/:id', (req, res) => {
  const file = path.join(HISTORY_DIRS.audio, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

module.exports = router;
