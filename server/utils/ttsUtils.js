const ngtts = require('node-gtts');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR = path.join(__dirname, '../../output/tmp');
const AUDIO_DIR = path.join(__dirname, '../../output/audio');

// Language code mapping
const LANG_CODES = { 'Telugu': 'te', 'Hindi': 'hi', 'English': 'en' };

// Emotion → FFmpeg audio filter mappings
const EMOTION_FILTERS = {
  'Professional':       null,
  'Calm & Meditative':  'asetrate=44100*0.95,aresample=44100',
  'Dramatic':           'asetrate=44100*0.92,aresample=44100,aecho=0.8:0.7:40:0.3',
  'Motivational':       'asetrate=44100*1.05,aresample=44100',
  'Conversational':     null,
  'Narrative':          'asetrate=44100*0.98,aresample=44100',
};

/**
 * Splits text into chunks of max maxLen characters,
 * respecting sentence and comma boundaries.
 */
function chunkText(text, maxLen = 180) {
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();
  // Split on Telugu/Hindi/English sentence boundaries
  const raw = normalized.split(/(?<=[.!?।\n])\s+/);
  const chunks = [];
  let current = '';

  for (const segment of raw) {
    if (!segment.trim()) continue;
    if ((current + ' ' + segment).length <= maxLen) {
      current = current ? current + ' ' + segment : segment;
    } else {
      if (current) chunks.push(current.trim());
      // If segment itself is too long, split on commas
      if (segment.length > maxLen) {
        const parts = segment.split(/(?<=[,،])\s*/);
        for (const part of parts) {
          if ((current + ' ' + part).length > maxLen) {
            if (current) chunks.push(current.trim());
            current = part;
          } else {
            current = current ? current + ' ' + part : part;
          }
        }
      } else {
        current = segment;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.trim().length > 0);
}

/**
 * Generates TTS audio for a single text chunk using node-gtts.
 * Returns path to the generated MP3 file.
 */
async function generateChunkAudio(text, langCode, outputPath) {
  return new Promise((resolve, reject) => {
    const gtts = ngtts(langCode);
    gtts.save(outputPath, text, (err) => {
      if (err) reject(new Error(`TTS chunk failed: ${err.message}`));
      else resolve(outputPath);
    });
  });
}

/**
 * Concatenates multiple MP3 files into one using FFmpeg.
 */
async function concatenateAudioFiles(inputPaths, outputPath) {
  if (inputPaths.length === 1) {
    fs.copyFileSync(inputPaths[0], outputPath);
    return outputPath;
  }

  // Write FFmpeg concat list
  const listPath = path.join(TMP_DIR, `concat_${Date.now()}.txt`);
  const listContent = inputPaths.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputPath)
      .on('end', () => {
        fs.unlink(listPath, () => {});
        resolve(outputPath);
      })
      .on('error', (err) => {
        fs.unlink(listPath, () => {});
        reject(err);
      })
      .run();
  });
}

/**
 * Applies pitch and speed adjustments via FFmpeg audio filters.
 * Returns path to the processed audio file.
 */
async function applyAudioEffects(inputPath, outputPath, { speed = 1.0, pitch = 1.0, emotion = 'Professional' }) {
  const filters = [];

  // Pitch adjustment (asetrate changes the sample rate to shift pitch, then resample back)
  if (Math.abs(pitch - 1.0) > 0.01) {
    filters.push(`asetrate=44100*${pitch.toFixed(2)},aresample=44100`);
  }

  // Speed adjustment (atempo; chain for values outside 0.5-2.0)
  if (Math.abs(speed - 1.0) > 0.01) {
    let s = Math.max(0.25, Math.min(4.0, speed));
    if (s >= 0.5 && s <= 2.0) {
      filters.push(`atempo=${s.toFixed(2)}`);
    } else if (s < 0.5) {
      filters.push(`atempo=0.5,atempo=${(s / 0.5).toFixed(2)}`);
    } else {
      filters.push(`atempo=2.0,atempo=${(s / 2.0).toFixed(2)}`);
    }
  }

  // Emotion filter
  const emotionFilter = EMOTION_FILTERS[emotion];
  if (emotionFilter) filters.push(emotionFilter);

  // If no filters, just copy
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

/**
 * Main TTS synthesis function.
 * Handles chunking for long texts, concatenation, and audio effects.
 */
async function synthesizeSpeech(text, { language = 'Telugu', speed = 1.0, pitch = 1.0, emotion = 'Professional' }, outputId) {
  const langCode = LANG_CODES[language] || 'te';
  const rawPath = path.join(TMP_DIR, `raw_${outputId}.mp3`);
  const finalPath = path.join(AUDIO_DIR, `${outputId}.mp3`);

  const chunks = chunkText(text);
  console.log(`  TTS: ${chunks.length} chunk(s) for ${text.length} chars in ${language}`);

  const chunkPaths = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = path.join(TMP_DIR, `chunk_${outputId}_${i}.mp3`);
    await generateChunkAudio(chunks[i], langCode, chunkPath);
    chunkPaths.push(chunkPath);
    console.log(`  TTS chunk ${i + 1}/${chunks.length} done`);
  }

  // Concatenate all chunks
  await concatenateAudioFiles(chunkPaths, rawPath);

  // Cleanup chunk files
  chunkPaths.forEach(p => fs.unlink(p, () => {}));

  // Apply pitch/speed/emotion effects
  await applyAudioEffects(rawPath, finalPath, { speed, pitch, emotion });
  fs.unlink(rawPath, () => {});

  // Get duration using ffprobe
  const duration = await getAudioDuration(finalPath);

  return { filePath: finalPath, duration };
}

/**
 * Get audio duration in seconds using ffprobe.
 */
function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) resolve(0);
      else resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Convert MP3 to WAV format.
 */
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
