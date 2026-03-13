let points = 20000;
let circles = []; // Store circle data
let circleColor = '#ffb700'; // Bright yellow color for the sun

// Precomputed sun center — updated on resize
let cx, cy;

// Precomputed RGB channels from circleColor — avoids per-particle color() parsing
let sunR, sunG, sunB;

// Rendering
let blurShader;
let graphics;
let textOverlay, textCtx; // native HTML canvas overlay — drawn on top of WEBGL, no compositing issues

// Grain animation
let grainTime = 0.001; // Start at small non-zero to avoid potential shader issues with time=0
const grainSpeed = 0.000001; // Speed of grain animation (independent of timeSpeed)
  
let blurAmount = 8.0; // Strength of the blur effect
let grainAmount = 0.2; // Strength of the grain effect

// FaceMesh
let faceMesh;
let faces = [];
let capture; // global so analyzeFrame() can grab a frame

// Vision API words
let wordList       = [];   // flat list of strings from the API
let currentWordIdx = 0;
let wordTimer      = 0;
const WORD_HOLD_MS = 3000; // ms each word stays before cycling
let analyzing      = false;
const ANALYZE_EVERY = 5000;
let lastAnalyzeTime = -4500; // fires ~500ms after first face detected
const VISION_USE_CROP = false; // true = cropped face region, false = full webcam frame

// FaceMesh landmark indices
const MOUTH_TOP    = 13;  // upper inner lip
const MOUTH_BOTTOM = 14;  // lower inner lip
const LEFT_EYE     = 33;  // left eye outer corner
const RIGHT_EYE    = 263; // right eye outer corner

// Sun controls (driven by face)
let sunScale        = 1.0; // Scales the spread of the particle cloud (mouth openness)
let vibrationEnergy = 1.0; // Multiplies oscillation amplitude (face proximity)

function preload() {
  // Load shader files - p5.js 2.0 uses promises internally
  blurShader = loadShader('shader.vert', 'blur.frag',
    () => console.log('Shader loaded successfully'),
    (err) => console.error('Shader load failed:', err)
  );
}



function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL); // WEBGL mode required for shaders
  noStroke();
  frameRate(60);

  graphics = createGraphics(windowWidth, windowHeight); // 2D offscreen buffer — goes through shader
  graphics.noStroke();

  // Native HTML canvas overlay — sits on top of the p5 WEBGL canvas via CSS
  textOverlay = document.createElement('canvas');
  textOverlay.width  = windowWidth;
  textOverlay.height = windowHeight;
  textOverlay.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;';
  document.body.appendChild(textOverlay);
  textCtx = textOverlay.getContext('2d');
  textCtx.font = '13px monospace';

  // Parse circleColor once so the draw loop uses fill(r, g, b, a) directly
  const parsed = color(circleColor);
  sunR = red(parsed);
  sunG = green(parsed);
  sunB = blue(parsed);

  cx = windowWidth * 0.5;
  cy = windowHeight * 0.5;

  // Start faceMesh only once the camera stream is actually live
  capture = createCapture(VIDEO, () => {
    faceMesh = ml5.faceMesh({ maxFaces: 1, flipped: true }, () => {
      faceMesh.detectStart(capture, results => faces = results);
    });
  });
  capture.size(320, 240);
  // Use opacity instead of display:none — keeps element in layout so ml5 keypoints
  // are returned in the correct 320x240 CSS coordinate space
  capture.elt.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;width:320px;height:240px;';

  // Generate circles once at start
  fuzzyPoints();
}

