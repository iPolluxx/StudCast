import { useState, useEffect, useRef, useMemo } from "react";
import starfieldSrc from "./assets/starfield.jpg";
import {
  DollarSign,
  Receipt,
  Layers,
  Settings,
  Mic,
  RefreshCw,
  X,
  ArrowUpRight,
  Send,
  Sparkles,
  Maximize2,
  Minimize2,
  Maximize,
  Wrench,
} from "lucide-react";
import type { Estimate, FramingIntent, MaterialItem, LaborItem, ChangeOrder, ContractorUserSettings } from "./types";
import ThreeVisualizer from "./components/ThreeVisualizer";
import SettingsModal from "./components/SettingsModal";
import EstimateList from "./components/EstimateList";
import LedgerTable from "./components/LedgerTable";
import PDFPreviewModal from "./components/PDFPreviewModal";
import ChangeOrderModal from "./components/ChangeOrderModal";

// ── CUSTOM PROCEDURAL STARFIELD BACKGROUND COMPONENT ──
export function Starfield() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let curX = 50, curY = 50, tgtX = 50, tgtY = 50;
    let raf: number;

    const onMove = (e: MouseEvent) => {
      // Horizontal: ±2% (portrait src has little horizontal room under cover)
      // Vertical: ±4% around 52% center — nebula drifts gently with cursor
      tgtX = 49 + (e.clientX / window.innerWidth)  * 2;
      tgtY = 50 + (e.clientY / window.innerHeight) * 4;
    };
    window.addEventListener("mousemove", onMove);

    const tick = () => {
      curX += (tgtX - curX) * 0.04;
      curY += (tgtY - curY) * 0.04;
      if (bgRef.current) {
        bgRef.current.style.backgroundPosition = `${curX}% ${curY}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <>
      {/* Milky Way nebula photo — cover fills landscape viewport; portrait src gives
          vertical parallax room. Nebula glow sits ~55% down, framed below center. */}
      <div
        ref={bgRef}
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `url(${starfieldSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: '50% 52%',
          // Dim enough for UI legibility; preserve warm amber nebula, slight cool shift
          filter: 'brightness(0.6) contrast(1.35) saturate(1.35) hue-rotate(-8deg)',
        }}
      />
      {/* Violet aurora pool — upper left, bleeds into cool star field */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 55% 45% at 22% 28%, rgba(30,14,60,0.6) 0%, transparent 100%)',
      }} />
      {/* Blue aurora pool — lower right, complements warm nebula center */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 65% 50% at 78% 72%, rgba(8,22,55,0.55) 0%, transparent 100%)',
      }} />
      {/* Edge vignette pulls corners to void-black */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 45%, rgba(5,8,16,0.75) 100%)',
      }} />
    </>
  );
}

// ── DEFAULT PROJECTS FOR COMPLIANCE ──
const initialEstimates: Estimate[] = [
  {
    id: "est-eagle-river-garage",
    project_name: "Eagle River Garage Complex",
    scope_of_work: "Construction of a detached 24x36-foot residential garage wood-framed envelope with engineered trusses and fiber-cement board siding.",
    items: [
      { name: "2x4x10ft Standard Studs (Bunk Drop)", quantity: 154, unit: "pcs", trade: "framing", unit_price: 6.25, total: 962.50, price_source: "database", type: "material" },
      { name: "7/16\" OSB Sheathing panels (bunk)", quantity: 45, unit: "pcs", trade: "framing", unit_price: 21.00, total: 945.00, price_source: "ai", type: "material" },
      { name: "2x4x16ft Pressure Treated Sill Plate", quantity: 12, unit: "pcs", trade: "framing", unit_price: 16.50, total: 198.00, price_source: "override", type: "material" },
      { role: "Garage framing specialist (crew of 2)", hours: 24, rate: 55, total: 1320.00, type: "labor" },
      { role: "Sill sealing/Anchor bolt configuration", hours: 4, rate: 55, total: 220.00, type: "labor" }
    ],
    total_amount: 3645.50,
    item_count: 5,
    client_name: "Bruce Sterling",
    client_address: "1024 Lake Thompson Dr, Eagle River, WI 54521",
    client_phone: "+17155550192",
    updatedAt: new Date().toISOString()
  },
  {
    id: "est-rhinelander-master",
    project_name: "Rhinelander Partition Addition",
    scope_of_work: "A dual-partitioned master closet addition, includes 1/2\" Type X drywall, taping, mudding, and finishing on a 16-foot framing structure.",
    items: [
      { name: "2x4x8ft Standard Wood Stud", quantity: 48, unit: "pcs", trade: "framing", unit_price: 5.75, total: 276.00, price_source: "database", type: "material" },
      { name: "1/2\" Regular Drywall 4x8 Panels", quantity: 22, unit: "pcs", trade: "drywall", unit_price: 15.50, total: 341.00, price_source: "database", type: "material" },
      { role: "Drywall hanging & structural taping segment", hours: 14, rate: 50, total: 700.00, type: "labor" }
    ],
    total_amount: 1317.00,
    item_count: 3,
    client_name: "Genevieve Dubois",
    client_address: "419 River Bend Rd, Rhinelander, WI 54501",
    client_phone: "+17155550241",
    updatedAt: new Date().toISOString()
  }
];

const defaultSettings: ContractorUserSettings = {
  company_name: "Lone Ranger Framing LLC",
  company_address: "814 Pine Tree Rd, Rhinelander, WI 54501",
  company_logo_url: "",
  license_number: "WI-Dw041123a",
  contact_email: "bids@rangerframing.com",
  default_labor_rate: 55,
  global_markup_percent: 15,
  tax_rate: 5.5,
  isOnboarded: true,
  active_subscription: true,
  subscription_status: "active"
};

