require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const app = express();
app.use(express.static('public'));
app.use(express.json({ limit: '5mb' }));

// Debug: save cropped frames sent to Claude as JPEGs in debug_frames/
const SAVE_DEBUG_FRAMES = false;
const DEBUG_DIR = path.join(__dirname, 'debug_frames');
if (SAVE_DEBUG_FRAMES && !fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an advertising targeting AI system. Analyze the image and respond with ONLY a raw JSON array — no markdown, no explanation, no code fences. Return 10–15 short labels (1–4 words each) representing the demographic segments, lifestyle categories, consumer interests, and ad targeting profiles this person would be assigned. Infer age range, lifestyle, profession, interests, consumer behavior, cultural signals, and emotional state. Be specific, varied, and commercially minded. Example output format: ["urban professional","tech enthusiast","35–44","premium brands","outdoor lifestyle","coffee culture","homeowner","frequent traveller"]`;

app.post('/api/analyze', async (req, res) => {
  const { image } = req.body;

  if (SAVE_DEBUG_FRAMES) {
    const filename = `frame_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(DEBUG_DIR, filename), Buffer.from(image, 'base64'));
    console.log(`Saved debug frame: ${filename}`);
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: image }
        }]
      }]
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '[]';
    console.log(`[Claude] raw response: ${text}`);

    let words = [];
    try {
      words = JSON.parse(text);
      if (!Array.isArray(words)) words = [];
    } catch {
      // If not valid JSON, split by newline/comma as fallback
      words = text.split(/[\n,]+/).map(w => w.replace(/["\[\]]/g, '').trim()).filter(Boolean);
    }

    // Shuffle
    words = words.sort(() => Math.random() - 0.5);
    console.log(`[Claude] ${new Date().toLocaleTimeString()} — ${words.length} labels:`, words);

    res.json({ words });

  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
