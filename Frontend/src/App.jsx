import React, { useEffect, useState, useRef, useCallback } from "react";
import BangaloreMap from "./components/BangaloreMap";
import CameraGrid from "./components/CameraGrid";
import Split from "react-split";

const BACKEND_HTTP = "http://127.0.0.1:8000";
const BACKEND_WS   = "ws://127.0.0.1:8000/ws";

// ── Bengaluru camera presets ──────────────────────────────────────────────────
const LOCATION_PRESETS = [
  { label: "Koramangala 100ft Rd", junction: "Koramangala Signal", station: "Koramangala",  lat: 12.9352, lng: 77.6245 },
  { label: "MG Road Junction",      junction: "MG Road Signal",      station: "Halasuru",    lat: 12.9757, lng: 77.6064 },
  { label: "Indiranagar 12th Main", junction: "CMH Road Signal",     station: "Indiranagar", lat: 12.9784, lng: 77.6408 },
  { label: "Silk Board Junction",   junction: "Silk Board Flyover",  station: "Bommanahalli",lat: 12.9166, lng: 77.6214 },
];
const VEHICLE_TYPES   = ["CAR", "BUS", "TRUCK", "TWO_WHEELER", "THREE_WHEELER", "HEAVY_VEHICLE"];
const VIOLATION_TYPES = ["NO_PARKING", "WRONG_SIDE", "DOUBLE_PARKING", "BUS_STOP_BLOCKING", "JUNCTION_BLOCKING"];

const DEFAULT_CAMERAS = LOCATION_PRESETS.map((p, i) => ({
  id: `cam_0${i + 1}`,
  label: p.label,
  junction: p.junction,
  station: p.station,
  lat: p.lat,
  lng: p.lng,
  vehicleType: VEHICLE_TYPES[i % VEHICLE_TYPES.length],
  violationType: VIOLATION_TYPES[i % VIOLATION_TYPES.length],
  videoFile: null,
  videoUrl: null,
  intervalSec: 30,
  dwellTime: parseFloat((3 + Math.random() * 8).toFixed(1)),
  active: false,
  violationsFired: 0,
}));

