// infinityconsulting.co.kr hero scene.
//
// One object: the corporate mark, extruded from its traced outline and lit as
// the only light source. The sky is a painted backdrop, the land is a dark
// noise terrain that receives the mark's spill. No crystals, no grid, no
// badge. Colours come from tokens.css and are not redefined here except as
// the same hex values (WebGL has no access to CSS custom properties).

import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// ?ref=front|tq|side|back|top renders the mark alone on a neutral ground with
// flat light and no bloom: the views handed to an image-to-3D tool.
const REF_VIEW = new URLSearchParams(location.search).get("ref");
// Modelled assets, when they exist, replace the runtime geometry.
const MARK_GLB = "assets/infinity-mark.glb";
const TERRAIN_GLB = "assets/terrain.glb";
const MARK_GLOW = 0.4;      // emissive strength of the modelled mark, tinted by its own colour
const MARK_DOT_GLOW = 0.8;  // the dot glows a little more, like a lit bead
const MARK_WIDTH = 2.7;     // scene units the mark is scaled to, whatever the model file's size
const MARK_COPY_GAP = 0.1;  // share of the window width kept clear between the mark and the copy
const MARK_MAX_SCALE_ABOVE = 0.8; // largest the mark gets when the copy sits below it
// the mark's own warm spill: just below its lower edge, so it warms the ground and only
// grazes the mark (level with the mark it burned the cream corner out to white)
const SPILL_DROP = 1.6, SPILL_FORWARD = 0.9, SPILL_POWER = 10;

const TOKENS = {
  night: "#16181B", ground: "#111316", smoke: "#2A211C", ember: "#4A2A14",
  sun: "#FBD734", amber: "#F4A254", flame: "#E94B39",
  paper: "#FAF9F7", ridgeBack: "#1A1917", ridgeFront: "#0E1013",
};
const RISE_MS = 1600;
const IDLE_PERIOD_S = 14;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || Boolean(REF_VIEW);

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);

// ── backdrop: gradient sky, faint stars, two ridge lines ───────────────────
// Painted on a 2D canvas at the viewport's aspect and used as the scene
// background, so the horizon lands at a fixed screen fraction regardless of
// camera. Redrawn on resize.
const backdrop = document.createElement("canvas");
const backdropTexture = new THREE.CanvasTexture(backdrop);
backdropTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = REF_VIEW ? new THREE.Color("#D9D9D9") : backdropTexture;

let seed = 7;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function valueNoise1D(x, salt) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
function ridge(ctx, w, h, baseY, amp, freq, salt, colour) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) {
    const n = 0.6 * valueNoise1D(x / w * freq, salt) + 0.3 * valueNoise1D(x / w * freq * 2.1, salt + 1) + 0.1 * valueNoise1D(x / w * freq * 4.3, salt + 2);
    ctx.lineTo(x, baseY - n * amp);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}
function drawBackdrop(width, height) {
  const w = Math.min(2048, Math.round(width));
  const h = Math.round(w * height / width);
  backdrop.width = w; backdrop.height = h;
  const ctx = backdrop.getContext("2d");
  const horizon = 0.56 * h;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.00, TOKENS.night);
  sky.addColorStop(0.36, TOKENS.smoke);
  sky.addColorStop(0.53, TOKENS.ember);
  sky.addColorStop(0.565, TOKENS.ground);
  sky.addColorStop(1.00, TOKENS.ground);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // the mark's light on the sky behind it: one soft amber pool, low alpha
  const pool = ctx.createRadialGradient(0.42 * w, horizon, 0, 0.42 * w, horizon, 0.36 * w);
  pool.addColorStop(0, "rgba(244,162,84,0.14)");
  pool.addColorStop(0.5, "rgba(244,162,84,0.04)");
  pool.addColorStop(1, "rgba(244,162,84,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);

  seed = 7;
  for (let i = 0; i < 260; i += 1) {
    const x = rand() * w, y = rand() * horizon * 0.8;
    const r = 0.6 + rand() * 0.9;
    ctx.fillStyle = `rgba(250,249,247,${0.15 + rand() * 0.45})`;
    ctx.beginPath(); ctx.arc(x, y, r * (w / 1600), 0, Math.PI * 2); ctx.fill();
  }

  ridge(ctx, w, h, horizon - 0.02 * h, 0.13 * h, 3.0, 11, TOKENS.ridgeBack);
  // the thin horizon light sits between the two ridges
  ctx.fillStyle = "rgba(244,162,84,0.35)";
  ctx.fillRect(0, horizon - 1, w, 2);
  ridge(ctx, w, h, horizon + 0.03 * h, 0.09 * h, 4.2, 23, TOKENS.ridgeFront);

  backdropTexture.needsUpdate = true;
}

