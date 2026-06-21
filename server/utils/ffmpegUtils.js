const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const VIDEO_DIR = path.join(__dirname, '../../output/video');
const TMP_DIR = path.join(__dirname, '../../output/tmp');
const ASSETS_DIR = path.join(__dirname, '../../public/assets');

// Active job registry for progress tracking
const activeJobs = {};

/**
 * Get video duration in seconds.
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, meta) => {
      if (err) resolve(0);
      else resolve(meta.format.duration || 0);
    });
  });
}

/**
 * Find the intro video in assets directory.
 */
function findIntroVideo() {
  const files = fs.readdirSync(ASSETS_DIR);
  const mp4 = files.find(f => f.endsWith('.mp4'));
  return mp4 ? path.join(ASSETS_DIR, mp4) : null;
}

/**
 * Find the best branded image for the podcast visual.
 * Prefers the wide banner (landscape) image.
 */
function findBrandedImage() {
  const files = fs.readdirSync(ASSETS_DIR);
  // Prefer the wide banner (01_08 is the landscape banner)
  const preferred = files.find(f => f.includes('01_08'));
  if (preferred) return path.join(ASSETS_DIR, preferred);
  const png = files.find(f => f.endsWith('.png'));
  return png ? path.join(ASSETS_DIR, png) : null;
}

/**
 * Main video generation pipeline.
 * Structure: [Intro MP4] → [Branded Image with Ken Burns + Audio]
 * Output: YouTube-ready MP4 (H264 + AAC, 1920x1080, yuv420p, faststart)
 */
async function generatePodcastVideo(audioPath, outputId, onProgress) {
  const introVideoPath = findIntroVideo();
  const brandedImagePath = findBrandedImage();
  const outputPath = path.join(VIDEO_DIR, `${outputId}.mp4`);

  if (!brandedImagePath) throw new Error('Branded image not found in assets folder.');
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error('Audio file not found.');

  // Get audio duration for image section length
  const audioDuration = await new Promise((resolve) => {
    ffmpeg.ffprobe(audioPath, (err, meta) => resolve(err ? 120 : meta.format.duration || 120));
  });

  // Get intro video duration (if exists)
  let introDuration = 0;
  if (introVideoPath && fs.existsSync(introVideoPath)) {
    introDuration = await getVideoDuration(introVideoPath);
  }

  const totalDuration = introDuration + audioDuration;
  console.log(`  Video: intro=${introDuration}s, audio=${audioDuration}s, total=${totalDuration}s`);

  activeJobs[outputId] = { progress: 0, status: 'processing' };

  return new Promise((resolve, reject) => {
    let cmd;

    if (introVideoPath && fs.existsSync(introVideoPath) && introDuration > 0) {
      // ── WITH INTRO VIDEO ──────────────────────────────────────────────────
      // Ken Burns: gentle float + slow zoom oscillation (sin wave for natural movement)
      // Using zoompan with sinusoidal motion for the "moving up and down" effect
      const fps = 25;
      const totalImageFrames = Math.ceil(audioDuration * fps);

      cmd = ffmpeg()
        .input(introVideoPath)
        .input(brandedImagePath)
          .inputOptions(['-loop 1', `-t ${audioDuration}`])
        .input(audioPath)
        .complexFilter([
          // Scale intro to 1920x1080
          '[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,' +
          'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,setpts=PTS-STARTPTS[intro_v]',

          // Ken Burns on branded image: zoom oscillates 1.0→1.15→1.0 + floating x/y
          `[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
          `zoompan=z='1+0.08*sin(on*2*PI/${fps * 12})':` +
          `x='iw/2-(iw/zoom/2)+30*sin(on*2*PI/${fps * 20})':` +
          `y='ih/2-(ih/zoom/2)+20*sin(on*2*PI/${fps * 25})':` +
          `d=1:fps=${fps}:s=1920x1080,setpts=PTS-STARTPTS[image_v]`,

          // Concat intro + image sections (video only)
          '[intro_v][image_v]concat=n=2:v=1:a=0[final_v]',

          // Intro audio (if any) + TTS audio
          '[0:a]apad[intro_a]',
          `[intro_a][2:a]concat=n=2:v=0:a=1,asetrate=44100,aresample=44100[final_a]`,
        ])
        .outputOptions([
          '-map [final_v]',
          '-map [final_a]',
          '-c:v libx264',
          '-preset fast',
          '-crf 22',
          '-c:a aac',
          '-b:a 192k',
          '-ar 44100',
          '-ac 2',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath);

    } else {
      // ── WITHOUT INTRO (image + audio only) ───────────────────────────────
      const fps = 25;
      cmd = ffmpeg()
        .input(brandedImagePath)
          .inputOptions(['-loop 1', `-t ${audioDuration}`])
        .input(audioPath)
        .complexFilter([
          `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,` +
          `zoompan=z='1+0.08*sin(on*2*PI/${fps * 12})':` +
          `x='iw/2-(iw/zoom/2)+30*sin(on*2*PI/${fps * 20})':` +
          `y='ih/2-(ih/zoom/2)+20*sin(on*2*PI/${fps * 25})':` +
          `d=1:fps=${fps}:s=1920x1080,setpts=PTS-STARTPTS[final_v]`,
        ])
        .outputOptions([
          '-map [final_v]',
          '-map 1:a',
          '-c:v libx264',
          '-preset fast',
          '-crf 22',
          '-c:a aac',
          '-b:a 192k',
          '-ar 44100',
          '-ac 2',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath);
    }

    cmd
      .on('progress', (progress) => {
        const pct = progress.percent ? Math.min(Math.round(progress.percent), 99) : 0;
        activeJobs[outputId] = { progress: pct, status: 'processing' };
        if (onProgress) onProgress(pct);
        console.log(`  Video progress: ${pct}%`);
      })
      .on('end', () => {
        activeJobs[outputId] = { progress: 100, status: 'done', outputPath };
        console.log(`  Video done: ${outputPath}`);
        resolve({ outputPath, totalDuration });
      })
      .on('error', (err) => {
        activeJobs[outputId] = { progress: 0, status: 'error', error: err.message };
        console.error('  Video error:', err.message);
        reject(err);
      })
      .run();
  });
}

function getJobStatus(jobId) {
  return activeJobs[jobId] || { progress: 0, status: 'not_found' };
}

/**
 * Get file size in MB.
 */
function getFileSizeMB(filePath) {
  try {
    return (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);
  } catch {
    return '0';
  }
}

module.exports = { generatePodcastVideo, getJobStatus, getFileSizeMB, findBrandedImage };