// ── Violation Detail Modal ───────────────────────────────────────────────────
function ViolationDetailModal({ v, onClose, onClear }) {
  if (!v) return null;
  const isActive = v.status === "active";
  
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`px-5 py-4 border-b flex justify-between items-center ${isActive ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"}`}>
          <div className="flex items-center gap-3">
             <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse' : 'bg-slate-400'}`} />
             <div>
               <h3 className="font-bold text-slate-800 text-lg leading-tight">{v.camera_id}</h3>
               <p className="text-xs text-slate-500 font-mono">{v.junction_name}</p>
             </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5">
          {/* Violation Type */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Violation Detected</p>
              <p className="font-bold text-slate-800 mt-0.5">
                {(() => {
                  try {
                    const parsed = JSON.parse(v.violation_type);
                    return Array.isArray(parsed) ? parsed.join(", ") : String(v.violation_type);
                  } catch(e) {
                    return String(v.violation_type || "UNKNOWN");
                  }
                })()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Vehicle Type</p>
              <p className="font-bold text-slate-800 mt-0.5">{v.vehicle_type}</p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`border rounded-lg p-3 ${isActive ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">ML Choke Point</p>
              <p className="text-xl font-bold text-red-600">{v.choke_point_impact != null ? v.choke_point_impact.toFixed(3) : "0.000"}</p>
              <p className="text-[10px] text-slate-400 mt-1">Severity prediction</p>
            </div>
            
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">Congestion Score</p>
              <p className="text-xl font-bold text-orange-600">{v.congestion_impact_score}%</p>
              <p className="text-[10px] text-slate-400 mt-1">Real-time blockage</p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">Economic Benefit</p>
              <p className="text-xl font-bold text-emerald-600">₹{v.economic_benefit}</p>
              <p className="text-[10px] text-slate-400 mt-1">Est. enforcement ROI</p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">Dwell Time</p>
              <p className="text-xl font-bold text-slate-700">{v.dwell_time}m</p>
              <p className="text-[10px] text-slate-400 mt-1">Time spent stationary</p>
            </div>
          </div>

          <div className="text-center text-xs text-slate-400 font-mono">
            Detected: {new Date(v.created_datetime).toLocaleString()}
          </div>
        </div>

        {/* Footer actions */}
        {isActive && (
          <div className="p-5 bg-slate-50 border-t border-slate-100">
            <button
              onClick={() => { onClear(v.id); onClose(); }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-mono text-sm uppercase tracking-widest py-3 rounded-lg transition-colors cursor-pointer font-bold shadow-md shadow-red-600/20"
            >
              Dispatch & Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Violation card (Simplified) ───────────────────────────────────────────────
function ViolationCard({ v, isSelected, onSelect }) {
  const isActive = v.status === "active";
  return (
    <div
      onClick={() => onSelect(v)}
      className={`rounded-lg p-3 cursor-pointer border transition-all duration-200 relative overflow-hidden flex items-center justify-between
        ${isActive
          ? `border-red-200 bg-red-50 ${isSelected ? "border-red-400 shadow-sm ring-1 ring-red-400" : "hover:border-red-300"}`
          : `border-slate-200 bg-white ${isSelected ? "border-blue-400 shadow-sm ring-1 ring-blue-400" : "hover:border-slate-300"}`
        }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isActive ? "bg-red-500" : "bg-slate-300"}`} />
      
      <div className="ml-3 flex flex-col gap-1 flex-1 min-w-0 pr-3">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="font-mono text-xs text-slate-500 font-bold">{v.camera_id}</span>
          </div>
          {isActive && (
            <span className="font-mono text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              CHOKE: {(v.choke_point_impact || 0).toFixed(2)}
            </span>
          )}
        </div>
        <p className="text-slate-800 text-sm font-semibold truncate" title={v.junction_name}>
          {v.junction_name}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="font-mono text-[10px] text-slate-400">
            {v.dwell_time}m dwell
          </span>
          {isActive && (
            <span className="font-mono text-[10px] text-emerald-600 font-bold">
              ₹{v.economic_benefit} ROI
            </span>
          )}
        </div>
      </div>

      <div className="text-slate-400 pr-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [violations, setViolations]           = useState([]);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [modalViolation, setModalViolation]   = useState(null);
  const [wsConnected, setWsConnected]         = useState(false);
  const [heatmapPoints, setHeatmapPoints]     = useState([]);
  const [currentTime, setCurrentTime]         = useState("");

  const [cameras, setCameras]         = useState(DEFAULT_CAMERAS);

  const wsRef             = useRef(null);
  const reconnectTimerRef = useRef(null);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")} IST`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchCameras = async () => {
    try {
      const cRes = await fetch(`${BACKEND_HTTP}/api/cameras`);
      if (cRes.ok) {
        const camData = await cRes.json();
        if (camData && camData.length > 0) {
          setCameras(camData);
          return true;
        }
      }
    } catch {}
    return false;
  };

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [vRes, hRes] = await Promise.all([
          fetch(`${BACKEND_HTTP}/api/violations`),
          fetch(`${BACKEND_HTTP}/api/heatmap`),
        ]);
        if (vRes.ok) {
          const data = await vRes.json();
          setViolations(data);
          const first = data.find(v => v.status === "active");
          if (first) setSelectedViolation(first);
        }
        if (hRes.ok) setHeatmapPoints(await hRes.json());
      } catch { /* backend offline during hackathon demo is OK */ }
      
      await fetchCameras();
    };
    load();
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const connect = () => {
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;
      ws.onopen  = () => {
        setWsConnected(true);
        // If the backend was offline when the UI loaded, cameras would be default. Try to fetch them now.
        setCameras(prev => {
          if (prev === DEFAULT_CAMERAS) fetchCameras();
          return prev;
        });
      };
      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data);
          if (event === "violation_created" || event === "violation_updated") {
            setViolations(prev => {
              const existingIdx = prev.findIndex(x => x.id === data.id);
              if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx] = data;
                return next;
              }
              return [data, ...prev];
            });
            setSelectedViolation(data);
          } else if (event === "violation_cleared") {
            setViolations(prev => prev.map(v => v.id === data.id ? { ...v, status: "cleared", cleared_at: data.cleared_at } : v));
            setSelectedViolation(prev => prev?.id === data.id ? null : prev);
          } else if (event === "heatmap_update") {
            setHeatmapPoints(data.points || []);
          }
        } catch { /* malformed frame */ }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (wsRef.current === ws) {
          setWsConnected(false);
          reconnectTimerRef.current = setTimeout(connect, 4000);
        }
      };
    };
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, []); // eslint-disable-line


  // ── Camera video upload ───────────────────────────────────────────────────
  const handleVideoUpload = (idx, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCameras(prev => prev.map((c, i) => i === idx ? { ...c, videoFile: file, videoUrl: url, active: true } : c));
  };

  // ── Clear violation ───────────────────────────────────────────────────────
  const handleClearViolation = async (id) => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/api/violations/${id}/clear`, { method: "POST" });
      if (res.ok) {
        setViolations(prev => prev.map(v => v.id === id ? { ...v, status: "cleared", cleared_at: new Date().toISOString() } : v));
        if (selectedViolation?.id === id) setSelectedViolation(null);
      }
    } catch { /* no-op */ }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const activeViolations = violations.filter(v => v.status === "active");
  const activeCount = activeViolations.length;
  const totalImpactScore = activeViolations.reduce((sum, v) => sum + (v.congestion_impact_score || 0), 0);
  const avgImpactScore = activeCount > 0 ? (totalImpactScore / activeCount).toFixed(0) : 0;
  const totalEconomicBenefit = activeViolations.reduce((sum, v) => sum + (v.economic_benefit || 0), 0);
  const highSeverityCount = activeViolations.filter(v => (v.choke_point_impact || 0) > 0.5).length;

  const sortedViolations = [...violations].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    if (a.status === "active") {
        const aVal = a.economic_benefit || 0;
        const bVal = b.economic_benefit || 0;
        return bVal - aVal;
    }
    return new Date(b.created_datetime) - new Date(a.created_datetime);
  });

  const uploadedCount = cameras.filter(c => c.videoUrl).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-50 text-slate-800 h-screen overflow-hidden flex flex-col font-sans">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 h-16 shrink-0 border-b border-slate-200 bg-white shadow-sm z-10">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-blue-700">BTCC COMMAND</h1>
            <span className="font-mono text-[10px] text-slate-400 tracking-widest uppercase font-semibold">Edge Intelligence Node</span>
          </div>
        </div>

        {/* Centre KPIs */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-3xl font-bold tabular-nums ${activeCount > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {activeCount}
            </div>
            <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Violations</div>
          </div>
          <div className="w-px h-10 bg-slate-200" />
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums text-blue-600">{uploadedCount}</div>
            <div className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Cameras Online</div>
          </div>
        </div>

        {/* Right: status + clock */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-slate-50">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${wsConnected ? "text-emerald-600" : "text-red-600"}`}>
              {wsConnected ? "Connected" : "Offline"}
            </span>
          </div>
          <span className="font-mono text-xs text-slate-500 tracking-widest font-medium">{currentTime}</span>
        </div>
      </header>

      {/* ── Main layout ── */}
      <Split 
        className="flex flex-1 overflow-hidden p-4 gap-2"
        sizes={[75, 25]}
        minSize={350}
        gutterSize={8}
        expandToMin={false}
      >
        {/* Left: Map + Camera strip */}
        <div className="flex flex-col h-full gap-4 overflow-hidden">
          {/* Map — takes most of the space */}
          <BangaloreMap
            violations={violations}
            heatmapPoints={heatmapPoints}
            selectedViolation={selectedViolation}
            onSelect={setSelectedViolation}
          />

          {/* Camera strip */}
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] font-bold text-slate-500 uppercase tracking-widest">Live Camera Feeds</span>
                <span className="font-mono text-[10px] text-slate-400">— click thumbnail to view real-time footage</span>
              </div>


            </div>

            <CameraGrid
              cameras={cameras}
              activeViolation={selectedViolation}
            />
          </div>
        </div>

        {/* Right: Violation stream */}
        <div className="h-full flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm min-w-0">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
            <span className="font-mono text-xs text-slate-800 font-bold uppercase tracking-widest">Enforcement Dashboard</span>
            <span className="font-mono text-[10px] text-slate-400 font-semibold">PRIORITIZED</span>
          </div>

          {/* Aggregate Stats Panel */}
          <div className="grid grid-cols-2 gap-px bg-slate-200 shrink-0 border-b border-slate-200">
            <div className="bg-white p-3">
              <div className="text-[9px] uppercase font-mono tracking-wider text-slate-400 mb-1">Avg Congestion Impact</div>
              <div className="text-lg font-bold text-orange-600">{avgImpactScore}%</div>
            </div>
            <div className="bg-white p-3">
              <div className="text-[9px] uppercase font-mono tracking-wider text-slate-400 mb-1">Critical Choke Points</div>
              <div className="text-lg font-bold text-red-600">{highSeverityCount}</div>
            </div>
            <div className="bg-white p-3 col-span-2">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[9px] uppercase font-mono tracking-wider text-slate-400 mb-1">Total Est. ROI</div>
                  <div className="text-xl font-bold text-emerald-600">₹{totalEconomicBenefit}</div>
                </div>
                <div className="text-[10px] text-slate-400 font-mono text-right max-w-[150px]">
                  Targeted enforcement impact potential
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {sortedViolations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-12">
                <span className="text-slate-300 text-3xl">✓</span>
                <p className="font-mono text-[10px] text-slate-400 uppercase tracking-wider mt-2">No violations detected</p>
              </div>
            ) : (
              sortedViolations.map(v => (
                <ViolationCard
                  key={v.id}
                  v={v}
                  isSelected={selectedViolation?.id === v.id}
                  onSelect={(selected) => {
                    setSelectedViolation(selected);
                    setModalViolation(selected);
                  }}
                />
              ))
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Aggregator Node · Bengaluru
            </span>
          </div>
        </div>
      </Split>

      <ViolationDetailModal
        v={modalViolation}
        onClose={() => setModalViolation(null)}
        onClear={handleClearViolation}
      />
    </div>
  );
}
