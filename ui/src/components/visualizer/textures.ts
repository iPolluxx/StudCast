/**
 * Procedural canvas textures for the material yard. Everything is generated
 * once per (kind, seed) key and cached for the life of the app — these are
 * small canvases, and caching keeps rebuilds free of GPU churn.
 */
import * as THREE from "three";
import { mulberry32 } from "./catalog";

const cache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d")! };
}

function finish(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function cached(key: string, build: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let tex = cache.get(key);
  if (!tex) {
    tex = build();
    cache.set(key, tex);
  }
  return tex;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function shade(c: number, f: number): string {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((c & 0xff) * f));
  return `rgb(${r},${g},${b})`;
}

/** Longitudinal face grain — streaks, cathedral arcs, occasional knots. */
export function woodSideTexture(baseColor: number, seed = 1): THREE.CanvasTexture {
  return cached(`side:${baseColor}:${seed}`, () => {
    const { canvas, ctx } = makeCanvas(512, 128);
    const rng = mulberry32(seed);
    ctx.fillStyle = hex(baseColor);
    ctx.fillRect(0, 0, 512, 128);

    // Soft tonal bands along the grain
    for (let i = 0; i < 14; i++) {
      const y = rng() * 128;
      const h = 3 + rng() * 14;
      ctx.fillStyle = shade(baseColor, 0.86 + rng() * 0.26);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, y, 512, h);
    }
    ctx.globalAlpha = 1;

    // Fine grain lines with gentle wobble
    for (let i = 0; i < 26; i++) {
      const y0 = rng() * 128;
      ctx.strokeStyle = shade(baseColor, 0.55 + rng() * 0.25);
      ctx.globalAlpha = 0.18 + rng() * 0.2;
      ctx.lineWidth = 0.6 + rng() * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= 512; x += 32) {
        ctx.lineTo(x, y0 + Math.sin(x * 0.012 + rng() * 6) * (1.5 + rng() * 2.5));
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Knots: dark ellipse + halo ring
    const knots = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < knots; k++) {
      const kx = 40 + rng() * 432, ky = 20 + rng() * 88;
      const kr = 3 + rng() * 6;
      const grad = ctx.createRadialGradient(kx, ky, 0.5, kx, ky, kr * 2.2);
      grad.addColorStop(0, shade(baseColor, 0.32));
      grad.addColorStop(0.5, shade(baseColor, 0.55));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr * 2.2, kr * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(canvas, 1, 1);
  });
}

/** End grain — off-center growth rings + drying checks. */
export function woodEndTexture(baseColor: number, seed = 1): THREE.CanvasTexture {
  return cached(`end:${baseColor}:${seed}`, () => {
    const { canvas, ctx } = makeCanvas(64, 64);
    const rng = mulberry32(seed + 7);
    ctx.fillStyle = shade(baseColor, 1.04);
    ctx.fillRect(0, 0, 64, 64);
    const cx = 16 + rng() * 32, cy = 70 + rng() * 20; // pith below the face → shallow arcs
    for (let r = 4; r < 110; r += 3 + rng() * 3) {
      ctx.strokeStyle = shade(baseColor, 0.6 + rng() * 0.2);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = shade(baseColor, 0.35);
    for (let i = 0; i < 3; i++) { // drying checks
      ctx.beginPath();
      ctx.moveTo(rng() * 64, rng() * 64);
      ctx.lineTo(rng() * 64, rng() * 64);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return finish(canvas);
  });
}

/** OSB — pressed strand chips at random orientations. */
export function osbTexture(seed = 1): THREE.CanvasTexture {
  return cached(`osb:${seed}`, () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    const rng = mulberry32(seed + 13);
    ctx.fillStyle = "#c9a868";
    ctx.fillRect(0, 0, 256, 256);
    const tones = ["#b8945a", "#d9b97c", "#a9854e", "#cfae6e", "#937544", "#e0c490"];
    for (let i = 0; i < 420; i++) {
      ctx.save();
      ctx.translate(rng() * 256, rng() * 256);
      ctx.rotate(rng() * Math.PI);
      ctx.fillStyle = tones[Math.floor(rng() * tones.length)];
      ctx.globalAlpha = 0.5 + rng() * 0.4;
      const w = 14 + rng() * 30, h = 4 + rng() * 8;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    return finish(canvas);
  });
}

/** Plywood face — pale, tight grain. */
export function plywoodTexture(seed = 1): THREE.CanvasTexture {
  return cached(`ply:${seed}`, () => woodSideTexture(0xddc49a, seed + 31));
}

/** Drywall paper face — near-white with faint speckle. */
export function drywallFaceTexture(): THREE.CanvasTexture {
  return cached("gypface", () => {
    const { canvas, ctx } = makeCanvas(128, 128);
    const rng = mulberry32(99);
    ctx.fillStyle = "#d6dade";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = 200 + Math.floor(rng() * 40);
      ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.25)`;
      ctx.fillRect(rng() * 128, rng() * 128, 1.4, 1.4);
    }
    return finish(canvas);
  });
}

/** Kraft paper / cardboard — fibrous tan. */
export function kraftTexture(seed = 1): THREE.CanvasTexture {
  return cached(`kraft:${seed}`, () => {
    const { canvas, ctx } = makeCanvas(128, 128);
    const rng = mulberry32(seed + 41);
    ctx.fillStyle = "#b08d5f";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = `rgba(${120 + rng() * 60},${90 + rng() * 50},${50 + rng() * 30},0.25)`;
      ctx.lineWidth = 0.7;
      const y = rng() * 128;
      ctx.beginPath();
      ctx.moveTo(rng() * 128, y);
      ctx.lineTo(rng() * 128, y + rng() * 4 - 2);
      ctx.stroke();
    }
    return finish(canvas);
  });
}

/** Asphalt shingle bundle wrapper — granule speckle over charcoal. */
export function shingleTexture(seed = 1): THREE.CanvasTexture {
  return cached(`shingle:${seed}`, () => {
    const { canvas, ctx } = makeCanvas(128, 128);
    const rng = mulberry32(seed + 53);
    ctx.fillStyle = "#2e2c2a";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2400; i++) {
      const v = 30 + Math.floor(rng() * 70);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      ctx.fillRect(rng() * 128, rng() * 128, 1.2, 1.2);
    }
    return finish(canvas);
  });
}

/** Yard ground — dark graded asphalt with aggregate, cracks and faint stains. */
export function groundTexture(): THREE.CanvasTexture {
  return cached("ground", () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    const rng = mulberry32(2024);
    ctx.fillStyle = "#10172b"; // keeps the cosmic void palette underfoot
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 5200; i++) { // fine aggregate
      const v = Math.floor(rng() * 26);
      ctx.fillStyle = `rgb(${16 + v},${23 + v},${42 + v})`;
      ctx.fillRect(rng() * 512, rng() * 512, 1 + rng() * 1.6, 1 + rng() * 1.6);
    }
    for (let i = 0; i < 70; i++) { // coarser gravel
      const v = 14 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgba(${v + 14},${v + 22},${v + 44},0.8)`;
      ctx.beginPath();
      ctx.arc(rng() * 512, rng() * 512, 1.5 + rng() * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let c = 0; c < 7; c++) { // hairline cracks
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.8;
      let x = rng() * 512, y = rng() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 14; s++) {
        x += rng() * 30 - 15; y += rng() * 30 - 15;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let s = 0; s < 5; s++) { // faded oil stains
      const sx = rng() * 512, sy = rng() * 512, sr = 18 + rng() * 36;
      const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, sr);
      g.addColorStop(0, "rgba(2,4,10,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(canvas, 9, 9);
  });
}

/** Floating stack label — glass chip with title + qty, drawn at 2× for crispness. */
export function labelTexture(title: string, sub: string): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  // Glass chip
  ctx.fillStyle = "rgba(10,15,30,0.82)";
  ctx.strokeStyle = "rgba(110,181,255,0.55)"; // --color-cool-blue
  ctx.lineWidth = 2;
  const r = 22, x = 6, y = 14, w = 500, h = 100;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#e2e8f0"; // --color-starlight
  ctx.font = "800 38px Inter, sans-serif";
  ctx.fillText(title.toUpperCase().slice(0, 26), 256, 60);
  ctx.fillStyle = "#6eb5ff"; // --color-cool-blue
  ctx.font = "700 30px 'JetBrains Mono', monospace";
  ctx.fillText(sub, 256, 98);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex; // not cached — disposed with its sprite on rebuild
}
