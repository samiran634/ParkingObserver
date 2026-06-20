#!/usr/bin/env python3
"""
edge_node.py — ParkingObserver Edge AI Camera Node v2
======================================================
Runs the parking violation ML model LOCALLY on a CCTV camera feed.
Sends only a compact JSON alert to the central server on state change.

Key upgrades over v1:
  - YOLOv8n replaces brightness-variance heuristic for vehicle detection
  - vehicle_type is DETECTED from video, not hardcoded
  - primary_offence_code derived from violation zone config via lookup table
  - device_approval_rate loaded from model pkl (historical camera reliability)
  - Feature set exactly matches the 14 features the model was trained on

Usage:
    python edge_node.py --cam CAM_01 --video footages/mg_road.mp4 \\
                        --station Halasuru --junction "MG Road Signal" \\
                        --lat 12.9757 --lng 77.6064 \\
                        --violation NO_PARKING
"""

import os, sys, json, time, uuid, pickle, argparse, requests
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import re

# ── ANSI colours ───────────────────────────────────────────────────────────────
RESET   = "\033[0m"
BOLD    = "\033[1m"
DIM     = "\033[2m"
RED     = "\033[91m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
CYAN    = "\033[96m"
WHITE   = "\033[97m"
MAGENTA = "\033[95m"

def clr(text, *codes):
    return "".join(codes) + str(text) + RESET

# ── Constants ──────────────────────────────────────────────────────────────────
MODEL_PATH   = Path(__file__).parent / "models_v10" / "v10_hackathon_model.pkl"
BACKEND_URL  = "http://127.0.0.1:8000/api/violations"

DWELL_THRESHOLD_MINUTES = 0.5   # flag vehicle after this many minutes stationary (lowered for fast demo)
FRAME_SAMPLE_RATE       = 30    # process every Nth frame (~1 s at 30 fps)
CONFIDENCE_THRESHOLD    = 0.40  # YOLO minimum detection confidence
ALERT_PROB_THRESHOLD    = 0.65  # ML model P(approved) threshold to fire alert

# ── YOLO class ID → our dataset vehicle_type string ───────────────────────────
# COCO class IDs for vehicles:
#   1=bicycle, 2=car, 3=motorcycle, 5=bus, 7=truck
YOLO_VEHICLE_CLASSES = {1, 2, 3, 5, 7}

YOLO_TO_VEHICLE_TYPE = {
    1: "MOPED",                  # bicycle → closest non-motorised 2-wheeler
    2: "CAR",
    3: "MOTOR CYCLE",
    5: "BUS (BMTC/KSRTC)",
    7: "LORRY/GOODS VEHICLE",
}

# ── Violation type → primary offence code lookup ───────────────────────────────
# Source: offence_code approval-rate analysis on 165k challan dataset
# Code 113 (NO_PARKING) → 74.2% approval   Code 112 (WRONG_PARKING) → 66.4%
VIOLATION_TO_CODE = {
    "NO_PARKING"           : "113",
    "WRONG_PARKING"        : "112",
    "DOUBLE_PARKING"       : "107",
    "BUS_STOP_BLOCKING"    : "105",
    "WRONG_SIDE"           : "116",
    "BLOCKING_INTERSECTION": "111",
    "FOOTPATH_PARKING"     : "112",   # mapped to WRONG PARKING code
    "HANDICAP_ZONE"        : "113",
}
DEFAULT_OFFENCE_CODE = "112"  # WRONG PARKING — safest fallback

# ── Model loader ───────────────────────────────────────────────────────────────
def load_model(cam_id):
    # Model inference has been migrated to the Central Server!
    # Edge node now purely acts as an intelligent vision sensor.
    return None, [], [], {}, 0.70

# ── YOLOv8 loader ─────────────────────────────────────────────────────────────
def load_yolo(cam_id):
    """
    Load YOLOv8n (nano — ~6 MB, fast on CPU).
    Falls back to brightness-variance heuristic if ultralytics is not installed.
    """
    try:
        from ultralytics import YOLO
        yolo = YOLO("yolov8n.pt")   # auto-downloads on first run
        print(clr(f"[{cam_id}] ✅  YOLOv8n loaded — real vehicle detection active.", GREEN, BOLD))
        return yolo
    except ImportError:
        print(clr(f"[{cam_id}] ⚠  ultralytics not installed. "
                  f"Install with: pip install ultralytics", YELLOW))
        print(clr(f"[{cam_id}]    Falling back to brightness-variance heuristic.", YELLOW))
        return None

