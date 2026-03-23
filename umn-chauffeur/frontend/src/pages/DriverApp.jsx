// pages/DriverApp.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import UMNHeader from '../components/UMNHeader';
import RouteMap from '../components/RouteMap';
import StatusBadge from '../components/StatusBadge';
import socket, { connectSocket, disconnectSocket } from '../socket';

const API = '/api';

// Simulate driver movement: slightly nudge location along route
function simulateLocation(base, route, stepRef) {
  if (!base) return base;
  if (route && route.length > 0 && stepRef.current < route.length) {
    const target = route[stepRef.current].location;
    const dlat = (target.lat - base.lat) * 0.05;
    const dlng = (target.lng - base.lng) * 0.05;
    return { lat: base.lat + dlat + (Math.random() - 0.5) * 0.0002, lng: base.lng + dlng + (Math.random() - 0.5) * 0.0002 };
  }
  return {
    lat: base.lat + (Math.random() - 0.5) * 0.0005,
    lng: base.lng + (Math.random() - 0.5) * 0.0005,
  };
}

// UMN Campus starting locations
const DRIVER_START_LOCS = {
  1: { lat: 44.9730, lng: -93.2310 },
  2: { lat: 44.9760, lng: -93.2340 },
  3: { lat: 44.9800, lng: -93.2280 },
  4: { lat: 44.9745, lng: -93.2260 },
};

const DRIVERS_LIST = [
  { id: 1, name: 'Marcus Johnson', vehicle: 'UMN-01' },
  { id: 2, name: 'Priya Patel',    vehicle: 'UMN-02' },
  { id: 3, name: 'David Kim',      vehicle: 'UMN-03' },
  { id: 4, name: 'Sofia Torres',   vehicle: 'UMN-04' },
];

// ──────────────────────────────────────────────────────────────────────────────
export default function DriverApp() {
  const [driver, setDriver] = useState(() => {
    try { return JSON.parse(localStorage.getItem('umn_driver')); } catch { return null; }
  });

  if (!driver) return <DriverLogin onLogin={setDriver} />;
  return <DriverDashboard driver={driver} onLogout={() => { localStorage.removeItem('umn_driver'); setDriver(null); }} />;
}

