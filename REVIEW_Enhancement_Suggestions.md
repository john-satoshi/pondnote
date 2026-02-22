# Floating Notes: Enhancement Review

**Reviewer role:** Senior Engineer + Product Designer
**Codebase:** Single-page vanilla JS app (index.html, style.css, app.js ~2,200 lines)
**Goal:** Make the experience engaging and fun without over-engineering, while fixing the performance issues that cause Chrome lag, fan spin, and overheating.

---

## Executive Summary

The pond concept is charming and the code is well-organized for a prototype. However, the single biggest problem is that the **water rendering loop** runs an expensive pixel-by-pixel canvas draw on every frame, which is what's causing the MacBook to overheat. Below are prioritized suggestions grouped into Performance, Product/UX, and Architecture (for future online deployment).

---

## Section 1: Performance (Critical)

These are the changes that will stop the overheating and lag. They should be done first.

### 1.1 Move Water Refraction to a WebGL Shader

**What it is now:** `drawReflectedSky()` (line ~1100) iterates over every pixel tile on the canvas every frame using a nested for-loop, sampling gradients and ripple sources per tile, then calling `ctx.drawImage()` thousands of times per frame. This is the primary CPU killer.

**What to do:** Replace the water refraction rendering with a WebGL fragment shader. The ripple height map (the `sim.current` Float32Array) can be uploaded as a texture to the GPU. The sky image becomes a second texture. The shader samples both and computes refraction in parallel on the GPU, which is what GPUs are literally designed for.

**Why it helps:** This moves the heaviest computation from the CPU's single thread to the GPU's thousands of parallel cores. Expect frame times to drop from ~30ms+ to under 5ms for the water layer alone. Fans will stop, battery drain will drop significantly.

**AI agent implementation notes:**
- Create a small WebGL helper that manages a fullscreen quad with two textures: `u_skyTexture` (the reflection image) and `u_rippleMap` (the height field).
- The fragment shader reads from `u_rippleMap` to compute a UV offset, then samples `u_skyTexture` at that offset. This replaces the entire `drawReflectedSky()` function.
- The ripple sources ring contour math (lines 1110-1127) can also move into the shader as uniform arrays.
- Keep the 2D canvas context for drawing floaters on top (overlay a 2D canvas over the WebGL canvas, or use `ctx.drawImage(webglCanvas, 0, 0)` to composite).
- The ripple simulation itself (the wave equation in `updateRipples()`) is fine on CPU since it operates on a coarse grid, but if you want extra headroom, it could also become a GPU compute pass later.

### 1.2 Cap the DPR More Aggressively on High-Res Displays

**What it is now:** `sim.dpr` is capped at 1.5 (line 100), which is reasonable. But on a Retina MacBook connected to a 4K or 5K external monitor, `window.devicePixelRatio` can be 2.0, and the canvas pixel count still gets large because the CSS dimensions grow with the monitor resolution.

**What to do:** Add a maximum canvas pixel budget. For example, cap total canvas pixels at roughly 2 million (about 1920x1080). If `width * height * dpr * dpr` exceeds this, reduce the DPR further. This is a common technique used by WebGL games.

**AI agent implementation notes:**
```js
const MAX_PIXELS = 2_073_600; // 1920*1080
const rawDpr = window.devicePixelRatio || 1;
const cssPixels = window.innerWidth * window.innerHeight;
const maxDpr = Math.sqrt(MAX_PIXELS / cssPixels);
sim.dpr = Math.max(1, Math.min(maxDpr, Math.min(1.5, rawDpr)));
```
Apply this in the `resize()` function. The water effect is blurry by nature, so users won't notice the lower internal resolution.

### 1.3 Throttle Ripple Simulation When Tab Is Not Focused

**What it is now:** `requestAnimationFrame` naturally pauses when the tab is hidden, but there's no explicit handling.

**What to do:** Use `document.visibilitychange` to fully pause the simulation loop when the tab is hidden. Also, when the user hasn't moved their pointer for more than 5 seconds, reduce the simulation to a "calm mode" that skips every other frame or reduces the ripple update frequency. This saves battery during idle time.

**AI agent implementation notes:**
- Add a `sim.idle` flag. Set it to true when no pointer movement has occurred for 5 seconds.
- In `frame()`, when idle, run `updateRipples()` every 2nd frame and skip `drawRingContours()` and `drawRippleHighlights()` entirely.
- On `visibilitychange` to "hidden", stop calling `requestAnimationFrame`. On "visible", restart the loop and reset `sim.lastTime` to avoid a massive dt spike.