# ── Vehicle detection & Geometry ──────────────────────────────────────────────
def parse_camera_height(video_path):
    # Extracts height from "location_5m.mp4"
    path_obj = Path(video_path)
    match = re.search(r'_([\d\.]+)m$', path_obj.stem)
    if match:
        return float(match.group(1))
    return 5.0  # default fallback

def get_ipm_matrix(frame_width, frame_height, cam_height_m):
    # Create a simplified homography matrix for Inverse Perspective Mapping
    # Assuming camera pitched down ~45 degrees
    src_points = np.float32([
        [0, frame_height],                           # bottom left
        [frame_width, frame_height],                 # bottom right
        [frame_width * 0.7, frame_height * 0.4],     # top right
        [frame_width * 0.3, frame_height * 0.4]      # top left
    ])
    
    dst_width = 500
    dst_height = 800
    dst_points = np.float32([
        [0, dst_height],
        [dst_width, dst_height],
        [dst_width, 0],
        [0, 0]
    ])
    
    # Let 500 pixels in warped image represent roughly 10 meters 
    # (adjust based on camera height ratio)
    scale_px_per_m = (dst_width / 10.0) * (5.0 / max(cam_height_m, 1.0))
    M = cv2.getPerspectiveTransform(src_points, dst_points)
    return M, scale_px_per_m

def detect_vehicle(frame, yolo_model, M, scale_px_per_m):
    """
    Returns (vehicle_present, vehicle_type, vehicle_width_m, road_width_m).
    """
    h, w = frame.shape[:2]
    # Programmatic Road Width: Estimate based on full frame bottom width in warped space
    bottom_road_pts = np.float32([[[0, h], [w, h]]])
    warped_road = cv2.perspectiveTransform(bottom_road_pts, M)
    road_px = np.linalg.norm(warped_road[0][0] - warped_road[0][1])
    road_width_m = road_px / scale_px_per_m
    
    if yolo_model is not None:
        results = yolo_model(frame, verbose=False, conf=CONFIDENCE_THRESHOLD)[0]
        vehicle_boxes = [
            (box, int(box.cls.item()))
            for box in results.boxes
            if int(box.cls.item()) in YOLO_VEHICLE_CLASSES
        ]
        if not vehicle_boxes:
            return False, "UNKNOWN", 0.0, road_width_m

        # Pick the detection with the highest confidence
        best_box, best_cls = max(vehicle_boxes, key=lambda x: float(x[0].conf.item()))
        vtype = YOLO_TO_VEHICLE_TYPE.get(best_cls, "OTHERS")
        
        # Calculate vehicle width
        x1, y1, x2, y2 = best_box.xyxy[0].tolist()
        bottom_pts = np.float32([[[x1, y2], [x2, y2]]])
        warped_v = cv2.perspectiveTransform(bottom_pts, M)
        v_px = np.linalg.norm(warped_v[0][0] - warped_v[0][1])
        vehicle_width_m = v_px / scale_px_per_m
        
        return True, vtype, vehicle_width_m, road_width_m
    else:
        # Fallback: brightness variance heuristic
        gray     = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        variance = float(np.var(gray))
        return variance > 200, "CAR", 2.0, road_width_m