// ── terrain: dark faceted ground that receives the mark's spill ───────────
function noise2D(x, y) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (h(i, j) * (1 - ux) + h(i + 1, j) * ux) * (1 - uy) + (h(i, j + 1) * (1 - ux) + h(i + 1, j + 1) * ux) * uy;
}
function fbm(x, y) {
  return 0.5 * noise2D(x, y) + 0.25 * noise2D(x * 2.1, y * 2.1) + 0.125 * noise2D(x * 4.3, y * 4.3) + 0.0625 * noise2D(x * 8.9, y * 8.9);
}
const terrainGeometry = new THREE.PlaneGeometry(48, 30, 192, 120);
{
  const pos = terrainGeometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i);
    const distance = Math.hypot(x * 0.9, y + 6) / 10; // flatter under the mark, rougher far away
    const height = (fbm(x * 0.16 + 3.1, y * 0.16 + 5.7) - 0.45) * (1.0 + 1.6 * distance);
    pos.setZ(i, height);
  }
  terrainGeometry.computeVertexNormals();
}
const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({ color: TOKENS.ground, roughness: 0.94, metalness: 0.0, flatShading: true }),
);
terrain.rotation.x = -Math.PI / 2;
terrain.position.set(0, -2.15, -3);
if (!REF_VIEW) scene.add(terrain);

async function loadModelledTerrain(url) {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse((node) => {
    if (node.isMesh) node.material = terrain.material;   // the page owns the ground colour
  });
  gltf.scene.position.copy(terrain.position);
  scene.remove(terrain);
  scene.add(gltf.scene);
}

// ── light: a quiet key, a warm rim, and the mark's own spill ──────────────
scene.add(new THREE.HemisphereLight(TOKENS.smoke, TOKENS.ground, 0.5));
const key = new THREE.DirectionalLight(TOKENS.paper, 1.1);
key.position.set(-5, 7, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(TOKENS.amber, 0.7);
rim.position.set(5, 2, -6);
scene.add(rim);
const spill = new THREE.PointLight(TOKENS.amber, 10, 12, 2);
scene.add(spill);
if (REF_VIEW) {
  // even, shadowless light so the silhouette and colours read without mood
  scene.add(new THREE.HemisphereLight("#ffffff", "#bbbbbb", 1.6));
  key.intensity = 0.8; rim.intensity = 0; spill.intensity = 0;
}

// ── the mark ──────────────────────────────────────────────────────────────
const mark = new THREE.Group();
scene.add(mark);
const sun = new THREE.Color(TOKENS.sun), amber = new THREE.Color(TOKENS.amber), flame = new THREE.Color(TOKENS.flame);

function gradientColour(t, target) {
  if (t < 0.5) target.lerpColors(sun, amber, t / 0.5);
  else target.lerpColors(amber, flame, (t - 0.5) / 0.5);
  return target;
}

async function loadSvg(id, fallback) {
  const inline = document.getElementById(id);
  if (inline && inline.textContent.trim().length > 0) return inline.textContent;
  const src = (inline && inline.dataset.src) || fallback;
  const response = await fetch(src);
  if (!response.ok) throw new Error(`${src} ${response.status}`);
  return response.text();
}

function extrudeSvg(svgText, options) {
  const data = new SVGLoader().parse(svgText);
  const geometries = [];
  for (const path of data.paths) {
    for (const shape of SVGLoader.createShapes(path)) {
      geometries.push(new THREE.ExtrudeGeometry(shape, options));
    }
  }
  return geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
}

// The mark is two bodies traced from the artwork: the saturated gradient band
// and the pale cream panels inside the fold. Both share one bounding box so
// the gradient and the centring agree, and the band stands proud of the panels.
function buildMark(strongSvg, paleSvg) {
  const band = extrudeSvg(strongSvg, { depth: 120, bevelEnabled: true, bevelThickness: 22, bevelSize: 16, bevelSegments: 4, curveSegments: 14 });
  const panels = extrudeSvg(paleSvg, { depth: 70, bevelEnabled: true, bevelThickness: 14, bevelSize: 10, bevelSegments: 3, curveSegments: 14 });
  band.computeBoundingBox(); panels.computeBoundingBox();
  const box = band.boundingBox.clone().union(panels.boundingBox);
  const width = box.max.x - box.min.x, height = box.max.y - box.min.y;

  const colourise = (geometry, mix) => {
    const pos = geometry.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const u = (pos.getX(i) - box.min.x) / width;   // left → right
      const v = (pos.getY(i) - box.min.y) / height;  // SVG y grows downward: 0 = top
      const t = Math.min(1, Math.max(0, 0.62 * u + 0.38 * v));
      mix(gradientColour(t, c));
      colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  };
  const cream = new THREE.Color("#FDF5D2");
  colourise(band, () => {});
  colourise(panels, (c) => c.lerp(cream, 0.82)); // cream carrying a hint of the band's hue

  // emissive follows the vertex gradient, so bloom lifts each colour as itself
  const glow = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;",
    );
  };
  const bandMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.22, roughness: 0.34,
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.2,
  });
  bandMaterial.onBeforeCompile = glow;
  const panelMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.05, roughness: 0.55,
    emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.06,
  });
  panelMaterial.onBeforeCompile = glow;

  const centre = box.getCenter(new THREE.Vector3());
  band.translate(-centre.x, -centre.y, -60);
  panels.translate(-centre.x, -centre.y, -35);
  const scale = MARK_WIDTH / width;
  const body = new THREE.Group();
  body.add(new THREE.Mesh(band, bandMaterial), new THREE.Mesh(panels, panelMaterial));
  body.scale.set(scale, -scale, scale); // flip SVG's downward y
  mark.add(body);
}

