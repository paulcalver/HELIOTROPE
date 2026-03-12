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

    const words = [];

    // Scene / object labels — what Google categorises in the frame
    r.labelAnnotations?.forEach(l => words.push(l.description.toLowerCase()));

    // Inferred emotions from face analysis
    if (r.faceAnnotations?.[0]) {
      const face = r.faceAnnotations[0];
      for (const emotion of ['joy', 'sorrow', 'anger', 'surprise']) {
        const val = face[`${emotion}Likelihood`];
        if (val === 'LIKELY' || val === 'VERY_LIKELY') words.push(emotion);
      }
    }

    // Web entities — what Google thinks this image matches to across the web
    r.webDetection?.webEntities
      ?.filter(e => e.description)
      .forEach(e => words.push(e.description.toLowerCase()));

    res.json({ words });

  } catch (err) {
    console.error('Vision API error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
