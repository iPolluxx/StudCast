import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FramingIntent, MaterialItem } from "../types";

interface ThreeVisualizerProps {
  mode: "stack" | "build";
  framingIntent: FramingIntent;
  materials: MaterialItem[];
  drywallOpacity: number;
}

export default function ThreeVisualizer({
  mode,
  framingIntent,
  materials,
  drywallOpacity,
}: ThreeVisualizerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltipText, setTooltipText] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [totalWeight, setTotalWeight] = useState<number>(0);

  // Keep references for hot re-renders / prop changes
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const stackGroupRef = useRef<THREE.Group | null>(null);
  const vehicleGroupRef = useRef<THREE.Group | null>(null);
  const wallGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const tooltipMeshesRef = useRef<THREE.Mesh[]>([]);

  // ── Identifiers and Material Constants ──
  const MAT_CONST = {
    SPF: {
      pW: 3.5 / 12, pH: 1.5 / 12, pL: 8.0,
      liftQty: 294, liftW: 49 / 12, liftH: 31.5 / 12, liftL: 8.0,
      weightEach: 9.0,
      woodColor: 0xe3c193, wrapColor: 0x7aafd4,
      label: "2x4x8 SPF Studs", zone: 1,
    },
    PT: {
      pW: 3.5 / 12, pH: 1.5 / 12, pL: 8.0,
      liftQty: 294, liftW: 49 / 12, liftH: 31.5 / 12, liftL: 8.0,
      weightEach: 15.0,
      woodColor: 0x6b8a5a, wrapColor: 0x7aad8a,
      label: "2x4x8 PT Plates", zone: 1,
    },
    OSB: {
      pW: 47.875 / 12, pH: 0.418 / 12, pL: 95.875 / 12,
      liftQty: 86, liftW: 47.875 / 12, liftH: 3.0, liftL: 95.875 / 12,
      weightEach: 45.0,
      woodColor: 0xc4a96b, wrapColor: 0xe0cfa0,
      label: "7/16\" OSB Sheathing", zone: 3,
    },
  };

  const TRADE_COLORS: Record<string, number> = {
    framing: 0xe3c193,
    drywall: 0xcbd5e1,
    concrete: 0x8d8d8d,
    roofing: 0x6b4226,
    electrical: 0xffd700,
    plumbing: 0x4a90d9,
    flooring: 0xb5854b,
    tile: 0x6baed6,
    paint: 0xf4a7b9,
    insulation: 0xffa040,
    hvac: 0x90e0ef,
    deck: 0xa0522d,
    fence: 0x8b6914,
    siding: 0x7fb3d3,
    masonry: 0x9c7a56,
    default: 0x7c3aed,
  };

  const DUNNAGE_FT = [1.0, 4.0, 7.0];
  const TRAILER_MAX_LBS = 11200;

  // Identify material species
  function identifyMaterialType(name: string, trade: string): "SPF" | "PT" | "OSB" | null {
    const n = name.toLowerCase();
    const t = trade.toLowerCase();
    if (n.includes("osb") || n.includes("sheathing") || n.includes("plywood")) return "OSB";
    const isSole = n.includes("sole") || n.includes("bottom") || n.includes("sill") || n.includes("treated") || /\bpt\b/.test(n);
    if (isSole && (n.includes("plate") || t.includes("framing") || t.includes("lumber"))) return "PT";
    if (n.includes("stud") || n.includes("2x4") || n.includes("spf") || t.includes("lumber") || t.includes("framing")) return "SPF";
    return null;
  }

  // Create Canvas Textures procedurally
  function makeWoodTexture(hexColor: number): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const r = (hexColor >> 16) & 0xff;
      const g = (hexColor >> 8) & 0xff;
      const b = hexColor & 0xff;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const yy = i * 16 + Math.random() * 5;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(128, yy + Math.random() * 6 - 3);
        ctx.stroke();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  function makeWrapTexture(hexColor: number): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const r = (hexColor >> 16) & 0xff;
      const g = (hexColor >> 8) & 0xff;
      const b = hexColor & 0xff;
      ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 16, 0);
        ctx.lineTo(i * 16, 64);
        ctx.stroke();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  function makeAsphaltTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1e293b"; // Clean Slate dark-mode pavement
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) {
        const val = Math.floor(Math.random() * 15);
        ctx.fillStyle = `rgb(${15 + val},${20 + val},${35 + val})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 2 + 1, Math.random() * 2 + 1);
      }
    }
    return new THREE.CanvasTexture(canvas);
  }

  const makeLabelTexture = (text: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#f59e0b"; // Gold label
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 32);
    }
    return new THREE.CanvasTexture(canvas);
  };

  // ── 3D Scene Initialization ──
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || 600;
    const height = mountRef.current.clientHeight || 450;

    // Create Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810); // Void black
    scene.fog = new THREE.FogExp2(0x050810, 0.018);
    sceneRef.current = scene;

    // Create Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
    camera.position.set(-18, 16, 45);
    cameraRef.current = camera;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.03; // Bounded flat plane
    controls.minDistance = 5;
    controls.maxDistance = 120;
    controls.target.set(0, 4, 10);
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.4);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.1);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 150;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.35);
    fillLight.position.set(-30, 20, -20);
    scene.add(fillLight);

    // Ground plane with asphalt
    const asphaltTex = makeAsphaltTexture();
    asphaltTex.wrapS = THREE.RepeatWrapping;
    asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(10, 10);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 140),
      new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Fine framing grid overlay
    const grid = new THREE.GridHelper(120, 60, 0x1f2e4d, 0x0c1328);
    grid.position.y = 0.01;
    scene.add(grid);

    // Sub-Groups
    const stackGroup = new THREE.Group();
    scene.add(stackGroup);
    stackGroupRef.current = stackGroup;

    const vehicleGroup = new THREE.Group();
    scene.add(vehicleGroup);
    vehicleGroupRef.current = vehicleGroup;

    const wallGroup = new THREE.Group();
    scene.add(wallGroup);
    wallGroupRef.current = wallGroup;

    // Raycaster
    raycasterRef.current = new THREE.Raycaster();

    // Resize Observer for responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const rect = entries[0].contentRect;
      const w = rect.width;
      const h = rect.height;
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    });
    resizeObserver.observe(mountRef.current);

    // Game loop
    let animeFrameId = 0;
    function thick() {
      animeFrameId = requestAnimationFrame(thick);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    }
    animeFrameId = requestAnimationFrame(thick);

    return () => {
      cancelAnimationFrame(animeFrameId);
      resizeObserver.disconnect();
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.parentNode?.removeChild(
          rendererRef.current.domElement
        );
      }
    };
  }, []);

  // ── Re-render 3D Assets on Mode & Prop Changes ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Reset old items
    tooltipMeshesRef.current = [];
    setTooltipText(null);

    if (stackGroupRef.current) {
      clearObjGroup(stackGroupRef.current);
      stackGroupRef.current.visible = mode === "stack";
    }
    if (vehicleGroupRef.current) {
      clearObjGroup(vehicleGroupRef.current);
      vehicleGroupRef.current.visible = mode === "stack";
    }
    if (wallGroupRef.current) {
      clearObjGroup(wallGroupRef.current);
      wallGroupRef.current.visible = mode === "build";
    }

    if (mode === "stack") {
      drawStackMode();
    } else {
      drawBuildMode();
    }
  }, [mode, materials, framingIntent, drywallOpacity]);

  // Clean-up materials/geometries helper
  function clearObjGroup(group: THREE.Group | THREE.Object3D) {
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if ((obj as any).geometry) {
        (obj as any).geometry.dispose();
      }
      if ((obj as any).material) {
        const mat = (obj as any).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    }
  }

  // ── DRAW STACK LAYER (Lumber Yard) ──
  function drawStackMode() {
    const stackGrp = stackGroupRef.current;
    if (!stackGrp) return;

    const palletMat = new THREE.MeshStandardMaterial({
      color: 0x7c2d12,
      roughness: 0.95,
      metalness: 0,
    });
    const dunnageMat = new THREE.MeshStandardMaterial({
      color: 0xa16207,
      roughness: 0.9,
    });

    const matQtys = { SPF: 0, PT: 0, OSB: 0 };
    const genericPiles: Record<string, { total: number; qty: number }> = {};

    materials.forEach((item) => {
      const mk = identifyMaterialType(item.name, item.trade || "default");
      if (mk) {
        matQtys[mk] += item.quantity || 1;
      } else {
        const trade = (item.trade || "default").toLowerCase();
        if (!genericPiles[trade]) genericPiles[trade] = { total: 0, qty: 0 };
        genericPiles[trade].total += item.total || 0;
        genericPiles[trade].qty += item.quantity || 1;
      }
    });

    const zoneZ = { 1: 12, 2: 24, 3: 36 };
    const zoneCurX = { 1: -14, 2: -10, 3: -10 };
    let weightSum = 0;

    // 1. Draw Identified Materials
    Object.entries(matQtys).forEach(([key, qty]) => {
      if (qty <= 0) return;
      const spec = MAT_CONST[key as "SPF" | "PT" | "OSB"];
      const zone = spec.zone as 1 | 2 | 3;
      const currentX = zoneCurX[zone] + spec.liftW / 2;
      zoneCurX[zone] += spec.liftW + 4.5;

      const subGrp = new THREE.Group();
      subGrp.position.set(currentX, 0.05, zoneZ[zone]);
      stackGrp.add(subGrp);

      const fullLifts = Math.floor(qty / spec.liftQty);
      const remainder = qty % spec.liftQty;
      const woodTex = makeWoodTexture(spec.woodColor);
      const wrapTex = makeWrapTexture(spec.wrapColor);
      const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, metalness: 0.05 });
      const wrapMat = new THREE.MeshStandardMaterial({ map: wrapTex, roughness: 0.45, metalness: 0.1 });

      const liftMats = [wrapMat, wrapMat, wrapMat, woodMat, wrapMat, wrapMat];
      let stackY = 0;

      // Pallet
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(spec.liftW + 0.5, 0.2, spec.liftL + 0.2), palletMat);
      pallet.position.set(0, 0.1, 0);
      pallet.castShadow = true;
      pallet.receiveShadow = true;
      subGrp.add(pallet);
      stackY += 0.2;

      // Render Lifts
      for (let li = 0; li < fullLifts; li++) {
        weightSum += spec.liftQty * spec.weightEach;
        // Dunnage
        DUNNAGE_FT.forEach((dp) => {
          const dz = dp - spec.liftL / 2;
          const block = new THREE.Mesh(new THREE.BoxGeometry(spec.liftW, 0.25, 0.25), dunnageMat);
          block.position.set(0, stackY + 0.125, dz);
          block.castShadow = true;
          subGrp.add(block);
        });
        stackY += 0.25;

        // Bunk Lift box
        const liftMesh = new THREE.Mesh(new THREE.BoxGeometry(spec.liftW, spec.liftH, spec.liftL), liftMats);
        liftMesh.position.set(0, stackY + spec.liftH / 2, 0);
        liftMesh.castShadow = true;
        liftMesh.receiveShadow = true;
        liftMesh.userData = {
          title: "Full Material Pack",
          material: spec.label,
          qty: spec.liftQty,
          weight: Math.round(spec.liftQty * spec.weightEach),
        };
        tooltipMeshesRef.current.push(liftMesh);
        subGrp.add(liftMesh);
        stackY += spec.liftH;
      }

      // Remainder Loose Boards
      if (remainder > 0) {
        const remWeight = Math.round(remainder * spec.weightEach);
        weightSum += remWeight;
        const colMax = Math.max(1, Math.round(spec.liftW / (spec.pW + 0.05)));
        const borderMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });
        let py = stackY + 0.1;
        let placed = 0;

        while (placed < remainder) {
          const countInRow = Math.min(colMax, remainder - placed);
          for (let rowCol = 0; rowCol < countInRow; rowCol++) {
            const pieceGeo = new THREE.BoxGeometry(spec.pW, spec.pH, spec.pL);
            const board = new THREE.Mesh(pieceGeo, woodMat);
            const xPos = -spec.liftW / 2 + rowCol * (spec.pW + 0.03) + spec.pW / 2;
            board.position.set(xPos, py + spec.pH / 2, 0);
            board.castShadow = true;
            board.userData = {
              title: "Loose Item Stake",
              material: spec.label,
              qty: remainder,
              weight: remWeight,
            };
            tooltipMeshesRef.current.push(board);
            subGrp.add(board);

            // Wire outlines to make wood boards pop
            const wire = new THREE.LineSegments(new THREE.EdgesGeometry(pieceGeo), borderMat);
            wire.position.copy(board.position);
            subGrp.add(wire);
          }
          py += spec.pH + 0.02;
          placed += countInRow;
        }
        stackY = py;
      }

      // Add Name Sprite Label on top of stack
      const labelSprite = makeLabelSprite(spec.label);
      labelSprite.position.set(0, stackY + 1.2, 0);
      subGrp.add(labelSprite);
    });

    // 2. Draw generic trades
    Object.entries(genericPiles).forEach(([trade, spec], idx) => {
      const color = TRADE_COLORS[trade] || TRADE_COLORS.default;
      const posX = zoneCurX[2] + idx * 4.8;
      zoneCurX[2] += 4.8;

      const subGrp = new THREE.Group();
      subGrp.position.set(posX, 0.05, zoneZ[2]);
      stackGrp.add(subGrp);

      // Pallet
      const pallet = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 3.5), palletMat);
      pallet.position.set(0, 0.1, 0);
      pallet.castShadow = true;
      subGrp.add(pallet);

      const crateGeo = new THREE.BoxGeometry(2.4, 1.8, 2.4);
      const crateMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(0, 1.1, 0);
      crate.castShadow = true;
      crate.userData = {
        title: `${trade.toUpperCase()} Supply Crate`,
        material: `Unitemized ${trade} materials`,
        qty: Math.round(spec.qty),
        weight: "Varies",
      };
      tooltipMeshesRef.current.push(crate);
      subGrp.add(crate);

      // Wireframe outlines
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(crateGeo),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })
      );
      wire.position.copy(crate.position);
      subGrp.add(wire);

      // Label sprite
      const labelSprite = makeLabelSprite(trade.toUpperCase());
      labelSprite.position.set(0, 2.6, 0);
      subGrp.add(labelSprite);
    });

    // 3. Spawning vehicles (trucks) to parking lot if payload is high
    drawVehicles(weightSum);
    setTotalWeight(weightSum);
  }

  function makeLabelSprite(text: string) {
    const tex = makeLabelTexture(text);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4, 1, 1);
    return sprite;
  }

  function drawVehicles(cargoWeight: number) {
    const vGrp = vehicleGroupRef.current;
    if (!vGrp) return;

    const truckCount = Math.max(1, Math.ceil(cargoWeight / TRAILER_MAX_LBS));
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.45, metalness: 0.6 });
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 });
    const flatbedMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.55 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 });

    for (let currentTruck = 0; currentTruck < Math.min(truckCount, 3); currentTruck++) {
      const offsetX = -18 + currentTruck * 18;
      const offsetZ = -14;

      const subGrp = new THREE.Group();
      subGrp.position.set(offsetX, 0, offsetZ);
      vGrp.add(subGrp);

      // Cab
      const cab = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.5, 6), bodyMat);
      cab.position.set(0, 2.45, 0);
      cab.castShadow = true;
      subGrp.add(cab);

      // Glass windshield
      const glass = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.0, 0.1), glassMat);
      glass.position.set(0, 3.2, 2.96);
      subGrp.add(glass);

      // Bed / Rear
      const bed = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.4, 8), bedMat);
      bed.position.set(0, 1.4, -6.5);
      bed.castShadow = true;
      subGrp.add(bed);

      // Tandem Trailer flatbed deck (12ft)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.4, 12), flatbedMat);
      deck.position.set(0, 1.8, -16);
      deck.castShadow = true;
      subGrp.add(deck);

      // Side Rails
      [-2.9, 2.9].forEach((rx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 12), bedMat);
        rail.position.set(rx, 2.4, -16);
        subGrp.add(rail);
      });

      // Tires cylinders
      const tireGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.8, 14);
      const tirePositions = [
        [-2.9, 1.0, 1.5], [2.9, 1.0, 1.5],
        [-2.9, 1.0, -3.5], [2.9, 1.0, -3.5],
        [-3.2, 1.0, -13], [3.2, 1.0, -13],
        [-3.2, 1.0, -17], [3.2, 1.0, -17],
      ];
      tirePositions.forEach(([tx, ty, tz]) => {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(tx, ty, tz);
        tire.castShadow = true;
        subGrp.add(tire);
      });
    }
  }

  // ── DRAW BUILD MODE (Wall Framing) ──
  function drawBuildMode() {
    const wallGrp = wallGroupRef.current;
    if (!wallGrp) return;

    const L = framingIntent.dimensions.lengthFt;
    const H = framingIntent.dimensions.heightFt;
    const spacing = framingIntent.structural.studSpacingInches;
    const isTreated = framingIntent.structural.treatedSolePlate;
    const hasDrywall = framingIntent.features.doorOpenings > 0 || framingIntent.features.windowOpenings > 0 || true; // editable toggle

    const studThick = 1.5 / 12;
    const studDepth = 3.5 / 12;
    const plateThick = 1.5 / 12;

    const studMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.72 });
    const treatedMat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 }); // Greenish treated
    const drywallMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: drywallOpacity / 100,
      depthWrite: false,
    });

    // Helper functions to spawn wall blocks
    const makePiece = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      wallGrp.add(m);
      return m;
    };

    // Orbit camera focusing
    if (controlsRef.current) {
      controlsRef.current.target.set(L / 2, H / 2, 0);
    }

    const openCount = framingIntent.features.doorOpenings + framingIntent.features.windowOpenings;

    // 1. Bottom plates
    if (openCount > 0 && framingIntent.features.doorOpenings > 0) {
      // Sever plates for doors
      const seg = L / (openCount + 1);
      for (let i = 0; i <= openCount; i++) {
        const xStart = i * seg + (i > 0 && i <= framingIntent.features.doorOpenings ? 1.5 : 0);
        const xEnd = (i + 1) * seg - (i < framingIntent.features.doorOpenings ? 1.5 : 0);
        const span = xEnd - xStart;
        if (span > 0.1) {
          makePiece(span, plateThick, studDepth, xStart + span / 2, plateThick / 2, 0, isTreated ? treatedMat : studMat);
        }
      }
    } else {
      makePiece(L, plateThick, studDepth, L / 2, plateThick / 2, 0, isTreated ? treatedMat : studMat);
    }

    // 2. Double Top Plates
    makePiece(L, plateThick, studDepth, L / 2, H - plateThick * 1.5, 0, studMat);
    makePiece(L, plateThick, studDepth, L / 2, H - plateThick / 2, 0, studMat);

    // 3. Openings allocations (doors vs windows)
    const opPositions: Array<{ x: number; type: "door" | "window" }> = [];
    const step = L / (openCount + 1);
    let counted = 0;

    for (let i = 0; i < framingIntent.features.doorOpenings; i++) {
      counted++;
      opPositions.push({ x: counted * step, type: "door" });
    }
    for (let i = 0; i < framingIntent.features.windowOpenings; i++) {
      counted++;
      opPositions.push({ x: counted * step, type: "window" });
    }

    const studHeight = H - plateThick * 3;
    const studY = plateThick + studHeight / 2;

    // Standard Vertical Studs
    const spUnits = spacing / 12;
    for (let x = 0; x <= L; x += spUnits) {
      // Avoid out of bound offsets
      let finalX = x;
      if (finalX > L - 0.1) finalX = L;

      // Skip if landing inside any rough openings gap (width 3ft)
      let insideGap = false;
      opPositions.forEach((o) => {
        if (finalX >= o.x - 1.55 && finalX <= o.x + 1.55) {
          insideGap = true;
        }
      });

      if (!insideGap) {
        makePiece(studThick, studHeight, studDepth, finalX, studY, 0, studMat);
      }
    }
    // Terminal end stud anchor
    makePiece(studThick, studHeight, studDepth, L, studY, 0, studMat);

    // Frame Opening Headers / Trimmers
    opPositions.forEach((op) => {
      const openWidth = 3.0; // Standard 3-foot door/window opening
      const headerH = 6 / 12; // 2x6 header block

      if (op.type === "door") {
        const doorHeight = 6.8; // 6ft 8in
        // King Studs (outer flanking load)
        makePiece(studThick, studHeight, studDepth, op.x - 1.5 - studThick / 2, studY, 0, studMat);
        makePiece(studThick, studHeight, studDepth, op.x + 1.5 + studThick / 2, studY, 0, studMat);

        // Jack Studs (supports header directly)
        const jackH = doorHeight - plateThick;
        makePiece(studThick, jackH, studDepth, op.x - 1.5 + studThick / 2, plateThick + jackH / 2, 0, studMat);
        makePiece(studThick, jackH, studDepth, op.x + 1.5 - studThick / 2, plateThick + jackH / 2, 0, studMat);

        // Header double beam
        const headerY = doorHeight + headerH / 2;
        makePiece(openWidth - studThick * 2, headerH, studDepth, op.x, headerY, 0, studMat);

        // Cripple studs
        const crippleYStart = headerY + headerH / 2;
        const crippleYEnd = H - plateThick * 2;
        const crippleH = crippleYEnd - crippleYStart;
        if (crippleH > 0.1) {
          const cy = crippleYStart + crippleH / 2;
          makePiece(studThick, crippleH, studDepth, op.x, cy, 0, studMat);
          makePiece(studThick, crippleH, studDepth, op.x - 1.0, cy, 0, studMat);
          makePiece(studThick, crippleH, studDepth, op.x + 1.0, cy, 0, studMat);
        }
      } else {
        // Window opening: Sill at 3.0ft, Header at 6.8ft
        const winTop = 6.8;
        const winBottom = 3.0;

        // King Studs (Full height)
        makePiece(studThick, studHeight, studDepth, op.x - 1.5 - studThick / 2, studY, 0, studMat);
        makePiece(studThick, studHeight, studDepth, op.x + 1.5 + studThick / 2, studY, 0, studMat);

        // Top Trimmers (from sill to header)
        const trimH = winTop - winBottom;
        makePiece(studThick, trimH, studDepth, op.x - 1.5 + studThick / 2, winBottom + trimH / 2, 0, studMat);
        makePiece(studThick, trimH, studDepth, op.x + 1.5 - studThick / 2, winBottom + trimH / 2, 0, studMat);

        // Window Head double beam
        const headerY = winTop + headerH / 2;
        makePiece(openWidth - studThick * 2, headerH, studDepth, op.x, headerY, 0, studMat);

        // Window Sill horizontal plate
        makePiece(openWidth - studThick * 2, plateThick, studDepth, op.x, winBottom - plateThick / 2, 0, studMat);

        // Top Cripples
        const topCrippleStart = headerY + headerH / 2;
        const topCrippleEnd = H - plateThick * 2;
        const tcH = topCrippleEnd - topCrippleStart;
        if (tcH > 0.1) {
          const cy = topCrippleStart + tcH / 2;
          makePiece(studThick, tcH, studDepth, op.x, cy, 0, studMat);
          makePiece(studThick, tcH, studDepth, op.x - 1.0, cy, 0, studMat);
          makePiece(studThick, tcH, studDepth, op.x + 1.0, cy, 0, studMat);
        }

        // Bottom Cripples (under sill to sole plate)
        const bcH = winBottom - plateThick * 1.5;
        if (bcH > 0.1) {
          const cy = plateThick + bcH / 2;
          makePiece(studThick, bcH, studDepth, op.x, cy, 0, studMat);
          makePiece(studThick, bcH, studDepth, op.x - 1.0, cy, 0, studMat);
          makePiece(studThick, bcH, studDepth, op.x + 1.0, cy, 0, studMat);
        }
      }
    });

    // 4. Drywall overlay
    if (hasDrywall && drywallOpacity > 0) {
      const dryThick = 0.5 / 12;
      const dryZ = studDepth / 2 + dryThick / 2 + 0.005; // Guard fighting z-buffer

      if (openCount > 0) {
        // Build sub-panels around window/door voids
        const seg = L / (openCount + 1);
        for (let i = 0; i <= openCount; i++) {
          const xStart = i * seg + (i > 0 ? 1.5 : 0);
          const xEnd = (i + 1) * seg - (i < openCount ? 1.5 : 0);
          const span = xEnd - xStart;
          if (span > 0.15) {
            makePiece(span, H, dryThick, xStart + span / 2, H / 2, dryZ, drywallMat);
          }
        }
        // Fill window sills/headers with mini drywall sheets
        opPositions.forEach((o) => {
          if (o.type === "window") {
            // Drywall below window sill
            makePiece(3.0, 3.0, dryThick, o.x, 1.5, dryZ, drywallMat);
            // Drywall above window head
            const topH = H - 6.8;
            makePiece(3.0, topH, dryThick, o.x, H - topH / 2, dryZ, drywallMat);
          } else {
            // Drywall above door head
            const topH = H - 6.8;
            makePiece(3.0, topH, dryThick, o.x, H - topH / 2, dryZ, drywallMat);
          }
        });
      } else {
        // Simple continuous panel overlay
        makePiece(L, H, dryThick, L / 2, H / 2, dryZ, drywallMat);
      }
    }
  }

  // ── Raycasting Mouse Click/Move Tooltips ──
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "stack" || !raycasterRef.current || !cameraRef.current || tooltipMeshesRef.current.length === 0) {
      setTooltipText(null);
      return;
    }
    const mount = mountRef.current;
    if (!mount) return;

    const rect = mount.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(tooltipMeshesRef.current);

    if (intersects.length > 0) {
      const userData = intersects[0].object.userData;
      if (userData && userData.title) {
        setTooltipText(
          `<strong>${userData.title}</strong><br/>` +
            `Type: ${userData.material}<br/>` +
            `Total Pcs: ${userData.qty}<br/>` +
            `Est. Weight: ${userData.weight ? userData.weight + " lbs" : "Varies"}`
        );
        // Position tooltip relative to container boundaries
        setTooltipPos({
          x: e.clientX - rect.left + 15,
          y: e.clientY - rect.top - 10,
        });
        return;
      }
    }
    setTooltipText(null);
  };

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative cursor-grab active:cursor-grabbing rounded-xl overflow-hidden shadow-inner border border-purple-950/50 bg-slate-950"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltipText(null)}
    >
      {/* 3D Legend/Metrics Overlay */}
      {mode === "stack" && (
        <div className="absolute top-4 left-4 bg-slate-900/90 border border-purple-500/20 px-3 py-2 rounded-lg text-xs font-semibold text-purple-200 backdrop-blur-md pointer-events-none space-y-1">
          <div className="flex items-center gap-1.5 text-amber-500 font-extrabold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Supplier Stack Yard
          </div>
          <div>Cargo Weight: <span className="text-white font-bold">{totalWeight.toLocaleString()} lbs</span></div>
          {totalWeight > TRAILER_MAX_LBS && (
            <div className="text-[10px] text-rose-400 font-bold">
              🚚 Fleet Dispatched: {Math.ceil(totalWeight / TRAILER_MAX_LBS)} flatbeds required
            </div>
          )}
        </div>
      )}

      {mode === "build" && (
        <div className="absolute top-4 left-4 bg-slate-900/90 border border-purple-500/20 px-3 py-2 rounded-lg text-xs font-semibold text-purple-200 backdrop-blur-md pointer-events-none space-y-1">
          <div className="flex items-center gap-1.5 text-sky-400 font-extrabold uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
            Dynamic Wall framing
          </div>
          <div>Wall Setup: {framingIntent.dimensions.lengthFt} × {framingIntent.dimensions.heightFt} ft</div>
          <div>Spacing: {framingIntent.structural.studSpacingInches}" O.C.</div>
          <div>Type: {framingIntent.structural.wallType.toUpperCase()} {framingIntent.structural.treatedSolePlate ? `(PT Plate)` : ""}</div>
        </div>
      )}

      <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1.5 rounded text-[10px] text-slate-300 backdrop-blur-sm pointer-events-none leading-relaxed">
        <div className="text-amber-500 font-bold uppercase tracking-wide text-[9px] mb-0.5">Navigation Help</div>
        • Left-click + drag: Rotate camera<br/>
        • Right-click + drag: Pan camera<br/>
        • Scroll wheel: Zoom zoom
      </div>

      {/* Tooltip Popup */}
      {tooltipText && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900/95 border border-purple-500/40 p-3 rounded-lg text-slate-100 text-xs shadow-xl backdrop-blur-md leading-relaxed"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
          dangerouslySetInnerHTML={{ __html: tooltipText }}
        />
      )}
    </div>
  );
}
