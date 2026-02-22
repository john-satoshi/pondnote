const canvas = document.getElementById("water-canvas");
const ctx = canvas.getContext("2d", { alpha: true });

const settings = {
  floaterCount: 1,
  natureCount: 3,
  natureSpawnMargin: 110,
  noteSize: 1.8,
  noteNoise: 0.4,
  rippleStrength: 1.2,
  rippleTravel: 0.55,
  cursorPush: 0.3,
  waterDrag: 0.984,
  refraction: 6,
  bottomOpacity: 0.7,
  ripplePixelSize: 8,
};

const sliderConfig = [
  {
    id: "floater-count",
    valueId: "floater-count-value",
    key: "floaterCount",
    format: (value) => `${Math.round(value)}`,
    onChange: (value) => syncFloaterCount(Math.round(value)),
  },
  {
    id: "nature-count",
    valueId: "nature-count-value",
    key: "natureCount",
    format: (value) => `${Math.round(value)}`,
    onChange: (value) => syncNatureCount(Math.round(value)),
  },
  {
    id: "nature-spawn-margin",
    valueId: "nature-spawn-margin-value",
    key: "natureSpawnMargin",
    format: (value) => `${Math.round(value)}`,
  },
  {
    id: "note-size",
    valueId: "note-size-value",
    key: "noteSize",
    format: (value) => value.toFixed(2),
    onChange: (value) => applyNoteSizeToFloaters(value),
  },
  {
    id: "note-noise",
    valueId: "note-noise-value",
    key: "noteNoise",
    format: (value) => value.toFixed(2),
  },
  {
    id: "ripple-strength",
    valueId: "ripple-strength-value",
    key: "rippleStrength",
    format: (value) => value.toFixed(2),
  },
  {
    id: "ripple-travel",
    valueId: "ripple-travel-value",
    key: "rippleTravel",
    format: (value) => value.toFixed(2),
  },
  {
    id: "cursor-push",
    valueId: "cursor-push-value",
    key: "cursorPush",
    format: (value) => value.toFixed(2),
  },
  {
    id: "water-drag",
    valueId: "water-drag-value",
    key: "waterDrag",
    format: (value) => value.toFixed(3),
  },
  {
    id: "refraction-intensity",
    valueId: "refraction-intensity-value",
    key: "refraction",
    format: (value) => value.toFixed(1),
  },
  {
    id: "bottom-opacity",
    valueId: "bottom-opacity-value",
    key: "bottomOpacity",
    format: (value) => value.toFixed(2),
  },
  {
    id: "ripple-pixel-size",
    valueId: "ripple-pixel-size-value",
    key: "ripplePixelSize",
    format: (value) => `${Math.round(value)}`,
  },
];

const sim = {
  width: 0,
  height: 0,
  dpr: Math.max(1, Math.min(1.5, window.devicePixelRatio || 1)),
  targetFrameMs: 1000 / 30,
  frameDtEma: 1000 / 30,
  effectiveRippleStep: 8,
  rafId: 0,
  paused: false,
  frameIndex: 0,
  idleThresholdMs: 5000,
  lastPointerMoveTime: performance.now(),
  isIdle: false,
  noteEditMode: false,
  hoveredNote: null,
  openNoteEditor: null,
  openAuthModal: null,
  authMode: "login",
  auth: {
    email: "",
    userId: "",
    loggedIn: false,
  },
  natureArrivalPlan: {
    enabled: false,
    spawned: 0,
    nextTime: 0,
  },
  cols: 0,
  rows: 0,
  cellSize: 16,
  current: null,
  previous: null,
  damp: 0.983,
  floaters: [],
  pointer: {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    down: false,
    initialized: false,
  },
  ambientTimer: 0,
  time: 0,
  skyCanvas: document.createElement("canvas"),
  skyCtx: null,
  noiseCanvas: document.createElement("canvas"),
  noisePattern: null,
  reflectionImage: null,
  reflectionObjectUrl: null,
  reflectionGif: {
    active: false,
    canvas: document.createElement("canvas"),
    ctx: null,
    frames: [],
    timeline: [],
    totalDuration: 0,
    startTime: 0,
  },
  bottomImage: null,
  bottomObjectUrl: null,
  itemSprites: {
    leaf: null,
    flower: null,
  },
  itemSpriteObjectUrls: {
    leaf: null,
    flower: null,
  },
  rippleSources: [],
  lastRippleEmit: 0,
  lastTime: performance.now(),
  shadowCache: new Map(),
  gl: {
    ready: false,
    // Temporary safety default: CPU refraction is used unless this is flipped on.
    // WebGL path remains implemented and can be re-enabled after further device validation.
    disabled: true,
    canvas: null,
    ctx: null,
    program: null,
    aPosLoc: -1,
    uSkyLoc: null,
    uRippleLoc: null,
    uTexelLoc: null,
    uRefractionLoc: null,
    uResolutionLoc: null,
    uPixelStepLoc: null,
    vertexBuffer: null,
    skyTex: null,
    rippleTex: null,
    rippleData: null,
    rippleW: 0,
    rippleH: 0,
  },
  graphicsWorker: {
    worker: null,
    enabled: false,
    seq: 0,
    handlers: new Map(),
  },
};

const COLLISION_RESTITUTION = 0.4;
const DEFAULT_NOTE_COLOR = "#F4F4F4";
const MAX_CANVAS_PIXELS = 2_073_600; // ~1920x1080
const ENABLE_GRAPHICS_WORKER = false;
const SUPABASE_URL = "https://husfhexynrqsvpzapmke.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_se4_3-htGRgwylrb3edafg_oPT13g1W"; // TODO: paste your Supabase "Publishable key" here before deploy
const DEMO_NOTE_TEXTS = [
  "Hello, welcome to pond notes",
  "A peaceful and reflective experience",
  "Have a nice day",
  "Reminiscing our time with nature",
  "TODAY_DATE",
  "built with love and fun by John",
];
const DEMO_NOTE_COLORS = ["#F4F4F4", "#F4F4F4", "#FFDB8D", "#FFDB8D", "#B1DCE8", "#A3D1A6"];
const DEFAULT_ASSETS = {
  reflection: "./assets/reflection-default.gif",
  floor: "./assets/pond-floor-default.png",
  leaf: "./assets/leaf-default.png",
  flower: "./assets/flower-default.png",
};
const supabaseClient =
  window.supabase && SUPABASE_ANON_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
sim.skyCtx = sim.skyCanvas.getContext("2d", { alpha: false });
sim.reflectionGif.ctx = sim.reflectionGif.canvas.getContext("2d", { alpha: true });

function generateNoisePattern() {
  if (requestNoisePatternFromWorker()) return;
  generateNoisePatternSync();
}

function generateNoisePatternSync() {
  const nctx = sim.noiseCanvas.getContext("2d", { alpha: true });
  const size = 96;
  sim.noiseCanvas.width = size;
  sim.noiseCanvas.height = size;

  const image = nctx.createImageData(size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = 210 + Math.floor(Math.random() * 46);
    data[i] = grain;
    data[i + 1] = grain;
    data[i + 2] = grain;
    data[i + 3] = 35 + Math.floor(Math.random() * 55);
  }
  nctx.putImageData(image, 0, 0);
  sim.noisePattern = ctx.createPattern(sim.noiseCanvas, "repeat");
}

function initGraphicsWorker() {
  if (!ENABLE_GRAPHICS_WORKER) return;
  if (sim.graphicsWorker.enabled || !("Worker" in window) || !("OffscreenCanvas" in window)) return;
  try {
    const worker = new Worker("./graphics-worker.js");
    worker.addEventListener("message", (event) => {
      const data = event.data || {};
      const id = data.id;
      const handler = sim.graphicsWorker.handlers.get(id);
      if (!handler) return;
      sim.graphicsWorker.handlers.delete(id);
      handler(data);
    });
    sim.graphicsWorker.worker = worker;
    sim.graphicsWorker.enabled = true;
  } catch (_err) {
    sim.graphicsWorker.enabled = false;
  }
}

function requestWorker(type, payload, onMessage) {
  if (!sim.graphicsWorker.enabled || !sim.graphicsWorker.worker) return false;
  const id = ++sim.graphicsWorker.seq;
  sim.graphicsWorker.handlers.set(id, onMessage);
  sim.graphicsWorker.worker.postMessage({ id, type, payload });
  return true;
}

function requestNoisePatternFromWorker() {
  return requestWorker("noise", { size: 96 }, (data) => {
    const bitmap = data.bitmap;
    if (!bitmap) return;
    sim.noiseCanvas.width = bitmap.width;
    sim.noiseCanvas.height = bitmap.height;
    const nctx = sim.noiseCanvas.getContext("2d", { alpha: true });
    nctx.clearRect(0, 0, bitmap.width, bitmap.height);
    nctx.drawImage(bitmap, 0, 0);
    sim.noisePattern = ctx.createPattern(sim.noiseCanvas, "repeat");
    if (typeof bitmap.close === "function") bitmap.close();
  });
}

function getItemMetrics(kind, size = settings.noteSize) {
  if (kind === "leaf") {
    const noteW = 46 * size;
    const noteH = 90 * size;
    const radius = Math.hypot(noteW * 0.5, noteH * 0.5) * 0.56;
    const mass = 1.6 + size;
    return { noteW, noteH, radius, mass };
  }
  if (kind === "flower") {
    const noteW = 68 * size;
    const noteH = 68 * size;
    const radius = Math.hypot(noteW * 0.5, noteH * 0.5) * 0.58;
    const mass = 1.8 + size * 1.1;
    return { noteW, noteH, radius, mass };
  }
  const noteW = 76 * size;
  const noteH = 76 * size;
  const radius = Math.hypot(noteW * 0.5, noteH * 0.5) * 0.76;
  const mass = 2 + size * 1.4;
  return { noteW, noteH, radius, mass };
}

function randomItemKind() {
  return Math.random() < 0.5 ? "leaf" : "flower";
}

function randomFloater(padding = 50, overrides = {}) {
  const safePadX = Math.min(padding, Math.max(10, sim.width / 4));
  const safePadY = Math.min(padding, Math.max(10, sim.height / 4));
  const kind = overrides.kind || "note";
  const metrics = getItemMetrics(kind, settings.noteSize);
  return {
    x: safePadX + Math.random() * Math.max(1, sim.width - safePadX * 2),
    y: safePadY + Math.random() * Math.max(1, sim.height - safePadY * 2),
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    radius: metrics.radius,
    mass: metrics.mass,
    noteW: metrics.noteW,
    noteH: metrics.noteH,
    size: settings.noteSize,
    kind,
    text: overrides.text || "",
    noteColor: overrides.noteColor || DEFAULT_NOTE_COLOR,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.02,
  };
}

