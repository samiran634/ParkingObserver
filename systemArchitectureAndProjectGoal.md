Project Blueprint: Edge AI Parking Intelligence Node

Event: Flipkart Gridlock Hackathon 2.0 - Round 2
Theme: Theme 1 - Poor Visibility on Parking-Induced Congestion

1. Project Overview & Goal

The objective is to solve Bengaluru's parking-induced traffic congestion using a highly scalable, decentralized AI approach.

Currently, detecting illegal parking relies on manual patrols or streaming massive amounts of raw CCTV video to central servers, which is expensive and crushes city network bandwidth. Our goal is to build a "Smart Edge" architecture. We will deploy lightweight Machine Learning models directly onto street cameras (simulated). These edge nodes will detect parking violations locally, calculate the congestion impact score, and send only tiny, lightweight text alerts to a Central Traffic Police Dashboard to generate real-time heatmaps for targeted enforcement.

2. Core Expectations & Constraints

Data strictness: Must strictly utilize the logic derived from the HackerEarth dataset (no external Google Maps/Traffic APIs).

Bandwidth Efficiency: The system must prove that raw video is never sent over the network, showcasing a highly scalable enterprise solution.

Target Audience: The UI must be tailored entirely for the Bengaluru Traffic Authority (a Command Center), not daily commuters.

Deliverable: A working code prototype (simulating the edge and central server), accompanied by a pitch video demonstrating the real-time heatmap and alert system.

3. System Architecture

Based on the Edge AI design, the system is divided into three distinct, decoupled tiers.

Tier 1: The Edge Nodes (Local CCTV Processors)

Representing the cameras physically located on Bengaluru streets.

Ingestion: Captures raw video frames locally.

Processing: Runs a localized, lightweight Machine Learning model (converted to ONNX format for speed) directly on the edge hardware.

Extraction: Detects vehicles in restricted "No Parking" zones and measures dwell time (how long a vehicle remains stationary).

Transmission (Event-Driven): To conserve bandwidth, the Edge Node does not stream data continuously. It remains silent until a state change occurs:

State -> Active: If a vehicle exceeds the dwell time threshold (e.g., 3 minutes), the node fires a single alert to the server. (Example: {"cameraId": "cam_01", "violation_id": "v_123", "status": "active", ...}). It then goes silent while the vehicle remains parked.

State -> Cleared: Once the vehicle leaves the zone, the node fires a single clearance payload to update the central server. (Example: {"cameraId": "cam_01", "violation_id": "v_123", "status": "cleared", ...}).

Tier 2: The Central Server (The Aggregator)

Representing the Traffic Police HQ Cloud infrastructure.

API Gateway: An Express.js server listening for incoming JSON POST requests from thousands of potential Edge Nodes.

Data Storage: Stores the incoming alerts and calculates city-wide moving averages for the heatmap.

Broadcaster: Pushes new alerts to the frontend dashboard instantly using WebSockets or Server-Sent Events (SSE).

Tier 3: The Command Center (Frontend UI)

The visual dashboard used by Traffic Authorities.

Live Heatmap: Uses the spatial data (lat, lng) from the edge payloads to render glowing hotspots on a city map.

Alert Feed: A scrolling list of active, high-priority parking violations ordered by impact_score.

Dispatch Interface: Allows operators to see exactly which bottlenecks need immediate manual enforcement.

4. Base Design & Tech Stack

To execute this within a 4-day sprint, the tech stack must be rapid, modern, and easily mockable on a single machine.

Edge Simulation (Python): * OpenCV (for reading local .mp4 files acting as live camera feeds).

ONNX Runtime (for running the .pkl model logic efficiently).

Requests module (to POST JSON data to the backend).

Backend (Node.js): * Express.js (REST API).

Socket.io (for real-time frontend updates).

Frontend (React.js): * Tailwind CSS (for rapid Command Center styling).

React (for sleek, professional iconography).

Standard HTML5 Canvas or SVG overlays (to fake the complex map heatmap without heavy third-party map dependencies).

5. Execution Strategy (The 4-Step Plan)

Step 1: The Edge. Write the Python script that loops over a local video, runs your model logic, and generates JSON alerts. Run multiple instances of this script in different terminals to simulate multiple cameras.

Step 2: The Hub. Build the Node.js Express server to catch those JSON alerts and store them in memory.

Step 3: The Glass. Build the React.js dashboard to visualize the data arriving from the backend in a beautiful, dark-mode UI.

Step 4: The Pitch. Stop coding. Record the screen showing the Python terminals sending data and the React dashboard lighting up. Edit the final 3-minute video and finalize the PPT.