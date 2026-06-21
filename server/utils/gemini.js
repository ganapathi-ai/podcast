const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
function getGenAI() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in .env');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function wordCountForLength(lengthOption) {
  const map = {
    '15 seconds': 38, '30 seconds': 75, '45 seconds': 112, '60 seconds': 150,
    '3 minutes': 450, '5 minutes': 750, '10 minutes': 1500, '15 minutes': 2250,
    '20 minutes': 3000, '30 minutes': 4500, '45 minutes': 6750,
    '60 minutes': 9000, '90 minutes': 13500, '120 minutes': 18000,
  };
  return map[lengthOption] || 750;
}

async function generateScript({ topic, keyword, contentType, scriptStyle, language, lengthOption }) {
  const wordCount = wordCountForLength(lengthOption);
  const estimatedSeconds = Math.round((wordCount / 2.5));

  const langNote = {
    'Telugu': 'Write entirely in Telugu (తెలుగు) script. Use authentic Telugu proverbs and expressions.',
    'Hindi': 'Write entirely in Hindi (हिन्दी). Use natural Hindi conversational phrases.',
    'English': 'Write in English. Use clear, accessible language.',
  }[language] || 'Write in Telugu.';

  const sectionCount = wordCount < 150 ? 1 : wordCount < 750 ? 3 : wordCount < 3000 ? 5 : 7;

  const prompt = `You are a professional script writer for "మేలుకో మనసా" (Meluko Manasa), a Telugu Stoic philosophy podcast channel. The channel focuses on Stoicism, mental strength, self-development, and wisdom from Marcus Aurelius, Seneca, and Epictetus applied to modern Telugu life.

CHANNEL DESCRIPTION:
మేలుకో మనసా ఛానల్‌లో స్టోయిసిజం, ఆత్మవికాసం, మానసిక దృఢత్వం, జీవిత జ్ఞానం తెలుగు భాషలో అందిస్తున్నాము.

SCRIPT PARAMETERS:
- Topic: ${topic}
- Keywords: ${keyword || 'Telugu motivation, stoicism, self development'}
- Content Type: ${contentType}
- Script Style: ${scriptStyle}
- Target Length: ${lengthOption} (approximately ${wordCount} words)
- Language: ${language}

LANGUAGE INSTRUCTION: ${langNote}

Write a complete podcast script with EXACTLY ${sectionCount} body sections. Each section should be approximately ${Math.round(wordCount / (sectionCount + 3))} words.

STRUCTURE REQUIREMENTS:
1. HOOK (5-10 seconds): Powerful, attention-grabbing opener. Must stop the listener immediately.
2. INTRO: Warm welcome mentioning "మేలుకో మనసా", briefly introduce today's topic. Natural, conversational.
3. SECTIONS (${sectionCount} sections): Each with a clear title. Reference Stoic philosophers naturally. Add retention triggers every ~25 seconds of content.
4. CTA: Invite to subscribe, comment, share - in a warm, genuine way matching the channel's voice.
5. OUTRO: Close with a powerful Stoic wisdom quote translated and explained. Warm sign-off.

STYLE NOTES:
- Conversational podcast tone, not academic
- Use Telugu proverbs where natural
- Include speaker direction hints like (pause) (emphasis) where appropriate
- Make listeners feel understood and motivated

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "hook": "...",
  "intro": "...",
  "sections": [
    {"title": "...", "content": "...", "retentionTrigger": "..."},
    ...
  ],
  "cta": "...",
  "outro": "...",
  "wordCount": ${wordCount},
  "estimatedSeconds": ${estimatedSeconds}
}`;

  const model = getGenAI().getGenerativeModel({ model: 'gemini-1.5-pro' });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip any accidental markdown code fences
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { generateScript, wordCountForLength };