### 1.4 Reduce Shadow Pass Complexity on Floaters

**What it is now:** Each note draws 5 shadow layers (lines 1279-1284), each with `ctx.filter = 'blur(...)'`. Canvas blur filters are very expensive on CPU-rendered canvases. With 6 demo notes + nature items, that is potentially 40+ blur operations per frame.

**What to do:** Pre-render shadows into offscreen canvases (one per floater size/color combo) and reuse them. Since note sizes and colors only change when the user adjusts settings, the shadow bitmaps can be cached and invalidated on settings change.

**AI agent implementation notes:**
- Create a `shadowCache` Map keyed by `${kind}_${noteW}_${noteH}_${noteColor}`.
- On first draw of a floater, render its shadow layers to an offscreen canvas, store the result.
- On subsequent frames, just `ctx.drawImage(cachedShadow, ...)` instead of re-running blur filters.
- Invalidate the cache when `settings.noteSize` changes or when a note's color changes.
- This alone could cut per-frame CPU time by 30-50% depending on floater count.

### 1.5 Use `OffscreenCanvas` for Noise Pattern and Sky Generation

**What it is now:** The noise pattern and sky texture are generated on the main thread.

**What to do:** Since these are one-time or infrequent operations, they're not the main bottleneck, but generating them on a Web Worker with `OffscreenCanvas` would prevent any startup jank and is good practice for when the app goes online.

**AI agent implementation notes:**
- This is lower priority. Only implement if the other changes are done and you want polish.
- The noise pattern (line 182-199) and sky generation (line 504-532) could move to a worker, posting the resulting ImageBitmap back.

---

## Section 2: Product / UX Enhancements

These make the experience more engaging and delightful without adding complexity.

### 2.1 Add Gentle Ambient Sound (Optional, User-Toggled)

**What:** A subtle water ambiance or soft wind sound, toggled via a small speaker icon. When the user creates a ripple by moving their cursor, a faint water "plop" could play.

**Why:** Sound is one of the most underrated engagement tools for meditative/ambient apps. It transforms the experience from "looking at a screen" to "being at a pond." Keep it opt-in so it doesn't surprise people.

**Implementation suggestion:** Use the Web Audio API with a short looping ambient track (can be a tiny MP3 under 100KB). On pointer splash, play a short plop sample with randomized pitch to avoid repetition. Add a mute/unmute toggle to the top action bar.

### 2.2 Add a Gentle "Drop" Animation When Notes Are Created

**What:** When a new note is confirmed, instead of appearing instantly at the center, animate it as if it's being dropped onto the pond surface. Have it start slightly scaled up, then scale down to normal size while creating a larger ripple splash at its landing point.

**Why:** This gives the action of creating a note a satisfying, tactile feeling that reinforces the pond metaphor.

**Implementation suggestion:** Add a `spawnAge` property to floaters. For the first ~0.5 seconds of its life, scale the note from 1.3x down to 1.0x using an ease-out curve. Fire a stronger `splashAtWorld()` at the note's position on creation.

### 2.3 Make Note Editing More Discoverable

**What it is now:** Users must click "Notes" to toggle edit mode, then click a note to edit it. This two-step process isn't immediately obvious.

**What to do:** Allow double-click (or long-press on mobile) on any note to open it directly for editing, regardless of whether "Notes" mode is active. Keep the "Notes" mode for power users who want to see the hover highlights, but make direct editing the primary path.

**Why:** Reduces friction. First-time users will try to click notes intuitively. Meeting them where they are makes the app feel more natural.

### 2.4 Add a Soft "Breathing" Idle Animation

**What:** When the pond is idle (no user interaction for 10+ seconds), have the notes very slowly drift apart and back together in a gentle breathing motion, and slightly increase the ambient ripple frequency.

**Why:** A completely still pond feels dead. Subtle life in the idle state makes the app feel alive and inviting when users glance at it.

**Implementation suggestion:** In the idle state, add a very slow sinusoidal force to each floater's velocity, with each note using a different phase offset so they don't all move in sync.

### 2.5 Keyboard Shortcut for Quick Note Creation

**What:** Let users press `N` (when no editor/modal is open) to open the note creation editor immediately.

**Why:** Power users and keyboard-oriented people will appreciate it. It makes the app feel snappy.

### 2.6 Time-of-Day Adaptive Sky Color

**What:** If using the generated sky (no custom reflection image), adjust the sky gradient based on the user's local time. Morning could be warm golden tones, midday bright blue (current), evening warm pinks/oranges, night deep blues.