function isNatureFloater(f) {
  return f.kind === "leaf" || f.kind === "flower";
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function isEditableNote(f) {
  return f && f.kind === "note";
}

function getTodayNoteLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

function serializeCurrentNotes() {
  return sim.floaters
    .filter((f) => f.kind === "note")
    .map((f) => ({
      text: f.text || "",
      noteColor: f.noteColor || DEFAULT_NOTE_COLOR,
      x: Number(f.x.toFixed(3)),
      y: Number(f.y.toFixed(3)),
      angle: Number(f.angle.toFixed(4)),
      vx: Number(f.vx.toFixed(4)),
      vy: Number(f.vy.toFixed(4)),
    }));
}

async function persistUserNotes(userId) {
  if (!supabaseClient || !userId) return;
  const notes = serializeCurrentNotes().map((n) => ({
    user_id: userId,
    text: n.text,
    note_color: n.noteColor,
    x: n.x,
    y: n.y,
    angle: n.angle,
    vx: n.vx,
    vy: n.vy,
  }));

  const { error: deleteError } = await supabaseClient.from("notes").delete().eq("user_id", userId);
  if (deleteError) {
    setAccountStatus("Failed to save notes.");
    return;
  }

  if (notes.length === 0) return;
  const { error: insertError } = await supabaseClient.from("notes").insert(notes);
  if (insertError) {
    setAccountStatus("Failed to save notes.");
  }
}

function hydrateNoteFromStored(item) {
  const note = randomFloater(50, {
    kind: "note",
    noteColor: item.note_color || DEFAULT_NOTE_COLOR,
    text: item.text || "",
  });
  note.x = Number.isFinite(item.x) ? item.x : note.x;
  note.y = Number.isFinite(item.y) ? item.y : note.y;
  note.vx = Number.isFinite(item.vx) ? item.vx : note.vx;
  note.vy = Number.isFinite(item.vy) ? item.vy : note.vy;
  note.angle = Number.isFinite(item.angle) ? item.angle : note.angle;
  note.x = Math.max(note.radius, Math.min(sim.width - note.radius, note.x));
  note.y = Math.max(note.radius, Math.min(sim.height - note.radius, note.y));
  return note;
}

function setLoggedOutDemoScene() {
  const next = [];
  for (let i = 0; i < DEMO_NOTE_TEXTS.length; i += 1) {
    const text = DEMO_NOTE_TEXTS[i] === "TODAY_DATE" ? getTodayNoteLabel() : DEMO_NOTE_TEXTS[i];
    const note = randomFloater(50, {
      kind: "note",
      noteColor: DEMO_NOTE_COLORS[i] || DEFAULT_NOTE_COLOR,
      text,
    });
    next.push(note);
  }
  for (let i = 0; i < 6; i += 1) {
    next.push(spawnNatureFloater());
  }
  sim.floaters = next;
  sim.natureArrivalPlan.enabled = false;
}

async function setLoggedInScene(userId) {
  let stored = [];
  if (supabaseClient && userId) {
    const { data, error } = await supabaseClient
      .from("notes")
      .select("text, note_color, x, y, angle, vx, vy, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (!error && Array.isArray(data)) {
      stored = data;
    }
  }

  const next = [];
  if (stored.length > 0) {
    for (const item of stored) {
      next.push(hydrateNoteFromStored(item));
    }
  } else {
    const note = randomFloater(50, { kind: "note", noteColor: DEFAULT_NOTE_COLOR });
    note.text = getTodayNoteLabel();
    next.push(note);
  }
  for (let i = 0; i < settings.natureCount; i += 1) {
    next.push(spawnNatureFloater());
  }
  sim.floaters = next;
  resetNatureArrivalPlan();
}

function getNoteCount() {
  let n = 0;
  for (const f of sim.floaters) {
    if (!isNatureFloater(f)) n += 1;
  }
  return n;
}

function getNatureCount() {
  let n = 0;
  for (const f of sim.floaters) {
    if (isNatureFloater(f)) n += 1;
  }
  return n;
}

function syncNoteCountControl() {
  const countInput = document.getElementById("floater-count");
  const countValue = document.getElementById("floater-count-value");
  const next = getNoteCount();
  settings.floaterCount = next;
  if (countInput) countInput.value = String(next);
  if (countValue) countValue.textContent = String(next);
}

function invalidateShadowCache() {
  sim.shadowCache.clear();
}

function spawnNatureFloater() {
  const kind = randomItemKind();
  const margin = Math.max(30, settings.natureSpawnMargin);
  const f = randomFloater(0, { kind });
  const edge = Math.floor(Math.random() * 4);

  if (edge === 0) {
    f.x = -margin - f.radius;
    f.y = Math.random() * sim.height;
    f.vx = 0.9 + Math.random() * 0.9;
    f.vy = (Math.random() - 0.5) * 0.55;
  } else if (edge === 1) {
    f.x = sim.width + margin + f.radius;
    f.y = Math.random() * sim.height;
    f.vx = -(0.9 + Math.random() * 0.9);
    f.vy = (Math.random() - 0.5) * 0.55;
  } else if (edge === 2) {
    f.x = Math.random() * sim.width;
    f.y = -margin - f.radius;
    f.vx = (Math.random() - 0.5) * 0.55;
    f.vy = 0.9 + Math.random() * 0.9;
  } else {
    f.x = Math.random() * sim.width;
    f.y = sim.height + margin + f.radius;
    f.vx = (Math.random() - 0.5) * 0.55;
    f.vy = -(0.9 + Math.random() * 0.9);
  }

  f.spin = (Math.random() - 0.5) * 0.012;
  return f;
}

function resetNatureArrivalPlan() {
  sim.natureArrivalPlan.enabled = true;
  sim.natureArrivalPlan.spawned = 0;
  sim.natureArrivalPlan.nextTime = sim.time + randomBetween(3, 15);
}

function updateNatureArrivalPlan() {
  const plan = sim.natureArrivalPlan;
  if (!plan.enabled) return;
  if (sim.time < plan.nextTime) return;

  sim.floaters.push(spawnNatureFloater());
  plan.spawned += 1;

  if (plan.spawned >= 2) {
    plan.enabled = false;
    return;
  }

  plan.nextTime = sim.time + randomBetween(2, 5);
}

function recycleNatureFloater(f) {
  const replacement = spawnNatureFloater();
  f.x = replacement.x;
  f.y = replacement.y;
  f.vx = replacement.vx;
  f.vy = replacement.vy;
  f.angle = replacement.angle;
  f.spin = replacement.spin;
  f.kind = replacement.kind;
  const metrics = getItemMetrics(f.kind, settings.noteSize);
  f.noteW = metrics.noteW;
  f.noteH = metrics.noteH;
  f.radius = metrics.radius;
  f.mass = metrics.mass;
}

function paintCloud(cx, cy, size, alpha) {
  const g = sim.skyCtx;
  const lumps = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < lumps; i += 1) {
    const ox = (Math.random() - 0.5) * size * 1.1;
    const oy = (Math.random() - 0.5) * size * 0.45;
    const rx = size * (0.18 + Math.random() * 0.24);
    const ry = size * (0.13 + Math.random() * 0.2);
    g.fillStyle = `rgba(255,255,255,${alpha * (0.5 + Math.random() * 0.5)})`;
    g.beginPath();
    g.ellipse(cx + ox, cy + oy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function generateSkyTexture() {
  if (requestSkyTextureFromWorker()) return;
  generateSkyTextureSync();
}

function generateSkyTextureSync() {
  const g = sim.skyCtx;
  sim.skyCanvas.width = sim.width;
  sim.skyCanvas.height = sim.height;

  const sky = g.createLinearGradient(0, 0, 0, sim.height);
  sky.addColorStop(0, "#75acd6");
  sky.addColorStop(0.52, "#8ec0e4");
  sky.addColorStop(1, "#c2dded");
  g.fillStyle = sky;
  g.fillRect(0, 0, sim.width, sim.height);

  g.save();
  g.filter = "blur(10px)";
  const cloudCount = Math.max(10, Math.floor(sim.width / 110));
  for (let i = 0; i < cloudCount; i += 1) {
    const cx = Math.random() * sim.width;
    const cy = Math.random() * sim.height * 0.92;
    const size = 120 + Math.random() * 260;
    paintCloud(cx, cy, size, 0.22 + Math.random() * 0.18);
  }
  g.restore();

  const light = g.createRadialGradient(sim.width * 0.78, sim.height * 0.2, 40, sim.width * 0.78, sim.height * 0.2, sim.width * 0.5);
  light.addColorStop(0, "rgba(255,255,255,0.28)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = light;
  g.fillRect(0, 0, sim.width, sim.height);
}

function requestSkyTextureFromWorker() {
  sim.skyCanvas.width = sim.width;
  sim.skyCanvas.height = sim.height;
  const g = sim.skyCtx;
  const quick = g.createLinearGradient(0, 0, 0, sim.height);
  quick.addColorStop(0, "#79afd8");
  quick.addColorStop(1, "#c0dcec");
  g.fillStyle = quick;
  g.fillRect(0, 0, sim.width, sim.height);

  return requestWorker("sky", { width: sim.width, height: sim.height }, (data) => {
    const bitmap = data.bitmap;
    if (!bitmap) return;
    sim.skyCanvas.width = sim.width;
    sim.skyCanvas.height = sim.height;
    sim.skyCtx.clearRect(0, 0, sim.width, sim.height);
    sim.skyCtx.drawImage(bitmap, 0, 0, sim.width, sim.height);
    if (typeof bitmap.close === "function") bitmap.close();
  });
}

function drawCoverImage(image, targetCtx, width, height) {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  if (!srcW || !srcH) return;

  const srcRatio = srcW / srcH;
  const dstRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcRatio > dstRatio) {
    sw = srcH * dstRatio;
    sx = (srcW - sw) * 0.5;
  } else {
    sh = srcW / dstRatio;
    sy = (srcH - sh) * 0.5;
  }

  targetCtx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

function applyReflectionTexture() {
  if (sim.reflectionGif.active) {
    updateGifFrame();
    sim.skyCanvas.width = sim.width;
    sim.skyCanvas.height = sim.height;
    sim.skyCtx.clearRect(0, 0, sim.width, sim.height);
    drawCoverImage(sim.reflectionGif.canvas, sim.skyCtx, sim.width, sim.height);
    return;
  }
  if (sim.reflectionImage) {
    sim.skyCanvas.width = sim.width;
    sim.skyCanvas.height = sim.height;
    sim.skyCtx.clearRect(0, 0, sim.width, sim.height);
    drawCoverImage(sim.reflectionImage, sim.skyCtx, sim.width, sim.height);
    return;
  }
  generateSkyTexture();
}

function clearGifPlayback() {
  const gif = sim.reflectionGif;
  if (!gif.active && gif.frames.length === 0) return;
  for (const frame of gif.frames) {
    if (frame.image && typeof frame.image.close === "function") {
      frame.image.close();
    }
  }
  gif.active = false;
  gif.frames = [];
  gif.timeline = [];
  gif.totalDuration = 0;
  gif.startTime = 0;
  gif.canvas.width = 0;
  gif.canvas.height = 0;
}

async function loadGifPlayback(file) {
  if (typeof ImageDecoder === "undefined") return false;
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type || "image/gif" });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  const frameCount = track && track.frameCount ? track.frameCount : 0;
  if (frameCount <= 0) return false;

  const gif = sim.reflectionGif;
  clearGifPlayback();
  let t = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const { image } = await decoder.decode({ frameIndex: i, completeFrames: true });
    const bitmap = await createImageBitmap(image);
    // VideoFrame duration is in microseconds; convert to milliseconds for timeline math.
    const durationMs = image.duration ? image.duration / 1000 : 100;
    const duration = Math.max(16, durationMs);
    image.close();
    gif.frames.push({ image: bitmap, duration });
    gif.timeline.push(t);
    t += duration;
  }
  if (typeof decoder.close === "function") decoder.close();
  if (gif.frames.length === 0) return false;

  gif.canvas.width = gif.frames[0].image.width;
  gif.canvas.height = gif.frames[0].image.height;
  gif.totalDuration = t;
  gif.startTime = performance.now();
  gif.active = true;
  return true;
}

function updateGifFrame(nowMs = performance.now()) {
  const gif = sim.reflectionGif;
  if (!gif.active || gif.frames.length === 0 || gif.totalDuration <= 0) return false;
  const elapsed = (nowMs - gif.startTime) % gif.totalDuration;
  let idx = gif.frames.length - 1;
  for (let i = 0; i < gif.timeline.length; i += 1) {
    if (elapsed < gif.timeline[i]) {
      idx = Math.max(0, i - 1);
      break;
    }
  }
  const frame = gif.frames[idx];
  gif.ctx.clearRect(0, 0, gif.canvas.width, gif.canvas.height);
  gif.ctx.drawImage(frame.image, 0, 0);
  return true;
}

function refreshReflectionTextureFrame() {
  if (sim.reflectionGif.active) {
    updateGifFrame();
    sim.skyCtx.clearRect(0, 0, sim.width, sim.height);
    drawCoverImage(sim.reflectionGif.canvas, sim.skyCtx, sim.width, sim.height);
    return;
  }
  if (!sim.reflectionImage) return;
  sim.skyCtx.clearRect(0, 0, sim.width, sim.height);
  drawCoverImage(sim.reflectionImage, sim.skyCtx, sim.width, sim.height);
}

function setReflectionStatus(text) {
  const status = document.getElementById("reflection-status");
  if (status) status.textContent = text;
}

function setBottomStatus(text) {
  const status = document.getElementById("bottom-status");
  if (status) status.textContent = text;
}

function setSpriteStatus(kind, text) {
  const status = document.getElementById(`${kind}-sprite-status`);
  if (status) status.textContent = text;
}

function registerRippleSource(x, y, amount) {
  const strength = Math.min(1.5, Math.max(0.35, amount * 0.42));
  sim.rippleSources.push({
    x,
    y,
    strength,
    age: 0,
    radius: 170 + amount * 80,
  });
  if (sim.rippleSources.length > 16) {
    sim.rippleSources.splice(0, sim.rippleSources.length - 16);
  }
}

function updateRippleSources(dt) {
  for (let i = sim.rippleSources.length - 1; i >= 0; i -= 1) {
    const source = sim.rippleSources[i];
    source.age += dt;
    if (source.age > 2.8) {
      sim.rippleSources.splice(i, 1);
    }
  }
}

function resize() {
  const rawDpr = window.devicePixelRatio || 1;
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);
  const cssPixels = Math.max(1, w * h);
  const maxDprByBudget = Math.sqrt(MAX_CANVAS_PIXELS / cssPixels);
  sim.dpr = Math.max(0.6, Math.min(maxDprByBudget, Math.min(1.5, rawDpr)));

  sim.width = w;
  sim.height = h;
  canvas.width = Math.floor(w * sim.dpr);
  canvas.height = Math.floor(h * sim.dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(sim.dpr, 0, 0, sim.dpr, 0, 0);

  sim.cols = Math.floor(w / sim.cellSize) + 2;
  sim.rows = Math.floor(h / sim.cellSize) + 2;
  sim.current = new Float32Array(sim.cols * sim.rows);
  sim.previous = new Float32Array(sim.cols * sim.rows);
  if (!sim.noisePattern) generateNoisePattern();

  applyReflectionTexture();

  if (sim.floaters.length === 0) {
    initFloaters(settings.floaterCount, settings.natureCount);
  } else {
    for (const f of sim.floaters) {
      if (!isNatureFloater(f)) {
        f.x = Math.max(f.radius, Math.min(sim.width - f.radius, f.x));
        f.y = Math.max(f.radius, Math.min(sim.height - f.radius, f.y));
      }
    }
  }
}

function initFloaters(noteCount = settings.floaterCount, natureCount = settings.natureCount) {
  const next = [];
  for (let i = 0; i < noteCount; i += 1) {
    const note = randomFloater(50, { kind: "note", noteColor: DEFAULT_NOTE_COLOR });
    if (i === 0) {
      note.text = getTodayNoteLabel();
      note.noteColor = DEFAULT_NOTE_COLOR;
    }
    next.push(note);
  }
  for (let i = 0; i < natureCount; i += 1) {
    next.push(spawnNatureFloater());
  }
  sim.floaters = next;
  resetNatureArrivalPlan();
}

function syncFloaterCount(targetCount) {
  const clamped = Math.max(1, targetCount);
  let notes = getNoteCount();
  if (notes < clamped) {
    while (notes < clamped) {
      sim.floaters.push(randomFloater(50, { kind: "note" }));
      notes += 1;
    }
  } else if (notes > clamped) {
    for (let i = sim.floaters.length - 1; i >= 0 && notes > clamped; i -= 1) {
      if (!isNatureFloater(sim.floaters[i])) {
        sim.floaters.splice(i, 1);
        notes -= 1;
      }
    }
  }
}

function syncNatureCount(targetCount) {
  const clamped = Math.max(0, targetCount);
  let nature = getNatureCount();
  if (nature < clamped) {
    while (nature < clamped) {
      sim.floaters.push(spawnNatureFloater());
      nature += 1;
    }
  } else if (nature > clamped) {
    for (let i = sim.floaters.length - 1; i >= 0 && nature > clamped; i -= 1) {
      if (isNatureFloater(sim.floaters[i])) {
        sim.floaters.splice(i, 1);
        nature -= 1;
      }
    }
  }
}

function applyNoteSizeToFloaters(size) {
  invalidateShadowCache();
  for (const f of sim.floaters) {
    const metrics = getItemMetrics(f.kind || "note", size);
    f.size = size;
    f.noteW = metrics.noteW;
    f.noteH = metrics.noteH;
    f.radius = metrics.radius;
    f.mass = metrics.mass;
    if (!isNatureFloater(f)) {
      f.x = Math.max(f.radius, Math.min(sim.width - f.radius, f.x));
      f.y = Math.max(f.radius, Math.min(sim.height - f.radius, f.y));
    }
  }
}

function idx(col, row) {
  return row * sim.cols + col;
}

function splashAtWorld(x, y, amount) {
  const col = Math.floor(x / sim.cellSize);
  const row = Math.floor(y / sim.cellSize);
  if (col < 1 || row < 1 || col > sim.cols - 2 || row > sim.rows - 2) return;
  sim.previous[idx(col, row)] += amount;
}

function sampleHeightWorld(x, y) {
  const cx = Math.max(1, Math.min(sim.cols - 2, Math.floor(x / sim.cellSize)));
  const cy = Math.max(1, Math.min(sim.rows - 2, Math.floor(y / sim.cellSize)));
  return sim.current[idx(cx, cy)];
}

function sampleGradientWorld(x, y) {
  const cx = Math.max(1, Math.min(sim.cols - 2, Math.floor(x / sim.cellSize)));
  const cy = Math.max(1, Math.min(sim.rows - 2, Math.floor(y / sim.cellSize)));

  const left = sim.current[idx(cx - 1, cy)];
  const right = sim.current[idx(cx + 1, cy)];
  const up = sim.current[idx(cx, cy - 1)];
  const down = sim.current[idx(cx, cy + 1)];

  return {
    gx: right - left,
    gy: down - up,
  };
}

function updateRipples() {
  for (let y = 1; y < sim.rows - 1; y += 1) {
    for (let x = 1; x < sim.cols - 1; x += 1) {
      const i = idx(x, y);
      const neighborAvg = (
        sim.current[idx(x - 1, y)] +
        sim.current[idx(x + 1, y)] +
        sim.current[idx(x, y - 1)] +
        sim.current[idx(x, y + 1)]
      ) * 0.5;
      const propagated = neighborAvg - sim.previous[i];
      const blended = sim.current[i] + (propagated - sim.current[i]) * settings.rippleTravel;
      sim.previous[i] = blended * sim.damp;
    }
  }

  const tmp = sim.current;
  sim.current = sim.previous;
  sim.previous = tmp;

  sim.ambientTimer += 1;
  if (sim.ambientTimer > 42) {
    sim.ambientTimer = 0;
    const ax = sim.width * (0.1 + Math.random() * 0.8);
    const ay = sim.height * (0.1 + Math.random() * 0.8);
    const amount = (0.09 + Math.random() * 0.14) * settings.rippleStrength;
    splashAtWorld(ax, ay, amount);
    registerRippleSource(ax, ay, amount);
  }
}

function updateFloaters(dt) {
  const cx = sim.width * 0.5;
  const cy = sim.height * 0.5;
  const recycleMargin = Math.max(120, settings.natureSpawnMargin + 140);
  const activeNatureMargin = Math.max(24, settings.natureSpawnMargin * 0.45);

  for (const f of sim.floaters) {
    const nature = isNatureFloater(f);
    const nearViewport =
      f.x > -activeNatureMargin &&
      f.x < sim.width + activeNatureMargin &&
      f.y > -activeNatureMargin &&
      f.y < sim.height + activeNatureMargin;
    const applyWater = !nature || nearViewport;

    let gradX = 0;
    let gradY = 0;
    let h = 0;
    if (applyWater) {
      const grad = sampleGradientWorld(f.x, f.y);
      gradX = grad.gx;
      gradY = grad.gy;
      h = sampleHeightWorld(f.x, f.y);
    }

    if (applyWater) {
      const waterForce = 30;
      f.vx += (-gradX * waterForce) / f.mass * dt;
      f.vy += (-gradY * waterForce) / f.mass * dt;
    }

    if (!nature) {
      const dx = cx - f.x;
      const dy = cy - f.y;
      f.vx += dx * 0.0025 * dt;
      f.vy += dy * 0.0025 * dt;
    } else {
      // Keep nature items loosely flowing through the scene without hard bounds.
      const dx = cx - f.x;
      const dy = cy - f.y;
      f.vx += dx * 0.00125 * dt;
      f.vy += dy * 0.00125 * dt;
    }

    f.vx *= settings.waterDrag;
    f.vy *= settings.waterDrag;

    f.x += f.vx * 60 * dt;
    f.y += f.vy * 60 * dt;

    f.spin += h * 0.00055;
    f.spin *= 0.985;
    f.angle += f.spin * 60 * dt;

    if (!nature) {
      constrainFloaterBounds(f);
    } else if (
      f.x < -recycleMargin - f.radius ||
      f.x > sim.width + recycleMargin + f.radius ||
      f.y < -recycleMargin - f.radius ||
      f.y > sim.height + recycleMargin + f.radius
    ) {
      recycleNatureFloater(f);
    }
  }
}

function pickNoteAt(x, y) {
  for (let i = sim.floaters.length - 1; i >= 0; i -= 1) {
    const f = sim.floaters[i];
    if (!isEditableNote(f)) continue;
    const dx = x - f.x;
    const dy = y - f.y;
    const hitRadius = f.radius * 1.1;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return f;
    }
  }
  return null;
}

