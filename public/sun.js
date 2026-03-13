// =============================================================================
// SUN — an interactive particle system that responds to your face
//
// Concept: A surveillance-art piece exploring how AI advertising systems
// profile people in real time. The sun reacts to the viewer's presence
// while Claude Vision infers demographic and lifestyle labels from the
// webcam feed — surfacing the kind of targeting data ad platforms build
// invisibly about everyone they observe.
//
// Stack: p5.js (WEBGL) · ml5 FaceMesh · GLSL blur/grain shader · Claude API
// =============================================================================

// --- Particle system ---
let points       = 20000;
let particles    = [];
let particleColor = '#ffb700'; // warm yellow sun colour

// Precomputed sun centre — updated on resize
let cx, cy;

// Precomputed RGB channels from particleColor — avoids per-particle color() parsing
let sunR, sunG, sunB;

// --- Rendering ---
let blurShader;
let graphics;   // 2D offscreen buffer — particles are drawn here, then passed through the GLSL shader
let textOverlay, textCtx; // native HTML canvas overlay — sits above the WEBGL canvas, immune to shader effects

// --- Shader controls ---
let grainTime   = 0.001; // start non-zero to avoid a potential time=0 edge case in the shader
const grainSpeed = 0.000001;
let blurAmount  = 8.0;  // Gaussian blur radius (shader uniform)
let grainAmount = 0.2;  // film grain intensity (shader uniform)

// --- FaceMesh ---
let faceMesh;
let faces   = [];
let capture; // kept global so analyzeFrame() can grab a still

// --- Claude advertising-inference words ---
// Every ANALYZE_EVERY ms we send a webcam frame to the server, which forwards
// it to the Claude API with a prompt asking it to act as an advertising
// targeting system. The returned labels cycle one at a time over the sun.
let wordList       = [];
let currentWordIdx = 0;
let wordTimer      = 0;
const WORD_HOLD_MS  = 3000;  // ms each word stays visible before advancing
let analyzing       = false; // mutex — prevents overlapping API calls
const ANALYZE_EVERY = 5000;  // ms between analysis calls
let lastAnalyzeTime = -4500; // offset so first call fires ~500ms after face detected
const VISION_USE_CROP = false; // true = tight face crop · false = full 320×240 frame

// --- FaceMesh landmark indices (MediaPipe 468-point model) ---
const MOUTH_TOP    = 13;  // upper inner lip
const MOUTH_BOTTOM = 14;  // lower inner lip
const LEFT_EYE     = 33;  // left eye outer corner
const RIGHT_EYE    = 263; // right eye outer corner

// --- Sun state (driven by face each frame) ---
let sunScale        = 1.0; // scales particle spread — driven by face proximity
let vibrationEnergy = 1.0; // scales oscillation amplitude — driven by mouth openness


// =============================================================================
// p5.js lifecycle
// =============================================================================

function preload() {
  // Shader files are loaded before setup() runs.
  // blur.frag applies a single-pass Gaussian blur + film grain to the particle buffer.
  blurShader = loadShader('shader.vert', 'blur.frag',
    () => console.log('Shader loaded'),
    (err) => console.error('Shader load failed:', err)
  );
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL); // WEBGL required for shader pass
  noStroke();
  frameRate(60);

  // Offscreen 2D buffer — particles are drawn here each frame,
  // then the whole buffer is passed through the GLSL shader as a texture
  graphics = createGraphics(windowWidth, windowHeight);
  graphics.noStroke();

  // Native HTML canvas overlay for text — lives above the WEBGL canvas via CSS
  // so it's never affected by the blur/grain shader
  textOverlay = document.createElement('canvas');
  textOverlay.width  = windowWidth;
  textOverlay.height = windowHeight;
  textOverlay.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;';
  document.body.appendChild(textOverlay);
  textCtx = textOverlay.getContext('2d');
  textCtx.font = '13px monospace';

  // Parse particleColor once — fill(r,g,b,a) in the draw loop is faster than
  // calling color() on every particle every frame
  const parsed = color(particleColor);
  sunR = red(parsed);
  sunG = green(parsed);
  sunB = blue(parsed);

  cx = windowWidth  * 0.5;
  cy = windowHeight * 0.5;

  // Chain FaceMesh initialisation inside the VIDEO callback so ml5 only starts
  // after the camera stream is actually live — avoids keypoint coordinate issues
  capture = createCapture(VIDEO, () => {
    faceMesh = ml5.faceMesh({ maxFaces: 1, flipped: true }, () => {
      faceMesh.detectStart(capture, results => faces = results);
    });
  });
  capture.size(320, 240);
  // opacity:0 keeps the element in the DOM layout (required for correct ml5
  // keypoint coordinates) while hiding it from the viewer
  capture.elt.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;width:320px;height:240px;';

  spawnSun();
}

