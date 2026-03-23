// components/RouteMap.jsx
// Driver's full route map with numbered markers
import React, { useEffect, useRef } from 'react';

const UMN_CENTER = [44.9740, -93.2277];

export default function RouteMap({ route, driverLocation }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const driverMarker = useRef(null);
  const stopMarkers = useRef([]);
  const routeLine = useRef(null);

  function buildMap(L) {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const center = driverLocation
      ? [driverLocation.lat, driverLocation.lng]
      : route && route.length > 0
        ? [route[0].location.lat, route[0].location.lng]
        : UMN_CENTER;

    const map = L.map(mapRef.current).setView(center, 15);
    leafletMap.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    renderMarkers(L, map);
  }

  function renderMarkers(L, map) {
    // Clear existing stop markers
    for (const m of stopMarkers.current) m.remove();
    stopMarkers.current = [];
    if (routeLine.current) { routeLine.current.remove(); routeLine.current = null; }

    // Driver marker
    const driverIcon = L.divIcon({
      className: '',
      html: `<div style="background:#7A0019;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #FFCC33;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🚗</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    if (driverLocation) {
      if (driverMarker.current) {
        driverMarker.current.setLatLng([driverLocation.lat, driverLocation.lng]);
      } else {
        driverMarker.current = L.marker([driverLocation.lat, driverLocation.lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup('Your location');
      }
    }

    if (!route || route.length === 0) return;

    const points = driverLocation ? [[driverLocation.lat, driverLocation.lng]] : [];

    route.forEach((stop, idx) => {
      const isPickup = stop.type === 'pickup';
      const isDone = stop.status === 'done';
      const color = isDone ? '#9ca3af' : isPickup ? '#16a34a' : '#dc2626';
      const letter = isPickup ? 'P' : 'D';

      const stopIcon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);font-weight:bold;font-size:11px;opacity:${isDone ? 0.5 : 1}">
          <span>${idx + 1}</span>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const timeStr = stop.scheduledTime
        ? new Date(stop.scheduledTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '';

      const marker = L.marker([stop.location.lat, stop.location.lng], { icon: stopIcon })
        .addTo(map)
        .bindPopup(`
          <b>#${idx + 1} ${isPickup ? 'PICKUP' : 'DROPOFF'}</b><br/>
          ${stop.location.label || ''}<br/>
          ${timeStr ? `ETA: ${timeStr}` : ''}
        `);

      stopMarkers.current.push(marker);
      points.push([stop.location.lat, stop.location.lng]);
    });

    if (points.length >= 2) {
      routeLine.current = L.polyline(points, { color: '#7A0019', weight: 3, opacity: 0.7 }).addTo(map);
      map.fitBounds(routeLine.current.getBounds(), { padding: [40, 40] });
    }
  }

  useEffect(() => {
    if (leafletMap.current || !mapRef.current) return;
    import('leaflet').then((L) => buildMap(L));
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        driverMarker.current = null;
        stopMarkers.current = [];
        routeLine.current = null;
      }
    };
  }, []);

  // Update when route changes
  useEffect(() => {
    if (!leafletMap.current) return;
    import('leaflet').then((L) => renderMarkers(L, leafletMap.current));
  }, [route, driverLocation]);

  return (
    <div ref={mapRef} className="w-full h-80 rounded-xl border border-gray-200 shadow-md" />
  );
}