function refreshHoveredNote() {
  if (!sim.noteEditMode || !sim.pointer.initialized) {
    sim.hoveredNote = null;
    return;
  }
  sim.hoveredNote = pickNoteAt(sim.pointer.x, sim.pointer.y);
}

function updateCanvasCursor() {
  if (sim.noteEditMode) {
    canvas.style.cursor = sim.hoveredNote ? "pointer" : "grab";
    return;
  }
  canvas.style.cursor = "default";
}

function constrainFloaterBounds(f) {
  if (f.x < f.radius) {
    f.x = f.radius;
    f.vx *= -0.7;
  }
  if (f.x > sim.width - f.radius) {
    f.x = sim.width - f.radius;
    f.vx *= -0.7;
  }
  if (f.y < f.radius) {
    f.y = f.radius;
    f.vy *= -0.7;
  }
  if (f.y > sim.height - f.radius) {
    f.y = sim.height - f.radius;
    f.vy *= -0.7;
  }
}

function resolveFloaterCollisions(iterations = 2) {
  const collisionMargin = 90;
  const natureCullMargin = Math.max(36, settings.natureSpawnMargin * 0.4);
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < sim.floaters.length; i += 1) {
      const a = sim.floaters[i];
      for (let j = i + 1; j < sim.floaters.length; j += 1) {
        const b = sim.floaters[j];
        const aNature = isNatureFloater(a);
        const bNature = isNatureFloater(b);
        const outNatureA =
          aNature &&
          (a.x < -natureCullMargin - a.radius ||
            a.x > sim.width + natureCullMargin + a.radius ||
            a.y < -natureCullMargin - a.radius ||
            a.y > sim.height + natureCullMargin + a.radius);
        const outNatureB =
          bNature &&
          (b.x < -natureCullMargin - b.radius ||
            b.x > sim.width + natureCullMargin + b.radius ||
            b.y < -natureCullMargin - b.radius ||
            b.y > sim.height + natureCullMargin + b.radius);
        if (outNatureA || outNatureB) continue;

        const outA =
          a.x < -collisionMargin - a.radius ||
          a.x > sim.width + collisionMargin + a.radius ||
          a.y < -collisionMargin - a.radius ||
          a.y > sim.height + collisionMargin + a.radius;
        const outB =
          b.x < -collisionMargin - b.radius ||
          b.x > sim.width + collisionMargin + b.radius ||
          b.y < -collisionMargin - b.radius ||
          b.y > sim.height + collisionMargin + b.radius;
        if (outA && outB) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist) continue;

        if (dist < 0.0001) {
          dx = 1;
          dy = 0;
          dist = 1;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const invMassA = 1 / a.mass;
        const invMassB = 1 / b.mass;
        const invMassSum = invMassA + invMassB;

        const correction = overlap / invMassSum;
        a.x -= nx * correction * invMassA;
        a.y -= ny * correction * invMassA;
        b.x += nx * correction * invMassB;
        b.y += ny * correction * invMassB;

        const relVx = b.vx - a.vx;
        const relVy = b.vy - a.vy;
        const velAlongNormal = relVx * nx + relVy * ny;
        if (velAlongNormal < 0) {
          const impulse = (-(1 + COLLISION_RESTITUTION) * velAlongNormal) / invMassSum;
          const impulseX = impulse * nx;
          const impulseY = impulse * ny;

          a.vx -= impulseX * invMassA;
          a.vy -= impulseY * invMassA;
          b.vx += impulseX * invMassB;
          b.vy += impulseY * invMassB;
        }

        if (!isNatureFloater(a)) constrainFloaterBounds(a);
        if (!isNatureFloater(b)) constrainFloaterBounds(b);
      }
    }
  }
}