function draw() {

  grainTime += grainSpeed;

  // Trigger Claude analysis on interval.
  // Gated on faces.length > 0 — FaceMesh only returns keypoints when the
  // camera is live, which naturally prevents sending a black first frame.
  if (!analyzing && faces.length > 0 && millis() - lastAnalyzeTime > ANALYZE_EVERY) {
    lastAnalyzeTime = millis();
    analyzeFrame();
  }

  // --- FaceMesh → sun mappings ---
  if (faces.length > 0) {
    const kp = faces[0].keypoints;

    // Mouth openness → vibrationEnergy
    // Open mouth = more energetic oscillation
    const mouthOpen = dist(kp[MOUTH_TOP].x, kp[MOUTH_TOP].y,
                           kp[MOUTH_BOTTOM].x, kp[MOUTH_BOTTOM].y);
    vibrationEnergy = constrain(map(mouthOpen, 2, 30, 1, 4.0), 1, 4.0);

    // Eye-to-eye distance (proxy for face proximity) → sunScale
    // Closer to camera = wider eye span = bigger sun
    const faceWidth = abs(kp[RIGHT_EYE].x - kp[LEFT_EYE].x);
    sunScale = constrain(map(faceWidth, 30, 150, 1, 20), 1, 20);
  }

  // Draw particles into the offscreen buffer
  graphics.background(2);

  // Trig addition formula — precompute once per frame instead of calling
  // cos/sin 20 000 times: cos(base+offset) = cosBase·cosOffset − sinBase·sinOffset
  const baseAngle  = frameCount * 0.5;
  const cosBase    = cos(baseAngle);
  const sinBase    = sin(baseAngle);
  const energyScale = vibrationEnergy;

  for (let p of particles) {
    graphics.fill(sunR, sunG, sunB, p.alpha);

    const scaledX = cx + p.dx * sunScale;
    const scaledY = cy + p.dy * sunScale;

    const jitter = p.speed * energyScale;
    p.x = scaledX + (cosBase * p.cosOffset - sinBase * p.sinOffset) * jitter;
    p.y = scaledY + (sinBase * p.cosOffset + cosBase * p.sinOffset) * jitter;

    graphics.rect(p.x, p.y, p.size, p.size);
  }

  // Pass the particle buffer through the blur + grain shader
  if (blurShader) {
    shader(blurShader);
    blurShader.setUniform('tex0',       graphics);
    blurShader.setUniform('texelSize',  [1.0 / width, 1.0 / height]);
    blurShader.setUniform('blurAmount', blurAmount);
    blurShader.setUniform('grainAmount', grainAmount);
    blurShader.setUniform('time',       grainTime);
    rect(0, 0, 1, 1);
  } else {
    // Fallback if shader hasn't loaded yet
    push();
    translate(-width / 2, -height / 2);
    image(graphics, 0, 0);
    pop();
  }

  // Draw the current advertising label over the sun — on the HTML overlay
  // canvas so it's never blurred or grainy
  textCtx.clearRect(0, 0, textOverlay.width, textOverlay.height);
  if (wordList.length > 0) {
    if (millis() - wordTimer > WORD_HOLD_MS) {
      wordTimer = millis();
      currentWordIdx = (currentWordIdx + 1) % wordList.length;
    }
    const fontSize = max(2, sunScale * 4);
    textCtx.font         = `${fontSize}px monospace`;
    textCtx.fillStyle    = 'rgba(0,0,0,0.85)';
    textCtx.textAlign    = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.fillText(wordList[currentWordIdx], cx, cy);
  }
}


// =============================================================================
// Particle generation
// =============================================================================