// ── Driver Login ──────────────────────────────────────────────────────────────
function DriverLogin({ onLogin }) {
  const [selectedId, setSelectedId] = useState('');

  function handleLogin(e) {
    e.preventDefault();
    if (!selectedId) return;
    const d = DRIVERS_LIST.find(x => x.id === Number(selectedId));
    if (d) {
      localStorage.setItem('umn_driver', JSON.stringify(d));
      onLogin(d);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <UMNHeader role="driver" />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">🚗</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Driver Login</h1>
            <p className="text-gray-500 text-sm mt-1">UMN Chauffeur Fleet</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Your Name</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">-- Select driver --</option>
                {DRIVERS_LIST.map(d => (
                  <option key={d.id} value={d.id}>{d.name} · {d.vehicle}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!selectedId}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Start Shift →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Driver Dashboard ──────────────────────────────────────────────────────────
function DriverDashboard({ driver, onLogout }) {
  const [driverData, setDriverData] = useState(null);
  const [view, setView] = useState('list'); // list | map
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const locationRef = useRef(DRIVER_START_LOCS[driver.id] || { lat: 44.9740, lng: -93.2277 });
  const simStepRef = useRef(0);
  const routeRef = useRef([]);

  // Fetch driver data from API
  async function fetchDriverData() {
    try {
      const resp = await fetch(`${API}/drivers`);
      const all = await resp.json();
      const me = all.find(d => d.id === driver.id);
      if (me) {
        setDriverData(me);
        routeRef.current = me.route || [];
        if (me.currentLocation) {
          locationRef.current = me.currentLocation;
        }
      }
    } catch (e) {
      console.error('Failed to fetch driver data', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDriverData();
    connectSocket();
    socket.emit('subscribe:driver', { driverId: driver.id });

    socket.on('route:updated', (data) => {
      setDriverData(prev => prev ? { ...prev, route: data.route } : prev);
      routeRef.current = data.route || [];
      setActionMsg('Route updated by optimizer!');
      setTimeout(() => setActionMsg(''), 4000);
    });

    return () => {
      socket.off('route:updated');
      disconnectSocket();
    };
  }, [driver.id]);

  // Location broadcast every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const newLoc = simulateLocation(locationRef.current, routeRef.current, simStepRef);
      locationRef.current = newLoc;

      // Advance step simulation
      if (routeRef.current.length > 0 && simStepRef.current < routeRef.current.length) {
        const target = routeRef.current[simStepRef.current].location;
        const dist = Math.sqrt(
          Math.pow(newLoc.lat - target.lat, 2) + Math.pow(newLoc.lng - target.lng, 2)
        );
        if (dist < 0.0003) simStepRef.current = Math.min(simStepRef.current + 1, routeRef.current.length - 1);
      }

      // Emit via socket
      socket.emit('driver:location', { driverId: driver.id, lat: newLoc.lat, lng: newLoc.lng });

      // Also POST to API for persistence
      try {
        await fetch(`${API}/drivers/${driver.id}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: newLoc.lat, lng: newLoc.lng }),
        });
      } catch { /* ignore */ }

      setDriverData(prev => prev ? { ...prev, currentLocation: newLoc } : prev);
    }, 5000);

    return () => clearInterval(interval);
  }, [driver.id]);

  async function handleAccept() {
    try {
      await fetch(`${API}/drivers/${driver.id}/accept`, { method: 'POST' });
      setActionMsg('Route accepted! Notifying passengers...');
      fetchDriverData();
      setTimeout(() => setActionMsg(''), 4000);
    } catch {
      setActionMsg('Error accepting route.');
    }
  }

  async function handleTransfer() {
    try {
      const resp = await fetch(`${API}/drivers/${driver.id}/transfer`, { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) { setActionMsg(data.error || 'Transfer failed.'); return; }
      setActionMsg(`Route transferred to ${data.transferredTo.name}`);
      fetchDriverData();
      setTimeout(() => setActionMsg(''), 4000);
    } catch {
      setActionMsg('Error transferring route.');
    }
  }

  async function handleCompleteStop(stop) {
    if (stop.dbStopId) {
      await handleCompleteStopById(stop.dbStopId);
    } else {
      // Fallback: refetch to get current DB IDs
      try {
        const resp = await fetch(`${API}/drivers`);
        const allDrivers = await resp.json();
        const me = allDrivers.find(d => d.id === driver.id);
        const match = me?.route?.find(s => s.requestId === stop.requestId && s.type === stop.type);
        if (match?.dbStopId) {
          await handleCompleteStopById(match.dbStopId);
        } else {
          setActionMsg('Stop not yet synced to DB. Try again.');
        }
      } catch {
        setActionMsg('Error finding stop.');
      }
    }
  }

  async function handleCompleteStopById(stopId) {
    try {
      const resp = await fetch(`${API}/stops/${stopId}/complete`, { method: 'PATCH' });
      const data = await resp.json();
      if (!resp.ok) { setActionMsg(data.error || 'Error.'); return; }
      setActionMsg('Stop marked as complete!');
      fetchDriverData();
      setTimeout(() => setActionMsg(''), 3000);
    } catch {
      setActionMsg('Error marking stop.');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <UMNHeader role="driver" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500 text-sm">Loading route...</div>
        </div>
      </div>
    );
  }

  const route = driverData?.route || [];
  const pendingStops = route.filter(s => s.status !== 'done');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <UMNHeader role="driver" />
      <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
        {/* Driver identity bar */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {driver.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{driver.name}</p>
              <p className="text-xs text-gray-500">Vehicle: {driver.vehicle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={driverData?.status || 'available'} pulse={driverData?.status === 'on_route'} />
            <button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-700">Logout</button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Stops', value: route.length },
            { label: 'Passengers', value: `${driverData?.currentLoad || 0}/${driverData?.capacity || 5}` },
            { label: 'Pending', value: pendingStops.length },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm px-3 py-3 text-center">
              <p className="text-xl font-bold text-maroon">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Action message */}
        {actionMsg && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-sm text-blue-700 text-center">
            {actionMsg}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={route.length === 0 || driverData?.status === 'on_route'}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✓ Accept Route
          </button>
          <button
            onClick={handleTransfer}
            disabled={route.length === 0}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↩ Transfer Route
          </button>
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          {['list', 'map'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${view === v ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              {v === 'list' ? '📋 Route List' : '🗺️ Map View'}
            </button>
          ))}
        </div>

        {/* Route list */}
        {view === 'list' && (
          <div className="space-y-2">
            {route.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
                <div className="text-4xl mb-2">🕐</div>
                <p className="text-sm">No stops assigned yet</p>
                <p className="text-xs mt-1">The optimizer will assign rides shortly</p>
              </div>
            ) : (
              route.map((stop, idx) => (
                <StopCard
                  key={`${stop.requestId}-${stop.type}-${idx}`}
                  stop={stop}
                  index={idx + 1}
                  onComplete={() => handleCompleteStop(stop)}
                />
              ))
            )}
          </div>
        )}

        {/* Map view */}
        {view === 'map' && (
          <div className="bg-white rounded-xl shadow-sm p-3">
            <RouteMap
              route={route}
              driverLocation={driverData?.currentLocation}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stop Card ─────────────────────────────────────────────────────────────────
function StopCard({ stop, index, onComplete }) {
  const isPickup = stop.type === 'pickup';
  const isDone = stop.status === 'done';

  const timeStr = stop.scheduledTime
    ? new Date(stop.scheduledTime).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago'
      })
    : null;

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${
      isDone ? 'border-gray-300 opacity-60' : isPickup ? 'border-green-500' : 'border-red-500'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
            isDone ? 'bg-gray-400' : isPickup ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {isDone ? '✓' : index}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                isPickup ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {isPickup ? '↑ Pickup' : '↓ Dropoff'}
              </span>
              {isDone && <span className="text-xs text-gray-400">Completed</span>}
            </div>
            <p className="font-medium text-gray-800 text-sm truncate">{stop.location?.label || 'Unknown location'}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Booking #{stop.requestId}
              {timeStr && ` · ETA ${timeStr}`}
            </p>
          </div>
          {!isDone && (
            <button
              onClick={onComplete}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-2 font-semibold transition-colors flex-shrink-0"
            >
              Mark Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
