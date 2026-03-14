# HELIOTROPE

Every time you look at a screen, advertising infrastructure makes assumptions about who you are. Age range, income bracket, emotional state, consumer behaviour — inferred silently from your appearance and context, without consent or transparency. SUN makes that process visible.

The sun is both the object of attention and a metaphor for it. Like a screen, it is warm, beautiful, and designed to draw you in. The 20,000 particles that form it are individual data points — not a person, but a construction of signals that the system reassembles into a readable identity. Your presence doesn't create the sun; it was already there. But it responds to you, grows around you, becomes more interested as you get closer.

The advertising labels are hidden at the sun's centre — too small to read from a distance. To see what the system thinks of you, you have to move closer to the screen, which is also the act of giving the camera a clearer view. Legibility costs proximity. Proximity costs data.

The labels themselves are modelled on real ad-tech taxonomy: confident, clinical, and occasionally wrong in the way that targeting systems are wrong — inferring "homeowner" from a collar, "frequent traveller" from a bag strap, "new parent" from tired eyes. The system has no mechanism for doubt. It outputs certainty by design, because uncertainty doesn't convert.

**[→ Live preview](https://sun-mouth.onrender.com)**

![Sun_AI_Assumptions_00](https://github.com/user-attachments/assets/09659bcd-f7f3-435b-abe2-517522ec5dce)

![Sun_AI_Assumptions_01](https://github.com/user-attachments/assets/5d3ee878-756a-4de4-8e72-bf026dd08cda)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Creative coding | [p5.js](https://p5js.org) (WEBGL mode) |
| Face tracking | [ml5.js FaceMesh](https://ml5js.org) (MediaPipe 468-point model) |
| Visual effects | GLSL fragment shader — single-pass Gaussian blur + film grain |
| AI inference | [Claude API](https://anthropic.com) (`claude-haiku-4-5`) via Anthropic SDK |
| Backend | Node.js + Express (API proxy, static file serving) |
| Deployment | [Render](https://render.com) |

---

## How It Works

1. **Face tracking** — ml5 FaceMesh runs continuously in the browser, detecting 468 facial landmarks at 60fps
2. **Sun reactivity** — mouth openness drives vibration energy; face proximity (eye-to-eye distance) drives the scale of the particle cloud
3. **Advertising inference** — every 5 seconds a webcam frame is sent to the Express server, which forwards it to the Claude API with a prompt asking it to act as an advertising targeting system
4. **Label display** — Claude returns a JSON array of 10–15 short labels which cycle one at a time over the centre of the sun, scaling with it

---

## Project Structure

```
/
├── server.js           # Express server — static files + Claude API proxy
├── package.json
├── .env                # API keys (not committed)
├── .gitignore
└── public/
    ├── index.html
    ├── style.css
    ├── sun.js          # p5.js sketch
    ├── shader.vert     # Vertex shader (passthrough)
    ├── blur.frag       # Fragment shader (blur + grain)
    └── libraries/
        ├── p5.min.js
        ├── p5.sound.min.js
        └── ml5.min.js
```

---

## Running Locally

```bash
npm install
```

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=your_key_here
```

```bash
npm start
# → http://localhost:3000
```

Allow camera access when prompted. The sketch requires a webcam and a modern browser with WebGL support.

---

## Deploying to Render

- **Build command:** `npm install`
- **Start command:** `node server.js`
- **Environment variable:** add `ANTHROPIC_API_KEY` in the Render dashboard

---

## Configuration

Key variables at the top of `sun.js`:

| Variable | Default | Description |
|---|---|---|
| `points` | `20000` | Number of particles |
| `particleColor` | `#ffb700` | Sun colour |
| `ANALYZE_EVERY` | `5000` | ms between Claude API calls |
| `WORD_HOLD_MS` | `3000` | ms each label stays visible |
| `VISION_USE_CROP` | `false` | Crop to face region before sending to Claude |
| `blurAmount` | `8.0` | Gaussian blur radius |
| `grainAmount` | `0.2` | Film grain intensity |

In `server.js`:

| Variable | Default | Description |
|---|---|---|
| `SAVE_DEBUG_FRAMES` | `false` | Save each frame sent to Claude as a JPEG in `debug_frames/` |

## Author

**Paul Calver** — pcalv001@gold.ac.uk