async function loadModelledMark(input) {   // a URL, or the bytes of a GLB
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);
  loader.register((parser) => {
    // embedded textures arrive as blob: URLs; load them through <img> (not fetch()), and let
    // one that still fails resolve to nothing so the file's vertex colours take over instead
    // of the whole mark failing to load
    parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: "infinity_soft_textures", loadTexture: (index) => parser.loadTexture(index).catch(() => null) };
  });
  const gltf = typeof input === "string" ? await loader.loadAsync(input) : await loader.parseAsync(input, "");
  const body = gltf.scene;
  // the model's colour texture (or, for older files, its vertex colours) drives base colour
  // and glow, so bloom lifts each colour as itself; a gloss layer in the file is kept
  body.traverse((node) => {
    if (!node.isMesh) return;
    const source = node.material;
    const texture = source.map ?? null;
    const vertexColours = !texture && Boolean(node.geometry.attributes.color);
    const material = new THREE.MeshPhysicalMaterial({
      map: texture, emissiveMap: texture, vertexColors: vertexColours,
      metalness: source.metalness ?? 0.2, roughness: source.roughness ?? 0.35,
      clearcoat: source.clearcoat ?? 0, clearcoatRoughness: source.clearcoatRoughness ?? 0,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: /panel/i.test(node.name) ? 0.06 : /dot/i.test(node.name) ? MARK_DOT_GLOW : MARK_GLOW,
    });
    if (vertexColours) {
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;",
        );
      };
    }
    node.material = material;
  });
  const box = new THREE.Box3().setFromObject(body);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  body.position.sub(centre);
  const holder = new THREE.Group();
  holder.add(body);
  holder.scale.setScalar(MARK_WIDTH / Math.max(size.x, 1e-6)); // the brief: model width 1.0 → MARK_WIDTH scene units
  markAspect = size.y / Math.max(size.x, 1e-6);
  mark.add(holder);
}

function inlineGlb(id) {
  // the single-file bundle carries the GLB as base64 in a script block; decode it here and
  // parse the bytes directly, because a data: URL would go through fetch(), which a strict
  // host (the claude.ai artifact viewer) refuses
  const block = document.getElementById(id);
  const text = block && block.textContent.trim();
  if (!text) return null;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function markFileExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    return false;
  }
}