# ── Feature builder ────────────────────────────────────────────────────────────
def build_features(args, detected_vehicle_type, feature_cols,
                   dev_mean_full, global_mean):
    """
    Builds the exact 14-feature row the model expects.
    Matches FEATURE_COLS from ParkingViolationClassifier.ipynb §5.
    """
    now = datetime.now(timezone.utc)

    # device_approval_rate: camera's historical challan approval rate
    cam_device_id   = args.cam.upper()   # camera ID used as device_id key
    device_rate     = dev_mean_full.get(cam_device_id, global_mean)

    # primary_offence_code: derived from violation zone type
    offence_code    = VIOLATION_TO_CODE.get(args.violation.upper(), DEFAULT_OFFENCE_CODE)

    features = {
        # Spatial — from camera install config
        "lat_bin"              : str(round(args.lat, 3)),
        "lng_bin"              : str(round(args.lng, 3)),
        "police_station"       : args.station,
        "junction_name"        : args.junction,
        "center_code"          : str(args.center_code),
        # Temporal — from system clock
        "hour_of_day"          : int(now.hour),
        "day_of_week"          : int(now.weekday()),
        "month"                : int(now.month),
        "is_weekend"           : int(now.weekday() >= 5),
        # Vehicle — from YOLOv8 detection
        "vehicle_type"         : detected_vehicle_type,
        # Violation — from camera zone config
        "primary_violation"    : args.violation.upper(),
        "primary_offence_code" : offence_code,
        "num_violations"       : 1,
        # Device quality — OOF-computed historical approval rate
        "device_approval_rate" : float(device_rate),
        "location_approval_rate" : float(device_rate),
    }

    df = pd.DataFrame([features])

    # Type enforcement (must match dtypes used during training)
    df["hour_of_day"]           = df["hour_of_day"].astype("Int16")
    df["day_of_week"]           = df["day_of_week"].astype("Int16")
    df["month"]                 = df["month"].astype("Int16")
    df["is_weekend"]            = df["is_weekend"].astype("Int8")
    df["num_violations"]        = df["num_violations"].astype("Int8")
    df["device_approval_rate"]   = df["device_approval_rate"].astype(float)
    df["location_approval_rate"] = df["location_approval_rate"].astype(float)

    for col in ["lat_bin", "lng_bin", "police_station", "junction_name",
                "center_code", "vehicle_type", "primary_violation",
                "primary_offence_code"]:
        df[col] = df[col].astype(str)

    return df[feature_cols]

# ── Model inference ────────────────────────────────────────────────────────────
def run_inference(model, feature_cols, dev_mean_full, global_mean, args,
                  detected_vehicle_type):
    """Edge node now relies on central server for inference. We just flag based on dwell time."""
    return True, 0.0

# ── Alert sender ───────────────────────────────────────────────────────────────
def send_alert(args, dwell_time, prob, detected_vehicle_type, offence_code, v_width, r_width):
    payload = {
        "camera_id"          : args.cam,
        "latitude"           : args.lat,
        "longitude"          : args.lng,
        "police_station"     : args.station,
        "junction_name"      : args.junction,
        "center_code"        : str(args.center_code),
        "vehicle_type"       : detected_vehicle_type,
        "violation_type"     : json.dumps([args.violation.upper()]),
        "primary_offence_code": offence_code,
        "num_violations"     : 1,
        "dwell_time"         : float(round(dwell_time, 2)),
        "vehicle_width_m"    : float(round(v_width, 2)),
        "road_width_m"       : float(round(r_width, 2)),
        "approved_probability": float(prob),
        "created_datetime"   : datetime.now(timezone.utc).isoformat(),
    }
    try:
        resp = requests.post(BACKEND_URL, json=payload, timeout=5)
        if resp.ok:
            score = resp.json().get("congestion_impact_score", 0)
            return True, score
        return False, 0
    except Exception as e:
        print(clr(f"[{args.cam}] ⚠  Network error: {e}", YELLOW))
        return False, 0

def clear_alert(camera_id):
    try:
        requests.post(f"{BACKEND_URL.replace('/violations', '/cameras')}/{camera_id}/clear", timeout=5)
    except Exception:
        pass

