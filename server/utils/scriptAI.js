/**
 * scriptAI.js
 * Uses Gemini 2.5 Flash via OpenAI-compatible endpoint (AQ. key format).
 * Falls back to OpenAI GPT-4o-mini if Gemini is unavailable.
 *
 * Gemini OpenAI-compatible base URL:
 *   https://generativelanguage.googleapis.com/v1beta/openai/
 */

const OpenAI = require('openai');
require('dotenv').config();

// ── Client factory ─────────────────────────────────────────────
function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  return new OpenAI({
    apiKey:  process.env.GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── System prompt ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the head script writer for "మేలుకో మనసా" (Meluko Manasa), a Telugu Stoic philosophy podcast.

CHANNEL IDENTITY:
- Name: మేలుకో మనసా (Wake Up, O Mind)
- Genre: Stoic philosophy, mental strength, self-development
- Tone: Warm, wise, contemplative — like a trusted elder sharing life wisdom
- Language: Telugu (తెలుగు) — use authentic Telugu script, not transliteration
- Philosophy: Stoicism (Marcus Aurelius, Seneca, Epictetus) + Bhagavad Gita parallels

STOIC THEMES:
- అమర్ ఫతి (Amor Fati) — love of fate
- మెమెంటో మోరి (Memento Mori) — remember death
- నియంత్రణ ద్వంద్వం (Dichotomy of Control)
- అంతర్ దుర్గం (Inner Citadel)
- రోజువారీ ప్రతిబింబం (Daily Reflection)

OUTPUT FORMAT (return ONLY valid JSON, no markdown):
{
  "hook": "Powerful opening 5-10 seconds — question or dramatic quote",
  "intro": "Channel intro + episode overview (30-60 seconds of spoken content)",
  "sections": [
    {
      "title": "Section title in Telugu",
      "content": "Full spoken script — several paragraphs",
      "retentionTrigger": "Re-engagement cue every 3-5 min (sound cue note, question, surprise)"
    }
  ],
  "cta": "Subscribe/like/share call to action in Telugu",
  "outro": "Closing wisdom + next episode teaser",
  "wordCount": <number>,
  "estimatedSeconds": <number>
}

RULES:
1. Write fully in the requested language (Telugu/Hindi/English)
2. Include REAL philosopher quotes with Telugu translations
3. Connect ancient wisdom to modern Telugu life problems
4. Retention triggers prevent viewer drop-off — make them compelling
5. Return ONLY the JSON object — no explanation, no code blocks`;

// ── Word count targets ─────────────────────────────────────────
const WORD_TARGETS = {
  '60 seconds':  150,
  '5 minutes':   750,
  '10 minutes':  1500,
  '15 minutes':  2250,
  '20 minutes':  3000,
  '30 minutes':  4500,
  '45 minutes':  6750,
  '60 minutes':  9000,
  '90 minutes':  13500,
  '120 minutes': 18000,
};

// ── Generate script ────────────────────────────────────────────
async function generateScript({ topic, keyword, contentType, scriptStyle, language, lengthOption }) {
  const wordTarget = WORD_TARGETS[lengthOption] || 750;
  const sectionCount = Math.max(2, Math.round(wordTarget / 500));

  const userPrompt = `Write a complete ${contentType || 'Podcast'} script for "మేలుకో మనసా":

TOPIC: ${topic}
${keyword ? `SEO KEYWORDS: ${keyword}` : ''}
LANGUAGE: ${language || 'Telugu'}
STYLE: ${scriptStyle || 'Storytelling'}
TARGET LENGTH: ${lengthOption || '5 minutes'} (~${wordTarget} words)
BODY SECTIONS: ${sectionCount} sections

Write approximately ${wordTarget} words of natural spoken content.
Include Stoic philosophy, emotional depth, and retention triggers.
Return ONLY the JSON object.`;

  // Try Gemini first, fall back to OpenAI
  const gemini = getGeminiClient();
  const openai = getOpenAIClient();

  if (!gemini && !openai) {
    throw new Error('No AI API key configured. Add GEMINI_API_KEY or OPENAI_API_KEY to your .env file.');
  }

  // ── Attempt 1: Gemini 2.5 Flash ─────────────────────────────
  if (gemini) {
    try {
      console.log('  [AI] Using Gemini 2.5 Flash...');
      const res = await gemini.chat.completions.create({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt + '\n\nIMPORTANT: Return ONLY a raw JSON object. Do NOT use markdown code fences (```json). Start your response with { and end with }.' },
        ],
        temperature: 0.85,
        max_tokens: Math.min(65536, wordTarget * 3 + 2000),
      });
      return parseAndEnrich(res.choices[0].message.content);
    } catch (err) {
      if (err.message && err.message.includes('429')) {
        // Rate limit — wait and retry once
        console.warn('  [AI] Gemini rate limited (429) — waiting 15 seconds...');
        await new Promise(r => setTimeout(r, 15000));
        try {
          const res2 = await gemini.chat.completions.create({
            model: 'gemini-2.5-flash',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user',   content: userPrompt + '\n\nIMPORTANT: Return ONLY a raw JSON object. Start with { end with }.' },
            ],
            temperature: 0.85,
            max_tokens: Math.min(65536, wordTarget * 3 + 2000),
          });
          return parseAndEnrich(res2.choices[0].message.content);
        } catch (err2) {
          console.warn('  [AI] Gemini retry failed:', err2.message, '— trying OpenAI...');
        }
      } else {
        console.warn('  [AI] Gemini failed:', err.message, '— trying OpenAI fallback...');
      }
    }
  }

  // ── Attempt 2: OpenAI GPT-4o-mini fallback ───────────────────
  if (openai) {
    console.log('  [AI] Using OpenAI GPT-4o-mini...');
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: Math.min(16000, wordTarget * 2 + 2000),
    });
    return parseAndEnrich(res.choices[0].message.content);
  }

  throw new Error('All AI providers failed.');
}

// ── Parse JSON response and add metadata ───────────────────────
function parseAndEnrich(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Strip any markdown code fences if present
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returned invalid JSON — please try again.');
    parsed = JSON.parse(match[0]);
  }

  // Ensure all required fields
  parsed.hook     = parsed.hook     || '';
  parsed.intro    = parsed.intro    || '';
  parsed.sections = parsed.sections || [];
  parsed.cta      = parsed.cta      || '';
  parsed.outro    = parsed.outro    || '';

  // Calculate word count from all text
  const fullText = [
    parsed.hook,
    parsed.intro,
    ...(parsed.sections).map(s => `${s.title || ''} ${s.content || ''}`),
    parsed.cta,
    parsed.outro,
  ].join(' ');

  const words = fullText.split(/\s+/).filter(w => w.trim().length > 0).length;
  parsed.wordCount        = words;
  parsed.estimatedSeconds = Math.round(words / 2.5); // ~150 Telugu words/min

  console.log(`  [AI] Done: ${words} words, ~${Math.round(parsed.estimatedSeconds / 60)} min`);
  return parsed;
}

module.exports = { generateScript };