function draw() {

  // Update grain animation (continuous, smooth)
  grainTime += grainSpeed;

  // Trigger Claude analysis on interval — only once FaceMesh detects a face
  // (guarantees camera is live, preventing black first frames)
  if (!analyzing && faces.length > 0 && millis() - lastAnalyzeTime > ANALYZE_EVERY) {
    lastAnalyzeTime = millis();
    analyzeFrame();
  }

  // --- FaceMesh mappings ---
  if (faces.length > 0) {
    const kp = faces[0].keypoints;

    // Mouth openness → vibrationEnergy (open mouth = more energetic)
    const mouthOpen = dist(kp[MOUTH_TOP].x, kp[MOUTH_TOP].y,
                           kp[MOUTH_BOTTOM].x, kp[MOUTH_BOTTOM].y);
    vibrationEnergy = constrain(map(mouthOpen, 2, 30, 1, 4.0), 1, 4.0);

    // Face proximity (eye-to-eye width) → sunScale (closer = bigger sun)
    const faceWidth = abs(kp[RIGHT_EYE].x - kp[LEFT_EYE].x);
    sunScale = constrain(map(faceWidth, 30, 150, 1, 20), 1, 20);

  }

  // Draw to graphics buffer first
  graphics.background(2);

  // Precompute once per frame — trig addition formula avoids 50k cos/sin calls
  const baseAngle = frameCount * 0.5;
  const cosBase = cos(baseAngle);
  const sinBase = sin(baseAngle);
  const energyScale = vibrationEnergy; // local ref avoids repeated global lookup

  for (let circle of circles) {
    graphics.fill(sunR, sunG, sunB, circle.alpha);

    const scaledX = cx + circle.dx * sunScale;
    const scaledY = cy + circle.dy * sunScale;

    const jitter = circle.speed * energyScale;
    circle.x = scaledX + (cosBase * circle.cosOffset - sinBase * circle.sinOffset) * jitter;
    circle.y = scaledY + (sinBase * circle.cosOffset + cosBase * circle.sinOffset) * jitter;

    graphics.rect(circle.x, circle.y, circle.size, circle.size);
  }

  // Apply shader to particles buffer
  if (blurShader) {
    shader(blurShader);
    blurShader.setUniform('tex0', graphics);
    blurShader.setUniform('texelSize', [1.0 / width, 1.0 / height]);
    blurShader.setUniform('blurAmount', blurAmount);
    blurShader.setUniform('grainAmount', grainAmount);
    blurShader.setUniform('time', grainTime);
    rect(0, 0, 1, 1);
  } else {
    push();
    translate(-width / 2, -height / 2);
    image(graphics, 0, 0);
    pop();
  }

  // Draw single centered word — scales with sun, black, no shader effects
  textCtx.clearRect(0, 0, textOverlay.width, textOverlay.height);
  if (wordList.length > 0) {
    // Cycle to next word on timer
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

function fuzzyPoints() {
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  for (let i = 0; i < points; i++) {
    const x = randomGaussian(centerX, 100);
    const y = randomGaussian(centerY, 100);
    const distance = dist(x, y, centerX, centerY);
    const offset = random(TWO_PI);

    circles.push({
      x: x,
      y: y,
      dx: x - centerX,           // displacement from center — scaled by sunScale each frame
      dy: y - centerY,
      size: map(distance, 0, 300, 12, 0),
      alpha: map(distance, 50, 300, 255, 20, true),
      speed: 3,
      cosOffset: cos(offset),     // precomputed — used in trig addition formula
      sinOffset: sin(offset),
    });
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  graphics.resizeCanvas(windowWidth, windowHeight);
  textOverlay.width  = windowWidth;
  textOverlay.height = windowHeight;
  textCtx.font = '13px monospace'; // font resets after canvas resize
  cx = windowWidth * 0.5;
  cy = windowHeight * 0.5;
}

async function analyzeFrame() {
  if (!capture) return;
  analyzing = true;

  const nativeW = capture.elt.videoWidth  || 320;
  const nativeH = capture.elt.videoHeight || 240;
  const sx = nativeW / 320;
  const sy = nativeH / 240;

  let cropX = 0, cropY = 0, cropW = 320, cropH = 240;
  if (VISION_USE_CROP && faces.length > 0) {
    const kp      = faces[0].keypoints;
    const lEye    = kp[LEFT_EYE];
    const rEye    = kp[RIGHT_EYE];
    const eyeMidX = (lEye.x + rEye.x) * 0.5;
    const eyeMidY = (lEye.y + rEye.y) * 0.5;
    const eyeDist = Math.abs(rEye.x - lEye.x);

    const halfW = eyeDist * 1.4;
    const halfH = eyeDist * 1.6;

    const x1 = Math.max(0,   eyeMidX - halfW);
    const y1 = Math.max(0,   eyeMidY - halfH);
    const x2 = Math.min(320, eyeMidX + halfW);
    const y2 = 240;

    cropX = x1; cropY = y1;
    cropW = x2 - x1;
    cropH = y2 - y1;
  }

  const tmp = document.createElement('canvas');
  tmp.width = cropW; tmp.height = cropH;
  tmp.getContext('2d').drawImage(
    capture.elt,
    cropX * sx, cropY * sy, cropW * sx, cropH * sy,
    0, 0, cropW, cropH
  );
  const base64 = tmp.toDataURL('image/jpeg', 0.8).split(',')[1];
  console.log(`Vision ${VISION_USE_CROP ? 'crop' : 'full'}: ${Math.round(cropW)}×${Math.round(cropH)}px`);

  try {
    const res  = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image: base64 })
    });
    const { words } = await res.json();
    if (words && words.length) spawnWords(words);
  } catch (e) {
    console.warn('Vision API:', e);
  }

  analyzing = false;
}

function spawnWords(words) {
  wordList       = words;
  currentWordIdx = 0;
  wordTimer      = millis();
}
