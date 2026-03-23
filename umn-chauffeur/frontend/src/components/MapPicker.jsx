// components/MapPicker.jsx
// Leaflet map with click-to-pin pickup and dropoff locations
import React, { useEffect, useRef, useState } from 'react';

const UMN_CENTER = [44.9740, -93.2277];
const DEFAULT_ZOOM = 15;

export default function MapPicker({ pickupPin, dropoffPin, onPickupChange, onDropoffChange, mode = 'both' }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const [activePin, setActivePin] = useState(mode === 'pickup' ? 'pickup' : 'pickup');

  useEffect(() => {
    if (leafletMap.current) return;
    if (!mapRef.current) return;

    // Dynamic import of Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default marker icon paths
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current).setView(UMN_CENTER, DEFAULT_ZOOM);
      leafletMap.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Pickup icon (green)
      const pickupIcon = L.divIcon({
        className: '',
        html: `<div style="background:#16a34a;color:white;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);font-size:12px;font-weight:bold">P</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      // Dropoff icon (red)
      const dropoffIcon = L.divIcon({
        className: '',
        html: `<div style="background:#dc2626;color:white;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);font-size:12px;font-weight:bold">D</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });

      // Restore existing pins
      if (pickupPin && pickupPin.lat) {
        pickupMarker.current = L.marker([pickupPin.lat, pickupPin.lng], { icon: pickupIcon, draggable: true }).addTo(map);
        pickupMarker.current.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          onPickupChange && onPickupChange({ lat: pos.lat, lng: pos.lng, label: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` });
        });
      }
      if (dropoffPin && dropoffPin.lat) {
        dropoffMarker.current = L.marker([dropoffPin.lat, dropoffPin.lng], { icon: dropoffIcon, draggable: true }).addTo(map);
        dropoffMarker.current.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          onDropoffChange && onDropoffChange({ lat: pos.lat, lng: pos.lng, label: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` });
        });
      }

      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (activePin === 'pickup' || mode === 'pickup') {
          if (pickupMarker.current) {
            pickupMarker.current.setLatLng([lat, lng]);
          } else {
            pickupMarker.current = L.marker([lat, lng], { icon: pickupIcon, draggable: true }).addTo(map);
            pickupMarker.current.on('dragend', (ev) => {
              const pos = ev.target.getLatLng();
              onPickupChange && onPickupChange({ lat: pos.lat, lng: pos.lng, label: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` });
            });
          }
          onPickupChange && onPickupChange({ lat, lng, label });
          if (mode === 'both') setActivePin('dropoff');
        } else {
          if (dropoffMarker.current) {
            dropoffMarker.current.setLatLng([lat, lng]);
          } else {
            dropoffMarker.current = L.marker([lat, lng], { icon: dropoffIcon, draggable: true }).addTo(map);
            dropoffMarker.current.on('dragend', (ev) => {
              const pos = ev.target.getLatLng();
              onDropoffChange && onDropoffChange({ lat: pos.lat, lng: pos.lng, label: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` });
            });
          }
          onDropoffChange && onDropoffChange({ lat, lng, label });
          if (mode === 'both') setActivePin('pickup');
        }
      });
    });

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      {mode === 'both' && (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActivePin('pickup')}
            className={`px-3 py-1 rounded-full font-semibold transition-colors ${activePin === 'pickup' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            📍 Set Pickup
          </button>
          <button
            type="button"
            onClick={() => setActivePin('dropoff')}
            className={`px-3 py-1 rounded-full font-semibold transition-colors ${activePin === 'dropoff' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            🏁 Set Dropoff
          </button>
          <span className="text-gray-400 ml-1 self-center">
            Click map to place {activePin} pin
          </span>
        </div>
      )}
      <div ref={mapRef} className="w-full h-64 rounded-lg border border-gray-200 shadow-sm" />
    </div>
  );
}
