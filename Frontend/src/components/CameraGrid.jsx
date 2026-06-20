import React, { useState, useRef, useEffect } from "react";

// Default slot data (shown when no cameras have been configured via simulation)
const DEFAULT_SLOTS = [
  { id: "cam_01", label: "Koramangala 100ft Rd", videoUrl: null, active: false, violationsFired: 0 },
  { id: "cam_02", label: "MG Road Junction",      videoUrl: null, active: false, violationsFired: 0 },
  { id: "cam_03", label: "Indiranagar 12th Main", videoUrl: null, active: false, violationsFired: 0 },
  { id: "cam_04", label: "Silk Board Junction",   videoUrl: null, active: false, violationsFired: 0 },
];

// ── Modal overlay for full footage view ───────────────────────────────────────
function FootageModal({ cam, activeViolation, onClose }) {
  const videoRef = useRef(null);
  const isAlarm = activeViolation && activeViolation.camera_id === cam.id;

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (videoRef.current && cam.videoUrl) {
      videoRef.current.play().catch(() => {});
    }
  }, [cam.videoUrl]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-4xl rounded-2xl overflow-hidden border shadow-2xl bg-white
          ${isAlarm ? "border-red-400 shadow-red-500/20" : "border-slate-200"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className={`flex items-center justify-between px-5 py-3 
          ${isAlarm ? "bg-red-50" : "bg-slate-50"} border-b border-slate-200`}>
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${isAlarm ? "bg-red-500 animate-pulse" : "bg-blue-500 animate-pulse"}`} />
            <span className="font-mono text-xs text-slate-800 uppercase tracking-widest font-bold">
              {cam.id.toUpperCase()} — {cam.label}
            </span>
            {isAlarm && (
              <span className="bg-red-500 text-white font-mono text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                ⚠ VIOLATION ACTIVE
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 transition-colors cursor-pointer p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Footage */}
        <div className="relative bg-black aspect-video">
          {cam.videoUrl ? (
            <>
              <video
                ref={videoRef}
                src={cam.videoUrl}
                className="w-full h-full object-contain"
                loop
                muted
                playsInline
              />
              {/* Scanlines overlay */}
              <div className="absolute inset-0 pointer-events-none"
                style={{
                  background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)"
                }}
              />
              {/* Bounding box if alarm */}
              {isAlarm && (
                <div className="absolute top-[28%] left-[35%] w-[32%] h-[40%] border-2 border-red-500/80 bg-red-500/5">
                  <div className="bg-red-500 text-white font-mono text-[11px] font-bold px-2 py-0.5 -translate-y-full absolute top-0 left-0 whitespace-nowrap">
                    [{activeViolation.vehicle_type} — DWELL {activeViolation.dwell_time}m]
                  </div>
                </div>
              )}
              {/* Telemetry overlay */}
              <div className="absolute bottom-3 left-3 font-mono text-[11px] text-emerald-400/70 flex flex-col gap-0.5">
                <span>FPS: 29.97</span>
                <span>BW: {isAlarm ? "21.4" : "12.8"} Kbps</span>
              </div>
              {/* Violation info */}
              {isAlarm && (
                <div className="absolute bottom-0 left-0 w-full bg-red-900/80 backdrop-blur-sm px-4 py-2 flex items-center justify-between">
                  <span className="font-mono text-[12px] text-white font-bold uppercase tracking-wider">
                    ⚠ {(activeViolation.violation_type || []).join(" · ")}
                  </span>
                  <span className="font-mono text-[12px] text-white/70">
                    Impact Score: {activeViolation.congestion_impact_score?.toFixed(0)}%
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-900 text-slate-500">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              <span className="font-mono text-[12px] uppercase tracking-widest">No footage loaded</span>
              <span className="font-mono text-[11px] text-slate-600">Upload a video in the simulator panel to preview</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Individual camera thumbnail ────────────────────────────────────────────────
function CamThumbnail({ cam, activeViolation, onClick }) {
  const isAlarm = activeViolation && activeViolation.camera_id === cam.id;
  const hasVideo = !!cam.videoUrl;

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl overflow-hidden cursor-pointer border transition-all duration-200 group
        ${isAlarm
          ? "border-red-400 shadow-[0_0_16px_rgba(244,67,54,0.25)]"
          : "border-slate-200 hover:border-blue-300 shadow-sm"
        } bg-slate-100 aspect-video`}
    >
      {/* Video thumbnail */}
      {hasVideo ? (
        <video
          src={cam.videoUrl}
          className="w-full h-full object-cover opacity-60 grayscale group-hover:opacity-80 transition-opacity"
          muted
          playsInline
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-300">
            <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </div>
      )}

      {/* Alarm pulse ring */}
      {isAlarm && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-red-500/60 animate-pulse pointer-events-none" />
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 w-full px-2 py-1.5 flex items-center justify-between bg-gradient-to-b from-white/90 to-transparent">
        <span className="font-mono text-[10px] text-slate-800 font-bold uppercase tracking-wider">{cam.id}</span>
        <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest flex items-center gap-1
          ${isAlarm ? "bg-red-500/90 text-white" : hasVideo ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-slate-200 text-slate-500 border border-slate-300"}`}>
          <span className={`w-1 h-1 rounded-full inline-block ${isAlarm ? "bg-white animate-pulse" : hasVideo ? "bg-blue-500 animate-pulse" : "bg-slate-400"}`} />
          {isAlarm ? "ALARM" : hasVideo ? "LIVE" : "STANDBY"}
        </span>
      </div>

      {/* Bottom label */}
      <div className="absolute bottom-0 left-0 w-full px-2 py-1.5 bg-gradient-to-t from-white/95 to-transparent flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-800 font-bold truncate">{cam.label}</span>
        {cam.violationsFired > 0 && (
          <span className="font-mono text-[9px] text-amber-600 font-bold ml-1 shrink-0">↑{cam.violationsFired}</span>
        )}
      </div>

      {/* Click hint */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/40 backdrop-blur-sm">
        <span className="font-mono text-[11px] text-blue-700 font-bold bg-white/90 px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm">
          View footage
        </span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CameraGrid({ cameras, activeViolation }) {
  const [openCam, setOpenCam] = useState(null);

  const slots = cameras && cameras.length > 0 ? cameras : DEFAULT_SLOTS;

  return (
    <>
      {/* Camera thumbnails */}
      <div className="grid grid-cols-4 gap-3">
        {slots.slice(0, 4).map((cam) => (
          <CamThumbnail
            key={cam.id}
            cam={cam}
            activeViolation={activeViolation}
            onClick={() => setOpenCam(cam)}
          />
        ))}
      </div>

      {/* Footage modal */}
      {openCam && (
        <FootageModal
          cam={openCam}
          activeViolation={activeViolation}
          onClose={() => setOpenCam(null)}
        />
      )}
    </>
  );
}