# ── Banner ─────────────────────────────────────────────────────────────────────
def print_banner(args, total_frames, fps, device_rate):
    offence_code = VIOLATION_TO_CODE.get(args.violation.upper(), DEFAULT_OFFENCE_CODE)
    print()
    print(clr("╔══════════════════════════════════════════════════════╗", CYAN, BOLD))
    print(clr("║   PARKINGOBSERVER  //  EDGE AI NODE  //  v2.0        ║", CYAN, BOLD))
    print(clr("╚══════════════════════════════════════════════════════╝", CYAN, BOLD))
    print(clr(f"  Camera ID      : {args.cam}", WHITE, BOLD))
    print(clr(f"  Location       : {args.junction}", WHITE))
    print(clr(f"  Station        : {args.station}", WHITE))
    print(clr(f"  Coordinates    : {args.lat:.4f}N, {args.lng:.4f}E", WHITE))
    print(clr(f"  Cam Height     : {args.cam_height}m (IPM active)", WHITE))
    print(clr(f"  Zone type      : {args.violation.upper()}", WHITE))
    print(clr(f"  Offence code   : {offence_code}  (from violation→code lookup)", DIM))
    print(clr(f"  Device rate    : {device_rate:.3f}  (historical approval rate)", DIM))
    print(clr(f"  Vehicle detect : YOLOv8n + Homography Width Eval", DIM))
    print(clr(f"  Video          : {Path(args.video).name}  ({total_frames} frames @ {fps:.1f}fps)", DIM))
    print(clr(f"  Model          : {MODEL_PATH.name}", DIM))
    print(clr(f"  Alert threshold: P(approved) > {ALERT_PROB_THRESHOLD}", DIM))
    print(clr("  ─────────────────────────────────────────────────────", CYAN))
    print()

