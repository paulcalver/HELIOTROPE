// =============================================================================
// server.js — Express backend for the SUN installation
//
// Responsibilities:
//   1. Serve the static front-end from /public
//   2. Proxy webcam frames to the Claude API for advertising-inference analysis
//   3. Optionally save those frames to disk for debugging the crop/framing
//
// Environment variables (set in .env or Render dashboard):
//   ANTHROPIC_API_KEY  — Claude API key
//   PORT               — optional, defaults to 3000
// =============================================================================

require('dotenv').config();
const express   = require('express');
const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const app = express();

// Serve everything in /public (p5.js sketch, shaders, libraries)
app.use(express.static('public'));

// Allow request bodies up to 5 MB — base64 JPEGs from the webcam can be ~200 KB
app.use(express.json({ limit: '5mb' }));


// =============================================================================
// Debug frame saving
// When SAVE_DEBUG_FRAMES is true, every image sent to Claude is also written
// to debug_frames/ as a JPEG so you can inspect exactly what the AI is seeing.
// Keep false in production — Render's filesystem is ephemeral anyway.
// =============================================================================

const SAVE_DEBUG_FRAMES = false;
const DEBUG_DIR = path.join(__dirname, 'debug_frames');
if (SAVE_DEBUG_FRAMES && !fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR);


// =============================================================================
// Claude client + system prompt
// =============================================================================

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// The system prompt instructs Claude to act as an advertising targeting system.
// It returns a raw JSON array of short labels — no prose, no markdown — so the
// front-end can parse and display them directly without any post-processing.
const SYSTEM_PROMPT = `You are an advertising targeting AI system. Analyze the image and respond with ONLY a raw JSON array — no markdown, no explanation, no code fences. Return 10–15 short labels (1–4 words each) representing the demographic segments, lifestyle categories, consumer interests, and ad targeting profiles this person would be assigned. Infer age range, lifestyle, profession, interests, consumer behavior, cultural signals, and emotional state. Be specific, varied, and commercially minded. Example output format: ["urban professional","tech enthusiast","35–44","premium brands","outdoor lifestyle","coffee culture","homeowner","frequent traveller"]`;


// =============================================================================
// POST /api/analyze
//
// Receives a base64-encoded JPEG from the browser, sends it to Claude with the
// advertising-inference prompt, and returns a shuffled array of label strings.
// =============================================================================

app.post('/api/analyze', async (req, res) => {
  const { image } = req.body;

  // Optionally persist the frame for debugging crop accuracy
  if (SAVE_DEBUG_FRAMES) {
    const filename = `frame_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(DEBUG_DIR, filename), Buffer.from(image, 'base64'));
    console.log(`[debug] Saved frame: ${filename}`);
  }

  try {
    // Send the image to Claude as a base64 inline image.
    // claude-haiku-4-5 is used here for speed and cost — this fires every 5s
    // in a live installation. Swap to claude-opus-4-6 for richer inferences.
    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 256,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [{
          type:   'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: image }
        }]
      }]
    });

    const raw = response.content.find(b => b.type === 'text')?.text ?? '';
    console.log(`[Claude] raw: ${raw}`);

    // Claude occasionally wraps its response in markdown code fences despite
    // instructions. Strip fences first, then extract the [...] array with a
    // regex so stray preamble text doesn't break JSON.parse().
    const stripped = raw.replace(/```[a-z]*\n?/gi, '').trim();
    const match    = stripped.match(/\[[\s\S]*\]/);
    const jsonStr  = match ? match[0] : '[]';

    let words = [];
    try {
      words = JSON.parse(jsonStr);
      if (!Array.isArray(words)) words = [];
      words = words.filter(w => typeof w === 'string' && w.trim());
    } catch {
      // Last-resort fallback: split on newlines/commas and strip punctuation
      console.warn('[Claude] JSON parse failed, falling back to text split');
      words = stripped.split(/[\n,]+/).map(w => w.replace(/["\[\]]/g, '').trim()).filter(Boolean);
    }

    // Shuffle so the same labels don't always appear in the same order
    words = words.sort(() => Math.random() - 0.5);
    console.log(`[Claude] ${new Date().toLocaleTimeString()} — ${words.length} labels:`, words);

    res.json({ words });

  } catch (err) {
    console.error('[Claude] API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// =============================================================================
// Start server
// PORT is injected by Render in production; falls back to 3000 locally
// =============================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
