/**
 * ThreeVisualizer — the WebGL material yard.
 *
 * Every ledger material line is classified into a physically-dimensioned stack
 * (see visualizer/catalog.ts) and rendered the way it actually arrives on a job
 * site: lumber in banded bunks on 4x4 dunnage with sticker layers, sheet goods
 * in jittered piles, bags/pails/cartons/bundles on pallets, pipe in pyramids.
 * Per-piece geometry is THREE.InstancedMesh, so a 300-stud bunk is one draw
 * call. Layout is deterministic shelf-packing — stacks can never overlap, and a
 * seeded PRNG keyed on the item name keeps re-renders pixel-stable.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FramingIntent, MaterialItem } from "../types";
import {
  classifyMaterial, hashString, mulberry32, type StackSpec,
} from "./visualizer/catalog";
import {
  woodSideTexture, woodEndTexture, osbTexture, plywoodTexture,
  drywallFaceTexture, kraftTexture, shingleTexture, groundTexture, labelTexture,
} from "./visualizer/textures";

interface ThreeVisualizerProps {
  mode: "stack" | "build"; // build mode removed — yard renders regardless
  framingIntent: FramingIntent;
  materials: MaterialItem[];
  drywallOpacity: number;
  showOverlay?: boolean;
  onARReady?: (toggle: () => void) => void;
  onARSessionChange?: (active: boolean) => void;
}

interface TooltipData {
  title: string;
  qty: string;
  weight: string;
  layout: string;
}

interface BuiltUnit {
  group: THREE.Group;
  w: number;       // footprint along X (ft)
  d: number;       // footprint along Z (ft)
  topY: number;    // stack height, for label placement
  weight: number;  // lbs
  zone: number;    // packing order: lumber rows first, pallets later
  label: string;
  count: string;
}

const TRAILER_MAX_LBS = 11200;
const FT_TO_M = 0.3048;

// Wood base colors (textures tint from these)
const SPF_COLOR = 0xe6c79a;
const PT_COLOR = 0x7d9261;
const DUNNAGE_COLOR = 0x6e5430;
const PALLET_COLOR = 0x95764c;

// ── Shared material cache — keyed, never disposed (small bounded set) ──
const matCache = new Map<string, THREE.Material | THREE.Material[]>();
function getMat<T extends THREE.Material | THREE.Material[]>(key: string, build: () => T): T {
  let m = matCache.get(key);
  if (!m) { m = build(); matCache.set(key, m); }
  return m as T;
}

const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(opts);

function lumberMats(treated: boolean, seed: number): THREE.Material[] {
  const color = treated ? PT_COLOR : SPF_COLOR;
  const key = `lumber:${treated}:${seed % 5}`;
  return getMat(key, () => {
    const side = std({ map: woodSideTexture(color, 11 + (seed % 5)), roughness: 0.82 });
    const end = std({ map: woodEndTexture(color, 23 + (seed % 5)), roughness: 0.9 });
    return [side, side, side, side, end, end]; // box faces: ±x ±y = grain, ±z = end grain
  });
}

function sheetMats(surface: StackSpec["surface"]): THREE.Material[] {
  return getMat(`sheet:${surface}`, () => {
    let face: THREE.Material, edge: THREE.Material;
    if (surface === "drywall") {
      face = std({ map: drywallFaceTexture(), roughness: 0.95 });
      edge = std({ map: kraftTexture(3), roughness: 0.9 });
    } else if (surface === "plywood") {
      face = std({ map: plywoodTexture(5), roughness: 0.7 });
      edge = std({ color: 0xc9ab7c, roughness: 0.85 });
    } else if (surface === "cement") {
      face = std({ color: 0xb9bdc2, roughness: 0.97 });
      edge = std({ color: 0xa3a7ac, roughness: 0.97 });
    } else {
      face = std({ map: osbTexture(7), roughness: 0.78 });
      edge = std({ map: osbTexture(17), roughness: 0.85 });
    }
    return [edge, edge, face, face, edge, edge];
  });
}

const dunnageMat = () => getMat("dunnage", () => std({ map: woodSideTexture(DUNNAGE_COLOR, 71), roughness: 0.95 }));
const palletMat = () => getMat("pallet", () => std({ map: woodSideTexture(PALLET_COLOR, 73), roughness: 0.92 }));
const strapMat = () => getMat("strap", () => std({ color: 0x14181f, metalness: 0.65, roughness: 0.45 }));

function setShadows(o: THREE.Object3D) {
  o.castShadow = true;
  o.receiveShadow = true;
}

function tooltipUserData(spec: StackSpec, layout: string): TooltipData {
  return {
    title: spec.name,
    qty: `${spec.ledgerQty.toLocaleString()} ${spec.unit}`,
    weight: `${Math.round(spec.pieces * spec.pieceWeightLbs).toLocaleString()} lbs`,
    layout,
  };
}

// ══════════════════════════ STACK BUILDERS ══════════════════════════
// Each returns a group whose origin is the center of its ground footprint.

type Ctx = {
  rng: () => number;
  hits: THREE.Object3D[];
  disposables: { dispose: () => void }[];
};

function instancedBox(
  geo: THREE.BufferGeometry, mats: THREE.Material | THREE.Material[],
  count: number, data: TooltipData, ctx: Ctx,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mats, count);
  setShadows(mesh);
  mesh.userData = data;
  ctx.hits.push(mesh);
  ctx.disposables.push(geo, mesh); // mesh.dispose() frees the instance buffers
  return mesh;
}

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _scl = new THREE.Vector3(1, 1, 1);
const _col = new THREE.Color();

function setInstance(
  mesh: THREE.InstancedMesh, i: number,
  x: number, y: number, z: number,
  rotY = 0, sy = 1, tint = 1, warm = true,
) {
  _pos.set(x, y, z);
  _quat.setFromEuler(_eul.set(0, rotY, 0));
  _scl.set(1, sy, 1);
  mesh.setMatrixAt(i, _m4.compose(_pos, _quat, _scl));
  // Slight warm/cool per-piece variation sells "many real boards" at a glance
  _col.setRGB(tint, tint * (warm ? 0.992 : 1), tint * (warm ? 0.975 : 1.005));
  mesh.setColorAt(i, _col);
}

function addDunnage(group: THREE.Group, w: number, len: number, ctx: Ctx, alongX = false) {
  const geo = new THREE.BoxGeometry(alongX ? 0.29 : w + 0.15, 0.29, alongX ? len + 0.15 : 0.29);
  ctx.disposables.push(geo);
  [0.12, 0.5, 0.88].forEach((f) => {
    const block = new THREE.Mesh(geo, dunnageMat());
    const off = (alongX ? w : len) * (f - 0.5);
    block.position.set(alongX ? off : 0, 0.145, alongX ? 0 : off);
    setShadows(block);
    group.add(block);
  });
  return 0.29;
}

/** Dimensional lumber — banded bunks, dunnage, sticker layers, partial top row. */
function buildLumber(spec: StackSpec, ctx: Ctx): BuiltUnit {
  const { rng } = ctx;
  const gapX = 0.02, gapY = 0.006, stickerH = 1 / 12, STICKER_EVERY = 9;
  const wFt = spec.widthFt, tFt = spec.thickFt, len = spec.lengthFt;
  const perRow = Math.max(1, Math.floor(4.05 / (wFt + gapX)));
  const maxLayers = Math.max(2, Math.floor(3.9 / (tFt + gapY)));
  const perBunk = perRow * maxLayers;
  const bunkCount = Math.ceil(spec.pieces / perBunk);
  const bunkW = perRow * (wFt + gapX) - gapX;
  const bunkPitch = bunkW + 1.0;

  const yOf = (layer: number) =>
    0.29 + layer * (tFt + gapY) + Math.floor(layer / STICKER_EVERY) * (stickerH + gapY);

  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(wFt, tFt, len);
  const layersTotal = Math.ceil(spec.pieces / perRow);
  const data = tooltipUserData(
    spec,
    `${bunkCount > 1 ? `${bunkCount} bunks • ` : ""}${perRow} wide × ${Math.min(maxLayers, layersTotal)} high`,
  );
  const mesh = instancedBox(geo, lumberMats(spec.treated, hashString(spec.name)), spec.pieces, data, ctx);

  // Center-out column order so partial top layers cluster mid-bunk
  const colOrder = Array.from({ length: perRow }, (_, c) => c)
    .sort((a, b) => Math.abs(a - (perRow - 1) / 2) - Math.abs(b - (perRow - 1) / 2));

  let i = 0;
  let topY = 0;
  for (let b = 0; b < bunkCount; b++) {
    const bunkX = (b - (bunkCount - 1) / 2) * bunkPitch;
    const inBunk = Math.min(perBunk, spec.pieces - b * perBunk);
    const layers = Math.ceil(inBunk / perRow);
    const fullLayers = Math.floor(inBunk / perRow);

    for (let p = 0; p < inBunk; p++, i++) {
      const layer = Math.floor(p / perRow);
      const col = colOrder[p % perRow];
      const x = bunkX + (col - (perRow - 1) / 2) * (wFt + gapX) + (rng() - 0.5) * 0.012;
      const y = yOf(layer) + tFt / 2;
      const z = (rng() - 0.5) * 0.16;
      setInstance(mesh, i, x, y, z, (rng() - 0.5) * 0.006, 1, 0.92 + rng() * 0.14);
    }

    const bunkGrp = new THREE.Group();
    bunkGrp.position.x = bunkX;
    addDunnage(bunkGrp, bunkW, len, ctx);

    // Sticker rows every STICKER_EVERY layers (forklift gaps inside tall units)
    for (let s = 1; s <= Math.floor((layers - 1) / STICKER_EVERY); s++) {
      const sy = yOf(s * STICKER_EVERY) - (stickerH + gapY) / 2 - gapY / 2;
      const sGeo = new THREE.BoxGeometry(bunkW + 0.1, stickerH, 0.29);
      ctx.disposables.push(sGeo);
      [0.12, 0.5, 0.88].forEach((f) => {
        const st = new THREE.Mesh(sGeo, dunnageMat());
        st.position.set(0, sy, len * (f - 0.5));
        setShadows(st);
        bunkGrp.add(st);
      });
    }

    // Steel banding around the complete layers
    const bunkTop = yOf(layers - 1) + tFt;
    if (fullLayers >= 2) {
      const strapTop = yOf(fullLayers - 1) + tFt;
      const sGeoH = new THREE.BoxGeometry(bunkW + 0.07, 0.022, 0.07);
      const sGeoV = new THREE.BoxGeometry(0.022, strapTop - 0.29, 0.07);
      ctx.disposables.push(sGeoH, sGeoV);
      [-0.3, 0.3].forEach((f) => {
        const zPos = len * f;
        const top = new THREE.Mesh(sGeoH, strapMat());
        top.position.set(0, strapTop + 0.012, zPos);
        bunkGrp.add(top);
        [-1, 1].forEach((side) => {
          const v = new THREE.Mesh(sGeoV, strapMat());
          v.position.set(side * (bunkW / 2 + 0.012), 0.29 + (strapTop - 0.29) / 2, zPos);
          bunkGrp.add(v);
        });
      });
    }
    group.add(bunkGrp);
    topY = Math.max(topY, bunkTop);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  return {
    group, w: bunkCount * bunkPitch, d: len + 0.4, topY,
    weight: spec.pieces * spec.pieceWeightLbs, zone: 0,
    label: spec.label, count: `${spec.ledgerQty.toLocaleString()} ${spec.unit}`,
  };
}

/** Sheet goods — flat piles on dunnage with per-sheet jitter. */
function buildSheets(spec: StackSpec, ctx: Ctx): BuiltUnit {
  const { rng } = ctx;
  const t = spec.sheetThickFt, w = spec.sheetWFt, l = spec.sheetLFt;
  const maxLayers = Math.min(90, Math.max(8, Math.floor(3.0 / t)));
  const stacks = Math.ceil(spec.pieces / maxLayers);
  const pitch = w + 1.1;

  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, t, l);
  const data = tooltipUserData(spec, `${stacks > 1 ? `${stacks} piles • ` : ""}${w}×${l} ft sheets`);
  const mesh = instancedBox(geo, sheetMats(spec.surface), spec.pieces, data, ctx);

  let topY = 0;
  let i = 0;
  for (let s = 0; s < stacks; s++) {
    const sx = (s - (stacks - 1) / 2) * pitch;
    const inStack = Math.min(maxLayers, spec.pieces - s * maxLayers);
    const sub = new THREE.Group();
    sub.position.x = sx;
    addDunnage(sub, w, l, ctx);
    group.add(sub);
    for (let p = 0; p < inStack; p++, i++) {
      const y = 0.29 + p * t * 1.01 + t / 2;
      setInstance(
        mesh, i,
        sx + (rng() - 0.5) * 0.05, y, (rng() - 0.5) * 0.08,
        (rng() - 0.5) * 0.024, 1, 0.96 + rng() * 0.07, spec.surface !== "drywall",
      );
      topY = Math.max(topY, y + t / 2);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  return {
    group, w: stacks * pitch, d: l + 0.4, topY,
    weight: spec.pieces * spec.pieceWeightLbs, zone: 1,
    label: spec.label, count: `${spec.ledgerQty.toLocaleString()} ${spec.unit}`,
  };
}

/** GMA pallet (40"×48") — stringers + deck boards. Returns deck height. */
function addPallet(group: THREE.Group, ctx: Ctx, x = 0, z = 0): number {
  const W = 3.33, D = 4.0;
  const slatGeo = new THREE.BoxGeometry(W, 0.052, 0.46);
  const strGeo = new THREE.BoxGeometry(0.125, 0.29, D);
  ctx.disposables.push(slatGeo, strGeo);
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  [-W / 2 + 0.2, 0, W / 2 - 0.2].forEach((sx) => {
    const s = new THREE.Mesh(strGeo, palletMat());
    s.position.set(sx, 0.197, 0);
    setShadows(s);
    grp.add(s);
  });
  for (let k = 0; k < 5; k++) {
    const slat = new THREE.Mesh(slatGeo, palletMat());
    slat.position.set(0, 0.368, -D / 2 + 0.23 + k * ((D - 0.46) / 4));
    setShadows(slat);
    grp.add(slat);
  }
  group.add(grp);
  return 0.394;
}

interface PalletPlanItem { x: number; y: number; z: number; rotY: number }

/** Generic palletized goods: bags, cartons, bundles, buckets. */
function buildPalletized(spec: StackSpec, ctx: Ctx): BuiltUnit {
  const { rng } = ctx;
  const group = new THREE.Group();

  // Per-kind piece geometry, layer plan and material
  let pieceGeo: THREE.BufferGeometry;
  let mats: THREE.Material | THREE.Material[];
  let perPallet: number;
  let plan: (idx: number, deckY: number) => PalletPlanItem;
  let pieceH: number;
  let squash = false;

  if (spec.kind === "bag") {
    pieceH = 0.42;
    pieceGeo = new THREE.BoxGeometry(1.5, pieceH, 2.1);
    mats = getMat("bagMat", () => std({ map: kraftTexture(9), roughness: 0.92 }));
    perPallet = 40;
    squash = true;
    plan = (idx, deckY) => {
      const layer = Math.floor(idx / 4), p = idx % 4;
      const rot = layer % 2 === 0 ? 0 : Math.PI / 2;
      const px = (p % 2 === 0 ? -0.78 : 0.78), pz = p < 2 ? -1.0 : 1.0;
      const [x, z] = rot === 0 ? [px, pz] : [pz * 0.78, px * 1.0];
      return { x, y: deckY + layer * (pieceH * 0.92) + pieceH / 2, z, rotY: rot + (rng() - 0.5) * 0.1 };
    };
  } else if (spec.kind === "bundle") {
    pieceH = 0.33;
    pieceGeo = new THREE.BoxGeometry(1.0, pieceH, 3.05);
    mats = getMat("bundleMat", () => std({ map: shingleTexture(4), roughness: 0.96 }));
    perPallet = 42;
    plan = (idx, deckY) => {
      const layer = Math.floor(idx / 3), p = idx % 3;
      return {
        x: (p - 1) * 1.06 + (layer % 2 === 0 ? 0.03 : -0.03),
        y: deckY + layer * (pieceH * 0.96) + pieceH / 2,
        z: (rng() - 0.5) * 0.08,
        rotY: (rng() - 0.5) * 0.03,
      };
    };
  } else if (spec.kind === "bucket") {
    pieceH = 1.21;
    pieceGeo = new THREE.CylinderGeometry(0.49, 0.46, pieceH, 18);
    mats = getMat(`bucketMat:${spec.tradeColor}`, () => {
      const side = std({ color: 0xe8e8ec, roughness: 0.5, metalness: 0.05 });
      const lid = std({ color: spec.tradeColor, roughness: 0.45 });
      return [side, lid, side];
    });
    perPallet = 36;
    plan = (idx, deckY) => {
      const layer = Math.floor(idx / 12), p = idx % 12;
      return {
        x: ((p % 3) - 1) * 1.06,
        y: deckY + layer * (pieceH + 0.02) + pieceH / 2,
        z: (Math.floor(p / 3) - 1.5) * 1.0,
        rotY: rng() * Math.PI,
      };
    };
  } else { // carton
    pieceH = 0.85;
    pieceGeo = new THREE.BoxGeometry(1.3, pieceH, 1.0);
    mats = getMat("cartonMat", () => std({ map: kraftTexture(21), roughness: 0.9 }));
    perPallet = 24;
    plan = (idx, deckY) => {
      const layer = Math.floor(idx / 6), p = idx % 6;
      return {
        x: ((p % 2) - 0.5) * 1.42 + (rng() - 0.5) * 0.05,
        y: deckY + layer * (pieceH + 0.005) + pieceH / 2,
        z: (Math.floor(p / 2) - 1) * 1.12 + (rng() - 0.5) * 0.05,
        rotY: (rng() - 0.5) * 0.06,
      };
    };
  }

  const pallets = Math.ceil(spec.pieces / perPallet);
  const pitch = 4.4;
  const data = tooltipUserData(spec, `${pallets} pallet${pallets > 1 ? "s" : ""}`);
  const mesh = instancedBox(pieceGeo, mats, spec.pieces, data, ctx);

  let topY = 0;
  let i = 0;
  for (let pl = 0; pl < pallets; pl++) {
    const px = (pl - (pallets - 1) / 2) * pitch;
    const deckY = addPallet(group, ctx, px, 0);
    const inPallet = Math.min(perPallet, spec.pieces - pl * perPallet);
    for (let p = 0; p < inPallet; p++, i++) {
      const pos = plan(p, deckY);
      setInstance(
        mesh, i, px + pos.x, pos.y, pos.z, pos.rotY,
        squash ? 0.88 + rng() * 0.18 : 1, 0.94 + rng() * 0.1,
      );
      topY = Math.max(topY, pos.y + pieceH / 2);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  return {
    group, w: pallets * pitch, d: 4.4, topY,
    weight: spec.pieces * spec.pieceWeightLbs, zone: 3,
    label: spec.label, count: `${spec.ledgerQty.toLocaleString()} ${spec.unit}`,
  };
}

/** Pipe / insulation rolls — pyramid courses on dunnage. */
function buildPyramid(spec: StackSpec, ctx: Ctx): BuiltUnit {
  const { rng } = ctx;
  const isPipe = spec.kind === "pipe";
  const r = isPipe ? Math.max(spec.widthFt / 2, 0.055) : 0.68;
  const len = isPipe ? spec.lengthFt : 3.9;
  const baseRow = isPipe ? Math.min(10, Math.max(3, Math.ceil(Math.sqrt(spec.pieces * 2)))) : 3;

  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, len, isPipe ? 12 : 18);
  geo.rotateX(Math.PI / 2); // axis along Z, like the lumber
  const mats = isPipe
    ? getMat("pipeMat", () => std({ color: 0xdde3e8, roughness: 0.35, metalness: 0.15 }))
    : getMat("rollMat", () => std({ color: 0xd98ba3, roughness: 0.55, metalness: 0.02 }));
  const data = tooltipUserData(spec, `${baseRow}-wide pyramid`);
  const mesh = instancedBox(geo, mats, spec.pieces, data, ctx);

  const baseW = baseRow * r * 2.02;
  addDunnage(group, baseW, len, ctx);

  let i = 0, row = 0, topY = 0;
  let remaining = spec.pieces;
  while (remaining > 0) {
    const inRow = Math.min(Math.max(1, baseRow - row), remaining);
    const y = 0.29 + r + row * r * 1.74;
    for (let p = 0; p < inRow; p++, i++) {
      const x = (p - (inRow - 1) / 2) * r * 2.02;
      setInstance(mesh, i, x, y, (rng() - 0.5) * 0.2, 0, 1, 0.95 + rng() * 0.08, false);
    }
    topY = y + r;
    remaining -= inRow;
    row = (row + 1) % baseRow;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  return {
    group, w: baseW + 0.4, d: len + 0.4, topY,
    weight: spec.pieces * spec.pieceWeightLbs, zone: 2,
    label: spec.label, count: `${spec.ledgerQty.toLocaleString()} ${spec.unit}`,
  };
}

/** Fallback — plywood supply crate with a trade-color stripe. */
function buildCrate(spec: StackSpec, ctx: Ctx): BuiltUnit {
  const group = new THREE.Group();
  const deckY = addPallet(group, ctx);
  const crateGeo = new THREE.BoxGeometry(2.7, 2.0, 3.4);
  const stripeGeo = new THREE.BoxGeometry(2.74, 0.34, 3.44);
  ctx.disposables.push(crateGeo, stripeGeo);

  const crate = new THREE.Mesh(crateGeo, getMat("crateMat", () => std({ map: plywoodTexture(29), roughness: 0.8 })));
  crate.position.set(0, deckY + 1.0, 0);
  setShadows(crate);
  crate.userData = tooltipUserData(spec, "palletized supply crate");
  ctx.hits.push(crate);
  group.add(crate);

  const stripe = new THREE.Mesh(
    stripeGeo,
    getMat(`stripe:${spec.tradeColor}`, () => std({ color: spec.tradeColor, roughness: 0.6 })),
  );
  stripe.position.set(0, deckY + 1.55, 0);
  group.add(stripe);

  return {
    group, w: 4.0, d: 4.4, topY: deckY + 2.0,
    weight: spec.pieceWeightLbs, zone: 4,
    label: spec.label, count: `${spec.ledgerQty.toLocaleString()} ${spec.unit}`,
  };
}

function buildStack(spec: StackSpec, ctx: Ctx): BuiltUnit {
  switch (spec.kind) {
    case "lumber": return buildLumber(spec, ctx);
    case "sheet": return buildSheets(spec, ctx);
    case "pipe":
    case "roll": return buildPyramid(spec, ctx);
    case "bag":
    case "bucket":
    case "carton":
    case "bundle": return buildPalletized(spec, ctx);
    default: return buildCrate(spec, ctx);
  }
}

/** Flatbed delivery trucks parked along the yard edge — one per 11,200 lbs. */
function buildTrucks(group: THREE.Group, cargoWeight: number, ctx: Ctx) {
  const truckCount = Math.min(3, Math.max(1, Math.ceil(cargoWeight / TRAILER_MAX_LBS)));
  const bodyMat = getMat("truckBody", () => std({ color: 0x2f6fd1, roughness: 0.35, metalness: 0.55 }));
  const bedMat = getMat("truckBed", () => std({ color: 0x1e293b, roughness: 0.72 }));
  const deckMat = getMat("truckDeck", () => std({ color: 0x475569, metalness: 0.4, roughness: 0.6 }));
  const glassMat = getMat("truckGlass", () => std({ color: 0xa5f3fc, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.3 }));
  const tireMat = getMat("truckTire", () => std({ color: 0x0c0f14, roughness: 0.95 }));

  const cabGeo = new THREE.BoxGeometry(5.5, 4.5, 6);
  const glassGeo = new THREE.BoxGeometry(4.8, 2.0, 0.1);
  const bedGeo = new THREE.BoxGeometry(5.5, 2.4, 8);
  const deckGeo = new THREE.BoxGeometry(6.2, 0.4, 12);
  const railGeo = new THREE.BoxGeometry(0.3, 1.8, 12);
  const tireGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.8, 14);
  ctx.disposables.push(cabGeo, glassGeo, bedGeo, deckGeo, railGeo, tireGeo);

  for (let t = 0; t < truckCount; t++) {
    const sub = new THREE.Group();
    sub.position.set(-12 + t * 16, 0, 0);
    group.add(sub);

    const cab = new THREE.Mesh(cabGeo, bodyMat);
    cab.position.set(0, 2.45, 0);
    setShadows(cab);
    sub.add(cab);

    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 3.2, 2.96);
    sub.add(glass);

    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(0, 1.4, -6.5);
    setShadows(bed);
    sub.add(bed);

    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, 1.8, -16);
    setShadows(deck);
    sub.add(deck);

    [-2.9, 2.9].forEach((rx) => {
      const rail = new THREE.Mesh(railGeo, bedMat);
      rail.position.set(rx, 2.4, -16);
      sub.add(rail);
    });

    ([[-2.9, 1.5], [2.9, 1.5], [-2.9, -3.5], [2.9, -3.5],
      [-3.2, -13], [3.2, -13], [-3.2, -17], [3.2, -17]] as const).forEach(([tx, tz]) => {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(tx, 1.0, tz);
      tire.castShadow = true;
      sub.add(tire);
    });
  }
}

// ══════════════════════════ COMPONENT ══════════════════════════

export default function ThreeVisualizer({
  materials,
  showOverlay = true,
  onARReady,
  onARSessionChange,
}: ThreeVisualizerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [totalWeight, setTotalWeight] = useState(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const yardGroupRef = useRef<THREE.Group | null>(null);
  const vehicleGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const hitMeshesRef = useRef<THREE.Object3D[]>([]);
  const disposablesRef = useRef<{ dispose: () => void }[]>([]);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const toggleARRef = useRef<(() => void) | undefined>(undefined);
  const yardSigRef = useRef<string | null>(null);

  // ── Scene bootstrap (once) ──
  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth || 600;
    const height = mountRef.current.clientHeight || 450;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810); // void black
    scene.fog = new THREE.FogExp2(0x050810, 0.011);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 400);
    camera.position.set(-22, 18, 38);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return; // WebGL unavailable (headless / unsupported GPU) — render nothing
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.xr.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 4;
    controls.maxDistance = 140;
    controls.target.set(0, 3, 0);
    controlsRef.current = controls;

    // Lighting — warm low sun + cool cosmic fill, tuned for ACES
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    scene.add(new THREE.HemisphereLight(0x9db8ff, 0x1a2238, 0.55));

    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(42, 55, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55;
    sun.shadow.camera.bottom = -55;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    rim.position.set(-35, 18, -28);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 200),
      std({ map: groundTexture(), roughness: 0.96, metalness: 0.04 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const grid = new THREE.GridHelper(160, 80, 0x1f2e4d, 0x0c1328);
    grid.position.y = 0.012;
    scene.add(grid);
    gridRef.current = grid;

    const yardGroup = new THREE.Group();
    scene.add(yardGroup);
    yardGroupRef.current = yardGroup;

    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);
    vehicleGroupRef.current = vehicleGroup;

    raycasterRef.current = new THREE.Raycaster();

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    });
    resizeObserver.observe(mountRef.current);

    renderer.setAnimationLoop(() => {
      if (controlsRef.current && !renderer.xr.isPresenting) controlsRef.current.update();
      if (sceneRef.current && cameraRef.current) renderer.render(sceneRef.current, cameraRef.current);
    });

    if (navigator.xr) {
      navigator.xr.isSessionSupported("immersive-ar")
        .then((supported) => { if (supported) onARReady?.(() => toggleARRef.current?.()); })
        .catch(() => {});
    }

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rebuild the yard whenever the ledger changes ──
  useEffect(() => {
    const yard = yardGroupRef.current;
    const vehicles = vehicleGroupRef.current;
    if (!yard || !vehicles) return;

    // Content signature over the fields that shape the yard. Re-renders with an
    // unchanged ledger (or price-only edits) skip the expensive rebuild — this
    // also guarantees the effect can never feed a re-render loop, since it only
    // does GPU work when the signature genuinely changes.
    const sig = materials
      .map((m) => `${m?.name}|${m?.quantity}|${m?.unit}|${m?.trade}`)
      .join("¦");
    if (yardSigRef.current === sig) return;
    yardSigRef.current = sig;

    // Tear down the previous yard
    hitMeshesRef.current = [];
    setTooltip(null);
    yard.clear();
    vehicles.clear();
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];

    const ctx: Ctx = { rng: () => 0, hits: hitMeshesRef.current, disposables: disposablesRef.current };

    // 1. Classify + build every material stack (seeded per item name)
    const units: BuiltUnit[] = [];
    materials.forEach((item) => {
      if (!item || (item.quantity ?? 0) <= 0) return;
      const spec = classifyMaterial(item);
      ctx.rng = mulberry32(hashString(spec.name + spec.kind));
      units.push(buildStack(spec, ctx));
    });

    // 2. Shelf-pack into aisled rows — overlap-free by construction
    const ROW_MAX_W = 50, AISLE = 6, GAP = 2.4;
    units.sort((a, b) => a.zone - b.zone || b.d - a.d);
    let cursorX = 0, rowZ = 0, rowDepth = 0, maxX = 0, maxZ = 0;
    const placed: { u: BuiltUnit; x: number; z: number }[] = [];
    units.forEach((u) => {
      if (cursorX > 0 && cursorX + u.w > ROW_MAX_W) {
        rowZ += rowDepth + AISLE;
        cursorX = 0;
        rowDepth = 0;
      }
      placed.push({ u, x: cursorX + u.w / 2, z: rowZ + u.d / 2 });
      cursorX += u.w + GAP;
      rowDepth = Math.max(rowDepth, u.d);
      maxX = Math.max(maxX, cursorX - GAP);
      maxZ = Math.max(maxZ, rowZ + rowDepth);
    });

    // 3. Mount centered on origin, with a floating label chip per stack
    placed.forEach(({ u, x, z }) => {
      u.group.position.set(x - maxX / 2, 0, z - maxZ / 2);
      const tex = labelTexture(u.label, u.count);
      const sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(sprMat);
      sprite.scale.set(5.4, 1.35, 1);
      sprite.position.set(0, u.topY + 1.5, 0);
      u.group.add(sprite);
      disposablesRef.current.push(tex, sprMat);
      yard.add(u.group);
    });

    // 4. Trucks + payload readout
    const weightSum = units.reduce((s, u) => s + u.weight, 0);
    if (units.length > 0) {
      vehicles.position.set(0, 0, -maxZ / 2 - 14);
      buildTrucks(vehicles, weightSum, ctx);
    }
    setTotalWeight(Math.round(weightSum));

    // 5. Frame the yard
    const cam = cameraRef.current, controls = controlsRef.current;
    if (cam && controls && !rendererRef.current?.xr.isPresenting) {
      const span = Math.max(maxX, maxZ, 14);
      const dist = Math.min(110, Math.max(20, span * 1.15));
      controls.target.set(0, 2, 0);
      cam.position.set(-dist * 0.52, dist * 0.55, dist * 0.85);
      controls.update();
    }
  }, [materials]);

  // ── WebXR AR session toggle ──
  const toggleAR = async () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene || !navigator.xr) return;

    if (xrSessionRef.current) {
      xrSessionRef.current.end();
      return;
    }
    try {
      const session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
      });
      await renderer.xr.setSession(session);
      xrSessionRef.current = session;
      onARSessionChange?.(true);

      // Let the real world show through; scale scene-feet → XR meters
      if (groundRef.current) groundRef.current.visible = false;
      if (gridRef.current) gridRef.current.visible = false;
      if (vehicleGroupRef.current) vehicleGroupRef.current.visible = false;
      scene.background = null;
      scene.fog = null;
      yardGroupRef.current?.scale.setScalar(FT_TO_M);

      session.addEventListener("end", () => {
        xrSessionRef.current = null;
        onARSessionChange?.(false);
        if (groundRef.current) groundRef.current.visible = true;
        if (gridRef.current) gridRef.current.visible = true;
        if (vehicleGroupRef.current) vehicleGroupRef.current.visible = true;
        const s = sceneRef.current;
        if (s) {
          s.background = new THREE.Color(0x050810);
          s.fog = new THREE.FogExp2(0x050810, 0.011);
        }
        yardGroupRef.current?.scale.setScalar(1);
      });
    } catch (err) {
      console.error("AR session error:", err);
    }
  };
  // Keep the ref current so the async XR-support callback always sees the latest closure
  useEffect(() => { toggleARRef.current = toggleAR; });

  // ── Hover raycast → structured tooltip ──
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const raycaster = raycasterRef.current;
    const camera = cameraRef.current;
    const mount = mountRef.current;
    if (!raycaster || !camera || !mount || hitMeshesRef.current.length === 0) {
      setTooltip(null);
      return;
    }
    const rect = mount.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = raycaster.intersectObjects(hitMeshesRef.current, false)[0];
    const data = hit?.object.userData as TooltipData | undefined;
    if (data?.title) {
      setTooltip(data);
      setTooltipPos({
        x: Math.min(e.clientX - rect.left + 16, rect.width - 230),
        y: Math.max(e.clientY - rect.top - 12, 8),
      });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing rounded-xl overflow-hidden shadow-inner border border-soft-violet/20 bg-void-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Yard metrics overlay — hidden in mini mode */}
      {showOverlay && (
        <div className="absolute top-4 left-4 bg-deep-navy/90 border border-white/10 px-3 py-2 rounded-lg text-mini backdrop-blur-md pointer-events-none space-y-1">
          <div className="flex items-center gap-1.5 text-live-emerald text-micro font-extrabold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-live-emerald animate-pulse"></span>
            Material Yard
          </div>
          <div className="text-starlight/80">
            Cargo weight{" "}
            <span className="text-cool-blue font-bold font-mono">{totalWeight.toLocaleString()} lbs</span>
          </div>
          {totalWeight > TRAILER_MAX_LBS && (
            <div className="text-micro text-stale-amber font-bold">
              {Math.ceil(totalWeight / TRAILER_MAX_LBS)} flatbed loads required
            </div>
          )}
        </div>
      )}

      {/* Hover tooltip — structured, token-driven */}
      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-deep-navy/95 border border-soft-violet/40 px-3 py-2.5 rounded-lg shadow-xl backdrop-blur-md max-w-[230px]"
          style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
        >
          <div className="text-mini font-bold text-starlight leading-snug">{tooltip.title}</div>
          <div className="mt-1.5 space-y-0.5 text-micro text-starlight/70">
            <div>
              Quantity <span className="text-cool-blue font-bold font-mono">{tooltip.qty}</span>
            </div>
            <div>
              Est. weight <span className="text-cool-blue font-bold font-mono">{tooltip.weight}</span>
            </div>
            <div className="text-soft-violet">{tooltip.layout}</div>
          </div>
        </div>
      )}
    </div>
  );
}
