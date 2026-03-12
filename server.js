require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.static('public'));
app.use(express.json({ limit: '5mb' }));

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
            { type: 'LABEL_DETECTION',  maxResults: 8 },
            { type: 'FACE_DETECTION',   maxResults: 1 },
            { type: 'WEB_DETECTION',    maxResults: 5 },
          ]
        }]
      })
    });

    const data = await response.json();
    const r = data.responses?.[0];
    if (!r) return res.json({ words: [] });

    // Anatomy/generic face terms — not interesting for the advertising inference concept
    const BLOCKLIST = new Set([
      'face', 'facial hair', 'hair', 'chin', 'cheek', 'forehead', 'nose', 'lip',
      'eyebrow', 'eyelash', 'eye', 'ear', 'neck', 'beard', 'moustache', 'skin',
      'head', 'jaw', 'mouth', 'tooth', 'teeth', 'wrinkle', 'person', 'human',
      'man', 'woman', 'people', 'photography', 'photo', 'stock photography',
      'portrait', 'selfie', 'close-up', 'black and white',
    ]);

    const words = [];

    // Web entities first — brand/topic associations are the point of the piece
    r.webDetection?.webEntities
      ?.filter(e => e.description && !BLOCKLIST.has(e.description.toLowerCase()))
      .forEach(e => words.push(e.description));

    // Inferred emotions from face analysis
    if (r.faceAnnotations?.[0]) {
      const face = r.faceAnnotations[0];
      for (const emotion of ['joy', 'sorrow', 'anger', 'surprise']) {
        const val = face[`${emotion}Likelihood`];
        if (val === 'LIKELY' || val === 'VERY_LIKELY') words.push(emotion);
      }
    }

    // Scene/context labels — filtered to remove anatomy
    r.labelAnnotations
      ?.filter(l => !BLOCKLIST.has(l.description.toLowerCase()))
      .forEach(l => words.push(l.description));

    res.json({ words: words.slice(0, 12) }); // cap to avoid word soup

  } catch (err) {
    console.error('Vision API error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
