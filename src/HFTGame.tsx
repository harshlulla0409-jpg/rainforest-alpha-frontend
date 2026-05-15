import { useState, useEffect, useRef, useCallback } from "react";

const INITIAL_ALPHAS = [
  { id: "lead_score_slow", label: "Lead Score Slow", desc: "" },
  { id: "basis_z_fast", label: "Basis Z Fast", desc: "" },
  { id: "basis_z_slow", label: "Basis Z Slow", desc: "" },
  { id: "basis_deviation", label: "Basis Deviation", desc: "" },
  { id: "cross_asset_ofi_fast", label: "Cross Asset OFI Fast", desc: "" },
  { id: "cross_asset_ofi_slow", label: "Cross Asset OFI Slow", desc: "" },
  { id: "imbalance_divergence", label: "Imbalance Div", desc: "" },
  { id: "return_divergence", label: "Return Divergence", desc: "" },
  { id: "vol_spillover", label: "Vol Spillover", desc: "" },
  { id: "resistance_ratio", label: "Resistance Ratio", desc: "" },
  { id: "book_pressure_cash", label: "Book Pressure Cash", desc: "" },
  { id: "rel_book_pressure", label: "Rel Book Pressure", desc: "" },
  { id: "rel_cancel_bid", label: "Rel Cancel Bid", desc: "" },
  { id: "rel_cancel_ask", label: "Rel Cancel Ask", desc: "" },
  { id: "rel_imbalance_velocity", label: "Rel Imbalance Vel", desc: "" },
  { id: "rel_smart_ofi", label: "Rel Smart OFI", desc: "" },
  { id: "rel_liquidity_skew", label: "Rel Liquidity Skew", desc: "" },
  { id: "rel_book_divergence", label: "Rel Book Div", desc: "" },
  { id: "rel_bid_depletion", label: "Rel Bid Depletion", desc: "" },
  { id: "rel_weighted_imbalance", label: "Rel Weighted Imb", desc: "" },
  { id: "toxicity_vpin_slow", label: "VPIN Slow", desc: "" },
  { id: "toxicity_vpin_fast", label: "VPIN Fast", desc: "" },
  { id: "spoof_flicker_fut", label: "Spoof Flicker Fut", desc: "" },
  { id: "spoof_flicker_cash", label: "Spoof Flicker Cash", desc: "" },
  { id: "limit_replenish_fut", label: "Limit Replenish Fut", desc: "" },
  { id: "trade_accel_fut", label: "Trade Accel Fut", desc: "" },
  { id: "limit_imbalance_fast_fut", label: "Limit Imb Fast Fut", desc: "" },
  { id: "limit_imbalance_slow_fut", label: "Limit Imb Slow Fut", desc: "" },
  { id: "limit_imbalance_fast_cash", label: "Limit Imb Fast Cash", desc: "" },
  { id: "limit_imbalance_slow_cash", label: "Limit Imb Slow Cash", desc: "" },
  { id: "sector_momentum_slow", label: "Sector Mom Slow", desc: "" },
  { id: "sector_momentum_fast", label: "Sector Mom Fast", desc: "" },
  { id: "vol_participation_fast", label: "Vol Part Fast", desc: "" },
  { id: "vol_participation_slow", label: "Vol Part Slow", desc: "" },
  { id: "sector_dispersion", label: "Sector Dispersion", desc: "" },
  { id: "macro_fracture_slow", label: "Macro Frac Slow", desc: "" },
  { id: "macro_fracture_fast", label: "Macro Frac Fast", desc: "" },
  { id: "relative_strength_slow", label: "Rel Strength Slow", desc: "" },
  { id: "relative_strength_fast", label: "Rel Strength Fast", desc: "" },
  { id: "trend_acceleration", label: "Trend Accel", desc: "" },
  { id: "stock_momentum_fast", label: "Stock Mom Fast", desc: "" },
  { id: "vwap_deviation_z", label: "VWAP Dev Z", desc: "" },
  { id: "unified_lead_score", label: "Unified Lead Score", desc: "" },
  { id: "taker_imbalance_fut", label: "Taker Imb Fut", desc: "" },
  { id: "taker_imbalance_cash", label: "Taker Imb Cash", desc: "" },
  { id: "l1_imbalance_fut", label: "L1 Imb Fut", desc: "" },
  { id: "l1_imbalance_cash", label: "L1 Imb Cash", desc: "" },
];

const INITIAL_FILTERS = [
  { id: "filter_mddv_cash", label: "MDDV Cash", desc: "Thresholds (crs comma seperated)" },
  { id: "filter_mddv_fut", label: "MDDV Fut", desc: "Thresholds (crs comma seperated)" },
  { id: "filter_spread_bps_cash", label: "Spread BPS Cash", desc: "Thresholds (bps, comma-separated)" },
  { id: "filter_volatility_cash", label: "Volatility Cash", desc: "(% comma seperated)" },
  { id: "filter_lot_size_fut", label: "Lot Size Fut", desc: "units comma seperated" }
];

const RETURN_HORIZONS = [
  { label: "60s", key: "r60" },
  { label: "300s", key: "r300" },
  { label: "1800s", key: "r1800" },
];

const DEFAULT_BPS_THRESHOLDS = [-20, -5, 0, 5, 20];
const MIN_SAVING_THRESHOLD = 20.0;

// ── Types ─────────────────────────────────────────────────────────────────────

type BucketStat = { label: string; n: number; r60: number; r300: number; r1800: number };
type AggStats   = { n: number; r60: number; r300: number; r1800: number };

type Level = {
  alphaId: string;
  thresholds: number[];
  selectedBuckets: number[];
  buckets: BucketStat[];
  filteredRows: number;
  totalRows: number;
};

type RegressionResult = {
  intercept: number;
  coefficients: Record<string, number>;
  rSquared: number;
  oosRSquared?: number;
  hasSufficientCoverage?: boolean;
  oosBucketData?: any;
};

type OOSResults = {
  stats: AggStats;
  n: number;
  totalRows: number;
};

// ── API helpers ───────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL || "";

export async function apiFetchMeta(): Promise<{ isRows: number; oosRows: number }> {
  // Now targets 127.0.0
  const res = await fetch(`${BASE_URL}/api/data/meta`); 
  if (!res.ok) throw new Error(`meta ${res.status}`);
  return res.json();
}

export async function apiFetchBuckets(
  dataset: "is" | "oos",
  side: 1 | -1,
  alphaId: string,
  thresholds: number[],
  upstreamFilters: { alphaId: string; thresholds: number[]; selectedBuckets: number[] }[],
): Promise<{ buckets: BucketStat[]; filteredRows: number; totalRows: number }> {
  // Now targets 127.0.0
  const res = await fetch(`${BASE_URL}/api/buckets`, { 
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset, side, alphaId, thresholds, upstreamFilters }),
  });
  if (!res.ok) throw new Error(`buckets ${res.status}`);
  return res.json();
}

export async function apiRunRegression(
  dataset: "is" | "oos",
  side: 1 | -1,
  features: string[],
  target: string,
  name: string,
  userId?: string
): Promise<RegressionResult> {
  const res = await fetch(`${BASE_URL}/api/regression`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset, side, features, target, name, userId }),
  });
  if (!res.ok) throw new Error(`regression ${res.status}`);
  return res.json();
}

export async function apiSaveStrategy(payload: any) {
  const res = await fetch(`${BASE_URL}/api/strategies/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Failed to save strategy (Status: ${res.status})`);
  }
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function aggStats(buckets: BucketStat[], selected: number[]): AggStats {
  const rows = buckets.filter((_, i) => selected.includes(i));
  const totalN = rows.reduce((s, b) => s + b.n, 0);
  if (totalN === 0) return { n: 0, r60: 0, r300: 0, r1800: 0 };
  const wmean = (key: "r60" | "r300" | "r1800") =>
    rows.reduce((s, b) => s + b[key] * b.n, 0) / totalN;
  return { n: totalN, r60: wmean("r60"), r300: wmean("r300"), r1800: wmean("r1800") };
}

function buildUpstreamFilters(levels: Level[], upToIdx: number) {
  return levels.slice(0, upToIdx).map((l) => ({
    alphaId: l.alphaId,
    thresholds: l.thresholds,
    selectedBuckets: l.selectedBuckets,
  }));
}

// ── Color / bar helpers ───────────────────────────────────────────────────────

function pnlColor(val: number, mult: number = 1) {
  const adj = val * mult;
  if (adj > 2) return "#27ae60";
  if (adj > 0.5) return "#2ecc71";
  if (adj > -0.5) return "#a4b595";
  if (adj > -2) return "#d35400";
  return "#e74c3c";
}

function barWidth(val: number, maxAbs: number) {
  return maxAbs === 0 ? 0 : Math.min(100, (Math.abs(val) / maxAbs) * 100);
}