export default function App() {
  // Auth + bootstrap state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [subscriptionGate, setSubscriptionGate] = useState<boolean>(false);

  // State variables
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [activeEstimateId, setActiveEstimateId] = useState<string>("");
  const [settings, setSettings] = useState<ContractorUserSettings>(defaultSettings);
  const [visualizerMode, setVisualizerMode] = useState<"stack" | "build">("build");
  const drywallOpacity = 30;
  
  // Input fields
  const [textPrompt, setTextPrompt] = useState<string>("");
  const [changeOrderInput, setChangeOrderInput] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [aiProcessing, setAiProcessing] = useState<boolean>(false);
  const [statusFlash, setStatusFlash] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const setActiveStage = (_: number) => {};
  const [vizSize, setVizSize] = useState<'mini' | 'medium' | 'full'>('mini');
  const [orbState, setOrbState] = useState<'center' | 'rolling' | 'landed'>('center');
  const prevVizSize = useRef<'mini' | 'medium' | 'full'>('mini');

  // AR state — lifted from ThreeVisualizer via callbacks
  const [arToggle, setArToggle] = useState<(() => void) | null>(null);
  const [isARActive, setIsARActive] = useState(false);

  // Draggable mini PIP
  const pipRef = useRef<HTMLDivElement>(null);

  // Live microphone recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const pipDragRef = useRef<{ startPX: number; startPY: number; startX: number; startY: number } | null>(null);

  // Floating instruments panels
  const [activeInstrument, setActiveInstrument] = useState<"sliders" | "pricing" | "change" | "layers" | null>(null);
  
  // (Ledger no longer a drawer — inline in main flow)
  const setLedgerExpanded = (_: boolean) => {};
  
  // Dropdown states
  const [projectDropdownOpen, setProjectDropdownOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [derivedChangeOrder, setDerivedChangeOrder] = useState<ChangeOrder | null>(null);
  const [changeOrderLoading, setChangeOrderLoading] = useState(false);
  const [changeOrderModalOpen, setChangeOrderModalOpen] = useState(false);

  // Price Override matrix configuration
  const [priceSheet, setPriceSheet] = useState({
    stud: 6.25,
    treated: 16.50,
    plate: 12.00,
    drywall: 15.50,
    nails: 85.00,
    laborFrame: 55,
    laborDrywall: 50
  });

  // Current framing model parameters
  const [framingIntent, setFramingIntent] = useState<FramingIntent>({
    schemaVersion: "1.0",
    projectType: "wall_frame",
    dimensions: { lengthFt: 16, heightFt: 8 },
    structural: { studSpacingInches: 16, treatedSolePlate: true, wallType: "exterior" },
    features: { doorOpenings: 1, windowOpenings: 1, cornerCount: 4 }
  });

  const activeEstimate = estimates.find(e => e.id === activeEstimateId) || estimates[0] || null;

  // Auth headers helper
  const apiHeaders = (token: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  });

  // Boot: verify auth token, load estimates + settings
  useEffect(() => {
    // DEV-only: skip the auth/backend dance entirely and render built-in demo data, so the
    // dashboard is analyzable locally without a login or a running backend. (Hitting /api with
    // no real token returns 401, whose handler redirects to '/', which loops.) Guarded by
    // import.meta.env.DEV — compiled out of production builds, where real auth runs below.
    if (import.meta.env.DEV) {
      setAuthToken('demo');
      setEstimates(initialEstimates);
      setActiveEstimateId(initialEstimates[0].id);
      setAppLoading(false);
      return;
    }

    const token = localStorage.getItem('authBearerToken');
    if (!token) {
      window.location.href = '/';
      return;
    }
    setAuthToken(token);

    const load = async () => {
      try {
        const [estRes, settingsRes] = await Promise.all([
          fetch('/api/estimates', { headers: apiHeaders(token) }),
          fetch('/api/settings',  { headers: apiHeaders(token) }),
        ]);

        if (estRes.status === 401) {
          localStorage.removeItem('authBearerToken');
          window.location.href = '/';
          return;
        }

        const summaries: Estimate[] = await estRes.json(); // plain array from server
        const settingsData = await settingsRes.json();

        // Handle Stripe post-payment return (session_id in URL)
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        if (sessionId) {
          try {
            const vResp = await fetch('/api/billing/verify-session', {
              method: 'POST',
              headers: apiHeaders(token),
              body: JSON.stringify({ session_id: sessionId }),
            });
            const vData = await vResp.json();
            if (vData.activated) settingsData.active_subscription = true;
          } catch (_) {}
          window.history.replaceState({}, '', '/dashboard');
        }

        if (settingsData) {
          setSettings(s => ({ ...s, ...settingsData }));
          if (!settingsData.active_subscription) setSubscriptionGate(true);
        }

        if (Array.isArray(summaries) && summaries.length > 0) {
          // Load full details (with items[]) for the first estimate
          const detailRes = await fetch(`/api/estimates/${summaries[0].id}`, { headers: apiHeaders(token) });
          const full = detailRes.ok ? await detailRes.json() : summaries[0];
          // Merge: full details for active, summaries for the rest
          const merged = [full, ...summaries.slice(1)];
          setEstimates(merged);
          setActiveEstimateId(full.id);
        } else {
          setEstimates(initialEstimates);
          setActiveEstimateId(initialEstimates[0].id);
        }
      } catch {
        // Network down — fall back to demo data so the UI still loads
        setEstimates(initialEstimates);
        setActiveEstimateId(initialEstimates[0].id);
      } finally {
        setAppLoading(false);
      }
    };

    load();
  }, []);

  // Auto-advance stage when AI state changes
  useEffect(() => {
    if (isRecording) setActiveStage(1);
  }, [isRecording]);

  useEffect(() => {
    if (aiProcessing) setActiveStage(2);
    else if (!isRecording) setActiveStage(3);
  }, [aiProcessing]);

  // Barrel roll animation when transitioning into theater (medium) mode — desktop only
  useEffect(() => {
    if (vizSize !== 'mini') setPipPos(null);

    if (vizSize === 'medium' && prevVizSize.current !== 'medium') {
      if (window.innerWidth >= 1024) {
        setOrbState('rolling');
        const t = setTimeout(() => setOrbState('landed'), 1580);
        prevVizSize.current = vizSize;
        return () => clearTimeout(t);
      }
      // Mobile: stay centered so the orb never disappears
    }
    if (vizSize !== 'medium') {
      setOrbState('center');
    }
    prevVizSize.current = vizSize;
  }, [vizSize]);

  // Always stack mode — build mode removed
  useEffect(() => {
    setVisualizerMode("stack");

    // Load full details (with items[]) when switching to an estimate that only has summary data
    if (activeEstimateId && authToken) {
      const current = estimates.find(e => e.id === activeEstimateId);
      if (current && !current.items) {
        fetch(`/api/estimates/${activeEstimateId}`, { headers: apiHeaders(authToken) })
          .then(r => r.ok ? r.json() : null)
          .then(full => {
            if (full) setEstimates(prev => prev.map(e => e.id === activeEstimateId ? full : e));
          })
          .catch(() => {});
      }
    }
  }, [activeEstimateId]);

  // Estimate materials & labor update helper
  const updateEstimateItems = (updater: (prevItems: any[]) => any[]) => {
    const updated = estimates.map(e => {
      if (e.id === activeEstimateId) {
        const nextItems = updater(e.items);
        const subtotal = nextItems.reduce((sum, item) => sum + (item.total || 0), 0);
        return {
          ...e,
          items: nextItems,
          total_amount: Math.round(subtotal * 100) / 100,
          item_count: nextItems.length,
          updatedAt: new Date().toISOString()
        };
      }
      return e;
    });
    setEstimates(updated);
  };

  // Inline grid cell update
  const handleCellEdit = (index: number, field: string, value: string | number) => {
    updateEstimateItems(items => {
      const copy = [...items];
      const target = { ...copy[index] };
      
      if (target.type === "material") {
        if (field === "name" || field === "unit") {
          target[field] = value;
        } else {
          const numVal = parseFloat(value as string) || 0;
          target[field] = numVal;
          target.price_source = "override";
        }
        target.total = Math.round((target.quantity || 0) * (target.unit_price || 0) * 100) / 100;
      } else {
        if (field === "role") {
          target[field] = value;
        } else {
          const numVal = parseFloat(value as string) || 0;
          target[field] = numVal;
        }
        target.total = Math.round((target.hours || 0) * (target.rate || 0) * 100) / 100;
      }
      copy[index] = target;
      return copy;
    });
  };

  const handleAddFieldItem = (type: "material" | "labor") => {
    updateEstimateItems(items => [
      ...items,
      type === "material"
        ? { name: "2x4 SPF Stud", quantity: 10, unit: "pcs", trade: "framing", unit_price: priceSheet.stud, total: priceSheet.stud * 10, price_source: "override", type: "material" }
        : { role: "Professional carpentry installers", hours: 4, rate: settings.default_labor_rate || 55, total: (settings.default_labor_rate || 55) * 4, type: "labor" }
    ]);
  };

  const handleDeleteItem = (index: number) => {
    updateEstimateItems(items => items.filter((_, i) => i !== index));
  };

  const handleDeleteProject = async (id: string) => {
    if (!authToken) return;
    await fetch(`/api/estimates/${id}`, { method: 'DELETE', headers: apiHeaders(authToken) });
    const remaining = estimates.filter(e => e.id !== id);
    setEstimates(remaining);
    if (activeEstimateId === id) {
      setActiveEstimateId(remaining[0]?.id ?? '');
    }
  };

  // Add new blank estimate
  const handleNewProject = () => {
    const nextId = "est-" + Date.now().toString(16);
    const newEst: Estimate = {
      id: nextId,
      project_name: `Project Run #${estimates.length + 1}`,
      scope_of_work: "Continuous wood-framed wall telemetry, integrated structural materials takeoff ledger.",
      items: [
        { name: "2x4x8ft Basic Wood Stud", quantity: 32, unit: "pcs", trade: "framing", unit_price: 5.75, total: 184.00, price_source: "ai", type: "material" },
        { role: "Framing installation crew", hours: 6, rate: settings.default_labor_rate, total: settings.default_labor_rate * 6, type: "labor" }
      ],
      total_amount: 184.00 + (settings.default_labor_rate * 6),
      item_count: 2,
      client_name: "Bruce Sterling",
      client_address: "Eagle River, WI",
      client_phone: "+17155550192"
    };
    setEstimates([...estimates, newEst]);
    setActiveEstimateId(nextId);
    setProjectDropdownOpen(false);
  };

  // ── Draggable mini PIP handlers ──
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const pip = pipRef.current;
    if (!pip) return;
    const rect = pip.getBoundingClientRect();
    pipDragRef.current = { startPX: e.clientX, startPY: e.clientY, startX: rect.left, startY: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipDragRef.current) return;
    const { startPX, startPY, startX, startY } = pipDragRef.current;
    const pip = pipRef.current!;
    const newX = Math.max(4, Math.min(window.innerWidth - pip.offsetWidth - 4, startX + e.clientX - startPX));
    const newY = Math.max(56, Math.min(window.innerHeight - pip.offsetHeight - 4, startY + e.clientY - startPY));
    setPipPos({ x: newX, y: newY });
  };

  const handlePipPointerUp = () => { pipDragRef.current = null; };

  // Trigger AI extraction — server merges into Firestore, we reload the estimate
  const handleProcessNLP = async (textToParse: string) => {
    if (!textToParse.trim()) return;
    setAiProcessing(true);

    try {
      const headers = authToken
        ? apiHeaders(authToken)
        : { "Content-Type": "application/json" };

      const response = await fetch("/api/process-text", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: textToParse,
          estimateId: activeEstimate?.id ?? null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.estimateId) {
        // Server merged into Firestore — reload the estimate to get updated items
        const refreshed = await fetch(`/api/estimates/${data.estimateId}`, { headers: apiHeaders(authToken!) });
        if (refreshed.ok) {
          const full = await refreshed.json();
          setEstimates(prev => prev.map(e => e.id === full.id ? full : e));
          if (data.estimateId !== activeEstimateId) setActiveEstimateId(data.estimateId);
        }
        setStatusFlash(`${data.itemCount ?? '?'} items in estimate`);
        setTimeout(() => setStatusFlash(null), 4000);
        setTextPrompt("");
      } else {
        throw new Error(data.error || 'Extraction failed');
      }
    } catch (e) {
      // Fallback: local parse (no Firestore persistence)
      runLocalBackupParser(textToParse);
    } finally {
      setAiProcessing(false);
    }
  };

  // Standard high-reliability fallback parser so it is always 100% active and works
  const runLocalBackupParser = (textToParse: string) => {
    const lower = textToParse.toLowerCase();
    let matchedLength = framingIntent.dimensions.lengthFt;
    let matchedHeight = framingIntent.dimensions.heightFt;
    let matchedDoors = framingIntent.features.doorOpenings;
    let matchedWindows = framingIntent.features.windowOpenings;
    let spacing: 16 | 24 = framingIntent.structural.studSpacingInches;
    let pt = framingIntent.structural.treatedSolePlate;
    let wallType: 'interior' | 'exterior' = framingIntent.structural.wallType;

    const lenMatch = lower.match(/(\d+)\s*(foot|ft|feet|f)/);
    if (lenMatch) matchedLength = parseInt(lenMatch[1]);
    
    const highMatch = lower.match(/(\d+)\s*(high|tall|height|h|ft)/);
    if (highMatch && (lower.includes("high") || lower.includes("tall"))) {
      matchedHeight = parseInt(highMatch[1]);
    }

    if (lower.includes("door") || lower.includes("opening")) {
      matchedDoors = 1;
      if (lower.includes("no door") || lower.includes("0") || lower.includes("zero")) matchedDoors = 0;
      else if (lower.includes("two") || lower.includes("2")) matchedDoors = 2;
    }
    if (lower.includes("window")) {
      matchedWindows = 1;
      if (lower.includes("no window") || lower.includes("0") || lower.includes("zero")) matchedWindows = 0;
      else if (lower.includes("two") || lower.includes("2")) matchedWindows = 2;
    }
    if (lower.includes("24 on center") || lower.includes("24 o") || lower.includes("24-inch")) {
      spacing = 24;
    } else if (lower.includes("16 on center") || lower.includes("16 o") || lower.includes("16-inch")) {
      spacing = 16;
    }
    if (lower.includes("treated") || lower.includes("pt")) pt = true;
    if (lower.includes("interior")) wallType = 'interior';
    if (lower.includes("exterior")) wallType = 'exterior';

    if (matchedLength < 4) matchedLength = 4;
    if (matchedLength > 30) matchedLength = 30;
    if (matchedHeight < 8) matchedHeight = 8;
    if (matchedHeight > 12) matchedHeight = 12;

    setFramingIntent({
      schemaVersion: "1.0",
      projectType: "wall_frame",
      dimensions: { lengthFt: matchedLength, heightFt: matchedHeight },
      structural: { studSpacingInches: spacing, treatedSolePlate: pt, wallType },
      features: { doorOpenings: matchedDoors, windowOpenings: matchedWindows, cornerCount: 4 }
    });

    // Takeoff calculators
    const baseStuds = Math.ceil((matchedLength * 12) / spacing) + 3 + (matchedDoors * 2) + (matchedWindows * 3);
    const addedMats: MaterialItem[] = [
      { name: `2x4x${matchedHeight}ft SPF Stud Stock (AI)`, quantity: baseStuds, unit: "pcs", trade: "framing", unit_price: priceSheet.stud, total: baseStuds * priceSheet.stud, price_source: "ai" },
      { name: `2x4x16ft Sole/Top Plates (AI)`, quantity: Math.ceil((matchedLength * 3) / 16), unit: "pcs", trade: "framing", unit_price: pt ? priceSheet.treated : priceSheet.plate, total: Math.ceil((matchedLength * 3) / 16) * (pt ? priceSheet.treated : priceSheet.plate), price_source: "ai" }
    ];

    if (lower.includes("drywall")) {
      const sqFt = matchedLength * matchedHeight * 2;
      const sheetsCount = Math.ceil((sqFt * 1.05) / 32);
      addedMats.push({ name: `1/2\" Plaster Drywall 4x8 Panels (AI)`, quantity: sheetsCount, unit: "pcs", trade: "drywall", unit_price: priceSheet.drywall, total: sheetsCount * priceSheet.drywall, price_source: "ai" });
    }

    const carpentersCount = Math.ceil(matchedLength * 0.45 + (matchedDoors * 1.5) + (matchedWindows * 1.5));
    const addedLab: LaborItem[] = [
      { role: "Professional carpentry installation hours (AI)", hours: carpentersCount, rate: priceSheet.laborFrame, total: carpentersCount * priceSheet.laborFrame }
    ];

    updateEstimateItems(prev => {
      const cleanUserModified = prev.filter(i => i.price_source !== "ai" && !i.name?.includes("(AI)"));
      return [
        ...cleanUserModified,
        ...addedMats.map(m => ({ ...m, type: "material" as const })),
        ...addedLab.map(l => ({ ...l, type: "labor" as const }))
      ];
    });

    setStatusFlash("3 materials extracted");
    setTimeout(() => setStatusFlash(null), 4000);
    setTextPrompt("");
    setActiveStage(3);
  };

  const toggleRecording = async () => {
    // Second tap — stop recording; onstop handler takes over
    if (isRecording) {
      setIsRecording(false);
      mediaRecorderRef.current?.stop();
      return;
    }

    // First tap — request mic and start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());

        // Strip codec suffix (e.g. "audio/webm;codecs=opus" → "audio/webm") so
        // multer's allow-list matches.
        const cleanMime = (mr.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(audioChunksRef.current, { type: cleanMime });

        if (blob.size === 0) {
          setStatusFlash("No audio captured — try again");
          setTimeout(() => setStatusFlash(null), 4000);
          return;
        }

        setAiProcessing(true);
        try {
          const ext = cleanMime.includes('ogg') ? '.ogg' : cleanMime.includes('mp4') ? '.mp4' : '.webm';
          const fd = new FormData();
          fd.append('audio', blob, `recording${ext}`);
          if (activeEstimate?.id) fd.append('estimateId', activeEstimate.id);

          const resp = await fetch('/api/process', {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            body: fd,
          });

          const data = await resp.json();
          if (resp.ok && data.estimateId) {
            const refreshed = await fetch(`/api/estimates/${data.estimateId}`, {
              headers: apiHeaders(authToken!),
            });
            if (refreshed.ok) {
              const full = await refreshed.json();
              setEstimates(prev => prev.map(e => e.id === full.id ? full : e));
              if (data.estimateId !== activeEstimateId) setActiveEstimateId(data.estimateId);
            }
            setStatusFlash(`${data.itemCount ?? '?'} items extracted from audio`);
            setTimeout(() => setStatusFlash(null), 4000);
          } else {
            throw new Error(data.error || 'Audio extraction failed');
          }
        } catch (e: any) {
          setStatusFlash('Audio failed: ' + (e.message || 'Unknown error'));
          setTimeout(() => setStatusFlash(null), 5000);
        } finally {
          setAiProcessing(false);
        }
      };

      mr.start();
      setIsRecording(true);
    } catch (e: any) {
      const msg = e.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : `Mic unavailable: ${e.message}`;
      setStatusFlash(msg);
      setTimeout(() => setStatusFlash(null), 5000);
    }
  };

  // Unique clients derived from estimates — used in ChangeOrderModal dropdown
  const clients = useMemo(() =>
    estimates
      .filter(e => e.client_phone)
      .map(e => ({
        label: `${e.client_name || 'Unknown'} — ${e.client_phone}`,
        phone: e.client_phone,
      }))
      .filter((c, i, arr) => arr.findIndex(x => x.phone === c.phone) === i)
      .sort((a, b) => a.label.localeCompare(b.label)),
    [estimates]
  );

  const handleGenerateChangeOrder = async () => {
    if (!changeOrderInput.trim() || !activeEstimateId || !authToken) return;
    setChangeOrderLoading(true);
    try {
      const resp = await fetch('/api/change-orders/generate', {
        method: 'POST',
        headers: apiHeaders(authToken),
        body: JSON.stringify({ parentEstimateId: activeEstimateId, text: changeOrderInput }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Generation failed');
      setDerivedChangeOrder({ id: data.changeOrderId, ...data });
      setChangeOrderModalOpen(true);
    } catch (e: any) {
      setStatusFlash('Change order failed: ' + e.message);
      setTimeout(() => setStatusFlash(null), 5000);
    } finally {
      setChangeOrderLoading(false);
    }
  };

  if (appLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050810]">
        <Starfield />
        <div className="text-center space-y-4 z-10">
          <div className="h-12 w-12 rounded-full border-2 border-cool-blue border-t-transparent animate-spin mx-auto" style={{ borderColor: '#6eb5ff', borderTopColor: 'transparent' }} />
          <p className="text-mini font-mono font-bold tracking-widest text-[#6eb5ff] uppercase">Initializing Orbit...</p>
        </div>
      </div>
    );
  }

  // Safe to compute — appLoading is false so estimates is populated
  const items = activeEstimate?.items ?? [];
  const materials = items.filter(i => i.type === "material") as unknown as MaterialItem[];
  const labor    = items.filter(i => i.type === "labor")    as unknown as LaborItem[];

  const materialsSubtotal = materials.reduce((s, i) => s + (i.total || 0), 0);
  const laborSubtotal     = labor.reduce((s, i) => s + (i.total || 0), 0);
  const markupAmount      = materialsSubtotal * (settings.global_markup_percent / 100);
  const taxedMaterials    = materialsSubtotal + markupAmount;
  const taxAmount         = taxedMaterials * (settings.tax_rate / 100);
  const grandTotal        = Math.round((taxedMaterials + laborSubtotal + taxAmount) * 100) / 100;

  return (
    <div className="flex flex-col h-screen overflow-hidden text-starlight relative font-sans">

      {/* Background canvas starry elements */}
      <Starfield />

      {/* Subscription gate overlay */}
      {subscriptionGate && (
        <div className="fixed inset-0 z-[60] bg-[#050810]/95 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="glass-panel border-white/15 max-w-sm w-full rounded-2xl p-8 text-center space-y-5 shadow-2xl">
            <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-cool-blue to-soft-violet mx-auto flex items-center justify-center">
              <span className="text-void-black font-black text-lg">LR</span>
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wide">Unlock Lone Ranger</h2>
              <p className="text-mini text-[#e2e8f0]/60 mt-1">Subscribe to access AI estimating, PDF generation, and the 3D material yard.</p>
            </div>
            <a
              href="/dashboard#subscribe"
              className="block w-full py-3 bg-gradient-to-r from-cool-blue to-soft-violet text-[#050810] font-black rounded-full text-mini uppercase tracking-widest"
            >
              Subscribe — $50/mo
            </a>
            <button
              onClick={() => setSubscriptionGate(false)}
              className="text-mini text-[#e2e8f0]/40 hover:text-white font-mono uppercase tracking-wider"
            >
              Continue in demo mode
            </button>
          </div>
        </div>
      )}

      {/* ── 1. TOP RAIL (exactly 48px / h-12) ── */}
      <header className="h-12 border-b border-white/8 bg-[#0a0f1e]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 relative z-40 select-none">
        
        {/* Project trigger dropdown indicator */}
        <div className="relative">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2 hover:text-[#ffffff] transition-colors focus:outline-none cursor-pointer"
          >
            <span className="text-mini font-black tracking-widest text-[#ffffff] uppercase font-mono">
              {activeEstimate?.project_name ?? 'No Project'}
            </span>
            <span className="text-mini text-cool-blue/70 font-mono">▼</span>
          </button>

          <EstimateList
            open={projectDropdownOpen}
            estimates={estimates}
            activeEstimateId={activeEstimateId}
            onDelete={handleDeleteProject}
            onSelect={async (id) => {
              setProjectDropdownOpen(false);
              // Load full details if we only have the summary
              const existing = estimates.find(e => e.id === id);
              if (!existing?.items && authToken) {
                const r = await fetch(`/api/estimates/${id}`, { headers: apiHeaders(authToken) });
                if (r.ok) {
                  const full = await r.json();
                  setEstimates(prev => prev.map(e => e.id === id ? full : e));
                }
              }
              setActiveEstimateId(id);
            }}
            onNewProject={handleNewProject}
          />
        </div>

        {/* Live Estimate badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-live-emerald animate-pulse"></span>
          <span className="text-mini font-black tracking-widest text-live-emerald uppercase font-mono">
            LIVE ESTIMATE
          </span>
        </div>

        {/* Settings gear */}
        <div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-starlight hover:text-[#ffffff] transition-all cursor-pointer"
            id="settings-gear-button"
          >
            <Settings className="w-4 h-4 text-cool-blue" />
          </button>
        </div>

      </header>

      {/* ── 2. VISUALIZER FRAME — three-state: mini PIP (draggable), medium banner, full ── */}
      <div
        ref={pipRef}
        className={
          vizSize === 'mini'
            ? 'fixed z-30 flex flex-col items-end touch-none select-none'
            : vizSize === 'medium'
            ? 'fixed top-12 left-0 right-0 h-[40vh] sm:h-[45vh] z-30 border-b border-white/10 shadow-2xl bg-[#050810]'
            : 'fixed inset-0 z-50 bg-[#050810]'
        }
        style={vizSize === 'mini' ? (pipPos
          ? { left: `${pipPos.x}px`, top: `${pipPos.y}px` }
          : { top: '3.5rem', right: '0.5rem' }
        ) : undefined}
        onPointerDown={vizSize === 'mini' ? handlePipPointerDown : undefined}
        onPointerMove={vizSize === 'mini' ? handlePipPointerMove : undefined}
        onPointerUp={vizSize === 'mini' ? handlePipPointerUp : undefined}
        onPointerCancel={vizSize === 'mini' ? handlePipPointerUp : undefined}
      >
        {/* Canvas container — overflow-hidden clips the Three.js renderer */}
        <div className={
          vizSize === 'mini'
            ? 'relative w-[150px] h-[100px] sm:w-[240px] sm:h-[160px] rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-[#050810]'
            : 'relative w-full h-full'
        }>
          <ThreeVisualizer
            mode={visualizerMode}
            framingIntent={framingIntent}
            materials={materials}
            drywallOpacity={drywallOpacity}
            showOverlay={vizSize !== 'mini'}
            onARReady={(toggle) => setArToggle(() => toggle)}
            onARSessionChange={setIsARActive}
          />

          {/* Transparent drag-capture layer in mini mode — blocks OrbitControls, enables full-surface drag */}
          {vizSize === 'mini' && <div className="absolute inset-0 z-20 cursor-move" />}

          {/* Bottom gradient bleed (theater mode) */}
          {vizSize === 'medium' && (
            <div
              className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
              style={{ height: '4rem', background: 'linear-gradient(to bottom, transparent 0%, #050810 100%)' }}
            />
          )}

          {/* AR button — small circle inside canvas for medium / full modes */}
          {vizSize !== 'mini' && arToggle && (
            <button
              onClick={arToggle}
              className="absolute bottom-4 right-4 z-10 h-9 w-9 rounded-full bg-gradient-to-tr from-[#3a1854]/80 to-violet-700/80 hover:from-violet-800 hover:to-violet-500 border border-violet-400/35 text-white text-micro font-black flex items-center justify-center backdrop-blur-md shadow-lg transition-colors cursor-pointer"
              title={isARActive ? 'Exit AR' : 'View in AR'}
            >
              AR
            </button>
          )}

          {/* Viz size controls */}
          <div className="absolute top-1.5 right-1.5 flex gap-1 z-40">
            {vizSize === 'mini' && (
              <button
                onClick={() => setVizSize('medium')}
                onPointerDown={(e) => e.stopPropagation()}
                className="h-7 w-7 rounded-full bg-void-black/80 hover:bg-cool-blue/30 text-cool-blue flex items-center justify-center backdrop-blur border border-white/20 cursor-pointer"
                title="Expand"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            {vizSize === 'medium' && (
              <>
                <button
                  onClick={() => setVizSize('mini')}
                  className="h-9 w-9 rounded-full bg-void-black/80 hover:bg-cool-blue/30 text-cool-blue flex items-center justify-center backdrop-blur border border-white/20 cursor-pointer"
                  title="Shrink to mini"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setVizSize('full')}
                  className="h-9 w-9 rounded-full bg-void-black/80 hover:bg-cool-blue/30 text-cool-blue flex items-center justify-center backdrop-blur border border-white/20 cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </>
            )}
            {vizSize === 'full' && (
              <button
                onClick={() => setVizSize('mini')}
                className="h-11 w-11 rounded-full bg-void-black/80 hover:bg-alert-rose/30 text-cool-blue flex items-center justify-center backdrop-blur border border-white/20 cursor-pointer"
                title="Close fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* AR pill — attached below the mini PIP, outside overflow-hidden */}
        {vizSize === 'mini' && arToggle && (
          <button
            onClick={arToggle}
            onPointerDown={(e) => e.stopPropagation()}
            className="mt-1 mr-0.5 h-6 px-2.5 rounded-full bg-gradient-to-r from-[#2d1050]/90 to-violet-700/80 hover:from-violet-900 hover:to-violet-600 border border-violet-500/30 text-white text-micro font-black backdrop-blur-md flex items-center gap-1.5 shadow-lg transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" />
            {isARActive ? 'Exit AR' : 'View in AR'}
          </button>
        )}
      </div>

      {/* ── MAIN SCROLLABLE CONTENT ── */}
      <main className={`flex-1 overflow-y-auto relative ${vizSize === 'full' ? 'opacity-0 pointer-events-none' : ''}`}>

        {/* Gradient veil — fades content out as it scrolls behind the theater-mode visualizer */}
        {vizSize === 'medium' && (
          <div
            className="sticky top-0 left-0 right-0 z-20 pointer-events-none"
            style={{ height: '5rem', background: 'linear-gradient(to bottom, #050810 0%, #050810 30%, transparent 100%)', pointerEvents: 'none' }}
          />
        )}

        <div className={`mx-auto max-w-3xl px-3 sm:px-6 pb-24 sm:pb-12 ${
          vizSize === 'medium' ? 'pt-[42vh] sm:pt-[47vh]' : 'pt-4 sm:pt-6'
        }`}>


      {/* ── 5. INSTRUMENT SIDEBAR: desktop only ── */}
      <nav className={`hidden md:flex fixed left-4 top-20 z-30 flex-col gap-3 h-auto select-none pointer-events-auto ${vizSize === 'full' ? 'invisible' : ''}`}>
        <div className="glass-panel border-white/10 rounded-2xl p-1.5 flex flex-col gap-2.5 shadow-2xl">
          {[
            { id: "pricing" as const, icon: DollarSign, tooltip: "Lumber Price Overrides" },
            { id: "change" as const, icon: Receipt, tooltip: "AI Change Orders" },
            { id: "layers" as const, icon: Layers, tooltip: "Visualization Settings" }
          ].map((item) => {
            const active = activeInstrument === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (active) setActiveInstrument(null);
                  else {
                    setActiveInstrument(item.id);
                    // Close ledger drawer for full workspace floating layout preview
                    setLedgerExpanded(false);
                  }
                }}
                className={`h-11 w-11 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
                  active
                    ? "bg-gradient-to-tr from-cool-blue to-soft-violet text-void-black shadow-lg shadow-cool-blue/25 scale-105 border-none"
                    : "bg-void-black/40 text-starlight/75 hover:bg-white/5 hover:text-white border border-white/5"
                }`}
                title={item.tooltip}
              >
                <item.icon className="w-4 h-4" />
                
                {/* Micro tooltip */}
                <span className="absolute left-[54px] top-1/2 -translate-y-1/2 bg-[#050810]/95 border border-white/10 px-2.5 py-1 text-micro font-bold tracking-widest text-starlight uppercase rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity font-mono w-max">
                  {item.tooltip}
                </span>
                
                {active && (
                  <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-3.5 rounded-r bg-cool-blue"></span>
                )}
              </button>
            );
          })}
        </div>
        
        {/* Help button indicator */}
        <div className="glass-panel border-white/5 rounded-xl p-1 text-center bg-void-black/80 font-mono text-micro font-bold text-cool-blue/60 leading-none">
          LR
        </div>
      </nav>

      {/* ── FLOATING GLASS INSTRUMENT PANELS — modal on mobile, side-float on desktop ── */}
      {activeInstrument && (
        <>
          {/* Mobile backdrop */}
          <div
            onClick={() => setActiveInstrument(null)}
            className="md:hidden fixed inset-0 z-40 bg-void-black/60 backdrop-blur-sm"
          />
          <div className="fixed z-50 inset-x-3 bottom-3 max-h-[70vh] md:absolute md:inset-auto md:left-20 md:top-20 md:bottom-auto md:w-80 md:max-h-[70vh] overflow-y-auto glass-panel border-white/15 rounded-2xl p-5 shadow-2xl pointer-events-auto select-none animate-fade-in animate-slide-in">
          
          <div className="flex items-center justify-between border-b border-white/8 pb-3 mb-4">
            <h3 className="text-mini font-black uppercase tracking-widest text-[#ffffff] flex items-center gap-1.5">
              {activeInstrument === "pricing" && <DollarSign className="w-3.5 h-3.5 text-cool-blue" />}
              {activeInstrument === "change" && <Receipt className="w-3.5 h-3.5 text-cool-blue" />}
              {activeInstrument === "layers" && <Layers className="w-3.5 h-3.5 text-soft-violet" />}
              
              {activeInstrument === "pricing" && "Prices & Supplier Sheet"}
              {activeInstrument === "change" && "Change Order Engine"}
              {activeInstrument === "layers" && "Visualization Specs"}
            </h3>
            
            <button
              onClick={() => setActiveInstrument(null)}
              className="text-starlight/50 hover:text-alert-rose transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* PRICES & SUPPLIER SHEET PANEL */}
          {activeInstrument === "pricing" && (
            <div className="space-y-4 font-mono text-mini">

              {/* Supplier CSV upload */}
              <div className="space-y-2">
                <span className="block text-micro font-black uppercase text-soft-violet tracking-wider">
                  Supplier Price Sheet
                </span>
                <p className="text-micro text-starlight/50 font-sans leading-relaxed">
                  Upload a CSV from your supplier with <span className="text-starlight/80 font-bold">name</span> and <span className="text-starlight/80 font-bold">price</span> columns. Prices are saved to your account and used automatically in future estimates.
                </p>
                <label className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-cool-blue/30 hover:border-cool-blue/60 rounded-xl cursor-pointer transition-all hover:bg-cool-blue/5 text-cool-blue text-micro font-black uppercase tracking-widest">
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !authToken) return;
                      const form = new FormData();
                      form.append('file', file);
                      const r = await fetch('/api/upload-csv', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${authToken}` },
                        body: form,
                      });
                      const d = await r.json();
                      if (r.ok) {
                        setStatusFlash(`${d.saved ?? '?'} prices imported`);
                      } else {
                        setStatusFlash(`Upload failed: ${d.error}`);
                      }
                      setTimeout(() => setStatusFlash(null), 4000);
                      e.target.value = '';
                    }}
                  />
                  ↑ Upload Supplier CSV
                </label>
              </div>

              <hr className="border-white/5" />

              {/* Manual price overrides */}
              <span className="block text-micro font-black uppercase text-soft-violet tracking-wider">
                Manual Rate Overrides
              </span>

              {[
                { label: "2x4 SPF Stud (ea)", val: priceSheet.stud, target: "stud" },
                { label: "2x4 PT Bottom Plate (ea)", val: priceSheet.treated, target: "treated" },
                { label: "2x4 16ft Plate (ea)", val: priceSheet.plate, target: "plate" },
                { label: "1/2\" Drywall (ea)", val: priceSheet.drywall, target: "drywall" },
                { label: "16-D Nails Box (ea)", val: priceSheet.nails, target: "nails" },
                { label: "Framing Labor (/hr)", val: priceSheet.laborFrame, target: "laborFrame" },
                { label: "Drywall Labor (/hr)", val: priceSheet.laborDrywall, target: "laborDrywall" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-void-black/40 p-2 rounded-xl border border-white/5">
                  <span className="text-starlight/80">{item.label}</span>
                  <div className="flex items-center gap-1 font-sans">
                    <span className="text-starlight/45">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.val}
                      onChange={(e) => setPriceSheet({ ...priceSheet, [item.target]: parseFloat(e.target.value) || 0 })}
                      className="w-14 bg-void-black border border-white/10 text-right font-bold text-cool-blue px-1.5 py-0.5 rounded focus:outline-none focus:border-cool-blue/50"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. CHANGE ORDER FORMULATION PANEL */}
          {activeInstrument === "change" && (
            <div className="space-y-4 font-mono text-mini">
              
              <div className="space-y-1">
                <span className="block text-micro font-black uppercase text-soft-violet tracking-wider">
                  Describe Change Segment
                </span>
                <textarea
                  value={changeOrderInput}
                  onChange={(e) => setChangeOrderInput(e.target.value)}
                  placeholder="e.g., Add 12 sheets of OSB and 4 hours of framing labor..."
                  className="w-full bg-[#050810]/80 h-16 border border-white/10 rounded-xl p-2.5 outline-none focus:border-cool-blue/60 focus:ring-1 focus:ring-cool-blue/10 backdrop-blur-md font-mono text-mini text-starlight"
                />
              </div>

              <button
                onClick={handleGenerateChangeOrder}
                disabled={!changeOrderInput.trim() || changeOrderLoading || !activeEstimateId}
                className="w-full py-2 border border-cool-blue/30 hover:border-cool-blue bg-cool-blue/10 hover:bg-cool-blue/20 transition-all font-black uppercase tracking-widest text-micro rounded-full text-cool-blue flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {changeOrderLoading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-soft-violet" />
                )}
                {changeOrderLoading ? 'Generating PDF…' : 'Formulate Change Addendum'}
              </button>

              {derivedChangeOrder && !changeOrderModalOpen && (
                <div className="border border-white/10 bg-void-black/60 rounded-xl p-3.5 mt-2">
                  <div className="flex justify-between items-center text-micro font-bold uppercase tracking-wider text-soft-violet">
                    <span>Addendum Ready</span>
                    <span className="text-cool-blue">{derivedChangeOrder.id}</span>
                  </div>
                  <button
                    onClick={() => setChangeOrderModalOpen(true)}
                    className="w-full mt-3 py-2 bg-gradient-to-r from-cool-blue to-soft-violet text-void-black font-black uppercase tracking-widest text-micro rounded-full transition-transform hover:scale-105 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Review &amp; Dispatch
                  </button>
                </div>
              )}

            </div>
          )}

          {/* 4. VISUALIZATION SETTINGS PANEL */}
          {activeInstrument === "layers" && (
            <div className="space-y-4 font-mono text-mini">
              <p className="text-micro text-starlight/50 font-sans leading-relaxed">
                Material Yard shows a live 3D digital twin of your lumber drop — lifts, dunnage, and fleet dispatch based on your estimate.
              </p>
              <div className="text-micro text-starlight/40 leading-normal pl-1 space-y-1 font-sans">
                <div>• Drag to orbit</div>
                <div>• Scroll to zoom</div>
                <div>• Hover materials for weight + quantity</div>
              </div>
            </div>
          )}

        </div>
        </>
      )}

      {/* ── WORKFLOW BAR ── */}
      <div className="w-full mb-4 sm:mb-6 select-none flex justify-center">
        <div className="glass-panel border-white/5 rounded-full px-2 sm:px-5 py-1.5 flex items-center gap-1.5 sm:gap-5 shadow-2xl glass-panel-glow">
          {[
            { label: "DESCRIBE",  sublabel: "Voice or type",   action: () => document.querySelector<HTMLInputElement>('input[placeholder*="e.g"]')?.focus() },
            { label: "TAKEOFF",   sublabel: "AI extraction",   action: () => {} },
            { label: "REVIEW",    sublabel: "Ledger & 3D",     action: () => document.getElementById('estimate-ledger-section')?.scrollIntoView({ behavior: 'smooth' }) },
            { label: "DELIVER",   sublabel: "Send PDF",        action: () => document.getElementById('publish-btn')?.click() },
          ].map((step, i) => {
            const isLast = i === 3;
            return (
              <div key={step.label} className="flex items-center gap-1.5 sm:gap-5">
                <button
                  onClick={step.action}
                  className="flex items-center gap-1.5 py-1 px-1.5 rounded-md hover:bg-white/5 transition-all cursor-pointer group"
                >
                  <span className="w-4 h-4 rounded-full font-mono text-micro font-black flex items-center justify-center border border-white/20 text-starlight/50 group-hover:border-cool-blue group-hover:text-cool-blue transition-colors">
                    {i + 1}
                  </span>
                  <span className="hidden sm:flex flex-col items-start leading-none">
                    <span className="text-micro font-mono font-black tracking-widest uppercase text-starlight/70 group-hover:text-cool-blue transition-colors">{step.label}</span>
                    <span className="text-micro text-starlight/30 font-sans mt-0.5">{step.sublabel}</span>
                  </span>
                </button>
                {!isLast && <span className="text-white/10 text-mini font-mono">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. VOICE ORB — animates to left rail in theater mode ── */}

      {/* Landed layout — two flex containers that fill the side spaces */}
      {orbState === 'landed' && (
        <>
          {/* LEFT: orb centered between page-left edge and ledger left edge, and between viz-bottom and viewport-bottom */}
          <div
            className="fixed z-30 hidden lg:flex items-center justify-center pointer-events-none"
            style={{
              top: 'calc(48px + 40vh)',
              bottom: 0,
              left: 0,
              right: 'calc(50% + 1.5rem)',
            }}
          >
            <div className="flex flex-col items-center gap-3 animate-orb-land pointer-events-auto">
              <div className="relative flex items-center justify-center">
                {isRecording && (
                  <>
                    <div className="absolute h-16 w-16 rounded-full border border-cool-blue/30 bg-cool-blue/5 animate-ring-expand-1 pointer-events-none" />
                    <div className="absolute h-16 w-16 rounded-full border border-soft-violet/20 bg-soft-violet/5 animate-ring-expand-2 pointer-events-none" />
                  </>
                )}
                <button
                  onClick={toggleRecording}
                  className={`h-14 w-14 rounded-full flex items-center justify-center transition-all duration-300 border cursor-pointer ${
                    isRecording ? "bg-gradient-to-tr from-rose-500 to-soft-violet border-rose-300 scale-105"
                      : aiProcessing ? "bg-[#0a0f1e] border-[#273a5a]"
                      : "bg-gradient-to-tr from-[#121829] to-[#3a2254] border-[#614582] shadow-xl shadow-cool-blue/10"
                  }`}
                >
                  {aiProcessing
                    ? <RefreshCw className="w-5 h-5 text-cool-blue animate-spin" />
                    : <Mic className={`w-5 h-5 ${isRecording ? "text-starlight" : "text-cool-blue"}`} />}
                </button>
              </div>
              <span className="text-micro font-black tracking-widest text-starlight/40 uppercase font-mono text-center leading-tight">
                {isRecording ? "Listening..." : aiProcessing ? "Building..." : "Describe Job"}
              </span>
              <div className="relative w-36">
                <input
                  type="text" value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleProcessNLP(textPrompt)}
                  placeholder="Type & enter..."
                  className="w-full bg-[#050810]/80 border border-white/10 rounded-full py-1.5 px-3 text-mini text-starlight placeholder-starlight/30 focus:ring-1 focus:ring-cool-blue focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* RIGHT: panel centered between ledger right edge and page-right edge */}
          <div
            className="fixed z-30 hidden lg:flex items-center justify-center pointer-events-none animate-panel-right"
            style={{
              top: 'calc(48px + 40vh)',
              bottom: 0,
              left: 'calc(50% + 1.5rem)',
              right: 0,
            }}
          >
            <div className="glass-panel border-white/15 rounded-2xl p-5 w-52 space-y-4 pointer-events-auto">
              <span className="text-micro font-black tracking-widest text-soft-violet uppercase font-mono block">
                Estimate Snapshot
              </span>
              <div className="space-y-2.5 font-mono text-mini">
                <div className="flex justify-between items-center text-starlight/70">
                  <span>Materials</span>
                  <span className="text-cool-blue font-bold">{materials.length}</span>
                </div>
                <div className="flex justify-between items-center text-starlight/70">
                  <span>Labor</span>
                  <span className="text-cool-blue font-bold">{labor.length} rows</span>
                </div>
                <div className="border-t border-white/5 pt-2.5 flex justify-between items-center">
                  <span className="text-starlight/70">Total</span>
                  <span className="text-cool-blue font-extrabold text-base">
                    ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <p className="text-micro text-starlight/25 font-sans italic leading-relaxed">
                Tell us what to put here.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Center orb (normal + rolling states) */}
      <section className={`flex flex-col items-center gap-3 w-full max-w-sm mx-auto text-center select-none mb-6 sm:mb-8 ${
        orbState === 'landed' ? 'invisible h-0 overflow-hidden mb-0' : ''
      }`}>
        
        {/* Status Flash notification popup above orb */}
        {statusFlash && (
          <div className="bg-cool-blue/15 border border-cool-blue/30 text-cool-blue px-3.5 py-1.5 rounded-full text-mini font-mono tracking-wider font-extrabold shadow-lg shadow-cool-blue/10 flex items-center gap-1.5 animate-bounce">
            <Sparkles className="w-3.5 h-3.5 animate-spin" />
            + {statusFlash.toUpperCase()}
          </div>
        )}

        {/* Dynamic Waveform visualization underneath/around the orb when actively listening */}
        {isRecording && (
          <div className="flex items-end justify-center gap-1 h-8 mb-1">
            {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((_bar, index) => (
              <span
                key={index}
                className="w-1 bg-[#6eb5ff] rounded-full animate-wave-bar"
                style={{
                  animationDelay: `${index * 0.1}s`,
                  height: "4px"
                }}
              />
            ))}
          </div>
        )}

        {/* Ring expansions representing depth orbit */}
        <div className={`relative flex items-center justify-center ${orbState === 'rolling' ? 'animate-barrel-roll' : ''}`}>
          
          {/* Animated pulsing concentric rings */}
          {isRecording && (
            <>
              <div className="absolute h-16 w-16 rounded-full border border-cool-blue/30 bg-cool-blue/5 animate-ring-expand-1 pointer-events-none" />
              <div className="absolute h-16 w-16 rounded-full border border-soft-violet/20 bg-soft-violet/5 animate-ring-expand-2 pointer-events-none" />
              <div className="absolute h-16 w-16 rounded-full border border-cool-blue/10 bg-cool-blue/5 animate-ring-expand-3 pointer-events-none" />
            </>
          )}

          {/* Core voice orb button */}
          <button
            onClick={toggleRecording}
            className={`h-14 w-14 rounded-full flex items-center justify-center transition-all duration-300 pointer-events-auto border relative z-50 cursor-pointer ${
              isRecording 
                ? "bg-gradient-to-tr from-rose-500 to-soft-violet border-rose-300 scale-105" 
                : aiProcessing
                  ? "bg-[#0a0f1e] text-white border-[#273a5a]"
                  : "bg-gradient-to-tr from-[#121829] to-[#3a2254] hover:from-[#1b2641] hover:to-[#4e316d] border-[#614582] shadow-xl shadow-cool-blue/5"
            }`}
            id="floating-voice-orb-button"
          >
            {aiProcessing ? (
              <RefreshCw className="w-5 h-5 text-cool-blue animate-spin" />
            ) : (
              <Mic className={`w-5 h-5 ${isRecording ? "text-starlight" : "text-cool-blue"}`} />
            )}
          </button>
        </div>

        {/* State Label description text */}
        <div className="bg-[#050810]/75 border border-white/5 px-4 py-1.5 rounded-full shadow-lg backdrop-blur-md">
          <span className="text-micro font-black tracking-widest text-[#ffffff] uppercase font-mono block">
            {isRecording ? "LISTENING..." : aiProcessing ? "BUILDING ESTIMATE..." : "DESCRIBE YOUR JOB"}
          </span>
          <span className="text-micro text-[#e2e8f0]/60 italic font-sans max-w-xs line-clamp-1">
            {isRecording ? "Speak naturally — materials, dimensions, openings..." : aiProcessing ? "Extracting materials and pricing..." : (activeEstimate?.scope_of_work ?? 'Tap orb or type below to start your estimate')}
          </span>
        </div>

        {/* Elegant Natural Text input field */}
        <div className="pointer-events-auto w-72 mt-1 relative">
          <input
            type="text"
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleProcessNLP(textPrompt);
              }
            }}
            placeholder="Describe materials, dimensions, or scope..."
            className="w-full bg-[#050810]/80 frosted-input border-white/10 rounded-full py-1.5 px-4 text-mini tracking-wide text-starlight placeholder-starlight/40 focus:ring-1 focus:ring-cool-blue focus:outline-none backdrop-blur-md font-mono"
            style={{ paddingRight: "3rem" }}
          />
          {textPrompt.trim() !== "" && (
            <button
              onClick={() => handleProcessNLP(textPrompt)}
              disabled={aiProcessing}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-cool-blue/20 hover:bg-cool-blue text-cool-blue hover:text-void-black flex items-center justify-center transition-all cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </section>

      {/* ── 4. LEDGER — inline below voice section ── */}
      <section id="estimate-ledger-section" className="rounded-2xl border border-white/10 bg-[#0a0f1e]/60 backdrop-blur-md overflow-hidden">

        {/* Total summary header bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-void-black/40 border-b border-white/5 select-none">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cool-blue"></span>
            <span className="text-mini sm:text-mini font-black tracking-widest text-starlight/70 uppercase font-mono">
              Estimate Ledger
            </span>
          </div>
          <div className="text-right">
            <span className="text-micro text-starlight/40 font-bold tracking-widest uppercase block leading-none mb-0.5">
              total
            </span>
            <span className="text-base sm:text-lg font-black text-cool-blue font-mono leading-none">
              ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="h-full w-full flex flex-col relative">
          
          <LedgerTable
            materials={materials}
            labor={labor}
            allItems={activeEstimate?.items ?? []}
            onCellEdit={handleCellEdit}
            onDeleteItem={handleDeleteItem}
            onAddItem={handleAddFieldItem}
            materialsSubtotal={materialsSubtotal}
            laborSubtotal={laborSubtotal}
            markupAmount={markupAmount}
            taxAmount={taxAmount}
            grandTotal={grandTotal}
            markupPercent={settings.global_markup_percent}
            taxRate={settings.tax_rate}
            scopeOfWork={activeEstimate?.scope_of_work ?? ''}
            onScopeChange={(val) => {
              setEstimates(prev => prev.map(e =>
                e.id === activeEstimateId ? { ...e, scope_of_work: val } : e
              ));
              // Persist to Firestore on change (debounced via natural typing pause)
              if (authToken && activeEstimate?.id) {
                clearTimeout((window as any)._scopeTimer);
                (window as any)._scopeTimer = setTimeout(() => {
                  fetch(`/api/estimates/${activeEstimate.id}/save`, {
                    method: 'POST',
                    headers: apiHeaders(authToken),
                    body: JSON.stringify({ scope_of_work: val }),
                  }).catch(() => {});
                }, 1200);
              }
            }}
            onPreview={() => setPreviewOpen(true)}
            onPublish={async () => {
              if (!authToken || !activeEstimate) return;
              const resp = await fetch('/api/generate-pdf', {
                method: 'POST',
                headers: apiHeaders(authToken),
                body: JSON.stringify({
                  projectName: activeEstimate.id,
                  project: {
                    materials,
                    labor,
                    client_name: activeEstimate.client_name,
                    client_address: activeEstimate.client_address,
                    scope_of_work: activeEstimate.scope_of_work,
                  },
                }),
              });
              const data = await resp.json().catch(() => ({}));
              if (resp.ok) {
                setStatusFlash(`PDF sent to ${settings.contact_email}`);
                setTimeout(() => setStatusFlash(null), 5000);
              } else {
                // Reject so the ledger can surface a durable inline error + retry
                throw new Error(data.error || `Server error ${resp.status}`);
              }
            }}
          />

        </div>

      </section>

        </div>
      </main>

      {/* ── MOBILE INSTRUMENT FAB ── */}
      {vizSize !== 'full' && (
        <button
          onClick={() => setActiveInstrument(activeInstrument ? null : 'sliders')}
          className="md:hidden fixed bottom-4 left-4 z-30 h-12 w-12 rounded-full bg-gradient-to-tr from-cool-blue to-soft-violet text-void-black flex items-center justify-center shadow-2xl shadow-cool-blue/30 cursor-pointer"
          title="Open tools"
        >
          <Wrench className="w-5 h-5" />
        </button>
      )}

      {/* ── WORKSPACE CONFIG SETUP modal ── */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={async () => {
          setSettingsOpen(false);
          if (authToken) {
            await fetch('/api/settings', {
              method: 'POST',
              headers: apiHeaders(authToken),
              body: JSON.stringify(settings),
            });
          }
        }}
        authToken={authToken}
        onLogoUploaded={(url) => setSettings(s => ({ ...s, company_logo_url: url }))}
      />

      <PDFPreviewModal
        open={previewOpen}
        authToken={authToken ?? ''}
        estimateId={activeEstimate?.id ?? ''}
        projectName={activeEstimate?.id ?? ''}
        project={{
          materials,
          labor,
          client_name:    activeEstimate?.client_name    ?? '',
          client_address: activeEstimate?.client_address ?? '',
          client_phone:   activeEstimate?.client_phone   ?? '',
          scope_of_work:  activeEstimate?.scope_of_work  ?? '',
        }}
        onClose={() => setPreviewOpen(false)}
        onClientDetailsSaved={(name, phone, address) => {
          setEstimates(prev => prev.map(e =>
            e.id === activeEstimateId
              ? { ...e, client_name: name, client_phone: phone, client_address: address }
              : e
          ));
        }}
        onConfirmSend={async (client) => {
          if (!authToken || !activeEstimate) return;
          const resp = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: apiHeaders(authToken),
            body: JSON.stringify({
              projectName: activeEstimate.id,
              project: {
                materials,
                labor,
                client_name:    client.name,
                client_address: client.address,
                scope_of_work:  activeEstimate.scope_of_work,
              },
            }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || `Server error ${resp.status}`);
          setStatusFlash(`PDF sent to ${settings.contact_email}`);
          setTimeout(() => setStatusFlash(null), 5000);
        }}
      />

      <ChangeOrderModal
        open={changeOrderModalOpen}
        changeOrder={derivedChangeOrder}
        clients={clients}
        authToken={authToken}
        activeEstimateId={activeEstimateId}
        onClose={() => { setChangeOrderModalOpen(false); setDerivedChangeOrder(null); setChangeOrderInput(''); }}
        onDispatched={() => {
          setChangeOrderModalOpen(false);
          setDerivedChangeOrder(null);
          setChangeOrderInput('');
          setStatusFlash('Change order dispatched to client');
          setTimeout(() => setStatusFlash(null), 5000);
        }}
      />

    </div>
  );
}
