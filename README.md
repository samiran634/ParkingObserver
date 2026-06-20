# ParkingObserver: Edge AI Traffic Intelligence Node 🚦

**ParkingObserver** is a decentralized, Edge AI-driven solution designed to combat parking-induced traffic congestion in Bengaluru.

Currently, detecting illegal parking and its impact on city traffic relies heavily on manual patrols or streaming massive amounts of raw CCTV video to central servers. This approach is highly expensive, slow, and crushes municipal network bandwidth. 

ParkingObserver solves this by adopting a **"Smart Edge"** architecture.

---

## The Architectural Flow

1. **CCTV to NVR**: CCTV cameras monitor the streets and send their heavy, raw video feeds directly into the local NVR (Network Video Recorder) situated in the intersection's metal telecom box.
2. **Edge Processing (NVR)**: The NVR runs the localized ML prediction software (YOLOv8 converted to an ONNX model). 
    * a note on Threshold: The number of camera streams an NVR can process simultaneously is limited by its GPU's VRAM (e.g., Total VRAM / VRAM per model instance). For optimal performance, rather than using multiple independent threads, the NVR should use 'Batch Processing' (combining frames from all cameras into a single batch) to pass through the GPU at once.
3. **Event Generation**: The Edge model generates an event based solely on Dwell Time (not approval/rejection). If a vehicle is stationary in a restricted zone for > 3 minutes, it triggers an "active" violation event. If the vehicle leaves, it triggers a "cleared" event.
![Image example](assets/ArchitectureFlow.PNG)
4. **Transmission**: The NVR sends a tiny JSON payload containing the event data over the network to the centralized server.
5. **Centralized Server**: The Python backend (FastAPI) at City HQ receives the JSON payload. Here, the secondary CatBoost ML model runs to "Approve" or "Reject" the violation (filtering false positives) and calculates the Congestion Impact Score and Economic Benefit (ROI).
6.** Command Center Dashboard**: The Central Server pushes this aggregated, global data to the React Frontend Dashboard at the Central Traffic Police HQ. The street-level NVRs run headless (without monitors) to conserve resources; the UI is strictly for central dispatchers.

---
## Getting Started

### Prerequisites
- **Python 3.9+** (for Edge Node and FastAPI Backend)
- **Node.js 18+** (for React Frontend)
- **YOLOv8** (`pip install ultralytics`)

Just run this command in this directory and all necessery processes will spawn up setting the hole project.

```
python start_system.py
```

- Note: in case of first time running the set up run this command to download all system dependencies 
```
python install_dependencies.py 
```
This script will automatically detect video files in the `Footages/` folder, spawn individual Edge AI instances for each camera feed, and begin streaming violation telemetry to the central backend.
    
- Inorder to add any videos please locate them in the Footages folder and run the start command again. 

---

## Key Highlights & Value Proposition

- **Privacy by Design:** By analyzing video locally at the edge, faces and license plates do not need to be transmitted continuously to a central server unless a violation is confirmed.
- **Network Resiliency:** Sending JSON payloads rather than 4K video feeds reduces network bandwidth consumption by over **99%**.
- **Data-Driven Enforcement:** Instead of blindly patrolling, traffic police are dynamically guided by an ML-calculated "Choke Point Severity" score to maximize ROI and clear bottlenecks faster.

