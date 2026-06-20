# ParkingObserver Central Aggregator Backend

This is the Python-based FastAPI backend that serves as the **Central Aggregator (Tier 2)** for the Edge AI Parking Intelligence Node system.

It integrates the trained CatBoost Classifier model from the [Agent](file:///e:/GitHub/traficMl/ParkingObserver/Agent) to run real-time predictions on incoming violation alerts from edge cameras and broadcasts them instantly to the Command Center Dashboard via WebSockets.

## Key Features

1. **AI Inference Pipeline**: Loads `parking_violation_classifier.pkl`, preprocesses spatial-temporal inputs, and predicts the approval probability.
2. **Congestion Impact Engine**: Dynamically calculates a congestion score (0–100) based on dwell time, vehicle type, and model approval probability.
3. **Persistent Storage**: Utilizes a lightweight SQLite database (`violations.db`) to log violations.
4. **Real-time Broadcaster**: Pushes new alerts and clearance updates immediately to connected clients via WebSockets (`/ws`).
5. **Auto-Generated API Documentation**: Swagger UI documentation is available out-of-the-box.

---

## Installation & Setup

1. **Install Dependencies**:
   Navigate to the `Backend` directory and install the requirements:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the FastAPI Server**:
   Launch the application using Uvicorn:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```

3. **Explore API Documentation**:
   Once running, open your browser and go to:
   - Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   - ReDoc: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## API Endpoints

### REST API

- **`GET /health`**: Health check and validation that the CatBoost model loaded successfully.
- **`POST /api/violations`**: Ingests a new violation alert from an Edge camera.
  - Automatically runs the ML classifier.
  - Computes the congestion impact score.
  - Saves to database.
  - Broadcasts event to all WebSocket clients.
- **`GET /api/violations`**: Returns all recorded violations (supports optional status filter `?status=active` or `?status=cleared`).
- **`POST /api/violations/{violation_id}/clear`**: Resolves/clears an active violation (triggered when the vehicle leaves).
  - Broadcasts a clearance event to all WebSocket clients.
- **`GET /api/heatmap`**: Aggregates active violations into 3-decimal spatial bins for rendering real-time maps.

### WebSocket Endpoint

- **`WS /ws`**: Establish a persistent connection for real-time notification push.
  - **New violation event payload broadcast**:
    ```json
    {
      "event": "violation_created",
      "data": {
        "id": "uuid-string",
        "camera_id": "cam_01",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "created_datetime": "2026-06-16T22:36:53Z",
        "police_station": "Koramangala",
        "junction_name": "Sony World Signal",
        "vehicle_type": "CAR",
        "violation_type": ["NO_PARKING"],
        "num_violations": 1,
        "dwell_time": 5.5,
        "predicted_status": "approved",
        "approval_probability": 0.84,
        "congestion_impact_score": 15.12,
        "status": "active"
      }
    }
    ```
  - **Clearance event payload broadcast**:
    ```json
    {
      "event": "violation_cleared",
      "data": {
        "id": "uuid-string",
        "camera_id": "cam_01",
        "status": "cleared",
        "cleared_at": "2026-06-16T22:42:00Z"
      }
    }
    ```
