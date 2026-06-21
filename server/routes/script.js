const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { generateScript } = require('../utils/scriptAI');

const HISTORY_DIR = path.join(__dirname, '../../history/scripts');

router.post('/', async (req, res) => {
  const { topic, keyword, contentType, scriptStyle, language, lengthOption } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: 'Topic is required.' });
  }

  try {
    console.log(`[Script] Generating: "${topic.substring(0, 50)}" | ${language} | ${lengthOption}`);
    const scriptData = await generateScript({ topic, keyword, contentType, scriptStyle, language, lengthOption });

    const id = `script_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // Save to history
    const historyEntry = {
      id,
      topic,
      keyword,
      contentType,
      scriptStyle,
      language,
      lengthOption,
      wordCount: scriptData.wordCount,
      estimatedSeconds: scriptData.estimatedSeconds,
      createdAt: new Date().toISOString(),
      script: scriptData,
    };
    fs.writeFileSync(path.join(HISTORY_DIR, `${id}.json`), JSON.stringify(historyEntry, null, 2));

    res.json({ ...scriptData, id });
  } catch (err) {
    console.error('[Script] Error:', err.message);
    res.status(500).json({ error: err.message || 'Script generation failed.' });
  }
});

module.exports = router;
