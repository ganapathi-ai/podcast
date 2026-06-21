const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { generatePodcastVideo, getJobStatus, getFileSizeMB } = require('../utils/ffmpegUtils');

const HISTORY_DIR = path.join(__dirname, '../../history/videos');
const VIDEO_DIR = path.join(__dirname, '../../output/video');

// POST /api/generate-video — start video generation job
router.post('/', async (req, res) => {
  const { audioUrl, topic = 'Meluko Manasa Podcast', language = 'Telugu' } = req.body;

  if (!audioUrl) {
    return res.status(400).json({ error: 'audioUrl is required.' });
  }

  // Resolve audio file path from URL
  const audioRelPath = audioUrl.replace(/^\/output\//, '');
  const audioPath = path.join(__dirname, '../../output', audioRelPath);

  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ error: `Audio file not found: ${audioUrl}` });
  }

  const jobId = `video_${Date.now()}_${uuidv4().substring(0, 8)}`;
  console.log(`[Video] Starting job ${jobId} for: "${topic}"`);

  // Respond immediately with jobId — processing happens in background
  res.json({ success: true, jobId, status: 'processing' });

  // Run video generation asynchronously
  try {
    const { outputPath, totalDuration } = await generatePodcastVideo(
      audioPath,
      jobId,
      (pct) => {} // progress tracked internally
    );

    const videoUrl = `/output/video/${jobId}.mp4`;
    const sizeMB = getFileSizeMB(outputPath);

    // Save history
    const historyEntry = {
      id: jobId,
      topic,
      language,
      audioUrl,
      videoUrl,
      duration: Math.round(totalDuration),
      sizeMB,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(HISTORY_DIR, `${jobId}.json`), JSON.stringify(historyEntry, null, 2));

    console.log(`[Video] Done: ${videoUrl} (${sizeMB} MB)`);
  } catch (err) {
    console.error('[Video] Generation error:', err.message);
  }
});

// GET /api/generate-video/status/:jobId — poll for job status and video URL
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = getJobStatus(jobId);

  let videoUrl = null;
  let sizeMB = null;
  if (status.status === 'done') {
    videoUrl = `/output/video/${jobId}.mp4`;
    sizeMB = getFileSizeMB(path.join(VIDEO_DIR, `${jobId}.mp4`));
  }

  res.json({ jobId, ...status, videoUrl, sizeMB });
});

// GET /api/generate-video/download/:jobId — direct MP4 download
router.get('/download/:jobId', (req, res) => {
  const { jobId } = req.params;
  const filePath = path.join(VIDEO_DIR, `${jobId}.mp4`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not ready yet.' });
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="meluko-manasa-${jobId}.mp4"`);
  res.setHeader('Content-Length', fs.statSync(filePath).size);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
