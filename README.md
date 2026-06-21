# మేలుకో మనసా — Telugu Stoic Podcast Studio

> A full-stack AI-powered podcast production studio for the **Meluko Manasa** Telugu Stoic Podcast channel.

## Channel

**మేలుకో మనసా** (Meluko Manasa) is a Telugu Stoic philosophy podcast focused on:
- Stoicism (స్టోయిసిజం) — Marcus Aurelius, Seneca, Epictetus
- Mental strength (మానసిక దృఢత్వం)
- Self-development (ఆత్మవికాసం)
- Life wisdom (జీవిత జ్ఞానం)

## Features

| Tab | Feature |
|-----|---------|
| 📝 **AI Script Generator** | Gemini-powered Telugu/Hindi/English stoic podcast scripts with Hook → Intro → Sections → CTA → Outro |
| 🎙️ **Voice Studio** | Google TTS synthesis with pitch/speed/emotion controls. Exports clean **MP3** + **WAV** |
| 🎬 **Video Studio** | FFmpeg pipeline: Intro MP4 + Ken Burns image animation + TTS audio → **YouTube-ready MP4** |

- 🕐 **History tracking** — Scripts, Audio, and Videos saved with one-click reload
- 🎨 **Purple/Gold branding** — Consistent stoic aesthetic throughout
- ▶️ **YouTube-ready output** — H.264 + AAC, 1920×1080, faststart flag

## Tech Stack

- **Backend**: Node.js + Express
- **AI**: Google Gemini 1.5 Pro (script generation)
- **TTS**: node-gtts (Google TTS — Telugu/Hindi/English)
- **Video**: FFmpeg via fluent-ffmpeg (Ken Burns + H.264/AAC encoding)
- **Frontend**: Vanilla HTML/CSS/JS (static, deploys to Vercel)

## Local Setup

```bash
# 1. Clone
git clone https://github.com/ganapathi-ai/podcast.git
cd podcast

# 2. Create .env
echo "GEMINI_API_KEY=your_key_here" > .env
echo "PORT=3001" >> .env

# 3. Launch (Windows)
startdev.bat
```

Browser opens automatically to `http://localhost:3001`

## Deployment

Frontend (`public/`) auto-deploys to **Vercel** on every push to `main`.

## Channel Description

మేలుకో మనసా కు స్వాగతం! ఈ ఛానల్లో స్టోయిసిజం, ఆత్మవికాసం, మానసిక దృఢత్వం, జీవిత జ్ఞానం మరియు విజయానికి దారితీసే ఆలోచనలను తెలుగు భాషలో అందిస్తున్నాము.

---

*Built with ❤️ for Telugu Stoic wisdom*
