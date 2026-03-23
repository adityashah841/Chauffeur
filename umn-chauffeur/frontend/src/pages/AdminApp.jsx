// pages/AdminApp.jsx
import React, { useState, useEffect } from 'react';
import UMNHeader from '../components/UMNHeader';
import RouteMap from '../components/RouteMap';
import StatusBadge from '../components/StatusBadge';

const API = '/api';
const REFRESH_INTERVAL = 5000;

export default function AdminApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapDriver, setMapDriver] = useState(null);

  async function fetchData() {
    try {
      const resp = await fetch(`${API}/admin/overview`);
      const json = await resp.json();
      setData(json);
      if (!mapDriver && json.fleet && json.fleet.length > 0) {
        setMapDriver(json.fleet[0].id);
      }
    } catch (e) {
      console.error('Admin fetch error', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <UMNHeader role="admin" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading admin data...</div>
      </div>
    );
  }

  const selectedVehicle = data?.fleet?.find(v => v.id === mapDriver);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <UMNHeader role="admin" />
      <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Fleet Size', value: data?.fleet?.length ?? 0, icon: '🚗', color: 'bg-blue-50 text-blue-700' },
            {
              label: 'Utilization',
              value: `${data?.utilization?.usedSeats ?? 0}/${data?.utilization?.totalSeats ?? 0}`,
              sub: `${data?.utilization?.pct ?? 0}%`,
              icon: '💺',
              color: 'bg-purple-50 text-purple-700',
            },
            { label: 'Active Rides', value: data?.bookings?.active ?? 0, icon: '🟢', color: 'bg-green-50 text-green-700' },
            { label: 'Pending', value: data?.bookings?.pending ?? 0, icon: '⏳', color: 'bg-yellow-50 text-yellow-700' },
          ].map(stat => (
            <div key={stat.label} className={`rounded-xl p-4 ${stat.color} border border-current border-opacity-10`}>
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.sub && <div className="text-sm opacity-70">{stat.sub}</div>}
              <div className="text-sm font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Fleet status + map */}
        <div className="grid md:grid-cols-5 gap-4">
          {/* Fleet list */}
          <div className="md:col-span-2 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Fleet Status</h2>
            {data?.fleet?.map(vehicle => (
              <div
                key={vehicle.id}
                onClick={() => setMapDriver(vehicle.id)}
                className={`bg-white rounded-xl shadow-sm p-4 cursor-pointer border-2 transition-colors ${mapDriver === vehicle.id ? 'border-maroon' : 'border-transparent hover:border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-gray-900">{vehicle.driverName}</span>
                  <StatusBadge status={vehicle.status} />
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Vehicle</span>
                    <span className="font-mono font-semibold text-gray-700">{vehicle.vehicleNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Load</span>
                    <span className="font-semibold text-gray-700">{vehicle.currentLoad}/{vehicle.capacity} seats</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Stops</span>
                    <span className="font-semibold text-gray-700">{vehicle.route?.length ?? 0}</span>
                  </div>
                </div>
                {/* Utilization bar */}
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-maroon rounded-full transition-all"
                    style={{ width: `${(vehicle.currentLoad / vehicle.capacity) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Map */}
          <div className="md:col-span-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
              Route Map {selectedVehicle ? `· ${selectedVehicle.driverName}` : ''}
            </h2>
            {selectedVehicle ? (
              <RouteMap
                route={selectedVehicle.route}
                driverLocation={selectedVehicle.currentLocation}
              />
            ) : (
              <div className="bg-white rounded-xl shadow-sm h-80 flex items-center justify-center text-gray-400 text-sm">
                Select a vehicle to view route
              </div>
            )}
          </div>
        </div>

        {/* All routes overview */}
        <div>
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">All Active Routes</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {data?.fleet?.filter(v => v.route?.length > 0).map(vehicle => (
              <div key={vehicle.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">{vehicle.driverName} · {vehicle.vehicleNumber}</span>
                  <StatusBadge status={vehicle.status} />
                </div>
                <div className="divide-y divide-gray-50">
                  {vehicle.route?.map((stop, idx) => {
                    const isPickup = stop.type === 'pickup';
                    const isDone = stop.status === 'done';
                    const timeStr = stop.scheduledTime
                      ? new Date(stop.scheduledTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      : null;
                    return (
                      <div key={idx} className={`px-4 py-2.5 flex items-center gap-3 text-sm ${isDone ? 'opacity-40' : ''}`}>
                        <span className={`w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${isPickup ? 'bg-green-600' : 'bg-red-600'}`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-bold uppercase mr-2 ${isPickup ? 'text-green-700' : 'text-red-700'}`}>
                            {isPickup ? 'P' : 'D'}
                          </span>
                          <span className="text-gray-700 truncate">{stop.location?.label}</span>
                        </div>
                        {timeStr && <span className="text-xs text-gray-400">{timeStr}</span>}
                        {isDone && <span className="text-xs text-gray-400">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {data?.fleet?.every(v => !v.route?.length) && (
              <div className="col-span-2 bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">
                <div className="text-3xl mb-2">🚕</div>
                <p className="text-sm">No active routes</p>
              </div>
            )}
          </div>
        </div>

        {/* Optimizer log */}
        <div>
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
            Optimizer Log <span className="text-gray-400 font-normal normal-case">· last 50 events</span>
          </h2>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
              {(!data?.optimizerLog || data.optimizerLog.length === 0) ? (
                <span className="text-gray-500">No optimizer events yet.</span>
              ) : (
                [...data.optimizerLog].reverse().map((entry, i) => (
                  <div key={i} className={`${
                    entry.type === 'assignment' || entry.type === 'initial_assignment' || entry.type === 'reoptimize_assignment'
                      ? 'text-green-400'
                      : entry.type === 'unassigned'
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                  }`}>
                    <span className="text-gray-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    {' '}
                    {entry.type === 'assignment' || entry.type === 'initial_assignment' || entry.type === 'reoptimize_assignment'
                      ? `[OPTIMIZER] Booking #${entry.bookingId} → Vehicle ${entry.vehicleId}${entry.addedCostKm ? ` (+${entry.addedCostKm.toFixed(3)} km)` : ''}`
                      : entry.type === 'unassigned'
                        ? `[OPTIMIZER] Booking #${entry.bookingId} unassigned: ${entry.reason}`
                        : JSON.stringify(entry)
                    }
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center">Auto-refreshes every 5 seconds</p>
      </div>
    </div>
  );
}
