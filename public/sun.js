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

// Grain animation
let grainTime = 0.001; // Start at small non-zero to avoid potential shader issues with time=0
const grainSpeed = 0.000001; // Speed of grain animation (independent of timeSpeed)

let blurAmount = 10.0; // Strength of the blur effect
let grainAmount = 0.2; // Strength of the grain effect

// FaceMesh
let faceMesh;
let faces = [];

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

  graphics = createGraphics(windowWidth, windowHeight); // 2D offscreen buffer to draw into
  graphics.noStroke();

  // Parse circleColor once so the draw loop uses fill(r, g, b, a) directly
  const parsed = color(circleColor);
  sunR = red(parsed);
  sunG = green(parsed);
  sunB = blue(parsed);

  cx = windowWidth * 0.5;
  cy = windowHeight * 0.5;

  // Start faceMesh only once the camera stream is actually live
  let capture = createCapture(VIDEO, () => {
    faceMesh = ml5.faceMesh({ maxFaces: 1, flipped: true }, () => {
      faceMesh.detectStart(capture, results => faces = results);
    });
  });
  capture.size(320, 240);
  capture.hide();

  // Generate circles once at start
  fuzzyPoints();
}

function draw() {

  // Update grain animation (continuous, smooth)
  grainTime += grainSpeed;

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
  // cos(baseAngle + offset) = cosBase*cosOffset - sinBase*sinOffset
  // sin(baseAngle + offset) = sinBase*cosOffset + cosBase*sinOffset
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

  // Now apply shader to display the graphics buffer
  if (blurShader) {
    shader(blurShader);
    blurShader.setUniform('tex0', graphics);
    blurShader.setUniform('texelSize', [1.0 / width, 1.0 / height]);
    blurShader.setUniform('blurAmount', blurAmount);
    blurShader.setUniform('grainAmount', grainAmount);
    blurShader.setUniform('time', grainTime);

    // Unit quad — vertex shader maps [0,1] coords to NDC fullscreen
    rect(0, 0, 1, 1);
  } else {
    // Fallback: render without shader
    push();
    translate(-width / 2, -height / 2);
    image(graphics, 0, 0);
    pop();
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
  cx = windowWidth * 0.5;
  cy = windowHeight * 0.5;
}