function processPointer(dt) {
  if (!sim.pointer.initialized) return;
  if (sim.noteEditMode) {
    sim.pointer.px = sim.pointer.x;
    sim.pointer.py = sim.pointer.y;
    return;
  }

  const dx = sim.pointer.x - sim.pointer.px;
  const dy = sim.pointer.y - sim.pointer.py;
  const speed = Math.hypot(dx, dy);

  if (speed > 0.2) {
    const amount = Math.min(2.4, speed * 0.05) * settings.rippleStrength;
    splashAtWorld(sim.pointer.x, sim.pointer.y, amount);
    if (sim.time - sim.lastRippleEmit > 0.05) {
      sim.lastRippleEmit = sim.time;
      registerRippleSource(sim.pointer.x, sim.pointer.y, amount);
    }

    for (const f of sim.floaters) {
      const ox = f.x - sim.pointer.x;
      const oy = f.y - sim.pointer.y;
      const dist = Math.hypot(ox, oy);
      const influenceRadius = 90 + f.radius;
      if (dist < influenceRadius && dist > 0.01) {
        const n = 1 - dist / influenceRadius;
        const push = (sim.pointer.down ? 2.2 : 1.2) * n * settings.cursorPush;
        f.vx += (dx * push * dt * 18) / f.mass;
        f.vy += (dy * push * dt * 18) / f.mass;
      }
    }
  }

  if (sim.pointer.down) {
    splashAtWorld(sim.pointer.x, sim.pointer.y, 0.8 * settings.rippleStrength);
  }

  sim.pointer.px = sim.pointer.x;
  sim.pointer.py = sim.pointer.y;
}

function compileGlShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "shader compile error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createGlProgram(gl, vertexSrc, fragmentSrc) {
  const vs = compileGlShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fs = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "program link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function initRefractionGl() {
  if (sim.gl.disabled) return false;
  if (sim.gl.ready) return true;
  try {
    const glCanvas = document.createElement("canvas");
    const gl =
      glCanvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false }) ||
      glCanvas.getContext("experimental-webgl", { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) return false;

    const vertexSrc = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;
    const fragmentSrc = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_sky;
      uniform sampler2D u_ripple;
      uniform vec2 u_texel;
      uniform vec2 u_resolution;
      uniform float u_refraction;
      uniform float u_pixel_step;
      void main() {
        vec2 px = vec2(max(1.0, u_pixel_step));
        vec2 quantized = floor((v_uv * u_resolution) / px) * px / u_resolution;
        vec2 uv = clamp(quantized, vec2(0.0), vec2(1.0));
        float c = texture2D(u_ripple, uv).r;
        float l = texture2D(u_ripple, uv - vec2(u_texel.x, 0.0)).r;
        float r = texture2D(u_ripple, uv + vec2(u_texel.x, 0.0)).r;
        float u = texture2D(u_ripple, uv - vec2(0.0, u_texel.y)).r;
        float d = texture2D(u_ripple, uv + vec2(0.0, u_texel.y)).r;
        vec2 grad = vec2(r - l, d - u);
        float h = c - 0.5;
        vec2 offset = grad * (u_refraction * 0.6) + h * vec2(0.0, u_refraction * 0.03);
        vec2 suv = clamp(uv + offset, vec2(0.0), vec2(1.0));
        gl_FragColor = texture2D(u_sky, suv);
      }
    `;

    const program = createGlProgram(gl, vertexSrc, fragmentSrc);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    );

    const skyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const rippleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, rippleTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    sim.gl.canvas = glCanvas;
    sim.gl.ctx = gl;
    sim.gl.program = program;
    sim.gl.vertexBuffer = vertexBuffer;
    sim.gl.skyTex = skyTex;
    sim.gl.rippleTex = rippleTex;
    sim.gl.aPosLoc = gl.getAttribLocation(program, "a_pos");
    sim.gl.uSkyLoc = gl.getUniformLocation(program, "u_sky");
    sim.gl.uRippleLoc = gl.getUniformLocation(program, "u_ripple");
    sim.gl.uTexelLoc = gl.getUniformLocation(program, "u_texel");
    sim.gl.uRefractionLoc = gl.getUniformLocation(program, "u_refraction");
    sim.gl.uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
    sim.gl.uPixelStepLoc = gl.getUniformLocation(program, "u_pixel_step");
    sim.gl.ready = true;
    return true;
  } catch (_err) {
    sim.gl.ready = false;
    sim.gl.disabled = true;
    return false;
  }
}

function updateRippleTexture(gl) {
  const cols = sim.cols;
  const rows = sim.rows;
  if (!cols || !rows || !sim.current) return;
  if (!sim.gl.rippleData || sim.gl.rippleW !== cols || sim.gl.rippleH !== rows) {
    sim.gl.rippleData = new Uint8Array(cols * rows);
    sim.gl.rippleW = cols;
    sim.gl.rippleH = rows;
    gl.bindTexture(gl.TEXTURE_2D, sim.gl.rippleTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cols, rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, sim.gl.rippleData);
  }
  const out = sim.gl.rippleData;
  for (let i = 0; i < sim.current.length; i += 1) {
    const v = sim.current[i];
    const normalized = Math.max(0, Math.min(255, Math.floor(v * 127 + 128)));
    out[i] = normalized;
  }
  gl.bindTexture(gl.TEXTURE_2D, sim.gl.rippleTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.LUMINANCE, gl.UNSIGNED_BYTE, out);
}

function renderRefractionWebgl() {
  if (!initRefractionGl()) return false;
  const gl = sim.gl.ctx;
  if (!gl || !sim.skyCanvas.width || !sim.skyCanvas.height) return false;
  const outW = Math.max(1, Math.floor(sim.width * sim.dpr));
  const outH = Math.max(1, Math.floor(sim.height * sim.dpr));
  try {
    if (sim.gl.canvas.width !== outW || sim.gl.canvas.height !== outH) {
      sim.gl.canvas.width = outW;
      sim.gl.canvas.height = outH;
    }

    gl.viewport(0, 0, outW, outH);
    gl.useProgram(sim.gl.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, sim.gl.vertexBuffer);
    gl.enableVertexAttribArray(sim.gl.aPosLoc);
    gl.vertexAttribPointer(sim.gl.aPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sim.gl.skyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sim.skyCanvas);
    gl.uniform1i(sim.gl.uSkyLoc, 0);

    updateRippleTexture(gl);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sim.gl.rippleTex);
    gl.uniform1i(sim.gl.uRippleLoc, 1);

    gl.uniform2f(sim.gl.uTexelLoc, 1 / Math.max(1, sim.cols), 1 / Math.max(1, sim.rows));
    gl.uniform2f(sim.gl.uResolutionLoc, sim.width, sim.height);
    gl.uniform1f(sim.gl.uRefractionLoc, settings.refraction);
    gl.uniform1f(sim.gl.uPixelStepLoc, Math.max(8, sim.effectiveRippleStep || settings.ripplePixelSize));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      throw new Error(`webgl-error-${err}`);
    }
    ctx.drawImage(sim.gl.canvas, 0, 0, sim.width, sim.height);
    return true;
  } catch (_err) {
    sim.gl.ready = false;
    sim.gl.disabled = true;
    return false;
  }
}

function drawReflectedSkyCpuFallback() {
  const step = Math.max(8, Math.floor(sim.effectiveRippleStep || settings.ripplePixelSize));
  const maxShift = settings.refraction * 1.8;

  for (let y = 0; y < sim.height; y += step) {
    for (let x = 0; x < sim.width; x += step) {
      const grad = sampleGradientWorld(x, y);
      const h = sampleHeightWorld(x, y);
      let ringX = 0;
      let ringY = 0;

      for (let i = 0; i < sim.rippleSources.length; i += 1) {
        const source = sim.rippleSources[i];
        const dx = x - source.x;
        const dy = y - source.y;
        const dist = Math.hypot(dx, dy);
        if (dist > source.radius || dist < 0.0001) continue;

        const n = dist / source.radius;
        const envelope = Math.pow(1 - n, 1.5) * Math.exp(-source.age * 1.05);
        const phase = dist * 0.09 - source.age * 18;
        const wave = Math.sin(phase) * source.strength * settings.refraction * 0.75 * envelope;
        const nx = dx / dist;
        const ny = dy / dist;

        ringX += nx * wave + (-ny * wave * 0.17);
        ringY += ny * wave + (nx * wave * 0.17);
      }

      const sx = Math.max(
        0,
        Math.min(
          sim.width - step,
          x + grad.gx * maxShift * 22 + h * maxShift * 1.3 + ringX + Math.sin(sim.time * 0.5 + y * 0.01) * 0.6
        )
      );
      const sy = Math.max(
        0,
        Math.min(
          sim.height - step,
          y + grad.gy * maxShift * 22 + h * maxShift * 1.3 + ringY + Math.cos(sim.time * 0.45 + x * 0.01) * 0.6
        )
      );

      ctx.drawImage(sim.skyCanvas, sx, sy, step, step, x, y, step, step);
    }
  }
}

function drawReflectedSky() {
  const ok = renderRefractionWebgl();
  if (!ok) {
    drawReflectedSkyCpuFallback();
  }
}

function drawSunlightGradation() {
  ctx.save();
  ctx.globalAlpha = 0.2;
  const g = ctx.createLinearGradient(0, 0, sim.width, sim.height);
  g.addColorStop(0, "#FFCE63");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sim.width, sim.height);
  ctx.restore();
}

function drawBottomOverlay() {
  if (!sim.bottomImage || settings.bottomOpacity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = settings.bottomOpacity;
  drawCoverImage(sim.bottomImage, ctx, sim.width, sim.height);

  const vignette = ctx.createRadialGradient(
    sim.width * 0.5,
    sim.height * 0.5,
    Math.min(sim.width, sim.height) * 0.18,
    sim.width * 0.5,
    sim.height * 0.5,
    Math.max(sim.width, sim.height) * 0.7
  );
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, sim.width, sim.height);
  ctx.restore();
}

function drawRingContours() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const source of sim.rippleSources) {
    const t = source.age;
    for (let i = 0; i < 4; i += 1) {
      const r = 18 + (t * (85 + i * 18)) + i * 8;
      if (r > source.radius * 1.15) continue;
      const alpha = Math.max(0, 0.08 - t * 0.022 - i * 0.013);
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(232, 246, 255, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(source.x, source.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRippleHighlights() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let y = 2; y < sim.rows - 2; y += 2) {
    for (let x = 2; x < sim.cols - 2; x += 2) {
      const h = sim.current[idx(x, y)];
      if (Math.abs(h) < 0.02) continue;
      const alpha = Math.min(0.09, Math.abs(h) * 0.036);
      ctx.fillStyle = h > 0 ? `rgba(255,255,255,${alpha})` : `rgba(215,234,246,${alpha * 0.75})`;
      ctx.fillRect((x - 1) * sim.cellSize, (y - 1) * sim.cellSize, sim.cellSize * 1.5, sim.cellSize * 1.5);
    }
  }

  ctx.restore();
}

function drawVignette() {
  const v = ctx.createRadialGradient(sim.width * 0.5, sim.height * 0.5, sim.width * 0.15, sim.width * 0.5, sim.height * 0.5, sim.width * 0.75);
  v.addColorStop(0, "rgba(255,255,255,0)");
  v.addColorStop(1, "rgba(18,42,64,0.2)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, sim.width, sim.height);
}

function drawFloaters() {
  for (const f of sim.floaters) {
    if (
      f.x + f.radius < 0 ||
      f.x - f.radius > sim.width ||
      f.y + f.radius < 0 ||
      f.y - f.radius > sim.height
    ) {
      continue;
    }

    const noteW = f.noteW;
    const noteH = f.noteH;
    const halfW = noteW * 0.5;
    const halfH = noteH * 0.5;
    const r = 0;
    const shadowScale = noteW / 140;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    if (sim.noteEditMode && sim.hoveredNote === f && isEditableNote(f)) {
      ctx.scale(1.1, 1.1);
    }

    if (f.kind === "leaf") {
      drawLeafFloater(f, halfW, halfH, shadowScale);
    } else if (f.kind === "flower") {
      drawFlowerFloater(f, halfW, halfH, shadowScale);
    } else {
      drawNoteFloater(f, halfW, halfH, shadowScale, r);
    }

    ctx.restore();
  }
}

function getOrCreateShadowCache(key, builder) {
  const existing = sim.shadowCache.get(key);
  if (existing) return existing;
  const next = builder();
  sim.shadowCache.set(key, next);
  return next;
}

function drawRoundedRectPathCtx(target, x, y, w, h, r) {
  const clamped = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  target.beginPath();
  target.moveTo(x + clamped, y);
  target.lineTo(x + w - clamped, y);
  target.quadraticCurveTo(x + w, y, x + w, y + clamped);
  target.lineTo(x + w, y + h - clamped);
  target.quadraticCurveTo(x + w, y + h, x + w - clamped, y + h);
  target.lineTo(x + clamped, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - clamped);
  target.lineTo(x, y + clamped);
  target.quadraticCurveTo(x, y, x + clamped, y);
  target.closePath();
}

function drawNoteShadowCached(f, halfW, halfH, shadowScale, shadowLayers, r) {
  const key = `note|${Math.round(f.noteW)}|${Math.round(f.noteH)}|${(f.noteColor || DEFAULT_NOTE_COLOR).toLowerCase()}|${Math.round(shadowScale * 1000)}`;
  const entry = getOrCreateShadowCache(key, () => {
    let maxRight = 0;
    let maxBottom = 0;
    let maxBlur = 0;
    for (const layer of shadowLayers) {
      if (layer.a <= 0) continue;
      if (layer.x * shadowScale > maxRight) maxRight = layer.x * shadowScale;
      if (layer.y * shadowScale > maxBottom) maxBottom = layer.y * shadowScale;
      if (layer.blur * shadowScale > maxBlur) maxBlur = layer.blur * shadowScale;
    }
    const margin = Math.ceil(maxRight + maxBottom + maxBlur * 1.8 + 4);
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.ceil(f.noteW + margin * 2));
    off.height = Math.max(1, Math.ceil(f.noteH + margin * 2));
    const offCtx = off.getContext("2d", { alpha: true });
    for (const layer of shadowLayers) {
      if (layer.a <= 0) continue;
      offCtx.save();
      offCtx.filter = `blur(${layer.blur * shadowScale}px)`;
      offCtx.fillStyle = `rgba(0, 0, 0, ${layer.a})`;
      drawRoundedRectPathCtx(
        offCtx,
        margin + layer.x * shadowScale,
        margin + layer.y * shadowScale,
        f.noteW,
        f.noteH,
        r
      );
      offCtx.fill();
      offCtx.restore();
    }
    return { canvas: off, dx: -halfW - margin, dy: -halfH - margin };
  });
  ctx.drawImage(entry.canvas, entry.dx, entry.dy);
}

function drawLeafPathCtx(target, halfW, halfH) {
  target.beginPath();
  target.moveTo(0, -halfH);
  target.bezierCurveTo(halfW * 0.8, -halfH * 0.55, halfW * 0.75, halfH * 0.5, 0, halfH);
  target.bezierCurveTo(-halfW * 0.75, halfH * 0.5, -halfW * 0.8, -halfH * 0.55, 0, -halfH);
  target.closePath();
}

function drawFlowerShadowShape(target, halfW, halfH) {
  const petalW = halfW * 0.52;
  const petalH = halfH * 0.66;
  for (let i = 0; i < 5; i += 1) {
    const a = (Math.PI * 2 * i) / 5;
    target.save();
    target.rotate(a);
    target.beginPath();
    target.ellipse(0, -halfH * 0.35, petalW, petalH, 0, 0, Math.PI * 2);
    target.fill();
    target.restore();
  }
}

function drawShapeShadowCached(f, halfW, halfH, shadowScale, shadowLayers, cacheKind, drawShape) {
  const key = `${cacheKind}|${Math.round(f.noteW)}|${Math.round(f.noteH)}|${Math.round(shadowScale * 1000)}`;
  const entry = getOrCreateShadowCache(key, () => {
    let maxRight = 0;
    let maxBottom = 0;
    let maxBlur = 0;
    for (const layer of shadowLayers) {
      if (layer.a <= 0) continue;
      if (layer.x * shadowScale > maxRight) maxRight = layer.x * shadowScale;
      if (layer.y * shadowScale > maxBottom) maxBottom = layer.y * shadowScale;
      if (layer.blur * shadowScale > maxBlur) maxBlur = layer.blur * shadowScale;
    }
    const margin = Math.ceil(maxRight + maxBottom + maxBlur * 1.8 + 4);
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.ceil(f.noteW + margin * 2));
    off.height = Math.max(1, Math.ceil(f.noteH + margin * 2));
    const offCtx = off.getContext("2d", { alpha: true });
    for (const layer of shadowLayers) {
      if (layer.a <= 0) continue;
      offCtx.save();
      offCtx.translate(margin + halfW + layer.x * shadowScale, margin + halfH + layer.y * shadowScale);
      offCtx.filter = `blur(${layer.blur * shadowScale}px)`;
      offCtx.fillStyle = `rgba(0, 0, 0, ${layer.a})`;
      drawShape(offCtx, halfW, halfH);
      offCtx.fill();
      offCtx.restore();
    }
    return { canvas: off, dx: -halfW - margin, dy: -halfH - margin };
  });
  ctx.drawImage(entry.canvas, entry.dx, entry.dy);
}

function drawSpriteShadowed(img, f, halfW, halfH, shadowScale, shadowLayers, kind) {
  const spriteKey = img.src || `${img.naturalWidth}x${img.naturalHeight}`;
  const key = `sprite|${kind}|${Math.round(f.noteW)}|${Math.round(f.noteH)}|${Math.round(shadowScale * 1000)}|${spriteKey}`;
  const entry = getOrCreateShadowCache(key, () => {
    let maxRight = 0;
    let maxBottom = 0;
    let maxBlur = 0;
    for (const layer of shadowLayers) {
      if (layer.a <= 0) continue;
      if (layer.x * shadowScale > maxRight) maxRight = layer.x * shadowScale;
      if (layer.y * shadowScale > maxBottom) maxBottom = layer.y * shadowScale;
      if (layer.blur * shadowScale > maxBlur) maxBlur = layer.blur * shadowScale;
    }
    const margin = Math.ceil(maxRight + maxBottom + maxBlur * 1.8 + 4);
    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.ceil(f.noteW + margin * 2));
    off.height = Math.max(1, Math.ceil(f.noteH + margin * 2));
    const offCtx = off.getContext("2d", { alpha: true });
    for (const layer of shadowLayers) {
      if (layer.a <= 0) continue;
      offCtx.save();
      offCtx.translate(margin + layer.x * shadowScale, margin + layer.y * shadowScale);
      offCtx.filter = `grayscale(1) brightness(0) blur(${layer.blur * shadowScale}px)`;
      offCtx.globalAlpha = layer.a;
      offCtx.drawImage(img, 0, 0, f.noteW, f.noteH);
      offCtx.restore();
    }
    return { canvas: off, dx: -halfW - margin, dy: -halfH - margin };
  });
  ctx.drawImage(entry.canvas, entry.dx, entry.dy);
  ctx.drawImage(img, -halfW, -halfH, f.noteW, f.noteH);
}

function drawNoteFloater(f, halfW, halfH, shadowScale, r) {
  const shadowLayers = [
    { x: 3, y: 3, blur: 8, a: 0.1 },
    { x: 11, y: 11, blur: 15, a: 0.09 },
    { x: 24, y: 24, blur: 20, a: 0.05 },
    { x: 43, y: 42, blur: 24, a: 0.01 },
    { x: 66, y: 66, blur: 26, a: 0.0 },
  ];
  drawNoteShadowCached(f, halfW, halfH, shadowScale, shadowLayers, r);

  drawRoundedRectPath(-halfW, -halfH, f.noteW, f.noteH, r);
  ctx.fillStyle = f.noteColor || DEFAULT_NOTE_COLOR;
  ctx.fill();

  const overlay = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
  overlay.addColorStop(0, "rgba(0, 0, 0, 0.20)");
  overlay.addColorStop(1, "rgba(255, 255, 255, 0.20)");
  ctx.fillStyle = overlay;
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  drawRoundedRectPath(-halfW, -halfH, f.noteW, f.noteH, r);
  ctx.stroke();

  if (sim.noisePattern && settings.noteNoise > 0) {
    ctx.save();
    drawRoundedRectPath(-halfW, -halfH, f.noteW, f.noteH, r);
    ctx.clip();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = settings.noteNoise;
    ctx.fillStyle = sim.noisePattern;
    ctx.fillRect(-halfW, -halfH, f.noteW, f.noteH);
    ctx.restore();
  }

  if (f.text && f.text.trim().length > 0) {
    drawNoteText(f, halfW, halfH, r);
  }
}

function drawLeafPath(halfW, halfH) {
  drawLeafPathCtx(ctx, halfW, halfH);
}

function drawLeafFloater(f, halfW, halfH, shadowScale) {
  const shadowLayers = [
    { x: 1, y: 1, blur: 2, a: 0.1 },
    { x: 3, y: 3, blur: 4, a: 0.09 },
    { x: 6, y: 8, blur: 6, a: 0.05 },
    { x: 11, y: 13, blur: 7, a: 0.01 },
    { x: 18, y: 21, blur: 8, a: 0.0 },
  ];
  const sprite = sim.itemSprites.leaf;
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    drawSpriteShadowed(sprite, f, halfW, halfH, shadowScale, shadowLayers, "leaf");
    return;
  }
  drawShapeShadowCached(f, halfW, halfH, shadowScale, shadowLayers, "leaf", drawLeafPathCtx);

  const fill = ctx.createLinearGradient(0, -halfH, 0, halfH);
  fill.addColorStop(0, "#A7D27F");
  fill.addColorStop(0.45, "#8AC16B");
  fill.addColorStop(1, "#6FAF59");
  ctx.fillStyle = fill;
  drawLeafPath(halfW, halfH);
  ctx.fill();

  ctx.strokeStyle = "rgba(103, 144, 70, 0.75)";
  ctx.lineWidth = Math.max(1, f.noteW * 0.02);
  ctx.beginPath();
  ctx.moveTo(0, -halfH * 0.9);
  ctx.lineTo(0, halfH * 0.95);
  ctx.stroke();
}

function drawFlowerFloater(f, halfW, halfH, shadowScale) {
  const shadowLayers = [
    { x: 1, y: 1, blur: 3, a: 0.1 },
    { x: 3, y: 3, blur: 5, a: 0.09 },
    { x: 8, y: 7, blur: 6, a: 0.05 },
    { x: 14, y: 12, blur: 7, a: 0.01 },
    { x: 21, y: 19, blur: 8, a: 0.0 },
  ];
  const sprite = sim.itemSprites.flower;
  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    drawSpriteShadowed(sprite, f, halfW, halfH, shadowScale, shadowLayers, "flower");
    return;
  }
  drawShapeShadowCached(f, halfW, halfH, shadowScale, shadowLayers, "flower", drawFlowerShadowShape);

  const petal = ctx.createRadialGradient(0, -halfH * 0.05, halfW * 0.15, 0, 0, halfW);
  petal.addColorStop(0, "rgba(255, 248, 235, 0.96)");
  petal.addColorStop(1, "rgba(240, 227, 196, 0.95)");
  ctx.fillStyle = petal;
  drawFlowerPath(halfW, halfH);
  ctx.fill();

  const core = ctx.createRadialGradient(0, 0, 1, 0, 0, halfW * 0.35);
  core.addColorStop(0, "#F7C06A");
  core.addColorStop(1, "rgba(243, 159, 70, 0.9)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, 0, halfW * 0.24, halfH * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlowerPath(halfW, halfH) {
  drawFlowerShadowShape(ctx, halfW, halfH);
}

function drawNoteText(f, halfW, halfH, r) {
  const text = f.text || "";
  const padding = Math.max(14, f.noteW * 0.12);
  const maxWidth = Math.max(20, f.noteW - padding * 2);
  const fontSize = Math.max(14, f.noteW * 0.18);
  const lineHeight = fontSize * 1.05;
  const maxLines = Math.max(1, Math.floor((f.noteH - padding * 2) / lineHeight));

  ctx.save();
  drawRoundedRectPath(-halfW, -halfH, f.noteW, f.noteH, r);
  ctx.clip();
  ctx.fillStyle = "rgba(0, 0, 0, 0.86)";
  ctx.font = `${fontSize}px Caveat, system-ui, sans-serif`;
  ctx.textBaseline = "top";

  const sourceLines = text.split(/\n/g);
  const wrapped = [];
  for (const sourceLine of sourceLines) {
    const words = sourceLine.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      wrapped.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        wrapped.push(line);
        line = words[i];
      }
    }
    wrapped.push(line);
  }

  const lines = wrapped.slice(0, maxLines);
  for (let i = 0; i < lines.length; i += 1) {
    const y = -halfH + padding + i * lineHeight;
    ctx.fillText(lines[i], -halfW + padding, y, maxWidth);
  }
  ctx.restore();
}

function drawRoundedRectPath(x, y, w, h, r) {
  drawRoundedRectPathCtx(ctx, x, y, w, h, r);
}

function scheduleNextFrame() {
  if (sim.paused) return;
  sim.rafId = requestAnimationFrame(frame);
}

function pauseSimulation() {
  sim.paused = true;
  if (sim.rafId) {
    cancelAnimationFrame(sim.rafId);
    sim.rafId = 0;
  }
}

function resumeSimulation() {
  sim.paused = false;
  sim.lastTime = performance.now();
  sim.frameDtEma = sim.targetFrameMs;
  sim.frameIndex = 0;
  scheduleNextFrame();
}

function frame(now) {
  if (sim.paused) return;
  const elapsedMs = now - sim.lastTime;
  if (elapsedMs < sim.targetFrameMs) {
    scheduleNextFrame();
    return;
  }

  sim.frameIndex += 1;
  sim.isIdle = now - sim.lastPointerMoveTime > sim.idleThresholdMs;

  sim.frameDtEma = sim.frameDtEma * 0.9 + elapsedMs * 0.1;
  const baseStep = Math.max(8, Math.floor(settings.ripplePixelSize));
  const overload = Math.max(0, sim.frameDtEma - sim.targetFrameMs);
  const adaptiveBoost = Math.min(10, Math.floor(overload / 2.2));
  sim.effectiveRippleStep = Math.min(24, baseStep + adaptiveBoost);

  const dt = Math.min(0.05, elapsedMs / 1000);
  sim.lastTime = now;
  sim.time += dt;

  processPointer(dt);
  const shouldUpdateRipples = !sim.isIdle || sim.frameIndex % 2 === 0;
  if (shouldUpdateRipples) updateRipples();
  updateRippleSources(dt);
  updateFloaters(dt);
  updateNatureArrivalPlan();
  resolveFloaterCollisions();
  refreshHoveredNote();
  updateCanvasCursor();

  ctx.clearRect(0, 0, sim.width, sim.height);
  refreshReflectionTextureFrame();
  drawReflectedSky();
  drawSunlightGradation();
  drawBottomOverlay();
  if (!sim.isIdle) {
    drawRippleHighlights();
  }
  drawVignette();
  drawFloaters();

  scheduleNextFrame();
}

function onPointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (!sim.pointer.initialized) {
    sim.pointer.px = x;
    sim.pointer.py = y;
    sim.pointer.initialized = true;
  }

  sim.pointer.x = x;
  sim.pointer.y = y;
  sim.lastPointerMoveTime = performance.now();
  sim.isIdle = false;
  refreshHoveredNote();
  updateCanvasCursor();
}

function bindControls() {
  for (const config of sliderConfig) {
    const input = document.getElementById(config.id);
    const valueEl = document.getElementById(config.valueId);
    if (!input || !valueEl) continue;

    const update = () => {
      const value = Number(input.value);
      settings[config.key] = value;
      valueEl.textContent = config.format(value);
      if (config.onChange) config.onChange(value);
    };

    input.addEventListener("input", update);
    update();
  }
}

function setSettingsView(view) {
  const root = document.getElementById("settings-root-view");
  const pond = document.getElementById("pond-settings-view");
  if (!root || !pond) return;
  const showPond = view === "pond";
  root.classList.toggle("is-active", !showPond);
  pond.classList.toggle("is-active", showPond);
}

function bindControlsToggle() {
  const controls = document.querySelector(".controls");
  const toggle = document.getElementById("settings-button");
  if (!controls || !toggle) return;

  const setOpen = (open) => {
    controls.classList.toggle("is-collapsed", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      setSettingsView("root");
    }
  };

  toggle.addEventListener("click", () => {
    const isOpen = !controls.classList.contains("is-collapsed");
    setOpen(!isOpen);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (controls.classList.contains("is-collapsed")) return;
    if (controls.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
    }
  });
}

function bindSettingsNavigation() {
  const openPond = document.getElementById("open-pond-settings");
  const back = document.getElementById("back-to-settings-root");
  if (openPond) {
    openPond.addEventListener("click", () => {
      setSettingsView("pond");
    });
  }
  if (back) {
    back.addEventListener("click", () => {
      setSettingsView("root");
    });
  }
}

function bindAccountActions() {
  const login = document.getElementById("account-login");
  const updatePassword = document.getElementById("account-update-password");
  const logout = document.getElementById("account-logout");
  if (login) {
    login.addEventListener("click", () => {
      if (sim.openAuthModal) sim.openAuthModal("login");
    });
  }
  if (updatePassword) {
    updatePassword.addEventListener("click", () => {
      if (!sim.auth.loggedIn) {
        setAccountStatus("Please log in first.");
        return;
      }
      if (sim.openAuthModal) sim.openAuthModal("change-password");
    });
  }
  if (logout) {
    logout.addEventListener("click", () => {
      performLogout();
      setAccountStatus("Logged out. Guest mode is fully functional.");
    });
  }
}

function setAccountStatus(text) {
  const status = document.getElementById("account-status");
  if (status) status.textContent = text;
}

function refreshAccountUi() {
  const login = document.getElementById("account-login");
  const updatePassword = document.getElementById("account-update-password");
  const logout = document.getElementById("account-logout");
  const email = document.getElementById("account-email");
  if (email) {
    email.textContent = sim.auth.loggedIn
      ? `Email: ${sim.auth.email}`
      : "Email: not signed in (local prototype)";
  }
  if (login) login.hidden = sim.auth.loggedIn;
  if (updatePassword) updatePassword.hidden = !sim.auth.loggedIn;
  if (logout) logout.hidden = !sim.auth.loggedIn;
}

function isSupabaseReady() {
  return !!supabaseClient;
}

async function performLogin(user) {
  if (!user) return;
  sim.auth.loggedIn = true;
  sim.auth.email = user.email || "";
  sim.auth.userId = user.id || "";
  await setLoggedInScene(sim.auth.userId);
  syncNoteCountControl();
  refreshAccountUi();
  updateCanvasCursor();
  setAccountStatus("Signed in.");
}

function performGuestMode() {
  if (sim.auth.loggedIn && sim.auth.userId) {
    persistUserNotes(sim.auth.userId);
  }
  sim.auth.loggedIn = false;
  sim.auth.email = "";
  sim.auth.userId = "";
  initFloaters(settings.floaterCount, settings.natureCount);
  sim.noteEditMode = false;
  sim.hoveredNote = null;
  const editor = document.getElementById("note-editor");
  if (editor) {
    editor.classList.add("is-hidden");
    editor.setAttribute("aria-hidden", "true");
  }
  const noteModeBtn = document.getElementById("note-edit-button");
  if (noteModeBtn) noteModeBtn.setAttribute("aria-pressed", "false");
  syncNoteCountControl();
  refreshAccountUi();
  updateCanvasCursor();
}

async function performLogout() {
  if (isSupabaseReady()) {
    await supabaseClient.auth.signOut();
  }
  performGuestMode();
}

function bindAuthModal() {
  const modal = document.getElementById("auth-modal");
  const title = document.getElementById("auth-title");
  const subtitle = document.getElementById("auth-subtitle");
  const emailRow = document.getElementById("auth-email-row");
  const emailInput = document.getElementById("auth-email-input");
  const passwordInput = document.getElementById("auth-password-input");
  const newPasswordRow = document.getElementById("auth-new-password-row");
  const newPasswordInput = document.getElementById("auth-new-password-input");
  const status = document.getElementById("auth-status");
  const cancel = document.getElementById("auth-cancel-button");
  const submit = document.getElementById("auth-submit-button");
  if (
    !modal ||
    !title ||
    !subtitle ||
    !emailRow ||
    !emailInput ||
    !passwordInput ||
    !newPasswordRow ||
    !newPasswordInput ||
    !status ||
    !cancel ||
    !submit
  ) {
    return;
  }

  const setStatus = (text) => {
    status.textContent = text || " ";
  };

  const close = () => {
    modal.classList.add("is-hidden");
    modal.setAttribute("aria-hidden", "true");
  };

  const open = (mode) => {
    sim.authMode = mode === "change-password" ? "change-password" : "login";
    modal.classList.remove("is-hidden");
    modal.setAttribute("aria-hidden", "false");
    setStatus("");

  if (sim.authMode === "change-password") {
      title.textContent = "Change Password";
      subtitle.textContent = "Confirm current password, then set a new one.";
      emailRow.classList.remove("is-hidden");
      newPasswordRow.classList.remove("is-hidden");
      submit.textContent = "Update Password";
      emailInput.value = sim.auth.email || "";
      emailInput.disabled = true;
      passwordInput.value = "";
      newPasswordInput.value = "";
      setTimeout(() => passwordInput.focus(), 0);
      return;
    }

    title.textContent = "Log In";
    subtitle.textContent = "Use email + password. New email creates a local prototype account.";
    emailRow.classList.remove("is-hidden");
    newPasswordRow.classList.add("is-hidden");
    submit.textContent = "Continue";
    emailInput.disabled = false;
    emailInput.value = sim.auth.email || "";
    passwordInput.value = "";
    newPasswordInput.value = "";
    setTimeout(() => emailInput.focus(), 0);
  };

  cancel.addEventListener("click", close);

  submit.addEventListener("click", async () => {
    if (!isSupabaseReady()) {
      setStatus("Supabase key missing in app.js. Add publishable key first.");
      return;
    }

    if (sim.authMode === "change-password") {
      if (!sim.auth.loggedIn || !sim.auth.email) {
        setStatus("Please log in first.");
        return;
      }
      const currentPassword = passwordInput.value;
      const nextPassword = newPasswordInput.value;
      if (!currentPassword || !nextPassword) {
        setStatus("Enter current and new password.");
        return;
      }
      if (nextPassword.length < 4) {
        setStatus("New password must be at least 6 characters.");
        return;
      }

      const { error: reauthError } = await supabaseClient.auth.signInWithPassword({
        email: sim.auth.email,
        password: currentPassword,
      });
      if (reauthError) {
        setStatus("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabaseClient.auth.updateUser({ password: nextPassword });
      if (updateError) {
        setStatus(updateError.message || "Failed to update password.");
        return;
      }

      close();
      setAccountStatus("Password updated.");
      return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!email || !email.includes("@")) {
      setStatus("Enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (!loginError && loginData?.user) {
      close();
      await performLogin(loginData.user);
      return;
    }

    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    if (signUpError) {
      if ((signUpError.message || "").toLowerCase().includes("already registered")) {
        setStatus("Incorrect password for this email.");
      } else {
        setStatus(signUpError.message || "Sign up failed.");
      }
      return;
    }

    close();
    if (signUpData?.session?.user) {
      await performLogin(signUpData.session.user);
      setAccountStatus("Account created and signed in.");
      return;
    }

    setAccountStatus("Account created. Check your email, confirm, then log in.");
  });

  document.addEventListener("keydown", (event) => {
    if (modal.classList.contains("is-hidden")) return;
    if (event.key === "Escape") {
      close();
    }
  });

  sim.openAuthModal = open;
}

async function initializeAuthState() {
  if (!isSupabaseReady()) {
    performGuestMode();
    setAccountStatus("Guest mode active. Add Supabase publishable key in app.js to enable login.");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (!error && data?.session?.user) {
    await performLogin(data.session.user);
    return;
  }

  performGuestMode();
  setAccountStatus("Guest mode: fully functional. Log in to retain notes across revisits.");
}

function bindCreateButton() {
  const createBtn = document.getElementById("create-button");
  const editor = document.getElementById("note-editor");
  const sheet = document.querySelector(".note-editor-sheet");
  const input = document.getElementById("note-editor-input");
  const discard = document.getElementById("note-discard-button");
  const confirm = document.getElementById("note-confirm-button");
  const swatches = Array.from(document.querySelectorAll(".note-color-swatch"));
  if (!createBtn || !editor || !sheet || !input || !discard || !confirm) return;

  let selectedColor = DEFAULT_NOTE_COLOR;
  let editingNote = null;

  const setSelectedColor = (color) => {
    selectedColor = color;
    sheet.style.setProperty("--editor-note-color", color);
    for (const swatch of swatches) {
      const isActive = swatch.getAttribute("data-note-color") === color;
      swatch.classList.toggle("is-active", isActive);
      swatch.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  };

  const closeEditor = () => {
    editor.classList.add("is-hidden");
    editor.setAttribute("aria-hidden", "true");
    editingNote = null;
    refreshHoveredNote();
    updateCanvasCursor();
  };

  const openEditor = (note = null) => {
    editingNote = note && isEditableNote(note) ? note : null;
    setSelectedColor(editingNote?.noteColor || DEFAULT_NOTE_COLOR);
    input.value = editingNote?.text || "";
    editor.classList.remove("is-hidden");
    editor.setAttribute("aria-hidden", "false");
    setTimeout(() => input.focus(), 0);
  };

  const updateCountUI = () => {
    const countInput = document.getElementById("floater-count");
    const countValue = document.getElementById("floater-count-value");
    const next = getNoteCount();
    settings.floaterCount = next;
    if (countInput) countInput.value = String(next);
    if (countValue) countValue.textContent = String(next);
  };

  createBtn.addEventListener("click", () => {
    openEditor();
  });

  sim.openNoteEditor = (note) => {
    openEditor(note || null);
  };

  for (const swatch of swatches) {
    swatch.addEventListener("click", () => {
      const color = swatch.getAttribute("data-note-color") || DEFAULT_NOTE_COLOR;
      setSelectedColor(color);
    });
  }

  discard.addEventListener("click", () => {
    if (editingNote) {
      const idx = sim.floaters.indexOf(editingNote);
      if (idx >= 0) {
        sim.floaters.splice(idx, 1);
      }
      updateCountUI();
      if (sim.auth.loggedIn && sim.auth.userId) {
        persistUserNotes(sim.auth.userId);
      }
    }
    input.value = "";
    closeEditor();
  });

  confirm.addEventListener("click", () => {
    if (editingNote) {
      editingNote.text = input.value || "";
      editingNote.noteColor = selectedColor;
      invalidateShadowCache();
      if (sim.auth.loggedIn && sim.auth.userId) {
        persistUserNotes(sim.auth.userId);
      }
      closeEditor();
      return;
    }

    const countInput = document.getElementById("floater-count");
    const maxCount = countInput ? Number(countInput.max) : 30;
    if (getNoteCount() >= maxCount) {
      closeEditor();
      return;
    }

    const note = randomFloater(50, { kind: "note" });
    note.text = input.value || "";
    note.noteColor = selectedColor;
    invalidateShadowCache();
    note.x = sim.width * 0.5 + (Math.random() - 0.5) * 40;
    note.y = sim.height * 0.32 + (Math.random() - 0.5) * 40;
    note.vx = (Math.random() - 0.5) * 0.2;
    note.vy = (Math.random() - 0.5) * 0.2;
    sim.floaters.push(note);
    updateCountUI();
    if (sim.auth.loggedIn && sim.auth.userId) {
      persistUserNotes(sim.auth.userId);
    }
    input.value = "";
    closeEditor();
  });

  document.addEventListener("keydown", (event) => {
    if (editor.classList.contains("is-hidden")) return;
    if (event.key === "Escape") {
      closeEditor();
    }
  });
}

function bindReflectionPicker() {
  const input = document.getElementById("reflection-file");
  const uploadBtn = document.getElementById("reflection-upload-btn");
  const resetBtn = document.getElementById("reflection-reset-btn");
  const runtimeImg = document.getElementById("reflection-runtime");
  if (!input || !uploadBtn || !resetBtn || !runtimeImg) return;

  uploadBtn.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    setReflectionStatus(`Loading: ${file.name}`);
    if (sim.reflectionObjectUrl) {
      URL.revokeObjectURL(sim.reflectionObjectUrl);
      sim.reflectionObjectUrl = null;
    }

    clearGifPlayback();
    const lower = file.name.toLowerCase();
    const isGif = lower.endsWith(".gif") || (file.type && file.type.toLowerCase() === "image/gif");
    if (isGif) {
      (async () => {
        try {
          const ok = await loadGifPlayback(file);
          if (!ok) throw new Error("decoder-unavailable");
          sim.reflectionImage = null;
          runtimeImg.removeAttribute("src");
          applyReflectionTexture();
          const avg = sim.reflectionGif.frames.length
            ? (sim.reflectionGif.totalDuration / sim.reflectionGif.frames.length).toFixed(1)
            : "0";
          setReflectionStatus(
            `Reflection (GIF): ${file.name} | frames=${sim.reflectionGif.frames.length} | avg=${avg}ms`
          );
          input.value = "";
        } catch (_err) {
          const objectUrl = URL.createObjectURL(file);
          sim.reflectionObjectUrl = objectUrl;
          runtimeImg.onload = () => {
            sim.reflectionImage = runtimeImg;
            applyReflectionTexture();
            setReflectionStatus(`Reflection (GIF fallback): ${file.name}`);
            input.value = "";
          };
          runtimeImg.onerror = () => {
            runtimeImg.removeAttribute("src");
            setReflectionStatus("GIF failed to load");
            input.value = "";
          };
          runtimeImg.src = objectUrl;
        }
      })();
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    sim.reflectionObjectUrl = objectUrl;
    runtimeImg.onload = () => {
      sim.reflectionImage = runtimeImg;
      applyReflectionTexture();
      setReflectionStatus(`Reflection (Image): ${file.name}`);
      input.value = "";
    };
    runtimeImg.onerror = () => {
      runtimeImg.removeAttribute("src");
      setReflectionStatus("Failed to load image");
      input.value = "";
    };
    runtimeImg.src = objectUrl;
  });

  resetBtn.addEventListener("click", () => {
    clearGifPlayback();
    runtimeImg.removeAttribute("src");
    if (sim.reflectionObjectUrl) {
      URL.revokeObjectURL(sim.reflectionObjectUrl);
      sim.reflectionObjectUrl = null;
    }
    sim.reflectionImage = null;
    applyReflectionTexture();
    setReflectionStatus("Reflection: Generated sky");
  });
}

function bindBottomPicker() {
  const input = document.getElementById("bottom-file");
  const uploadBtn = document.getElementById("bottom-upload-btn");
  const resetBtn = document.getElementById("bottom-reset-btn");
  if (!input || !uploadBtn || !resetBtn) return;

  uploadBtn.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    setBottomStatus(`Loading: ${file.name}`);
    if (sim.bottomImage && sim.bottomImage.parentNode) {
      sim.bottomImage.parentNode.removeChild(sim.bottomImage);
    }
    if (sim.bottomObjectUrl) {
      URL.revokeObjectURL(sim.bottomObjectUrl);
      sim.bottomObjectUrl = null;
    }
    const img = new Image();
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.style.position = "fixed";
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.left = "-9999px";
    img.style.top = "-9999px";
    img.style.opacity = "0";
    img.style.pointerEvents = "none";
    document.body.appendChild(img);

    const objectUrl = URL.createObjectURL(file);
    sim.bottomObjectUrl = objectUrl;
    img.onload = () => {
      sim.bottomImage = img;
      setBottomStatus(`Pond floor: ${file.name}`);
      input.value = "";
    };
    img.onerror = () => {
      if (img.parentNode) img.parentNode.removeChild(img);
      setBottomStatus("Failed to load image");
      input.value = "";
    };
    img.src = objectUrl;
  });

  resetBtn.addEventListener("click", () => {
    if (sim.bottomImage && sim.bottomImage.parentNode) {
      sim.bottomImage.parentNode.removeChild(sim.bottomImage);
    }
    if (sim.bottomObjectUrl) {
      URL.revokeObjectURL(sim.bottomObjectUrl);
      sim.bottomObjectUrl = null;
    }
    sim.bottomImage = null;
    setBottomStatus("Pond floor: Off");
  });
}

function bindNoteEditModeButton() {
  const btn = document.getElementById("note-edit-button");
  if (!btn) return;

  const setMode = (next) => {
    sim.noteEditMode = !!next;
    btn.setAttribute("aria-pressed", sim.noteEditMode ? "true" : "false");
    if (!sim.noteEditMode) {
      sim.hoveredNote = null;
    }
    refreshHoveredNote();
    updateCanvasCursor();
  };

  btn.addEventListener("click", () => {
    setMode(!sim.noteEditMode);
  });
}

function bindSpritePickers() {
  const configs = [
    { kind: "leaf", label: "Leaf sprite" },
    { kind: "flower", label: "Flower sprite" },
  ];

  for (const cfg of configs) {
    const input = document.getElementById(`${cfg.kind}-sprite-file`);
    const uploadBtn = document.getElementById(`${cfg.kind}-sprite-upload-btn`);
    const resetBtn = document.getElementById(`${cfg.kind}-sprite-reset-btn`);
    if (!input || !uploadBtn || !resetBtn) continue;

    uploadBtn.addEventListener("click", () => {
      input.click();
    });

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      setSpriteStatus(cfg.kind, `Loading: ${file.name}`);
      if (sim.itemSpriteObjectUrls[cfg.kind]) {
        URL.revokeObjectURL(sim.itemSpriteObjectUrls[cfg.kind]);
        sim.itemSpriteObjectUrls[cfg.kind] = null;
      }

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        sim.itemSprites[cfg.kind] = img;
        sim.itemSpriteObjectUrls[cfg.kind] = objectUrl;
        invalidateShadowCache();
        setSpriteStatus(cfg.kind, `${cfg.label}: ${file.name}`);
        input.value = "";
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setSpriteStatus(cfg.kind, `Failed to load ${cfg.kind} image`);
        input.value = "";
      };
      img.src = objectUrl;
    });

    resetBtn.addEventListener("click", () => {
      if (sim.itemSpriteObjectUrls[cfg.kind]) {
        URL.revokeObjectURL(sim.itemSpriteObjectUrls[cfg.kind]);
        sim.itemSpriteObjectUrls[cfg.kind] = null;
      }
      sim.itemSprites[cfg.kind] = null;
      invalidateShadowCache();
      setSpriteStatus(cfg.kind, `${cfg.label}: Generated`);
    });
  }
}

function getFileNameFromPath(path) {
  if (!path) return "asset";
  const parts = path.split("/");
  return parts[parts.length - 1] || "asset";
}

async function loadBundledReflection() {
  const runtimeImg = document.getElementById("reflection-runtime");
  if (!runtimeImg) return;

  const path = DEFAULT_ASSETS.reflection;
  setReflectionStatus(`Loading default: ${getFileNameFromPath(path)}`);
  clearGifPlayback();
  if (sim.reflectionObjectUrl) {
    URL.revokeObjectURL(sim.reflectionObjectUrl);
    sim.reflectionObjectUrl = null;
  }

  try {
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) throw new Error("reflection fetch failed");
    const blob = await res.blob();
    const fileName = getFileNameFromPath(path);
    const fileType = blob.type || (fileName.toLowerCase().endsWith(".gif") ? "image/gif" : "");
    const file = new File([blob], fileName, { type: fileType });

    const isGif = fileName.toLowerCase().endsWith(".gif") || fileType.toLowerCase() === "image/gif";
    if (isGif) {
      const ok = await loadGifPlayback(file);
      if (ok) {
        sim.reflectionImage = null;
        runtimeImg.removeAttribute("src");
        applyReflectionTexture();
        const avg = sim.reflectionGif.frames.length
          ? (sim.reflectionGif.totalDuration / sim.reflectionGif.frames.length).toFixed(1)
          : "0";
        setReflectionStatus(
          `Reflection (default GIF): ${fileName} | frames=${sim.reflectionGif.frames.length} | avg=${avg}ms`
        );
        return;
      }
    }

    const objectUrl = URL.createObjectURL(blob);
    sim.reflectionObjectUrl = objectUrl;
    await new Promise((resolve, reject) => {
      runtimeImg.onload = resolve;
      runtimeImg.onerror = reject;
      runtimeImg.src = objectUrl;
    });
    sim.reflectionImage = runtimeImg;
    applyReflectionTexture();
    setReflectionStatus(`Reflection (default image): ${fileName}`);
  } catch (_err) {
    if (sim.reflectionObjectUrl) {
      URL.revokeObjectURL(sim.reflectionObjectUrl);
      sim.reflectionObjectUrl = null;
    }
    sim.reflectionImage = null;
    applyReflectionTexture();
    setReflectionStatus("Default reflection not found. Using generated sky.");
  }
}

async function loadBundledFloor() {
  const path = DEFAULT_ASSETS.floor;
  setBottomStatus(`Loading default: ${getFileNameFromPath(path)}`);
  if (sim.bottomImage && sim.bottomImage.parentNode) {
    sim.bottomImage.parentNode.removeChild(sim.bottomImage);
  }
  if (sim.bottomObjectUrl) {
    URL.revokeObjectURL(sim.bottomObjectUrl);
    sim.bottomObjectUrl = null;
  }

  let pendingImg = null;
  try {
    const img = new Image();
    pendingImg = img;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.style.position = "fixed";
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.left = "-9999px";
    img.style.top = "-9999px";
    img.style.opacity = "0";
    img.style.pointerEvents = "none";
    document.body.appendChild(img);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = path;
    });
    sim.bottomImage = img;
    setBottomStatus(`Pond floor (default): ${getFileNameFromPath(path)}`);
  } catch (_err) {
    if (pendingImg && pendingImg.parentNode) {
      pendingImg.parentNode.removeChild(pendingImg);
    }
    if (sim.bottomImage && sim.bottomImage.parentNode) {
      sim.bottomImage.parentNode.removeChild(sim.bottomImage);
    }
    sim.bottomImage = null;
    setBottomStatus("Default pond floor not found.");
  }
}

async function loadBundledSprite(kind) {
  const path = DEFAULT_ASSETS[kind];
  if (!path) return;
  setSpriteStatus(kind, `Loading default: ${getFileNameFromPath(path)}`);
  if (sim.itemSpriteObjectUrls[kind]) {
    URL.revokeObjectURL(sim.itemSpriteObjectUrls[kind]);
    sim.itemSpriteObjectUrls[kind] = null;
  }

  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = path;
    });
    sim.itemSprites[kind] = img;
    invalidateShadowCache();
    setSpriteStatus(kind, `${kind[0].toUpperCase() + kind.slice(1)} sprite (default): ${getFileNameFromPath(path)}`);
  } catch (_err) {
    sim.itemSprites[kind] = null;
    setSpriteStatus(kind, `Default ${kind} sprite not found.`);
  }
}

async function loadBundledAssets() {
  await Promise.all([loadBundledReflection(), loadBundledFloor(), loadBundledSprite("leaf"), loadBundledSprite("flower")]);
}

canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerdown", (event) => {
  if (sim.noteEditMode) {
    onPointerMove(event);
    const note = sim.hoveredNote || pickNoteAt(sim.pointer.x, sim.pointer.y);
    if (note && sim.openNoteEditor) {
      sim.openNoteEditor(note);
    }
    return;
  }

  sim.pointer.down = true;
  onPointerMove(event);
  const amount = 1.8 * settings.rippleStrength;
  splashAtWorld(sim.pointer.x, sim.pointer.y, amount);
  registerRippleSource(sim.pointer.x, sim.pointer.y, amount);
});
window.addEventListener("pointerup", () => {
  sim.pointer.down = false;
});
window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseSimulation();
  } else {
    resumeSimulation();
  }
});
window.addEventListener("beforeunload", () => {
  if (sim.auth.loggedIn && sim.auth.userId) {
    persistUserNotes(sim.auth.userId);
  }
  if (sim.graphicsWorker.worker) {
    sim.graphicsWorker.worker.terminate();
    sim.graphicsWorker.worker = null;
  }
});

bindControlsToggle();
bindSettingsNavigation();
bindAuthModal();
bindAccountActions();
bindCreateButton();
bindNoteEditModeButton();
initGraphicsWorker();
resize();
bindControls();
initializeAuthState();
bindReflectionPicker();
bindBottomPicker();
bindSpritePickers();
loadBundledAssets();
resumeSimulation();