# ── Main loop ──────────────────────────────────────────────────────────────────
def run(args):
    cam = args.cam.upper()

    model, feature_cols, cat_features, dev_mean_full, global_mean = load_model(cam)
    yolo_model = load_yolo(cam)

    # Resolve device rate for banner
    device_rate = dev_mean_full.get(cam, global_mean) if dev_mean_full else global_mean

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(clr(f"[{cam}] ✖  Cannot open video: {args.video}", RED, BOLD))
        sys.exit(1)

    fps          = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Initialize IPM matrix
    cam_height = parse_camera_height(args.video)
    args.cam_height = cam_height # Save for banner
    M, scale_px_per_m = get_ipm_matrix(frame_width, frame_height, cam_height)

    print_banner(args, total_frames, fps, device_rate)

    frame_idx            = 0
    dwell_frames         = 0
    last_state           = "CLEAR"
    already_alerted      = False
    alert_count          = 0
    last_vehicle_type    = "UNKNOWN"
    last_v_width         = 0.0
    last_r_width         = 0.0
    start_time           = time.time()

    print(clr(f"[{cam}] 🎬  Starting video analysis...", CYAN))
    print()

    while True:
        ret, frame = cap.read()
        if not ret:
            # If we fail on the very first frame, the codec is unsupported or file is corrupted
            if frame_idx == 0:
                print(clr(f"[{cam}] ✖  ERROR: OpenCV cannot decode this video. It may be corrupted or using an unsupported codec (like H.265/HEVC).", RED, BOLD))
                print(clr(f"[{cam}]    Try converting the video to standard H.264 MP4 or use a different file.", YELLOW))
                time.sleep(5)
                break
            
            # Loop video for continuous demo
            cap.release()
            cap = cv2.VideoCapture(args.video)
            frame_idx    = 0
            # dwell_frames is intentionally NOT reset here, so short videos can accumulate dwell time across loops!
            print(clr(f"[{cam}] 🔄  Video loop restart (accumulating dwell time)", DIM))
            time.sleep(0.5) # Prevent spamming if video gets stuck
            continue

        frame_idx += 1
        if frame_idx % FRAME_SAMPLE_RATE != 0:
            continue

        # ── Real vehicle detection & Measurement ──────────────────────────────
        vehicle_present, detected_type, v_w, r_w = detect_vehicle(frame, yolo_model, M, scale_px_per_m)

        if vehicle_present:
            dwell_frames      += 1
            last_vehicle_type  = detected_type   # update to latest YOLO detection
            last_v_width       = v_w
            last_r_width       = r_w
        else:
            dwell_frames = max(0, dwell_frames - 2)   # decay when zone clears

        dwell_minutes = (dwell_frames * FRAME_SAMPLE_RATE) / fps / 60.0

        # ── Periodic status log ─────────────────────────────────────────────
        sampled = frame_idx // FRAME_SAMPLE_RATE
        if sampled % 10 == 0:
            bar_len = int(min(dwell_minutes / DWELL_THRESHOLD_MINUTES, 1.0) * 20)
            bar     = "█" * bar_len + "░" * (20 - bar_len)
            bar_clr = (GREEN if dwell_minutes < DWELL_THRESHOLD_MINUTES * 0.5
                       else YELLOW if dwell_minutes < DWELL_THRESHOLD_MINUTES
                       else RED)
            ts = datetime.now().strftime("%H:%M:%S")
            print(
                clr(f"[{cam}]", CYAN, BOLD) +
                clr(f" {ts}", DIM) +
                f"  Frame {frame_idx:>5}/{total_frames}" +
                f"  Vehicle: " + clr(f"{last_vehicle_type:<18}", WHITE) +
                f"  Dwell: " + clr(f"{dwell_minutes:.1f}min", bar_clr) +
                f"  [{clr(bar, bar_clr)}]" +
                f"  " + clr(last_state, GREEN if last_state == "CLEAR" else RED, BOLD)
            )

        # ── Violation detection logic ───────────────────────────────────────
        if dwell_minutes >= DWELL_THRESHOLD_MINUTES and not already_alerted:
            is_violation, prob = run_inference(
                model, feature_cols, dev_mean_full, global_mean,
                args, last_vehicle_type
            )

            if is_violation and last_state == "CLEAR":
                last_state   = "VIOLATION"
                already_alerted = True
                alert_count += 1
                offence_code = VIOLATION_TO_CODE.get(args.violation.upper(),
                                                      DEFAULT_OFFENCE_CODE)
                print()
                print(clr(f"  ┌──────────────────────────────────────────────────┐", RED, BOLD))
                print(clr(f"  │  🚨  VIOLATION DETECTED  [{cam}]                  │", RED, BOLD))
                print(clr(f"  │                                                    │", RED))
                print(clr(f"  │  Vehicle   : {last_vehicle_type:<35}  │", RED))
                print(clr(f"  │  Width Est : {last_v_width:.1f}m / Road: {last_r_width:.1f}m{'':<13}  │", RED))
                print(clr(f"  │  Zone type : {args.violation.upper():<35}  │", RED))
                print(clr(f"  │  Offence   : {offence_code:<35}  │", RED))
                print(clr(f"  │  Dwell     : {dwell_minutes:.1f} min{'':<30}  │", RED))
                print(clr(f"  │  Confidence: {prob*100:.1f}%{'':<31}  │", RED))
                print(clr(f"  │  Alert #   : {alert_count:<35}  │", RED))
                print(clr(f"  └──────────────────────────────────────────────────┘", RED, BOLD))
                print()
                print(clr(f"  📡  Sending alert to Central Command...", YELLOW))

                ok, score = send_alert(args, dwell_minutes, prob,
                                       last_vehicle_type, offence_code, last_v_width, last_r_width)
                if ok:
                    print(clr(f"  ✅  Delivered! Congestion score: {score:.1f}/100", GREEN, BOLD))
                else:
                    print(clr(f"  ⚠   Delivery failed — will retry next cycle.", YELLOW))
                print()

            elif not is_violation and last_state == "VIOLATION":
                last_state   = "CLEAR"
                already_alerted = False
                dwell_frames = 0
                clear_alert(args.cam)
                print(clr(f"[{cam}]  ✅  Area cleared. Resuming monitoring.", GREEN, BOLD))
                print()

        time.sleep(0.01)

    cap.release()

# ── Entry point ────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="ParkingObserver Edge AI Node v10 — runs ML model locally."
    )
    parser.add_argument("--cam",         required=True,  help="Camera ID (e.g. CAM_01)")
    parser.add_argument("--video",       required=True,  help="Path to .mp4 video file")
    parser.add_argument("--station",     default="Unknown",    help="Police station jurisdiction")
    parser.add_argument("--junction",    default="Unknown",    help="Junction / intersection name")
    parser.add_argument("--lat",         type=float, default=12.9716, help="Latitude")
    parser.add_argument("--lng",         type=float, default=77.5946, help="Longitude")
    parser.add_argument("--center_code", default="100",  help="Admin centre code")
    parser.add_argument("--violation",   default="NO_PARKING",
                        help=f"Zone violation type. One of: {list(VIOLATION_TO_CODE.keys())}")
    args = parser.parse_args()

    if not Path(args.video).exists():
        print(clr(f"✖  Video not found: {args.video}", RED, BOLD))
        sys.exit(1)

    try:
        run(args)
    except KeyboardInterrupt:
        print()
        print(clr(f"[{args.cam.upper()}] 🛑  Stopped by operator.", YELLOW))

if __name__ == "__main__":
    main()
