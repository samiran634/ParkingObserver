import React, { useEffect, useRef, useState } from "react";
import { mappls } from "mappls-web-maps";

const mapplsClassObject = new mappls();

export default function BangaloreMap({ violations, heatmapPoints, selectedViolation, onSelect }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const heatmapLayerRef = useRef(null);
  const markersRef = useRef({});
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const activeViolations = (violations || []).filter((v) => v.status === "active");
  const pointCount = activeViolations.length;

  useEffect(() => {
    if (mapRef.current) return;

    const loadObject = {
      map: true,
      version: "3.0"
    };

    const apiKey = import.meta.env.VITE_MAPMYINDIA_API_KEY || "nvpohhnwgbvhxhrbmzvmudlndlwgjstwqlxr";

    mapplsClassObject.initialize(apiKey, loadObject, () => {
      const newMap = mapplsClassObject.Map({
        id: "mappls-map-container",
        properties: {
          center: [12.9716, 77.5946],
          zoom: 13,
          zoomControl: true,
          location: false,
        },
      });

      newMap.on("load", () => {
        setIsMapLoaded(true);
      });

      mapRef.current = newMap;
    });

    return () => {
      // Mappls cleanup is limited, but we can try removing markers
      Object.values(markersRef.current).forEach(m => m.remove());
    };
  }, []);

  // Sync Markers
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    const currentMarkerIds = new Set(activeViolations.map(v => v.id));

    // Remove old markers
    Object.keys(markersRef.current).forEach(id => {
      if (!currentMarkerIds.has(id)) {
        if (markersRef.current[id].remove) {
           markersRef.current[id].remove();
        }
        delete markersRef.current[id];
      }
    });

    // Add or update new markers
    activeViolations.forEach(v => {
      const isSelected = selectedViolation?.id === v.id;
      const color = v.congestion_impact_score > 50 ? "#f44336" : "#ff9800";
      const size = isSelected ? 24 : 16;
      
      const htmlContent = `<div style="
        width: ${size}px; 
        height: ${size}px; 
        background-color: ${color}; 
        border-radius: 50%; 
        border: ${isSelected ? '3px' : '2px'} solid white;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
        transform: translate(-50%, -50%);
        cursor: pointer;
      "></div>`;

      if (!markersRef.current[v.id]) {
        // Create new marker
        const marker = new mapplsClassObject.Marker({
          map: mapRef.current,
          position: { lat: v.latitude, lng: v.longitude },
          html: htmlContent
        });

        // Try adding click event (Mappls might use .addListener)
        if (marker.addListener) {
            marker.addListener("click", () => onSelect(v));
        }

        markersRef.current[v.id] = marker;
      } else {
        // Update existing marker position/html if supported
        const marker = markersRef.current[v.id];
        if (marker.setPosition) marker.setPosition({ lat: v.latitude, lng: v.longitude });
        if (marker.setIcon) marker.setIcon(htmlContent); // Might not work exactly with html
      }
    });
  }, [activeViolations, isMapLoaded, selectedViolation, onSelect]);

  // Sync Heatmap
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    try {
      if (heatmapLayerRef.current) {
         // remove if possible, Mappls documentation usually advises clearing data or removing overlay
         if (mapRef.current.removeLayer) mapRef.current.removeLayer(heatmapLayerRef.current);
         heatmapLayerRef.current = null;
      }

      if (heatmapPoints && heatmapPoints.length > 0) {
        const hData = heatmapPoints.map(p => ({
            lat: p.latitude, 
            lng: p.longitude, 
            weight: Math.max(p.weight || 1, 1)
        }));

        heatmapLayerRef.current = new mapplsClassObject.HeatmapLayer({
          map: mapRef.current,
          data: hData,
          radius: 25,
          opacity: 0.8,
          gradient: [
            'rgba(0, 255, 255, 0)',
            'rgba(0, 255, 255, 1)',
            'rgba(0, 191, 255, 1)',
            'rgba(0, 127, 255, 1)',
            'rgba(0, 63, 255, 1)',
            'rgba(0, 0, 255, 1)',
            'rgba(0, 0, 223, 1)',
            'rgba(0, 0, 191, 1)',
            'rgba(0, 0, 159, 1)',
            'rgba(0, 0, 127, 1)',
            'rgba(63, 0, 91, 1)',
            'rgba(127, 0, 63, 1)',
            'rgba(191, 0, 31, 1)',
            'rgba(255, 0, 0, 1)'
          ]
        });
      }
    } catch (e) {
        console.warn("Mappls Heatmap init failed:", e);
    }
  }, [heatmapPoints, isMapLoaded]);

  return (
    <div className="relative flex-1 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* HUD top bar */}
      <div className="absolute top-0 left-0 w-full p-3 flex items-center justify-between z-[900] pointer-events-none">
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-lg pointer-events-auto shadow-sm">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
          <span className="font-mono text-[10px] text-slate-700 uppercase tracking-widest font-bold">
            BENGALURU LIVE MAP (MAPPLS)
          </span>
          {pointCount > 0 && (
            <span className="ml-1 bg-red-500/90 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
              {pointCount} ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Mappls Map Container */}
      <div id="mappls-map-container" className="w-full h-full" />

      {/* Attribution */}
      <div className="absolute bottom-2 right-2 z-[900] font-mono text-[10px] text-slate-500 bg-white/80 px-2 py-1 rounded">
        © MapmyIndia Mappls
      </div>
    </div>
  );
}