function mergeGeometries(list) {
  // minimal merge for non-indexed extrude geometries sharing attribute layout
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let offset = 0;
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    position.set(ng.attributes.position.array, offset * 3);
    normal.set(ng.attributes.normal.array, offset * 3);
    uv.set(ng.attributes.uv.array, offset * 2);
    offset += ng.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}

// ── post: bloom lifts only the mark ───────────────────────────────────────
// The hero renders through this chain, whose buffers the canvas's own antialias flag never
// reaches, so the scene buffer is multisampled itself (4x) to keep the mark's edges smooth,
// also while it turns. The output pass does not swap buffers, so only that one buffer is
// ever allocated.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.32, 0.86);
composer.addPass(bloom);
const output = new OutputPass();
output.needsSwap = false;
composer.addPass(output);
// device pixels allowed for that buffer (about 160 MB at 4x); caps the pixel ratio on big screens
const MAX_BUFFER_PIXELS = 3.3e6;

// ── layout: where the mark and camera sit for this viewport ───────────────
// The CSS decides where the copy goes: beside the mark on wide windows, below it on narrow
// ones. The mark follows the copy's measured box, so the two never overlap at any size.
const layout = { markX: -0.9, markY: 0.95, markScale: 1, cameraY: 1.3, lookY: 0.7 };
let markAspect = 0.94;   // height / width of the mark; measured again when the model loads

const _ndc = new THREE.Vector3();
const _ray = new THREE.Vector3();
function screenToMarkPlane(sx, sy, width, height) {
  // where a screen pixel lands on the plane the mark stands in (z = 0)
  _ndc.set((sx / width) * 2 - 1, 1 - (sy / height) * 2, 0.5).unproject(camera);
  _ray.copy(_ndc).sub(camera.position);
  const t = -camera.position.z / _ray.z;
  return { x: camera.position.x + _ray.x * t, y: camera.position.y + _ray.y * t };
}

function applyLayout(width, height) {
  const copy = document.querySelector(".copy");
  const box = copy ? copy.getBoundingClientRect() : { left: 0.54 * width, top: height };
  const beside = box.left > 0.4 * width;
  layout.cameraY = beside ? 1.3 : 2.0;
  layout.lookY = beside ? 0.7 : 1.9;
  camera.aspect = width / height;
  camera.fov = beside ? 35 : 46;
  camera.updateProjectionMatrix();
  camera.position.set(0, layout.cameraY, 9.5);
  camera.lookAt(0, layout.lookY, 0);
  camera.updateMatrixWorld();
  if (beside) placeBesideCopy(width, height, box); else placeAboveCopy(width, height, box);
}

// Copy on the right: the mark's right edge stays MARK_COPY_GAP of the window width left of the
// copy, and the mark shrinks when the space there is narrow (tall windows).
function placeBesideCopy(width, height, box) {
  const middle = height / 2;
  const right = screenToMarkPlane(box.left - MARK_COPY_GAP * width, middle, width, height).x;
  const left = screenToMarkPlane(Math.max(24, 0.04 * width), middle, width, height).x;
  const preferred = width / height < 1.5 ? 0.9 : 1;
  layout.markScale = Math.min(preferred, (right - left) / MARK_WIDTH);
  layout.markX = right - (MARK_WIDTH / 2) * layout.markScale;
  layout.markY = 0.95;
}

// Copy at the bottom: the mark is centred in the space between the top bar and the headline,
// sized to fit it.
function placeAboveCopy(width, height, box) {
  const nav = document.querySelector(".nav");
  const top = (nav ? nav.getBoundingClientRect().bottom : 64) + 0.02 * height;
  const bottom = box.top - Math.max(24, 0.04 * height);
  const upper = screenToMarkPlane(width / 2, top, width, height);
  const lower = screenToMarkPlane(width / 2, bottom, width, height);
  const side = screenToMarkPlane(Math.max(16, 0.08 * width), (top + bottom) / 2, width, height);
  const fitHeight = (upper.y - lower.y) / (MARK_WIDTH * markAspect);
  const fitWidth = (2 * Math.abs(side.x)) / MARK_WIDTH;
  layout.markScale = Math.max(0.2, Math.min(MARK_MAX_SCALE_ABOVE, fitHeight, fitWidth));
  layout.markX = 0;
  layout.markY = (upper.y + lower.y) / 2;
}

