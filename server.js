require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('public'));
app.use(express.json({ limit: '5mb' }));

// Debug: save cropped frames sent to Vision API as JPEGs in debug_frames/
const SAVE_DEBUG_FRAMES = false;
const DEBUG_DIR = path.join(__dirname, 'debug_frames');
if (SAVE_DEBUG_FRAMES && !fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR);

const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`;

app.post('/api/analyze', async (req, res) => {
  const { image } = req.body;

  try {
    const response = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: image },
          features: [
            { type: 'LABEL_DETECTION', maxResults: 5 },
            { type: 'FACE_DETECTION', maxResults: 5 },
            { type: 'WEB_DETECTION', maxResults: 20 },
          ]
        }]
      })
    });

    if (SAVE_DEBUG_FRAMES) {
      const filename = `frame_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(DEBUG_DIR, filename), Buffer.from(image, 'base64'));
      console.log(`Saved debug frame: ${filename}`);
    }

    const data = await response.json();
    const r = data.responses?.[0];
    if (!r) return res.json({ words: [] });

    // Anatomy/generic face terms — not interesting for the advertising inference concept
    const BLOCKLIST = new Set([
      'black and white'
    ]);

    // const BLOCKLIST = new Set([
    //   'face', 'facial hair', 'hair', 'chin', 'cheek', 'forehead', 'nose', 'lip',
    //   'eyebrow', 'eyelash', 'eye', 'ear', 'neck', 'beard', 'moustache', 'skin',
    //   'head', 'jaw', 'mouth', 'tooth', 'teeth', 'wrinkle', 'person', 'human',
    //   'man', 'woman', 'people', 'photography', 'photo', 'stock photography',
    //   'portrait', 'selfie', 'close-up', 'black and white',
    // ]);

    console.log(`[Vision] full response keys:`, Object.keys(r));
    console.log(`[Vision] full r:`, JSON.stringify(r, null, 2));
    console.log(`[Vision] raw webEntities:`, r.webDetection?.webEntities?.map(e => `${e.description} (${e.score?.toFixed(2)})`));
    const words = (r.webDetection?.webEntities
      ?.filter(e => e.description && e.score > 0 && !BLOCKLIST.has(e.description.toLowerCase()))
      .map(e => e.description) ?? [])
      .sort(() => Math.random() - 0.5);

    console.log(`[Vision] ${new Date().toLocaleTimeString()} — ${words.length} entities:`, words);
    res.json({ words: words.slice(0, 30) }); // cap to avoid word soup

  } catch (err) {
    console.error('Vision API error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
