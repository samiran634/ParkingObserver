#!/usr/bin/env python3
"""
run_edges.py — ParkingObserver Edge Network Orchestrator
=========================================================
Discovers every .mp4 / .avi / .mov video in the footages/ directory,
maps each to a camera configuration, and spawns one edge_node.py
process per video in parallel — visually simulating a distributed
edge AI camera network all running ML inference independently.

Usage:
    python run_edges.py

Drop your CCTV footage files into ParkingObserver/footages/ before running.
Filename format (optional, for auto-mapping):
    cam_01_MG_ROAD.mp4
    cam_02_KORAMANGALA.mp4
    etc.

Otherwise locations are assigned from the CAMERA_PRESETS list below.
"""

import os, sys, time, subprocess
from pathlib import Path

# ── ANSI colours ───────────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
DIM    = "\033[2m"
WHITE  = "\033[97m"

def clr(t, *c): return "".join(c) + str(t) + RESET

# ── Camera location presets ────────────────────────────────────────────────────
# vehicle_type is NO LONGER configured here — it is detected by YOLOv8n at runtime.
# Each preset defines the ZONE TYPE the camera monitors (its physical install context).
CAMERA_PRESETS = [
    {
        "id"         : "CAM_01",
        "station"    : "Halasuru",
        "junction"   : "MG Road Signal",
        "lat"        : 12.9757,
        "lng"        : 77.6064,
        "center_code": "101",
        "violation"  : "NO_PARKING",          # zone type this camera monitors
    },
    {
        "id"         : "CAM_02",
        "station"    : "Koramangala",
        "junction"   : "Koramangala Signal",
        "lat"        : 12.9352,
        "lng"        : 77.6245,
        "center_code": "102",
        "violation"  : "BUS_STOP_BLOCKING",
    },
    {
        "id"         : "CAM_03",
        "station"    : "Indiranagar",
        "junction"   : "CMH Road Signal",
        "lat"        : 12.9784,
        "lng"        : 77.6408,
        "center_code": "103",
        "violation"  : "DOUBLE_PARKING",
    },
    {
        "id"         : "CAM_04",
        "station"    : "Bommanahalli",
        "junction"   : "Silk Board Flyover",
        "lat"        : 12.9166,
        "lng"        : 77.6214,
        "center_code": "104",
        "violation"  : "WRONG_PARKING",
    },
]

FOOTAGES_DIR = Path(__file__).parent.parent / "footages"
EDGE_SCRIPT  = Path(__file__).parent / "edge_node.py"
VIDEO_EXTS   = {".mp4", ".avi", ".mov", ".mkv"}

# ── Discovery ──────────────────────────────────────────────────────────────────
def discover_videos():
    if not FOOTAGES_DIR.exists():
        FOOTAGES_DIR.mkdir(parents=True)
        print(clr(f"  Created footages/ at {FOOTAGES_DIR}", DIM))

    videos = sorted([p for p in FOOTAGES_DIR.iterdir() if p.suffix.lower() in VIDEO_EXTS])
    return videos

def build_camera_args(video_path, preset):
    return [
        sys.executable, str(EDGE_SCRIPT),
        "--cam",         preset["id"],
        "--video",       str(video_path),
        "--station",     preset["station"],
        "--junction",    preset["junction"],
        "--lat",         str(preset["lat"]),
        "--lng",         str(preset["lng"]),
        "--center_code", preset["center_code"],
        "--violation",   preset["violation"],
        # NOTE: --vehicle is intentionally absent — YOLOv8n detects it from video
    ]

# ── Banner ─────────────────────────────────────────────────────────────────────
def print_banner(videos):
    print()
    print(clr("╔══════════════════════════════════════════════════════════╗", CYAN, BOLD))
    print(clr("║   PARKINGOBSERVER  //  EDGE NETWORK ORCHESTRATOR  //  v2  ║", CYAN, BOLD))
    print(clr("╚══════════════════════════════════════════════════════════╝", CYAN, BOLD))
    print()
    print(clr(f"  📂  Footages folder : {FOOTAGES_DIR}", WHITE))
    print(clr(f"  🎥  Videos found    : {len(videos)}", WHITE, BOLD))
    for i, v in enumerate(videos):
        preset = CAMERA_PRESETS[i % len(CAMERA_PRESETS)]
        print(clr(f"       [{preset['id']}]  {v.name}  →  {preset['junction']}  "
                  f"[zone: {preset['violation']}]", DIM))
    print()
    print(clr("  Each camera runs the ML model LOCALLY (Edge AI).", YELLOW))
    print(clr("  Only tiny JSON alerts are sent to the Central Server.", YELLOW))
    print()
    print(clr("  ──────────────────────────────────────────────────────────", CYAN))
    print()

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    videos = discover_videos()

    print_banner(videos)

    if not videos:
        print(clr("  ✖  No video files found in footages/ directory!", RED, BOLD))
        print(clr(f"     Drop .mp4/.avi/.mov files into: {FOOTAGES_DIR}", YELLOW))
        print()
        sys.exit(0)

    if not EDGE_SCRIPT.exists():
        print(clr(f"  ✖  edge_node.py not found at {EDGE_SCRIPT}", RED, BOLD))
        sys.exit(1)

    processes = []
    for i, video in enumerate(videos):
        preset = CAMERA_PRESETS[i % len(CAMERA_PRESETS)]
        cmd    = build_camera_args(video, preset)

        print(clr(f"  🚀  Launching {preset['id']} → {video.name}", GREEN, BOLD))
        # Each node gets its own new terminal window for maximum visual impact
        
        env = os.environ.copy()
        env["PYTHONUTF8"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        
        if sys.platform == "win32":
            title = f"{preset['id']} // {preset['junction']}"
            # Open a new CMD window for each camera node
            proc = subprocess.Popen(
                ["cmd", "/c", "title", title, "&"] + cmd,
                creationflags=subprocess.CREATE_NEW_CONSOLE,
                env=env
            )
        else:
            # macOS / Linux: open in new terminal tab (gnome-terminal or osascript)
            try:
                proc = subprocess.Popen(
                    ["gnome-terminal", "--"] + cmd,
                    env=env
                )
            except FileNotFoundError:
                proc = subprocess.Popen(cmd, env=env)

        processes.append((preset["id"], proc))
        time.sleep(0.5)   # stagger launch for visual effect

    print()
    print(clr(f"  ✅  {len(processes)} edge node(s) launched.", GREEN, BOLD))
    print(clr("  📡  Streaming alerts to: http://127.0.0.1:8000", CYAN))
    print(clr("  🌐  Dashboard           : http://localhost:5173", CYAN))
    print()
    print(clr("  Press Ctrl+C to stop all nodes.", DIM))
    print()

    try:
        while True:
            time.sleep(2)
            alive = [(cid, p) for cid, p in processes if p.poll() is None]
            if not alive:
                print(clr("  All edge nodes have exited.", YELLOW))
                break
    except KeyboardInterrupt:
        print()
        print(clr("  🛑  Stopping all edge nodes...", YELLOW, BOLD))
        if sys.platform == "win32":
            subprocess.run('taskkill /F /FI "WINDOWTITLE eq CAM_*" /T', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            for cid, p in processes:
                p.terminate()
        for cid, p in processes:
            print(clr(f"  ✖  {cid} stopped.", RED))
    print()

if __name__ == "__main__":
    main()