function getMetricConfig(id: string) {
  if (id.includes("mddv")) return { label: "Thresholds (crs comma seperated)", mult: 1e7, suffix: "cr" };
  if (id.includes("volatility")) return { label: "Thresholds (% comma seperated)", mult: 1, suffix: "%" };
  if (id.includes("lot_size")) return { label: "Thresholds (units comma seperated)", mult: 1, suffix: "units" };
  return { label: "Thresholds (bps, comma-separated)", mult: 1, suffix: "bps" };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HFTGame() {
  const [user, setUser] = useState<{id: string, username: string, avatarUrl: string} | null>(() => {
    const saved = localStorage.getItem("hft_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [phase, setPhase] = useState<"intro" | "build" | "oos" | "results">("intro");
  const [meta, setMeta] = useState<{ isRows: number; oosRows: number } | null>(null);

  // Dynamic alpha list that allows us to inject custom signals
  const [availableAlphas, setAvailableAlphas] = useState(INITIAL_ALPHAS);
  const [levels, setLevels] = useState<Level[]>([]);
  const [filters, setFilters] = useState<Level[]>([]);
  const [editingState, setEditingState] = useState<{ type: "alpha" | "filter"; idx: number } | null>(null);
  const [pendingAlpha, setPendingAlpha] = useState(INITIAL_ALPHAS[0].id);
  const [pendingThresholds, setPendingThresholds] = useState([...DEFAULT_BPS_THRESHOLDS]);
  const [thresholdInput, setThresholdInput] = useState(DEFAULT_BPS_THRESHOLDS.join(", "));
  const [previewData, setPreviewData] = useState<{ buckets: BucketStat[]; filteredRows: number } | null>(null);

  const [gameDirection, setGameDirection] = useState<"long" | "short">("long");

  const [regressionFeatures, setRegressionFeatures] = useState<string[]>([]);
  const [regressionTarget, setRegressionTarget] = useState<string>("r60");
  const [strategyName, setStrategyName] = useState<string>("custom_strategy");
  const [regressionResults, setRegressionResults] = useState<RegressionResult | null>(null);
  const [isRegressionLoading, setIsRegressionLoading] = useState(false);

  const [activeModelData, setActiveModelData] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{success?: boolean; message?: string} | null>(null);
  
  const [workspaceGlow, setWorkspaceGlow] = useState(false);
  const [savedStrategies, setSavedStrategies] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [oosProgress, setOosProgress] = useState(0);
  const [oosResults, setOosResults] = useState<OOSResults | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived stats from current level selections ────────────────────────────
  const allLevels = [...levels, ...filters];
  const lastActiveLvl = [...allLevels].reverse().find((l) => l.selectedBuckets.length > 0);
  const currentStats: AggStats = lastActiveLvl
    ? aggStats(lastActiveLvl.buckets, lastActiveLvl.selectedBuckets)
    : { n: 0, r60: 0, r300: 0, r1800: 0 };
  const directionMult = gameDirection === "long" ? 1 : -1;
  const score = (currentStats.r60 * 1 + currentStats.r300 * 0.7 + currentStats.r1800 * 0.4) * directionMult;
  const coverage = meta && currentStats.n > 0 ? (currentStats.n / meta.isRows) * 100 : 0;

  // ── Strategy Polling ───────────────────────────────────────────────────────
  const fetchUserStrategies = useCallback(async () => {
    if (!user) return;
    const currentUserId = user.id || (user as any)._id || (user as any).username || (user as any).login || "anonymous_user";
    try {
      const res = await fetch(`${BASE_URL}/api/strategies?userId=${currentUserId}`);
      if (res.ok) {
        const data = await res.json();
        setSavedStrategies(data.strategies || []);
      }
    } catch (e) {
      console.error("Failed to fetch strategies", e);
    }
  }, [user]);

  useEffect(() => {
    fetchUserStrategies();
  }, [fetchUserStrategies]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    
    if (code) {
      setIsAuthenticating(true);
      // Clear the query parameters from the URL safely
      window.history.replaceState({}, document.title, window.location.pathname);

      fetch(`${BASE_URL}/api/auth/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      })
      .then(res => {
        if (!res.ok) throw new Error("Auth failed");
        return res.json();
      })
      .then(data => {
        const userObj = data.user || data;
        setUser(userObj);
        localStorage.setItem("hft_user", JSON.stringify(userObj));
      })
      .catch(err => {
        setApiError("Authentication failed. Please try again.");
      })
      .finally(() => setIsAuthenticating(false));
    }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // If direction is swapped midway, flush out the build stack
  useEffect(() => {
    setLevels([]);
    setFilters([]);
    setEditingState(null);
    setPreviewData(null);
  }, [gameDirection]);

  // ── Refresh preview whenever pendingAlpha/thresholds/editingLevel change ───
  const refreshPreview = useCallback(async (
    type: "alpha" | "filter", lvlIdx: number, alphaId: string, thresholds: number[], sideVal: 1 | -1,
  ) => {
    const mult = getMetricConfig(alphaId).mult;
    const actualThresholds = thresholds.map((t) => t * mult);
    const upstream = type === "alpha" 
      ? buildUpstreamFilters(levels, lvlIdx)
      : [...buildUpstreamFilters(levels, levels.length), ...buildUpstreamFilters(filters, lvlIdx)];
    try {
      const data = await apiFetchBuckets("is", sideVal, alphaId, actualThresholds, upstream);
      setPreviewData({ buckets: data.buckets, filteredRows: data.filteredRows });
    } catch {
      setPreviewData(null);
    }
  }, [levels, filters]);

  useEffect(() => {
    if (editingState === null) { setPreviewData(null); return; }
    refreshPreview(editingState.type, editingState.idx, pendingAlpha, pendingThresholds, directionMult as 1 | -1);
  }, [editingState, pendingAlpha, pendingThresholds, directionMult, refreshPreview]);

  // ── Game flow ──────────────────────────────────────────────────────────────

  const handleLogin = () => {
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${import.meta.env.VITE_GITHUB_CLIENT_ID}&scope=user`;
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("hft_user");
  };

  async function startGame() {
    setIsLoading(true);
    setApiError(null);
    try {
      const m = await apiFetchMeta();
      setMeta(m);
      setAvailableAlphas(INITIAL_ALPHAS);
      setLevels([]);
      setFilters([]);
      setEditingState(null);
      setRegressionFeatures([]);
      setRegressionTarget("r60");
      setStrategyName("custom_strategy");
      setRegressionResults(null);
      setActiveModelData(null);
      setSaveStatus(null);
      setPendingAlpha(INITIAL_ALPHAS[0].id);
      setPendingThresholds([...DEFAULT_BPS_THRESHOLDS]);
      setThresholdInput(DEFAULT_BPS_THRESHOLDS.join(", "));
      setOosResults(null);
      setPhase("build");
    } catch (e) {
      setApiError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  function addLevel(type: "alpha" | "filter") {
    setEditingState({ type, idx: type === "alpha" ? levels.length : filters.length });
    setPendingAlpha(type === "alpha" ? availableAlphas[0].id : INITIAL_FILTERS[0].id);
    setPendingThresholds([...DEFAULT_BPS_THRESHOLDS]);
    setThresholdInput(DEFAULT_BPS_THRESHOLDS.join(", "));
  }

  function editLevel(type: "alpha" | "filter", idx: number) {
    const lvl = type === "alpha" ? levels[idx] : filters[idx];
    const mult = getMetricConfig(lvl.alphaId).mult;
    const displayThresholds = lvl.thresholds.map((t) => t / mult);
    setEditingState({ type, idx });
    setPendingAlpha(lvl.alphaId);
    setPendingThresholds([...displayThresholds]);
    setThresholdInput(displayThresholds.join(", "));
  }

  async function applyPendingLevel() {
    if (editingState === null) return;
    setIsLoading(true);
    setApiError(null);
    try {
      const { type, idx } = editingState;
      const mult = getMetricConfig(pendingAlpha).mult;
      const actualThresholds = pendingThresholds.map((t) => t * mult);

      const upstream = type === "alpha" 
        ? buildUpstreamFilters(levels, idx)
        : [...buildUpstreamFilters(levels, levels.length), ...buildUpstreamFilters(filters, idx)];
        
      const data = await apiFetchBuckets("is", directionMult as 1 | -1, pendingAlpha, actualThresholds, upstream);
      const newLvl: Level = {
        alphaId: pendingAlpha,
        thresholds: actualThresholds,
        buckets: data.buckets,
        filteredRows: data.filteredRows,
        totalRows: data.totalRows,
        selectedBuckets: [],
      };
      
      if (type === "alpha") setLevels((prev) => [...prev.slice(0, idx), newLvl]);
      else setFilters((prev) => [...prev.slice(0, idx), newLvl]);
      
      setEditingState(null);
    } catch (e) {
      setApiError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  function toggleBucket(type: "alpha" | "filter", lvlIdx: number, bucketIdx: number) {
    const updater = (prev: Level[]) =>
      prev.slice(0, lvlIdx + 1).map((lvl, i) => {
        if (i !== lvlIdx) return lvl;
        const sel = lvl.selectedBuckets.includes(bucketIdx)
          ? lvl.selectedBuckets.filter((b) => b !== bucketIdx)
          : [...lvl.selectedBuckets, bucketIdx];
        return { ...lvl, selectedBuckets: sel };
      });
    if (type === "alpha") setLevels(updater);
    else setFilters(updater);
  }

  function removeLevel(type: "alpha" | "filter", idx: number) {
    if (type === "alpha") setLevels((prev) => prev.slice(0, idx));
    else setFilters((prev) => prev.slice(0, idx));
    setEditingState(null);
  }

  async function startOOS() {
    if (!levels.length) return;
    setPhase("oos");
    setOosProgress(0);
    setApiError(null);
    setSaveStatus(null);

    // Dynamically generate a strategy name based on constituents if left as default
    if (strategyName === "custom_strategy" || strategyName === "custom_alpha" || !strategyName.trim()) {
      setStrategyName(`strategy${savedStrategies.length + 1}`);
    }

    // Fire OOS API call immediately — animate in parallel
    const isFilterStage = filters.length > 0;
    const lastLvl = isFilterStage ? filters[filters.length - 1] : levels[levels.length - 1];
    
    const upstream = isFilterStage
      ? [...buildUpstreamFilters(levels, levels.length), ...buildUpstreamFilters(filters, filters.length - 1)]
      : buildUpstreamFilters(levels, levels.length - 1);

    let oosResultData: OOSResults | null = null;
    try {
      const data = await apiFetchBuckets("oos", directionMult as 1 | -1, lastLvl.alphaId, lastLvl.thresholds, upstream);
      const stats = aggStats(data.buckets, lastLvl.selectedBuckets);
      oosResultData = { stats, n: stats.n, totalRows: data.totalRows };
    } catch (e) {
      setApiError(String(e));
    }

    // Animate progress bar then reveal results
    let progress = 0;
    timerRef.current = setInterval(() => {
      progress += 2;
      setOosProgress(Math.min(progress, 100));
      if (progress >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        setOosResults(oosResultData);
        setPhase("results");
      }
    }, 60);
  }

  async function runRegression() {
    setIsRegressionLoading(true);
    setApiError(null);
    try {
      const currentUserId = user?.id || (user as any)?._id || (user as any)?.username || (user as any)?.login || "anonymous_user";
      const data = await apiRunRegression("is", directionMult as 1 | -1, regressionFeatures, regressionTarget, strategyName, currentUserId);
      setRegressionResults(data);
      setActiveModelData(data);
      setSaveStatus(null);
      
      if (!availableAlphas.find((a) => a.id === strategyName)) {
        setAvailableAlphas((prev) => [...prev, {
          id: strategyName,
          label: strategyName,
          desc: `OLS on ${regressionTarget}`
        }]);
      }
    } catch (e) {
      setApiError(String(e));
    } finally {
      setIsRegressionLoading(false);
    }
  }

  async function handleSaveStrategy() {
    // DIAGNOSTIC 1: Confirm the click action successfully registers
    alert("Save button clicked! Beginning payload validation...");

    // The OAuth provider or local storage might not explicitly return `.id` depending on the backend schema. Fallback safely.
    console.log("Current user state object:", user); // Check F12 Console to see exactly what keys your backend returned
    
    const currentUserId = user?.id || (user as any)?._id || (user as any)?.username || (user as any)?.login || "anonymous_user";
    if (!currentUserId) {
      alert("Save halted: user identity could not be resolved.");
      return;
    }
    
    setIsSaving(true);
    setSaveStatus(null);
    
    try {
      const activeFilters = [...levels, ...filters];

      const activeWorkspaceLevels = activeFilters.map((filter) => {
        return { 
          alphaId: filter.alphaId, 
          thresholds: filter.thresholds || [], 
          selectedBuckets: filter.selectedBuckets || [] 
        };
      });

      const payload = {
        userId: currentUserId,
        signalName: strategyName || "unnamed_signal",
        targetHorizon: regressionTarget || "r60",
        features: regressionFeatures || [],
        isRSquared: activeModelData?.isRSquared ?? activeModelData?.rSquared ?? 0, 
        oosRSquared: activeModelData?.oosRSquared ?? 0,
        intercept: activeModelData?.intercept ?? 0,
        coefficients: activeModelData?.coefficients ?? {},
        oosBucketData: activeModelData?.oosBucketData ?? [], 
        activeWorkspaceLevels
      };

      // DIAGNOSTIC 3: Log the built object right before dispatching fetch
      console.log("Built Payload Object successfully:", payload);

      const res = await apiSaveStrategy(payload);
      console.log("Server Network Response:", res);
      
      if (res && res.status === "success") {
        alert("Success! Server accepted the save transaction.");
        setSaveStatus({ success: true, message: res.message || "Strategy exported successfully!" });
        if (typeof fetchUserStrategies === 'function') {
          fetchUserStrategies(); 
        }
      } else {
        setSaveStatus({ success: false, message: res?.message || "Server rejected the save transaction." });
      }
    } catch (e: any) {
      // DIAGNOSTIC 4: Force a browser alert display of the exact crash trace line
      console.error("CRITICAL EXCEPTION IN HANDLER:", e);
      alert(`FRONTEND EXCEPTION CAUGHT: ${e.message}\nStack: ${e.stack}`);
      setSaveStatus({ success: false, message: `Frontend Crash: ${String(e)}` });
    } finally {
      setIsSaving(false);
    }
  }


  async function loadWorkspace(strategy: any) {
    setIsLoading(true);
    setApiError(null);
    setPhase("build");
    setOosResults(null);
    setRegressionTarget(strategy.targetHorizon || "r60");
    setRegressionFeatures(strategy.features || []);
    setStrategyName((strategy.signalName || "loaded_signal") + "_v2");

    try {
      let currentLevels: Level[] = [];
      let currentFilters: Level[] = [];

      for (const lvl of strategy.activeWorkspaceLevels || []) {
        const isFilter = INITIAL_FILTERS.some(f => f.id === lvl.alphaId);
        const upstream = isFilter
          ? [...currentLevels.map(l => ({alphaId: l.alphaId, thresholds: l.thresholds, selectedBuckets: l.selectedBuckets})), ...currentFilters.map(l => ({alphaId: l.alphaId, thresholds: l.thresholds, selectedBuckets: l.selectedBuckets}))]
          : currentLevels.map(l => ({alphaId: l.alphaId, thresholds: l.thresholds, selectedBuckets: l.selectedBuckets}));

        // Sequentially rebuild the distribution slices
        const data = await apiFetchBuckets("is", directionMult as 1 | -1, lvl.alphaId, lvl.thresholds, upstream);
        
        const fullLvl: Level = {
          alphaId: lvl.alphaId,
          thresholds: lvl.thresholds,
          selectedBuckets: lvl.selectedBuckets || [],
          buckets: data.buckets,
          filteredRows: data.filteredRows,
          totalRows: data.totalRows,
        };
        
        if (isFilter) currentFilters.push(fullLvl);
        else currentLevels.push(fullLvl);
      }
      
      setLevels(currentLevels);
      setFilters(currentFilters);
      setActiveModelData(strategy);
      
      setWorkspaceGlow(true);
      setTimeout(() => setWorkspaceGlow(false), 1500);
    } catch (e) {
      setApiError("Failed to load workspace: " + String(e));
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderIntro() {
    return (
      <div className="intro-screen">
        <div className="intro-logo">
          <span className="logo-hft">RAINFOREST</span>
          <span className="logo-alpha">TRADING</span>
          <span className="logo-bucket">SIMULATOR</span>
        </div>
        <p className="intro-sub">Strategy research simulation · In-sample optimization · OOS validation</p>
        <div className="intro-rules">
          <div className="rule"><span className="rule-num">01</span><span>Choose an alpha signal & bucket by basis points of forward return</span></div>
          <div className="rule"><span className="rule-num">02</span><span>Select buckets where the edge is in your favor</span></div>
          <div className="rule"><span className="rule-num">03</span><span>Drill deeper with additional alpha layers</span></div>
          <div className="rule"><span className="rule-num">04</span><span>Trade your rule on an unseen OOS day — see if it holds</span></div>
        </div>
        <div className="dir-selector">
          <button 
            className={`dir-btn long ${gameDirection === "long" ? "active" : ""}`} 
            onClick={() => setGameDirection("long")}
          >LONG STRATEGY</button>
          <button 
            className={`dir-btn short ${gameDirection === "short" ? "active" : ""}`} 
            onClick={() => setGameDirection("short")}
          >SHORT STRATEGY</button>
        </div>
        {apiError && <div className="error-box">⚠ {apiError}</div>}
        <button className="btn-primary btn-big" onClick={startGame} disabled={isLoading}>
          {isLoading ? "CONNECTING…" : "INITIALIZE SIMULATION"}
        </button>
        <div className="disclaimer">For educational and research purposes only.</div>
      </div>
    );
  }

  function renderBucketLevel(lvl: Level, lvlIdx: number, type: "alpha" | "filter") {
    const maxAbs = Math.max(...lvl.buckets.map((b) =>
      Math.max(Math.abs(b.r60), Math.abs(b.r300), Math.abs(b.r1800))), 0.1);
      
    const sourceList = type === "alpha" ? availableAlphas : INITIAL_FILTERS;
    const prefix = type === "alpha" ? "L" : "F";
    const config = getMetricConfig(lvl.alphaId);
    const displayThresholds = lvl.thresholds.map((t) => t / config.mult);

    return (
      <div key={lvlIdx} className="level-card">
        <div className="level-header">
          <div className={`level-badge ${type === "filter" ? "filter-badge" : ""}`}>{prefix}{lvlIdx + 1}</div>
          <div className="level-info">
            <span className="level-alpha">{sourceList.find((a) => a.id === lvl.alphaId)?.label}</span>
            <span className="level-thresholds">{displayThresholds.join(", ")} {config.suffix}</span>
          </div>
          <div className="level-actions">
            <button className="btn-xs" onClick={() => editLevel(type, lvlIdx)}>EDIT</button>
            <button className="btn-xs btn-danger" onClick={() => removeLevel(type, lvlIdx)}>✕</button>
          </div>
        </div>
        <div className="buckets-grid">
          {lvl.buckets.map((b, bi) => {
            const selected = lvl.selectedBuckets.includes(bi);
            const dominant = Math.abs(b.r60) > 0.5 ? (b.r60 > 0 ? "long" : "short") : "neutral";
            return (
              <div
                key={bi}
                className={`bucket-row ${selected ? "selected" : ""} ${dominant}`}
                onClick={() => toggleBucket(type, lvlIdx, bi)}
              >
                <div className="bucket-label">{b.label}</div>
                <div className="bucket-n">n={b.n.toLocaleString()}</div>
                <div className="bucket-bars">
                  {RETURN_HORIZONS.map(({ key, label }) => {
                    const v = b[key as "r60" | "r300" | "r1800"];
                    return (
                      <div key={key} className="bar-row">
                        <span className="bar-label">{label}</span>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${barWidth(v, maxAbs)}%`,
                              background: pnlColor(v, directionMult),
                              marginLeft: v < 0 ? `${100 - barWidth(v, maxAbs)}%` : "0",
                            }}
                          />
                        </div>
                        <span className="bar-val" style={{ color: pnlColor(v, directionMult) }}>
                          {v >= 0 ? "+" : ""}{v.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className={`bucket-select-indicator ${selected ? "on" : "off"}`}>
                  {selected ? "✓ SELECTED" : "SELECT"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderEditor() {
    if (editingState === null) return null;
    const { type, idx } = editingState;
    const isNew = idx === (type === "alpha" ? levels.length : filters.length);
    const sourceList = type === "alpha" ? availableAlphas : INITIAL_FILTERS;

    return (
      <div className="editor-panel">
        <div className="editor-title">{isNew ? `ADD ${type.toUpperCase()} ${idx + 1}` : `EDIT ${type.toUpperCase()} ${idx + 1}`}</div>
        <div className="editor-row">
          <label>{type === "alpha" ? "Alpha Signal" : "Filter Metric"}</label>
          <div className="alpha-select-grid">
            {sourceList.map((a) => (
              <button
                key={a.id}
                className={`alpha-chip ${pendingAlpha === a.id ? "active" : ""}`}
                onClick={() => setPendingAlpha(a.id)}
                title={a.desc}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="editor-row">
          <label>{getMetricConfig(pendingAlpha).label}</label>
          <input
            className="threshold-input"
            value={thresholdInput}
            onChange={(e) => {
              setThresholdInput(e.target.value);
              const parsed = e.target.value
                .split(",")
                .map((s) => parseFloat(s.trim()))
                .filter((n) => !isNaN(n))
                .sort((a, b) => a - b);
              if (parsed.length > 0) setPendingThresholds(parsed);
            }}
          />
        </div>
        {previewData && (
          <div className="editor-preview">
            <div className="preview-label">
              PREVIEW ({previewData.filteredRows.toLocaleString()} rows → {previewData.buckets.length} buckets)
            </div>
            <div className="preview-mini-buckets">
              {previewData.buckets.map((b, bi) => (
                <div key={bi} className="preview-bucket">
                  <span className="preview-bucket-label">{b.label}</span>
                  <span className="preview-bucket-n">n={b.n}</span>
                  <span className="preview-bucket-ret" style={{ color: pnlColor(b.r60, directionMult) }}>
                    60s: {b.r60 >= 0 ? "+" : ""}{b.r60.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {apiError && <div className="error-box">⚠ {apiError}</div>}
        <div className="editor-btns">
          <button className="btn-primary" onClick={applyPendingLevel} disabled={isLoading}>
            {isLoading ? "LOADING…" : "APPLY"}
          </button>
          <button className="btn-ghost" onClick={() => setEditingState(null)}>CANCEL</button>
        </div>
      </div>
    );
  }

  function renderBuild() {
    const hasSelections = levels.some((l) => l.selectedBuckets?.length > 0);
    const lastLevelComplete = levels.length > 0 && levels[levels.length - 1].selectedBuckets?.length > 0;
    const canAddMore = lastLevelComplete && levels.length < 5;
    const canGo = hasSelections && editingState === null;

    return (
      <div className="build-screen">
        <div className={`build-left ${workspaceGlow ? "workspace-glow" : ""}`}>
          <div className="build-header">
            <div className="build-title">STRATEGY BUILDER</div>
            <div className="build-subtitle">IN-SAMPLE · {meta?.isRows.toLocaleString() ?? "—"} EVENTS</div>
          </div>

          {editingState !== null && renderEditor()}

          {editingState === null && (
            <>
              {levels.map((lvl, idx) => renderBucketLevel(lvl, idx, "alpha"))}
              <div className="add-level-row">
                {levels.length === 0 && (
                  <button className="btn-primary" onClick={() => addLevel("alpha")}>+ ADD FIRST ALPHA LAYER</button>
                )}
                {canAddMore && (
                  <button className="btn-secondary" onClick={() => addLevel("alpha")}>+ ADD DEEPER LAYER (L{levels.length + 1})</button>
                )}
                {hasSelections && !canAddMore && levels.length >= 5 && (
                  <div className="max-depth-msg">MAX DEPTH REACHED (5 layers)</div>
                )}
              </div>
              
              {levels.length > 0 && (
                <div className="mt-8 border-t border-[#2ecc71]/20 pt-6">
                  <div className="build-title" style={{ fontSize: "16px", color: "#1abc9c" }}>FILTER LAYERS</div>
                  <div className="build-subtitle mb-4">POST-ALPHA EXECUTION FILTERS</div>
                  {filters.map((lvl, idx) => renderBucketLevel(lvl, idx, "filter"))}
                  <div className="add-level-row">
                     <button className="btn-secondary" style={{ borderColor: "#1abc9c", color: "#1abc9c" }} onClick={() => addLevel("filter")}>+ ADD FILTER LAYER</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className={`build-right ${workspaceGlow ? "workspace-glow" : ""}`}>
          {/* STRATEGY VAULT */}
          <div className="stats-panel flex flex-col gap-3">
            <div className="stats-title flex justify-between items-center">
              <span>📂 STRATEGY VAULT</span>
              <span className="text-[#55735b] text-[9px]">{savedStrategies.length} ARCHIVED</span>
            </div>
            {savedStrategies.length === 0 ? (
              <div className="text-[9px] text-[#55735b] italic p-2 bg-black/20 rounded border border-[#2ecc71]/10">
                No archived strategies linked to this account yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                {savedStrategies.map((strat, i) => (
                  <div key={i} className="p-2.5 bg-black/40 border border-[#2ecc71]/20 rounded flex flex-col gap-2 group transition-colors hover:border-[#2ecc71]/40">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-bold text-[#2ecc71] max-w-[120px] truncate" title={strat.signalName}>{strat.signalName}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-[#2ecc71]/10 text-[#2ecc71] rounded">{strat.targetHorizon}</span>
                    </div>
                    <div className="flex gap-3 text-[9px] mt-1 bg-black/20 p-1.5 rounded border border-[#2ecc71]/10">
                       <div className="flex flex-col"><span className="text-[#55735b]">SCORE</span><span className={`font-bold ${strat.oosScore > 0 ? "text-[#27ae60]" : "text-[#e74c3c]"}`}>{strat.oosScore != null ? (strat.oosScore >= 0 ? "+" : "") + strat.oosScore.toFixed(2) : "—"}</span></div>
                       <div className="flex flex-col"><span className="text-[#55735b]">IS R²</span><span className="text-[#cce3ce]">{(strat.isRSquared * 100).toFixed(1)}%</span></div>
                       <div className="flex flex-col"><span className="text-[#55735b]">OOS R²</span><span className="text-[#f1c40f]">{(strat.oosRSquared || 0).toFixed(1)}%</span></div>
                    </div>
                    <div className="flex flex-col gap-1 mt-1 border-t border-[#2ecc71]/10 pt-2">
                      <div className="text-[8px] text-[#55735b] uppercase tracking-widest mb-1">Rule Summary</div>
                      {(() => {
                        let alphaCount = 0;
                        let filterCount = 0;
                        return strat.activeWorkspaceLevels?.map((lvl: any, idx: number) => {
                          const isFilter = INITIAL_FILTERS.some(f => f.id === lvl.alphaId);
                          const sourceList = isFilter ? INITIAL_FILTERS : INITIAL_ALPHAS;
                          const alphaName = sourceList.find(a => a.id === lvl.alphaId)?.label || lvl.alphaId;
                          
                          let displayIdx;
                          if (isFilter) { filterCount++; displayIdx = filterCount; } 
                          else { alphaCount++; displayIdx = alphaCount; }
                          
                          const prefix = isFilter ? "F" : "L";
                          const mult = getMetricConfig(lvl.alphaId).mult;
                          const displayThresh = (lvl.thresholds || []).map((t: number) => t / mult);
                          const labels = [];
                          const sel = lvl.selectedBuckets || [];
                          for (let j = 0; j <= displayThresh.length; j++) {
                            if (sel.includes(j)) {
                              if (j === 0) labels.push(`<${displayThresh[0]}`);
                              else if (j === displayThresh.length) labels.push(`>${displayThresh[displayThresh.length - 1]}`);
                              else labels.push(`${displayThresh[j - 1]} to ${displayThresh[j]}`);
                            }
                          }
                          return (
                            <div key={idx} className="flex justify-between items-start text-[8px] leading-tight mb-0.5">
                              <div className="flex gap-1">
                                <span style={{ color: isFilter ? "#1abc9c" : "#2ecc71", fontWeight: "bold" }}>{prefix}{displayIdx}</span>
                                <span className="text-[#819985]">{alphaName}</span>
                              </div>
                              <span className="text-[#55735b] text-right max-w-[90px] truncate" title={labels.join(", ")}>{labels.join(", ")}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <button className="btn-secondary w-full py-1.5 mt-1 text-[9px] bg-[#2ecc71]/5 border-[#2ecc71]/30 hover:bg-[#2ecc71]/20" onClick={() => loadWorkspace(strat)}>
                      ⚡ LOAD INTO WORKSPACE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stats-panel mt-4">
            <div className="stats-title">CURRENT RULE</div>
            <div className="stats-row">
              <span className="stats-label">Depth</span>
              <span className="stats-val">{allLevels.filter((l) => l.selectedBuckets?.length > 0).length} layers</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Coverage</span>
              <span className="stats-val">{coverage.toFixed(1)}%</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Matched rows</span>
              <span className="stats-val">{currentStats.n.toLocaleString()}</span>
            </div>
            <div className="stats-divider" />
            <div className="stats-title">EXPECTED EDGE</div>
            {RETURN_HORIZONS.map(({ key, label }) => (
              <div key={key} className="stats-row">
                <span className="stats-label">{label}</span>
                <span className="stats-val" style={{ color: pnlColor(currentStats[key as "r60" | "r300" | "r1800"], directionMult) }}>
                  {currentStats[key as "r60" | "r300" | "r1800"] >= 0 ? "+" : ""}{currentStats[key as "r60" | "r300" | "r1800"].toFixed(3)} bps
                </span>
              </div>
            ))}
            <div className="stats-divider" />
            <div className="stats-row">
              <span className="stats-label">SCORE</span>
              <span className={`stats-score ${score > 0 ? "positive" : "negative"}`}>
                {score >= 0 ? "+" : ""}{score.toFixed(2)}
              </span>
            </div>
            <div className="coverage-bar-wrap">
              <div className="coverage-bar" style={{ width: `${Math.min(100, coverage)}%` }} />
            </div>
          </div>

          {/* REGRESSION STUDIO */}
          <div className="stats-panel mt-4 flex flex-col gap-3">
            <div className="stats-title">REGRESSION STUDIO</div>
            
            <div className="flex flex-col gap-2">
              {INITIAL_ALPHAS.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-[10px] text-[#819985] cursor-pointer hover:text-[#cce3ce] transition-colors">
                  <input
                    type="checkbox"
                    className="accent-[#2ecc71] bg-black/30 border-[#2ecc71]/30 cursor-pointer rounded-sm"
                    checked={regressionFeatures.includes(a.id)}
                    onChange={(e) => {
                      if (e.target.checked) setRegressionFeatures([...regressionFeatures, a.id]);
                      else setRegressionFeatures(regressionFeatures.filter(f => f !== a.id));
                    }}
                  />
                  {a.label}
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-[#55735b] tracking-widest uppercase">Target Horizon</span>
              <select
                className="w-full p-1.5 bg-black/30 border border-[#2ecc71]/20 text-[#cce3ce] font-mono text-[11px] rounded outline-none focus:border-[#2ecc71] transition-colors"
                value={regressionTarget}
                onChange={(e) => setRegressionTarget(e.target.value)}
              >
                {RETURN_HORIZONS.map(rh => (
                  <option key={rh.key} value={rh.key}>{rh.key} ({rh.label})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-[#55735b] tracking-widest uppercase">Signal Name</span>
              <input
                className="w-full p-1.5 bg-black/30 border border-[#2ecc71]/20 text-[#cce3ce] font-mono text-[11px] rounded outline-none focus:border-[#2ecc71] transition-colors"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="e.g. alpha_1"
              />
            </div>

            <button className="btn-secondary w-full" onClick={runRegression} disabled={isRegressionLoading || regressionFeatures.length === 0 || !strategyName.trim()}>
              {isRegressionLoading ? "RUNNING..." : "RUN OLS REGRESSION"}
            </button>

            {activeModelData && (
              <div className="mt-2 pt-3 border-t border-[#2ecc71]/10 text-[10px] flex flex-col gap-1 text-[#cce3ce]">
                <div className="flex justify-between text-[#819985]"><span>IS R-Squared</span> <span className="text-[#cce3ce]">{(activeModelData.rSquared * 100).toFixed(2)}%</span></div>
                {activeModelData.oosRSquared !== undefined && (
                  <div className="flex justify-between text-[#819985]"><span>OOS R-Squared</span> <span className="text-[#f1c40f]">{activeModelData.oosRSquared.toFixed(1)}%</span></div>
                )}
                <div className="flex justify-between text-[#819985]"><span>Intercept</span> <span className="text-[#cce3ce]">{activeModelData.intercept.toFixed(4)}</span></div>
                <div className="text-[#55735b] mt-2 mb-1 border-b border-[#2ecc71]/10 pb-1">Coefficients</div>
                {Object.entries(activeModelData.coefficients || {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex justify-between items-center">
                    <span className="text-[#819985] text-[9px] truncate max-w-[100px]" title={k}>{k}</span>
                    <span className={v >= 0 ? "text-[#27ae60]" : "text-[#e74c3c]"}>{v >= 0 ? '+' : ''}{v.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canGo && (
            <button className="btn-fire" onClick={startOOS}>
              <span className="btn-fire-main">FIRE STRATEGY</span>
              <span className="btn-fire-sub">TRADE ON OOS DAY →</span>
            </button>
          )}
          {!hasSelections && (
            <div className="hint-box">Select buckets above to define your rule, then fire it on the unseen day.</div>
          )}
          {apiError && <div className="error-box">⚠ {apiError}</div>}
        </div>
      </div>
    );
  }

  function renderOOS() {
    return (
      <div className="oos-screen">
        <div className="oos-title">EXECUTING STRATEGY</div>
        <div className="oos-sub">Out-of-sample day · {meta?.oosRows.toLocaleString() ?? "—"} events</div>
        <div className="oos-progress-wrap">
          <div className="oos-progress-bar" style={{ width: `${oosProgress}%` }} />
        </div>
        <div className="oos-pct">{oosProgress}%</div>
        <div className="oos-log">
          {[...Array(Math.floor(oosProgress / 5))].map((_, i) => (
            <div key={i} className="oos-log-line">
              [{new Date(Date.now() - (20 - i) * 3000).toISOString().slice(11, 19)}]{" "}
              TRADE {gameDirection.toUpperCase()} · bucket matched · forwarded to execution
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderResults() {
    if (!oosResults) return null;
    const { stats } = oosResults;
    const oosScore = (stats.r60 * 1 + stats.r300 * 0.7 + stats.r1800 * 0.4) * directionMult;
    const isGood = oosScore > 0;
    const isGoodIS = score > 0;
    const overfitRatio = isGoodIS ? oosScore / score : 0;

    let grade: string, gradeColor: string;
    if (oosScore > 20)       { grade = "S"; gradeColor = "#27ae60"; }
    else if (oosScore > 10)  { grade = "A"; gradeColor = "#2ecc71"; }
    else if (oosScore > 0)  { grade = "B"; gradeColor = "#a4b595"; }
    else if (oosScore > -10) { grade = "C"; gradeColor = "#f1c40f"; }
    else if (oosScore > -20) { grade = "D"; gradeColor = "#e67e22"; }
    else                    { grade = "F"; gradeColor = "#e74c3c"; }

    return (
      <div className="results-screen">
        <div className="results-header">
          <div className="grade-badge" style={{ color: gradeColor, borderColor: gradeColor }}>{grade}</div>
          <div className="results-title-group">
            <div className="results-title">{isGood ? "STRATEGY VALIDATED" : "STRATEGY FAILED"}</div>
            <div className="results-sub">Out-of-sample performance report</div>
          </div>
        </div>

        <div className="results-grid">
          <div className="result-card">
            <div className="rc-title">IN-SAMPLE EDGE</div>
            {RETURN_HORIZONS.map(({ key, label }) => (
              <div key={key} className="rc-row">
                <span>{label}</span>
                <span style={{ color: pnlColor(currentStats[key as "r60" | "r300" | "r1800"], directionMult) }}>
                  {currentStats[key as "r60" | "r300" | "r1800"] >= 0 ? "+" : ""}{currentStats[key as "r60" | "r300" | "r1800"].toFixed(3)} bps
                </span>
              </div>
            ))}
            <div className="rc-score">Score: {score.toFixed(2)}</div>
          </div>
          <div className="result-card highlight">
            <div className="rc-title">OUT-OF-SAMPLE RESULT</div>
            {RETURN_HORIZONS.map(({ key, label }) => (
              <div key={key} className="rc-row">
                <span>{label}</span>
                <span style={{ color: pnlColor(stats[key as "r60" | "r300" | "r1800"], directionMult) }}>
                  {stats[key as "r60" | "r300" | "r1800"] >= 0 ? "+" : ""}{stats[key as "r60" | "r300" | "r1800"].toFixed(3)} bps
                </span>
              </div>
            ))}
            <div className="rc-score" style={{ color: isGood ? "#27ae60" : "#e74c3c" }}>
              Score: {oosScore.toFixed(2)}
            </div>
          </div>
          <div className="result-card">
            <div className="rc-title">RULE SUMMARY</div>
            {allLevels.filter((l) => l.selectedBuckets?.length > 0).map((lvl, i) => {
              const isFilter = i >= levels.length;
              const displayIdx = isFilter ? i - levels.length : i;
              const prefix = isFilter ? "F" : "L";
              const sourceList = isFilter ? INITIAL_FILTERS : availableAlphas;
              
              return (
              <div key={i} className="rc-rule-row">
                <span className="rc-rule-depth" style={{ color: isFilter ? "#1abc9c" : "#2ecc71" }}>{prefix}{displayIdx + 1}</span>
                <span>{sourceList.find((a) => a.id === lvl.alphaId)?.label}</span>
                <span className="rc-rule-buckets">
                  {lvl.selectedBuckets.map((bi) => lvl.buckets[bi]?.label).join(", ")}
                </span>
              </div>
              );
            })}
            <div className="rc-row">
              <span>Coverage</span>
              <span>
                {coverage.toFixed(1)}% IS / {oosResults.totalRows > 0 ? ((oosResults.n / oosResults.totalRows) * 100).toFixed(1) : 0}% OOS
              </span>
            </div>
          </div>
        </div>

        <div className="results-verdict">
          {isGood && overfitRatio > 0.5 && (
            <div className="verdict good">Strong signal transfer. Your alpha holds out-of-sample. This is the real deal.</div>
          )}
          {isGood && overfitRatio <= 0.5 && (
            <div className="verdict warn">Marginal OOS transfer. You may have over-fit some noise — the edge is thin.</div>
          )}
          {!isGood && isGoodIS && (
            <div className="verdict bad">Strategy collapsed out-of-sample. Classic overfit. Go back and be more selective.</div>
          )}
          {!isGood && !isGoodIS && (
            <div className="verdict bad">Even in-sample was poor. Try different alphas or thresholds.</div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[#2ecc71]/20 w-full">
          {oosScore >= MIN_SAVING_THRESHOLD ? (
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex flex-col gap-1 mb-1">
                <span className="text-[10px] text-[#819985] uppercase tracking-widest">Strategy Name</span>
                <input
                  className="w-full p-2 bg-black/40 border border-[#2ecc71]/30 text-[#cce3ce] font-mono text-[12px] rounded outline-none focus:border-[#2ecc71] transition-colors"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="Name your strategy..."
                />
              </div>
              <button className="btn-primary w-full flex justify-center items-center py-3 text-[14px]" onClick={handleSaveStrategy} disabled={isSaving || saveStatus?.success}>
                {isSaving ? "SAVING..." : saveStatus?.success ? "✓ STRATEGY ARCHIVED TO CLOUD" : "🚀 EXPORT & SAVE STRATEGY TO CLOUD"}
              </button>
              {saveStatus && (
                <div className={`p-2 text-center rounded ${saveStatus.success ? 'bg-[#27ae60]/20 text-[#2ecc71] border border-[#27ae60]/30' : 'bg-[#e74c3c]/20 text-[#e74c3c] border border-[#e74c3c]/30'}`}>
                  {saveStatus.message}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 mb-4 bg-black/40 border border-[#e74c3c]/30 rounded flex flex-col gap-1">
              <span className="text-[#e74c3c] font-bold text-[11px]">🔒 Archive Locked</span>
              <span className="text-[#819985] text-[9px] leading-relaxed">
                Out-of-Sample backtest score ({oosScore.toFixed(2)}) must exceed the minimum target threshold benchmark constraint of {MIN_SAVING_THRESHOLD.toFixed(1)} to unlock cloud table pushing pipelines.
              </span>
            </div>
          )}
        </div>

        <div className="results-btns">
          <button className="btn-primary" onClick={() => { setPhase("build"); setOosResults(null); setSaveStatus(null); }}>REFINE STRATEGY</button>
          <button className="btn-ghost" onClick={startGame}>NEW SIMULATION</button>
        </div>
      </div>
    );
  }

  function renderLogin() {
    return (
      <div className="login-screen">
        <h1 className="login-title">HFT Alpha Bucketer Studio</h1>
        <p className="login-desc">Connect your profile to build, regress, and archive algorithmic trading strategies.</p>
        <button className="btn-github" onClick={handleLogin} disabled={isAuthenticating}>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
          {isAuthenticating ? "AUTHENTICATING..." : "Sign in with GitHub"}
        </button>
        {apiError && <div className="error-box">⚠ {apiError}</div>}
        <div className="disclaimer">For educational and research purposes only.</div>
      </div>
    );
  }

  function renderHUD() {
    if (phase === "intro") return null;
    return (
      <div className="hud">
        <div className="hud-left">
          <span className="hud-logo">RAINFOREST·TRADING</span>
          <span className={`hud-phase ${phase}`}>{phase.toUpperCase()}</span>
          {phase !== "intro" && <span className={`hud-phase hud-dir ${gameDirection}`}>{gameDirection.toUpperCase()}</span>}
        </div>
        <div className="hud-right">
          {phase === "build" && (
            <>
              <div className="hud-stat"><span>IS rows</span><span>{meta?.isRows.toLocaleString() ?? "—"}</span></div>
              <div className="hud-stat"><span>Matched</span><span>{currentStats.n.toLocaleString()}</span></div>
              <div className="hud-stat"><span>Score</span><span style={{ color: pnlColor(score) }}>{score >= 0 ? "+" : ""}{score.toFixed(2)}</span></div>
            </>
          )}
          {user && (
            <div className="hud-user">
              <img src={user.avatarUrl} alt="Avatar" className="hud-avatar" />
              <div className="hud-user-info">
                <span className="hud-username">{user.username}</span>
                <button className="hud-logout" onClick={handleLogout}>Sign Out</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@300;400;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #061208;
          color: #cce3ce;
          font-family: 'Space Mono', monospace;
          min-height: 100vh;
          overflow-x: hidden;
        }

        #root, .game-root {
          min-height: 100vh;
          background: #061208;
          background-image:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(46,204,113,0.07) 0%, transparent 60%),
            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(46,204,113,0.03) 39px, rgba(46,204,113,0.03) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(46,204,113,0.02) 39px, rgba(46,204,113,0.02) 40px);
        }

        .hud {
          position: sticky; top: 0; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 24px;
          background: rgba(6,18,8,0.92);
          border-bottom: 1px solid rgba(46,204,113,0.2);
          backdrop-filter: blur(8px);
        }
        .hud-left { display: flex; align-items: center; gap: 16px; }
        .hud-logo { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-size: 16px; letter-spacing: 2px; color: #2ecc71; }
        .hud-phase { font-size: 10px; letter-spacing: 2px; padding: 2px 8px; border-radius: 2px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.3); }
        .hud-phase.build { color: #2ecc71; }
        .hud-phase.oos { color: #f1c40f; border-color: rgba(241,196,15,0.4); background: rgba(241,196,15,0.08); }
        .hud-phase.results { color: #27ae60; border-color: rgba(39,174,96,0.4); background: rgba(39,174,96,0.08); }
        .hud-right { display: flex; gap: 24px; }
        .hud-stat { display: flex; flex-direction: column; align-items: flex-end; }
        .hud-stat span:first-child { font-size: 9px; color: #55735b; letter-spacing: 1px; }
        .hud-stat span:last-child { font-size: 13px; color: #cce3ce; }

        .intro-screen {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 100vh; gap: 40px; padding: 40px 24px; text-align: center;
        }
        .intro-logo {
          display: flex; flex-direction: column; align-items: center; line-height: 1;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
        }
        .logo-hft { font-size: 14px; letter-spacing: 10px; color: #2ecc71; margin-bottom: 4px; }
        .logo-alpha { font-size: 56px; letter-spacing: 6px; color: #ffffff; }
        .logo-bucket { font-size: 16px; letter-spacing: 8px; color: #4a905a; margin-top: 4px; }
        .intro-sub { font-size: 11px; color: #55735b; letter-spacing: 2px; }
        .intro-rules { display: flex; flex-direction: column; gap: 12px; max-width: 440px; width: 100%; }
        .rule { display: flex; align-items: flex-start; gap: 16px; text-align: left; padding: 12px 16px; background: rgba(46,204,113,0.04); border: 1px solid rgba(46,204,113,0.1); border-radius: 4px; font-size: 12px; color: #819985; }
        .rule-num { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; color: #2ecc71; min-width: 28px; }

        .disclaimer { font-size: 9px; color: #55735b; opacity: 0.7; max-width: 400px; line-height: 1.4; text-align: center; margin-top: 12px; letter-spacing: 0.5px; text-transform: uppercase; }

        .btn-primary, .btn-secondary, .btn-ghost, .btn-fire, .btn-xs, .btn-danger {
          cursor: pointer; border: none; font-family: 'Space Mono', monospace; transition: all 0.15s;
        }
        .btn-primary {
          padding: 10px 24px; font-size: 12px; letter-spacing: 2px;
          background: #2ecc71; color: #061208; font-weight: 700; border-radius: 3px;
        }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .btn-primary:hover:not(:disabled) { background: #27ae60; transform: translateY(-1px); }
        .btn-big { padding: 14px 40px; font-size: 14px; }
        .btn-secondary {
          padding: 10px 20px; font-size: 11px; letter-spacing: 2px;
          background: transparent; color: #2ecc71; border: 1px solid #2ecc71; border-radius: 3px;
        }
        .btn-secondary:hover { background: rgba(46,204,113,0.1); }
        .btn-ghost {
          padding: 10px 20px; font-size: 11px; letter-spacing: 2px;
          background: transparent; color: #55735b; border: 1px solid rgba(85,115,91,0.4); border-radius: 3px;
        }
        .btn-ghost:hover { color: #cce3ce; border-color: #819985; }
        .btn-xs {
          padding: 3px 8px; font-size: 9px; letter-spacing: 1px;
          background: transparent; color: #4a9062; border: 1px solid rgba(74,144,98,0.3); border-radius: 2px;
        }
        .btn-xs:hover { color: #2ecc71; border-color: #2ecc71; }
        .btn-danger { color: #e74c3c !important; border-color: rgba(231,76,60,0.3) !important; }
        .btn-danger:hover { color: #e95e4f !important; background: rgba(231,76,60,0.1) !important; }
        .btn-fire {
          display: flex; flex-direction: column; align-items: center;
          padding: 16px 28px; background: linear-gradient(135deg, #d35400, #c0392b);
          color: #fff; border-radius: 4px; width: 100%;
          box-shadow: 0 0 24px rgba(211,84,0,0.3);
        }
        .btn-fire:hover { transform: translateY(-2px); box-shadow: 0 0 40px rgba(211,84,0,0.5); }
        .btn-fire-main { font-size: 14px; font-weight: 700; letter-spacing: 3px; }
        .btn-fire-sub { font-size: 10px; letter-spacing: 1px; opacity: 0.8; margin-top: 4px; }

        .dir-selector { display: flex; gap: 16px; margin: 10px 0 20px; }
        .dir-btn { padding: 12px 24px; font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; letter-spacing: 2px; border: 2px solid transparent; border-radius: 4px; cursor: pointer; transition: all 0.2s; background: rgba(0,0,0,0.4); color: #819985; }
        .dir-btn.long.active { border-color: #2ecc71; color: #2ecc71; background: rgba(46,204,113,0.1); box-shadow: 0 0 16px rgba(46,204,113,0.2); }
        .dir-btn.short.active { border-color: #e74c3c; color: #e74c3c; background: rgba(231,76,60,0.1); box-shadow: 0 0 16px rgba(231,76,60,0.2); }
        .dir-btn:not(.active):hover { color: #cce3ce; background: rgba(255,255,255,0.05); }
        .hud-dir.long { color: #2ecc71; border-color: rgba(46,204,113,0.4); background: rgba(46,204,113,0.08); }
        .hud-dir.short { color: #e74c3c; border-color: rgba(231,76,60,0.4); background: rgba(231,76,60,0.08); }

        .error-box { padding: 10px 14px; background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.3); border-radius: 4px; font-size: 10px; color: #e95e4f; max-width: 440px; width: 100%; }

        .build-screen { display: flex; gap: 0; min-height: calc(100vh - 49px); }
        .build-left { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; transition: box-shadow 0.4s ease; }
        .build-right { width: 240px; padding: 20px 16px; border-left: 1px solid rgba(46,204,113,0.1); display: flex; flex-direction: column; gap: 16px; position: sticky; top: 49px; max-height: calc(100vh - 49px); overflow-y: auto; transition: box-shadow 0.4s ease; }
        .build-left.workspace-glow, .build-right.workspace-glow { box-shadow: inset 0 0 40px rgba(46,204,113,0.15), 0 0 20px rgba(46,204,113,0.1), inset 0 0 0 1px rgba(46,204,113,0.8); }
        .build-title { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 700; letter-spacing: 3px; color: #2ecc71; }
        .build-subtitle { font-size: 9px; letter-spacing: 2px; color: #55735b; margin-top: 2px; }

        .level-card { background: rgba(46,204,113,0.03); border: 1px solid rgba(46,204,113,0.12); border-radius: 6px; overflow: hidden; }
        .level-header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(46,204,113,0.06); border-bottom: 1px solid rgba(46,204,113,0.1); }
        .level-badge { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 800; color: #2ecc71; min-width: 28px; }
        .filter-badge { color: #1abc9c; }
        .level-info { flex: 1; }
        .level-alpha { font-family: 'Barlow Condensed', sans-serif; font-size: 16px; font-weight: 700; letter-spacing: 1px; color: #cce3ce; }
        .level-thresholds { display: block; font-size: 9px; color: #55735b; margin-top: 1px; }
        .level-actions { display: flex; gap: 6px; }

        .buckets-grid { display: flex; flex-direction: column; }
        .bucket-row {
          display: grid; grid-template-columns: 160px 80px 1fr 100px;
          align-items: center; gap: 12px; padding: 8px 14px;
          cursor: pointer; border-bottom: 1px solid rgba(46,204,113,0.05); transition: background 0.1s;
        }
        .bucket-row:last-child { border-bottom: none; }
        .bucket-row:hover { background: rgba(46,204,113,0.06); }
        .bucket-row.selected { background: rgba(39,174,96,0.05); border-left: 3px solid #27ae60; }
        .bucket-row.long:hover { background: rgba(39,174,96,0.04); }
        .bucket-row.short:hover { background: rgba(231,76,60,0.04); }
        .bucket-label { font-size: 10px; color: #819985; letter-spacing: 0.5px; }
        .bucket-n { font-size: 9px; color: #55735b; }
        .bucket-bars { display: flex; flex-direction: column; gap: 4px; }
        .bar-row { display: flex; align-items: center; gap: 6px; }
        .bar-label { font-size: 8px; color: #55735b; min-width: 28px; }
        .bar-track { flex: 1; height: 5px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; position: relative; }
        .bar-fill { position: absolute; top: 0; height: 100%; border-radius: 2px; transition: width 0.3s; }
        .bar-val { font-size: 9px; min-width: 48px; text-align: right; }
        .bucket-select-indicator { font-size: 9px; letter-spacing: 1px; text-align: center; padding: 3px 8px; border-radius: 2px; border: 1px solid; }
        .bucket-select-indicator.on { color: #27ae60; border-color: rgba(39,174,96,0.4); background: rgba(39,174,96,0.08); }
        .bucket-select-indicator.off { color: #2a4a30; border-color: rgba(42,74,48,0.4); }

        .add-level-row { padding: 16px 0 0; display: flex; justify-content: flex-start; }
        .max-depth-msg { font-size: 10px; color: #55735b; letter-spacing: 1px; }
        .hint-box { font-size: 11px; color: #55735b; padding: 12px; background: rgba(46,204,113,0.03); border: 1px dashed rgba(46,204,113,0.15); border-radius: 4px; text-align: center; line-height: 1.6; }

        .stats-panel { background: rgba(46,204,113,0.03); border: 1px solid rgba(46,204,113,0.12); border-radius: 6px; padding: 14px; }
        .stats-title { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; letter-spacing: 2px; color: #4a9062; margin-bottom: 10px; }
        .stats-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 10px; }
        .stats-label { color: #55735b; }
        .stats-val { color: #cce3ce; }
        .stats-divider { height: 1px; background: rgba(46,204,113,0.1); margin: 8px 0; }
        .stats-score { font-family: 'Barlow Condensed', sans-serif; font-size: 24px; font-weight: 700; }
        .stats-score.positive { color: #27ae60; }
        .stats-score.negative { color: #e74c3c; }
        .coverage-bar-wrap { height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: 10px; }
        .coverage-bar { height: 100%; background: linear-gradient(90deg, #2ecc71, #27ae60); border-radius: 2px; transition: width 0.5s; }

        .editor-panel { background: rgba(46,204,113,0.04); border: 1px solid rgba(46,204,113,0.2); border-radius: 6px; padding: 18px; }
        .editor-title { font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 3px; color: #2ecc71; margin-bottom: 16px; }
        .editor-row { margin-bottom: 14px; }
        .editor-row label { display: block; font-size: 9px; letter-spacing: 1px; color: #55735b; margin-bottom: 6px; }
        .alpha-select-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .alpha-chip { padding: 5px 10px; font-size: 10px; background: rgba(46,204,113,0.05); border: 1px solid rgba(46,204,113,0.15); color: #819985; border-radius: 3px; cursor: pointer; transition: all 0.12s; }
        .alpha-chip:hover { border-color: #2ecc71; color: #cce3ce; }
        .alpha-chip.active { background: rgba(46,204,113,0.15); border-color: #2ecc71; color: #2ecc71; }
        .threshold-input { width: 100%; padding: 8px 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(46,204,113,0.2); color: #cce3ce; font-family: 'Space Mono', monospace; font-size: 11px; border-radius: 3px; outline: none; }
        .threshold-input:focus { border-color: #2ecc71; }
        .editor-preview { margin-bottom: 14px; }
        .preview-label { font-size: 9px; letter-spacing: 1px; color: #55735b; margin-bottom: 8px; }
        .preview-mini-buckets { display: flex; flex-direction: column; gap: 3px; max-height: 140px; overflow-y: auto; }
        .preview-bucket { display: flex; gap: 10px; font-size: 9px; padding: 3px 8px; background: rgba(0,0,0,0.2); border-radius: 2px; }
        .preview-bucket-label { color: #819985; flex: 1; }
        .preview-bucket-n { color: #55735b; min-width: 50px; }
        .preview-bucket-ret { min-width: 70px; text-align: right; }
        .editor-btns { display: flex; gap: 10px; }

        .oos-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: calc(100vh - 49px); padding: 40px 24px; gap: 28px; }
        .oos-title { font-family: 'Barlow Condensed', sans-serif; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #f1c40f; }
        .oos-sub { font-size: 11px; color: #55735b; letter-spacing: 2px; }
        .oos-progress-wrap { width: 100%; max-width: 500px; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
        .oos-progress-bar { height: 100%; background: linear-gradient(90deg, #d35400, #f1c40f); border-radius: 3px; transition: width 0.06s linear; box-shadow: 0 0 12px rgba(241,196,15,0.5); }
        .oos-pct { font-family: 'Barlow Condensed', sans-serif; font-size: 48px; font-weight: 800; color: #f1c40f; }
        .oos-log { width: 100%; max-width: 600px; height: 160px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid rgba(241,196,15,0.1); border-radius: 4px; padding: 10px 12px; font-size: 9px; color: #55735b; display: flex; flex-direction: column; gap: 2px; }
        .oos-log-line { color: #6a8a70; }

        .results-screen { max-width: 860px; margin: 0 auto; padding: 36px 24px; display: flex; flex-direction: column; gap: 28px; }
        .results-header { display: flex; align-items: center; gap: 24px; }
        .grade-badge { font-family: 'Barlow Condensed', sans-serif; font-size: 72px; font-weight: 800; border: 3px solid; border-radius: 8px; width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; }
        .results-title { font-family: 'Barlow Condensed', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: 4px; color: #cce3ce; }
        .results-sub { font-size: 10px; color: #55735b; letter-spacing: 2px; margin-top: 4px; }
        .results-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        .result-card { padding: 16px; background: rgba(46,204,113,0.03); border: 1px solid rgba(46,204,113,0.12); border-radius: 6px; }
        .result-card.highlight { background: rgba(39,174,96,0.04); border-color: rgba(39,174,96,0.2); }
        .rc-title { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; letter-spacing: 2px; color: #4a9062; margin-bottom: 12px; }
        .rc-row { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid rgba(46,204,113,0.05); }
        .rc-score { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; margin-top: 10px; color: #cce3ce; }
        .rc-rule-row { display: flex; align-items: flex-start; gap: 8px; font-size: 10px; padding: 4px 0; border-bottom: 1px solid rgba(46,204,113,0.05); }
        .rc-rule-depth { font-family: 'Barlow Condensed', sans-serif; color: #2ecc71; font-weight: 700; min-width: 20px; }
        .rc-rule-buckets { color: #55735b; font-size: 9px; margin-top: 2px; }
        .verdict { padding: 14px 18px; border-radius: 4px; font-size: 12px; line-height: 1.6; }
        .verdict.good { background: rgba(39,174,96,0.06); border: 1px solid rgba(39,174,96,0.2); color: #27ae60; }
        .verdict.warn { background: rgba(241,196,15,0.06); border: 1px solid rgba(241,196,15,0.2); color: #f1c40f; }
        .verdict.bad { background: rgba(231,76,60,0.06); border: 1px solid rgba(231,76,60,0.2); color: #e74c3c; }
        .results-btns { display: flex; gap: 12px; }

        .login-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; gap: 24px; padding: 40px 24px; text-align: center; }
        .login-title { font-family: 'Barlow Condensed', sans-serif; font-size: 48px; font-weight: 800; letter-spacing: 4px; color: #2ecc71; }
        .login-desc { font-size: 14px; color: #819985; max-width: 400px; line-height: 1.6; }
        .btn-github { display: flex; align-items: center; gap: 12px; padding: 12px 24px; font-size: 14px; font-family: 'Space Mono', monospace; font-weight: 700; letter-spacing: 1px; background: #2ea44f; color: #fff; border: none; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        .btn-github:hover:not(:disabled) { background: #2c974b; }
        .btn-github:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn-github svg { width: 20px; height: 20px; fill: currentColor; }

        .hud-user { display: flex; align-items: center; gap: 12px; border-left: 1px solid rgba(46,204,113,0.2); padding-left: 20px; margin-left: 8px; }
        .hud-avatar { width: 32px; height: 32px; border-radius: 50%; border: 1px solid #2ecc71; }
        .hud-user-info { display: flex; flex-direction: column; align-items: flex-end; }
        .hud-username { font-size: 11px; color: #cce3ce; font-weight: 700; }
        .hud-logout { font-size: 9px; color: #819985; background: none; border: none; cursor: pointer; padding: 0; margin-top: 2px; font-family: inherit; }
        .hud-logout:hover { color: #e74c3c; }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(46,204,113,0.2); border-radius: 2px; }

        @media (max-width: 700px) {
          .build-screen { flex-direction: column; }
          .build-right { width: 100%; position: static; border-left: none; border-top: 1px solid rgba(46,204,113,0.1); }
          .results-grid { grid-template-columns: 1fr; }
          .bucket-row { grid-template-columns: 120px 60px 1fr 80px; }
        }
      `}</style>
      <div className="game-root">
        {!user ? renderLogin() : (
          <>
            {renderHUD()}
            {phase === "intro"   && renderIntro()}
            {phase === "build"   && renderBuild()}
            {phase === "oos"     && renderOOS()}
            {phase === "results" && renderResults()}
          </>
        )}
      </div>
    </>
  );
}
