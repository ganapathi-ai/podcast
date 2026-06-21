const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { synthesizeSpeech, convertToWav } = require('../utils/ttsUtils');

const HISTORY_DIR = path.join(__dirname, '../../history/audio');
const AUDIO_DIR = path.join(__dirname, '../../output/audio');

// POST /api/synthesize-voice
router.post('/', async (req, res) => {
  const {
    text,
    language = 'Telugu',
    speed = 1.0,
    pitch = 1.0,
    emotion = 'Professional',
    topic = 'Podcast',
    format = 'mp3',
  } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required.' });
  }

  const id = `audio_${Date.now()}_${uuidv4().substring(0, 8)}`;
  console.log(`[TTS] Synthesizing: ${text.length} chars | ${language} | speed=${speed} pitch=${pitch}`);

  try {
    const { filePath: mp3Path, duration } = await synthesizeSpeech(
      text,
      { language, speed: parseFloat(speed), pitch: parseFloat(pitch), emotion },
      id
    );

    let finalPath = mp3Path;
    let finalFormat = 'mp3';
    let contentType = 'audio/mpeg';

    // Convert to WAV if requested
    if (format === 'wav') {
      const wavPath = mp3Path.replace('.mp3', '.wav');
      await convertToWav(mp3Path, wavPath);
      finalPath = wavPath;
      finalFormat = 'wav';
      contentType = 'audio/wav';
    }

    const fileName = `meluko-manasa-${Date.now()}.${finalFormat}`;
    const audioUrl = `/output/audio/${path.basename(finalPath)}`;

    // Save history entry
    const historyEntry = {
      id,
      topic,
      language,
      emotion,
      speed,
      pitch,
      format: finalFormat,
      duration: Math.round(duration),
      audioUrl,
      createdAt: new Date().toISOString(),
      textPreview: text.substring(0, 100),
    };
    fs.writeFileSync(path.join(HISTORY_DIR, `${id}.json`), JSON.stringify(historyEntry, null, 2));

    res.json({
      success: true,
      id,
      audioUrl,
      duration: Math.round(duration),
      format: finalFormat,
      fileName,
    });

  } catch (err) {
    console.error('[TTS] Error:', err.message);
    res.status(500).json({ error: err.message || 'Voice synthesis failed.' });
  }
});

// GET /api/synthesize-voice/download/:id — direct file download
router.get('/download/:id', (req, res) => {
  const { id } = req.params;
  const { format = 'mp3' } = req.query;
  const filePath = path.join(AUDIO_DIR, `${id}.${format}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found.' });
  }

  const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="meluko-manasa-${id}.${format}"`);
  res.setHeader('Content-Length', fs.statSync(filePath).size);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
