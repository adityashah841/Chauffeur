// components/TrackingMap.jsx
// Live tracking map for student to see driver's location
import React, { useEffect, useRef } from 'react';

const UMN_CENTER = [44.9740, -93.2277];

export default function TrackingMap({ driverLocation, pickupPin, dropoffPin }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const driverMarker = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);

  useEffect(() => {
    if (leafletMap.current || !mapRef.current) return;

    import('leaflet').then((L) => {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const center = driverLocation
        ? [driverLocation.lat, driverLocation.lng]
        : pickupPin ? [pickupPin.lat, pickupPin.lng]
        : UMN_CENTER;

      const map = L.map(mapRef.current).setView(center, 15);
      leafletMap.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Driver icon (car emoji style)
      const driverIcon = L.divIcon({
        className: '',
        html: `<div style="background:#7A0019;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #FFCC33;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:18px;">🚗</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const pickupIcon = L.divIcon({
        className: '',
        html: `<div style="background:#16a34a;color:white;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);font-weight:bold;font-size:13px">P</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });

      const dropoffIcon = L.divIcon({
        className: '',
        html: `<div style="background:#dc2626;color:white;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"><span style="transform:rotate(45deg);font-weight:bold;font-size:13px">D</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });

      if (driverLocation) {
        driverMarker.current = L.marker([driverLocation.lat, driverLocation.lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup('Driver location');
      }
      if (pickupPin) {
        pickupMarker.current = L.marker([pickupPin.lat, pickupPin.lng], { icon: pickupIcon })
          .addTo(map)
          .bindPopup(`Pickup: ${pickupPin.label || 'Your location'}`);
      }
      if (dropoffPin) {
        dropoffMarker.current = L.marker([dropoffPin.lat, dropoffPin.lng], { icon: dropoffIcon })
          .addTo(map)
          .bindPopup(`Dropoff: ${dropoffPin.label || 'Destination'}`);
      }

      // Draw route line if we have points
      const points = [];
      if (driverLocation) points.push([driverLocation.lat, driverLocation.lng]);
      if (pickupPin) points.push([pickupPin.lat, pickupPin.lng]);
      if (dropoffPin) points.push([dropoffPin.lat, dropoffPin.lng]);

      if (points.length >= 2) {
        L.polyline(points, { color: '#7A0019', weight: 3, opacity: 0.6, dashArray: '8,4' }).addTo(map);
      }
    });

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        driverMarker.current = null;
        pickupMarker.current = null;
        dropoffMarker.current = null;
      }
    };
  }, []);

  // Update driver marker position live
  useEffect(() => {
    if (!leafletMap.current || !driverLocation) return;

    import('leaflet').then((L) => {
      if (driverMarker.current) {
        driverMarker.current.setLatLng([driverLocation.lat, driverLocation.lng]);
        leafletMap.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true });
      } else {
        const driverIcon = L.divIcon({
          className: '',
          html: `<div style="background:#7A0019;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #FFCC33;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:18px;">🚗</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        driverMarker.current = L.marker([driverLocation.lat, driverLocation.lng], { icon: driverIcon })
          .addTo(leafletMap.current);
      }
    });
  }, [driverLocation]);

  return (
    <div ref={mapRef} className="w-full h-72 rounded-xl border border-gray-200 shadow-md" />
  );
}