function spawnSun() {
  // Distributes particles in a Gaussian cloud centred on the canvas.
  // Particles closer to the centre are larger and more opaque;
  // those at the edge are tiny and nearly transparent — creating a soft sun shape.
  const centerX = width  * 0.5;
  const centerY = height * 0.5;

  for (let i = 0; i < points; i++) {
    const x        = randomGaussian(centerX, 100);
    const y        = randomGaussian(centerY, 100);
    const distance = dist(x, y, centerX, centerY);
    const offset   = random(TWO_PI);

    particles.push({
      x, y,
      dx: x - centerX,       // static displacement from centre — scaled by sunScale each frame
      dy: y - centerY,
      size:  map(distance, 0, 300, 12, 0),
      alpha: map(distance, 50, 300, 255, 20, true),
      speed: 3,
      cosOffset: cos(offset), // precomputed phase for trig addition formula
      sinOffset: sin(offset),
    });
  }
}


// =============================================================================
// Claude advertising inference
// =============================================================================

async function analyzeFrame() {
  // Captures a still from the webcam, optionally crops to the face region,
  // converts to a base64 JPEG, and sends it to the Express server which
  // forwards it to the Claude API. Claude responds with a JSON array of
  // advertising targeting labels inferred from the image.

  if (!capture) return;
  analyzing = true;

  // The webcam element's CSS size is always 320×240, but the underlying video
  // stream may be higher resolution (e.g. 1280×720). drawImage() uses the
  // intrinsic (native) pixel dimensions, so we calculate a scale factor to
  // map FaceMesh keypoint coordinates (in CSS space) to native video pixels.
  const nativeW = capture.elt.videoWidth  || 320;
  const nativeH = capture.elt.videoHeight || 240;
  const sx = nativeW / 320;
  const sy = nativeH / 240;

  // Default: full frame
  let cropX = 0, cropY = 0, cropW = 320, cropH = 240;

  if (VISION_USE_CROP && faces.length > 0) {
    // Crop tightly to the person using eye landmarks as an anchor.
    // Eye distance is a reliable proxy for face size regardless of expression.
    const kp      = faces[0].keypoints;
    const lEye    = kp[LEFT_EYE];
    const rEye    = kp[RIGHT_EYE];
    const eyeMidX = (lEye.x + rEye.x) * 0.5;
    const eyeMidY = (lEye.y + rEye.y) * 0.5;
    const eyeDist = Math.abs(rEye.x - lEye.x);

    const halfW = eyeDist * 1.4; // ~face width with padding
    const halfH = eyeDist * 1.6; // above eye midpoint to forehead

    const x1 = Math.max(0,   eyeMidX - halfW);
    const y1 = Math.max(0,   eyeMidY - halfH);
    const x2 = Math.min(320, eyeMidX + halfW);
    const y2 = 240; // extend to bottom of frame to include clothing

    cropX = x1; cropY = y1;
    cropW = x2 - x1;
    cropH = y2 - y1;
  }

  // Draw the (optionally cropped) region into a temporary canvas and export
  // as a base64 JPEG to send in the API request body
  const tmp = document.createElement('canvas');
  tmp.width  = cropW;
  tmp.height = cropH;
  tmp.getContext('2d').drawImage(
    capture.elt,
    cropX * sx, cropY * sy, cropW * sx, cropH * sy, // source rect in native pixels
    0, 0, cropW, cropH                               // destination rect
  );
  const base64 = tmp.toDataURL('image/jpeg', 0.8).split(',')[1];
  console.log(`Analyze: ${VISION_USE_CROP ? 'crop' : 'full'} ${Math.round(cropW)}×${Math.round(cropH)}px`);

  try {
    const res   = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image: base64 })
    });
    const { words } = await res.json();
    if (words && words.length) spawnWords(words);
  } catch (e) {
    console.warn('analyzeFrame error:', e);
  }

  analyzing = false;
}

function spawnWords(words) {
  // Replaces the current word list and resets the cycling timer
  wordList       = words;
  currentWordIdx = 0;
  wordTimer      = millis();
}


// =============================================================================
// Resize
// =============================================================================

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  graphics.resizeCanvas(windowWidth, windowHeight);
  textOverlay.width  = windowWidth;
  textOverlay.height = windowHeight;
  textCtx.font = '13px monospace'; // canvas resize clears the font setting
  cx = windowWidth  * 0.5;
  cy = windowHeight * 0.5;
}