const REF_CAMERAS = {
  front: [0, 0, 9], tq: [6.2, 3.0, 6.2], side: [9, 0, 0], back: [0, 0, -9], top: [0, 9, 0.001],
};
function applyReferenceLayout(width, height) {
  camera.aspect = width / height;
  camera.fov = 22;
  camera.updateProjectionMatrix();
  const [x, y, z] = REF_CAMERAS[REF_VIEW] || REF_CAMERAS.front;
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  layout.markX = 0; layout.markY = 0; layout.markScale = 1;
}

function resize() {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const budget = Math.max(1, Math.sqrt(MAX_BUFFER_PIXELS / (width * height)));
  const dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1.5 : 2, budget);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(dpr);   // the chain keeps its own ratio; left alone it rendered at 1x
  composer.setSize(width, height);
  bloom.resolution.set(width, height);
  if (REF_VIEW) applyReferenceLayout(width, height); else applyLayout(width, height);
  if (!REF_VIEW) drawBackdrop(width, height);
}

// ── motion: one rise, then a slow idle; pointer adds a little parallax ────
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
if (!reduceMotion) {
  window.addEventListener("pointermove", (event) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
let start = 0;

function pose(elapsedMs) {
  const rise = reduceMotion ? 1 : Math.min(1, elapsedMs / RISE_MS);
  const e = easeOut(rise);
  const t = elapsedMs / 1000;
  const idle = reduceMotion ? 0 : 1;
  pointer.x += (pointer.tx - pointer.x) * 0.04;
  pointer.y += (pointer.ty - pointer.y) * 0.04;

  const y = layout.markY - 0.9 * (1 - e) + idle * 0.06 * Math.sin(t * (2 * Math.PI / 4.8));
  mark.position.set(layout.markX, y, 0);
  mark.scale.setScalar(layout.markScale * (0.92 + 0.08 * e));
  mark.rotation.y = REF_VIEW ? 0 : -0.6 * (1 - e) + idle * 0.26 * Math.sin(t * (2 * Math.PI / IDLE_PERIOD_S)) + pointer.x * 0.12;
  mark.rotation.x = REF_VIEW ? 0 : idle * 0.07 * Math.sin(t * (2 * Math.PI / 9.7)) - pointer.y * 0.06;
  spill.position.set(layout.markX, y - SPILL_DROP * layout.markScale, SPILL_FORWARD);
  spill.intensity = REF_VIEW ? 0 : SPILL_POWER * (0.35 + 0.65 * e);
  return rise >= 1;
}

function render() {
  if (REF_VIEW) renderer.render(scene, camera); else composer.render();
}

function frame(now) {
  if (!start) start = now;
  pose(now - start);
  render();
  if (!reduceMotion) requestAnimationFrame(frame);
}

async function boot() {
  resize();
  window.addEventListener("resize", () => { resize(); if (reduceMotion) { pose(RISE_MS); render(); } });
  try {
    if (!REF_VIEW && await markFileExists(TERRAIN_GLB)) await loadModelledTerrain(TERRAIN_GLB);
    const inline = inlineGlb("mark-glb");
    if (inline) {
      await loadModelledMark(inline);
    } else if (await markFileExists(MARK_GLB)) {
      await loadModelledMark(MARK_GLB);
    } else {
      const [strong, pale] = await Promise.all([
        loadSvg("mark-strong", "assets/infinity-mark-strong.svg"),
        loadSvg("mark-pale", "assets/infinity-mark-pale.svg"),
      ]);
      buildMark(strong, pale);
    }
  } catch (error) {
    // The page still reads without the object; say so once for the operator.
    console.warn("mark could not be built", error && error.message);
  }
  // the mark's proportions are known now, and the web font changes the copy's box
  resize();
  if (document.fonts) document.fonts.ready.then(() => { resize(); if (reduceMotion) { pose(RISE_MS); render(); } });
  if (reduceMotion) { pose(RISE_MS); render(); return; }
  requestAnimationFrame(frame);
}
boot();
