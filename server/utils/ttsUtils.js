/**
 * ttsUtils.js
 * Directly calls Google Translate TTS (supports Telugu, Hindi, English).
 * Replaces node-gtts which doesn't support 'te'.
 */

const path = require('path');
const fs   = require('fs');
const ffmpeg     = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR   = path.join(__dirname, '../../output/tmp');
const AUDIO_DIR = path.join(__dirname, '../../output/audio');

// ── Language code map ─────────────────────────────────────────
const LANG_CODES = { Telugu: 'te', Hindi: 'hi', English: 'en' };

// ── Emotion → FFmpeg audio filter ─────────────────────────────
const EMOTION_FILTERS = {
  'Professional':      null,
  'Calm & Meditative': 'asetrate=44100*0.95,aresample=44100',
  'Dramatic':          'asetrate=44100*0.92,aresample=44100,aecho=0.8:0.7:40:0.3',
  'Motivational':      'asetrate=44100*1.05,aresample=44100',
  'Conversational':    null,
  'Narrative':         'asetrate=44100*0.98,aresample=44100',
};

// ── Split long text into ~180-char chunks ─────────────────────
function chunkText(text, maxLen = 175) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Split on sentence endings (Telugu/Hindi/English)
  const sentences = normalized.split(/(?<=[.!?।॥\n])\s*/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;

    if ((current + ' ' + s).trim().length <= maxLen) {
      current = current ? current + ' ' + s : s;
    } else {
      if (current) chunks.push(current.trim());
      // If single sentence is too long, break by words
      if (s.length > maxLen) {
        const words = s.split(' ');
        let part = '';
        for (const word of words) {
          if ((part + ' ' + word).trim().length > maxLen) {
            if (part) chunks.push(part.trim());
            part = word;
          } else {
            part = part ? part + ' ' + word : word;
          }
        }
        current = part;
      } else {
        current = s;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.trim().length > 0);
}

// ── Fetch one chunk from Google Translate TTS ─────────────────
async function fetchTTSChunk(text, langCode, outputPath) {
  const encoded = encodeURIComponent(text.substring(0, 200));
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${langCode}&client=tw-ob&ttsspeed=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':     'audio/mpeg, audio/*; q=0.9, */*; q=0.8',
      'Referer':    'https://translate.google.com/',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Google TTS HTTP ${response.status} for lang=${langCode}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100) throw new Error('Empty audio response from Google TTS');

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ── Concatenate MP3 chunks with FFmpeg ────────────────────────
async function concatenateAudioFiles(inputPaths, outputPath) {
  if (inputPaths.length === 1) {
    fs.copyFileSync(inputPaths[0], outputPath);
    return outputPath;
  }

  const listPath = path.join(TMP_DIR, `concat_${Date.now()}.txt`);
  const content  = inputPaths
    .map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}' `)
    .join('\n');
  fs.writeFileSync(listPath, content, 'utf8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputPath)
      .on('end', () => { fs.unlink(listPath, () => {}); resolve(outputPath); })
      .on('error', err => { fs.unlink(listPath, () => {}); reject(err); })
      .run();
  });
}

// ── Apply pitch / speed / emotion via FFmpeg ──────────────────
async function applyAudioEffects(inputPath, outputPath, { speed = 1.0, pitch = 1.0, emotion = 'Professional' }) {
  const filters = [];

  // Pitch shift (change sample rate then resample back)
  if (Math.abs(pitch - 1.0) > 0.01) {
    filters.push(`asetrate=44100*${pitch.toFixed(2)},aresample=44100`);
  }

  // Speed (atempo supports 0.5–2.0; chain for out-of-range)
  if (Math.abs(speed - 1.0) > 0.01) {
    const s = Math.max(0.25, Math.min(4.0, speed));
    if (s >= 0.5 && s <= 2.0) {
      filters.push(`atempo=${s.toFixed(2)}`);
    } else if (s < 0.5) {
      filters.push(`atempo=0.5,atempo=${(s / 0.5).toFixed(2)}`);
    } else {
      filters.push(`atempo=2.0,atempo=${(s / 2.0).toFixed(2)}`);
    }
  }

  const emotionFilter = EMOTION_FILTERS[emotion];
  if (emotionFilter) filters.push(emotionFilter);

  if (filters.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(filters.join(','))
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// ── Main: synthesize speech for full script ───────────────────
async function synthesizeSpeech(text, { language = 'Telugu', speed = 1.0, pitch = 1.0, emotion = 'Professional' }, outputId) {
  const langCode  = LANG_CODES[language] || 'te';
  const rawPath   = path.join(TMP_DIR,   `raw_${outputId}.mp3`);
  const finalPath = path.join(AUDIO_DIR, `${outputId}.mp3`);

  const chunks = chunkText(text);
  console.log(`  TTS: ${chunks.length} chunk(s), lang=${langCode} (${language})`);

  const chunkPaths = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = path.join(TMP_DIR, `chunk_${outputId}_${i}.mp3`);
    await fetchTTSChunk(chunks[i], langCode, chunkPath);
    chunkPaths.push(chunkPath);
    console.log(`  TTS chunk ${i + 1}/${chunks.length} ✓`);
    // Rate-limit protection: 300ms between requests
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  // Concatenate all chunks
  await concatenateAudioFiles(chunkPaths, rawPath);
  chunkPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });

  // Apply effects
  await applyAudioEffects(rawPath, finalPath, { speed, pitch, emotion });
  try { fs.unlinkSync(rawPath); } catch {}

  const duration = await getAudioDuration(finalPath);
  return { filePath: finalPath, duration };
}

// ── Audio duration via ffprobe ────────────────────────────────
function getAudioDuration(filePath) {
  return new Promise(resolve => {
    ffmpeg.ffprobe(filePath, (err, meta) => resolve(err ? 0 : (meta.format.duration || 0)));
  });
}

// ── MP3 → WAV conversion ──────────────────────────────────────
async function convertToWav(mp3Path, wavPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(mp3Path)
      .audioCodec('pcm_s16le')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(wavPath)
      .on('end', () => resolve(wavPath))
      .on('error', reject)
      .run();
  });
}

module.exports = { synthesizeSpeech, getAudioDuration, convertToWav, chunkText };