**Why:** Makes the app feel personal and alive. Every time the user opens it, the pond looks slightly different based on when they visit.

**Implementation suggestion:** In `generateSkyTexture()`, use `new Date().getHours()` to pick from 4-5 gradient presets and interpolate between them.

---

## Section 3: Architecture for Online Deployment

These suggestions prepare the codebase for going live with user accounts and cross-device sync.

### 3.1 Extract the Simulation Into a Clean Module

**What it is now:** Everything lives in a single 2,200-line `app.js` with a global `sim` object and global functions.

**What to do:** Split into modules: `simulation.js` (wave equation, physics), `renderer.js` (all drawing), `floaters.js` (floater creation, collision), `auth.js` (authentication), `storage.js` (persistence), and `main.js` (initialization, event binding). Use ES modules with `import`/`export`.

**Why:** When you move to online auth (Firebase, Supabase, etc.), you'll need to swap out the storage and auth layers without touching the simulation code. Clean separation makes this possible without a rewrite.

### 3.2 Replace localStorage Auth with a Real Auth Provider

**What it is now:** Passwords are stored in plaintext in localStorage (line 1790: `users[email] !== currentPassword`). This is fine for a prototype but must be replaced before going live.

**What to do:** Use an auth provider like Firebase Auth, Supabase Auth, or Clerk. These handle password hashing, session tokens, email verification, and cross-device login out of the box.

**Why:** Security is non-negotiable for a live app. Rolling your own auth is almost always a mistake.

### 3.3 Move Note Persistence to a Cloud Database

**What it is now:** Notes are serialized to `localStorage` keyed by email (line 333-338).

**What to do:** Use a real-time database like Firebase Firestore or Supabase Postgres. Store notes as documents with fields for text, color, position, and a user ID foreign key. Sync changes on a debounced timer (e.g., save 2 seconds after the last change) rather than on every single note create/edit.

**Why:** Cross-device sync is the core promise of the online version. Real-time databases also enable future features like shared ponds or collaborative notes.

### 3.4 Add a Build Step

**What it is now:** Raw HTML/CSS/JS served directly.

**What to do:** Add Vite (or similar) for module bundling, tree-shaking, and minification. This also enables TypeScript if you want type safety, and makes it easy to import npm packages for auth, database SDKs, etc.

**Why:** A single 66KB JS file works for a prototype, but for production you want code splitting, cache busting, and minification. Vite has near-zero config and works well with vanilla JS projects.

### 3.5 Add Basic Analytics and Error Tracking

**What:** Add a lightweight analytics tool (like Plausible or PostHog) and an error tracker (like Sentry's free tier).

**Why:** Once real users are on the app, you need to know if the WebGL fallback is kicking in, if users are hitting errors, and which features are actually being used. Without this, you're flying blind.

---

## Section 4: Minor Code Quality Improvements

These are small things that improve maintainability.

### 4.1 The `r = 0` Corner Radius Is Unused

In `drawNoteFloater` (line 1243), `r` is hardcoded to 0, making `drawRoundedRectPath` just draw a rectangle. Either remove the rounded rect path function and use `ctx.fillRect` directly (slightly faster), or give notes a small corner radius for a softer look that better matches the "floating paper" aesthetic.

### 4.2 Remove Dead Shadow Layer Entries

In the shadow arrays (e.g., line 1284: `{ x: 66, y: 66, blur: 26, a: 0.0 }`), entries with `a: 0` are iterated but never drawn due to the `if (layer.a <= 0) continue` check. Remove them to keep the arrays clean.

### 4.3 Debounce the Resize Handler

`resize()` regenerates the sky texture and reallocates Float32Arrays. On window resize drag, this fires dozens of times. Debounce it with a 150ms delay so it only fires once the user finishes resizing.

### 4.4 Use `requestIdleCallback` for Note Persistence

`persistUserNotes()` serializes all notes and writes to localStorage synchronously. On every note creation, edit, and discard, this runs. Use `requestIdleCallback` or a debounce timer to batch these writes so they don't interrupt animation frames.

---

## Priority Order (Recommended)

1. **1.1 WebGL shader for water** (eliminates the overheating problem)
2. **1.4 Shadow caching** (big CPU savings, relatively simple)
3. **1.2 DPR pixel budget** (prevents issues on external monitors)
4. **1.3 Idle/visibility throttling** (saves battery)
5. **2.3 Direct note editing** (biggest UX win for minimal effort)
6. **2.2 Drop animation** (adds delight)
7. **3.1 Module extraction** (needed before any online work)
8. Everything else in parallel as needed

---

*Generated: February 22, 2026*
