// pages/StudentApp.jsx
import React, { useState, useEffect, useCallback } from 'react';
import UMNHeader from '../components/UMNHeader';
import MapPicker from '../components/MapPicker';
import TrackingMap from '../components/TrackingMap';
import StatusBadge from '../components/StatusBadge';
import socket, { connectSocket, disconnectSocket } from '../socket';

// ── Operating hours check (8am–1am) ──────────────────────────────────────────
function isWithinOperatingHours() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const total = h * 60 + m;
  return total >= 8 * 60 || total < 60; // 480–1500 minutes of day
}

// ── UMN campus quick-select locations ────────────────────────────────────────
const CAMPUS_LOCATIONS = [
  { label: 'Coffman Memorial Union',          lat: 44.9726, lng: -93.2350 },
  { label: 'Walter Library',                  lat: 44.9745, lng: -93.2355 },
  { label: 'Northrop Auditorium',             lat: 44.9718, lng: -93.2319 },
  { label: 'Rec Center (SREC)',               lat: 44.9766, lng: -93.2330 },
  { label: 'Dinkytown (4th St SE)',           lat: 44.9827, lng: -93.2283 },
  { label: 'Como Ave & 15th Ave SE',          lat: 44.9789, lng: -93.2260 },
  { label: 'Pioneer Hall',                    lat: 44.9730, lng: -93.2310 },
  { label: 'Mayo Memorial Building',          lat: 44.9736, lng: -93.2280 },
  { label: 'Weisman Art Museum',              lat: 44.9742, lng: -93.2373 },
  { label: 'Stadium Village (Washington Ave SE)', lat: 44.9778, lng: -93.2263 },
  { label: 'University Village Apartments',   lat: 44.9840, lng: -93.2230 },
];

const API = '/api';

// ──────────────────────────────────────────────────────────────────────────────
// STUDENT APP
// ──────────────────────────────────────────────────────────────────────────────
export default function StudentApp() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('umn_student')); } catch { return null; }
  });

  if (!user) return <StudentLogin onLogin={setUser} />;
  return <StudentDashboard user={user} onLogout={() => { localStorage.removeItem('umn_student'); setUser(null); }} />;
}

// ── Login screen ──────────────────────────────────────────────────────────────
function StudentLogin({ onLogin }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr('Please enter your name.'); return; }
    if (!phone.trim()) { setErr('Please enter your contact number.'); return; }
    const user = { name: name.trim(), phone: phone.trim() };
    localStorage.setItem('umn_student', JSON.stringify(user));
    onLogin(user);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <UMNHeader role="student" />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-maroon rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">🚗</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome to UMN Chauffeur</h1>
            <p className="text-gray-500 text-sm mt-1">Shared ride service · University of Minnesota</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Jordan Smith"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-maroon"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 612-555-0000"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-maroon"
              />
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <button
              type="submit"
              className="w-full bg-maroon hover:bg-maroon-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              Enter →
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-4">
            Service hours: 8:00 AM – 1:00 AM daily
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function StudentDashboard({ user, onLogout }) {
  const [view, setView] = useState('dashboard'); // dashboard | book | track
  const [activeBooking, setActiveBooking] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [notification, setNotification] = useState(null);

  // Subscribe to socket events when there's an active booking
  useEffect(() => {
    connectSocket();

    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    if (!activeBooking) return;

    socket.emit('subscribe:booking', { bookingId: activeBooking.id });

    socket.on('booking:confirmed', (data) => {
      if (data.bookingId === activeBooking.id) {
        setDriverInfo(data);
        setActiveBooking(prev => prev ? { ...prev, status: 'assigned' } : prev);
        setNotification({ type: 'success', msg: `Driver ${data.driverName} has accepted your ride!` });
        setTimeout(() => setNotification(null), 5000);
      }
    });

    socket.on('driver:location', (data) => {
      setDriverLocation({ lat: data.lat, lng: data.lng });
    });

    socket.on('stop:completed', (data) => {
      if (data.type === 'pickup') {
        setActiveBooking(prev => prev ? { ...prev, status: 'picked_up' } : prev);
        setNotification({ type: 'info', msg: 'You have been picked up! En route to your destination.' });
        setTimeout(() => setNotification(null), 5000);
      } else if (data.type === 'dropoff') {
        setActiveBooking(prev => prev ? { ...prev, status: 'completed' } : prev);
        setNotification({ type: 'success', msg: 'You have been dropped off. Thanks for riding UMN Chauffeur!' });
        setTimeout(() => {
          setNotification(null);
          setActiveBooking(null);
          setDriverInfo(null);
          setDriverLocation(null);
        }, 5000);
      }
    });

    return () => {
      socket.off('booking:confirmed');
      socket.off('driver:location');
      socket.off('stop:completed');
    };
  }, [activeBooking?.id]);

  function handleBookingCreated(booking, serverResp) {
    setActiveBooking({ ...booking, id: serverResp.bookingId, status: serverResp.status });
    if (serverResp.driverName) {
      setDriverInfo({
        driverName: serverResp.driverName,
        driverPhone: serverResp.driverPhone,
      });
    }
    setView('track');
  }

  const statusSteps = [
    { key: 'pending',   label: 'Booking Placed',   icon: '📋' },
    { key: 'assigned',  label: 'Driver Assigned',   icon: '👨‍💼' },
    { key: 'picked_up', label: 'Picked Up',         icon: '🚗' },
    { key: 'completed', label: 'Dropped Off',       icon: '✅' },
  ];
  const currentStepIdx = statusSteps.findIndex(s => s.key === activeBooking?.status) ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <UMNHeader role="student" />

      {/* Notification banner */}
      {notification && (
        <div className={`px-4 py-2 text-sm text-center font-medium ${notification.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
          {notification.msg}
        </div>
      )}

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-4">
        {/* User bar */}
        <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm">
          <div>
            <p className="font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.phone}</p>
          </div>
          <button onClick={onLogout} className="text-xs text-maroon hover:underline">Sign out</button>
        </div>

        {/* Service hours notice */}
        {!isWithinOperatingHours() && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
            ⚠️ Service is currently closed. Hours: 8:00 AM – 1:00 AM
          </div>
        )}

        {/* View: Dashboard */}
        {view === 'dashboard' && (
          <>
            {activeBooking ? (
              <ActiveRideCard
                booking={activeBooking}
                driverInfo={driverInfo}
                onViewTracking={() => setView('track')}
              />
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-6 text-center">
                <div className="text-5xl mb-3">🚕</div>
                <h2 className="text-lg font-bold text-gray-800 mb-1">No active ride</h2>
                <p className="text-gray-500 text-sm mb-4">Ready to go? Book a shared ride around campus.</p>
                <button
                  onClick={() => setView('book')}
                  disabled={!isWithinOperatingHours()}
                  className="bg-maroon hover:bg-maroon-dark text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Book a Ride
                </button>
              </div>
            )}
          </>
        )}

        {/* View: Booking Form */}
        {view === 'book' && (
          <BookingForm
            user={user}
            onSuccess={handleBookingCreated}
            onCancel={() => setView('dashboard')}
          />
        )}

        {/* View: Tracking */}
        {view === 'track' && activeBooking && (
          <TrackingView
            booking={activeBooking}
            driverInfo={driverInfo}
            driverLocation={driverLocation}
            statusSteps={statusSteps}
            currentStepIdx={currentStepIdx}
            onBack={() => setView('dashboard')}
          />
        )}
      </div>
    </div>
  );
}

// ── Active Ride Card ───────────────────────────────────────────────────────────
function ActiveRideCard({ booking, driverInfo, onViewTracking }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-maroon text-white px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">Active Ride</span>
        <StatusBadge status={booking.status} pulse={booking.status !== 'completed'} />
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-3 text-sm">
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Pickup</p>
            <p className="font-medium text-gray-800">{booking.pickupLabel || booking.pickup?.label}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Dropoff</p>
            <p className="font-medium text-gray-800">{booking.dropoffLabel || booking.dropoff?.label}</p>
          </div>
        </div>
        {driverInfo && (
          <div className="bg-maroon bg-opacity-5 rounded-lg px-3 py-2 text-sm">
            <p className="font-semibold text-maroon">{driverInfo.driverName}</p>
            {driverInfo.driverPhone && (
              <a href={`tel:${driverInfo.driverPhone}`} className="text-xs text-blue-600 hover:underline">
                📞 {driverInfo.driverPhone}
              </a>
            )}
          </div>
        )}
        <button
          onClick={onViewTracking}
          className="w-full text-center text-sm text-maroon font-semibold hover:underline"
        >
          View Live Tracking →
        </button>
      </div>
    </div>
  );
}

// ── Booking Form ──────────────────────────────────────────────────────────────
function BookingForm({ user, onSuccess, onCancel }) {
  const [pickupPin, setPickupPin] = useState(null);
  const [dropoffPin, setDropoffPin] = useState(null);
  const [pickupLabel, setPickupLabel] = useState('');
  const [dropoffLabel, setDropoffLabel] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [rideType, setRideType] = useState('on_demand');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handlePickupSelect(location) {
    setPickupPin(location);
    setPickupLabel(location.label || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
  }

  function handleDropoffSelect(location) {
    setDropoffPin(location);
    setDropoffLabel(location.label || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
  }

  function handleCampusPickup(e) {
    const loc = CAMPUS_LOCATIONS.find(l => l.label === e.target.value);
    if (loc) handlePickupSelect(loc);
    else setPickupLabel(e.target.value);
  }

  function handleCampusDropoff(e) {
    const loc = CAMPUS_LOCATIONS.find(l => l.label === e.target.value);
    if (loc) handleDropoffSelect(loc);
    else setDropoffLabel(e.target.value);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!pickupPin) { setError('Please select a pickup location.'); return; }
    if (!dropoffPin) { setError('Please select a dropoff location.'); return; }

    if (rideType === 'scheduled' && (!scheduledDate || !scheduledTime)) {
      setError('Please select a date and time for your scheduled ride.'); return;
    }

    let requestedTime = null;
    if (rideType === 'scheduled') {
      requestedTime = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: user.name,
          contactNumber: user.phone,
          pickupLat: pickupPin.lat,
          pickupLng: pickupPin.lng,
          pickupLabel: pickupLabel || pickupPin.label,
          dropoffLat: dropoffPin.lat,
          dropoffLng: dropoffPin.lng,
          dropoffLabel: dropoffLabel || dropoffPin.label,
          passengers,
          rideType,
          requestedTime,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) { setError(data.error || 'Booking failed.'); return; }

      onSuccess({
        pickupLabel: pickupLabel || pickupPin.label,
        dropoffLabel: dropoffLabel || dropoffPin.label,
        pickup: pickupPin,
        dropoff: dropoffPin,
        passengers,
        status: data.status,
      }, data);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Min date/time for scheduled bookings
  const now = new Date();
  const minDate = now.toISOString().slice(0, 10);
  const minTime = now.toTimeString().slice(0, 5);

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="bg-maroon text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
        <h2 className="font-semibold">Book a Ride</h2>
        <button onClick={onCancel} className="text-white opacity-70 hover:opacity-100 text-xl">×</button>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Ride Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ride Type</label>
          <div className="flex gap-3">
            {['on_demand', 'scheduled'].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setRideType(type)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  rideType === type
                    ? 'border-maroon bg-maroon text-white'
                    : 'border-gray-200 text-gray-600 hover:border-maroon hover:text-maroon'
                }`}
              >
                {type === 'on_demand' ? '⚡ On-Demand' : '📅 Scheduled'}
              </button>
            ))}
          </div>
        </div>

        {/* Scheduled date/time */}
        {rideType === 'scheduled' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                min={minDate}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon"
              />
            </div>
          </div>
        )}

        {/* Pickup */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Location</label>
          <select
            onChange={handleCampusPickup}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon mb-2"
            defaultValue=""
          >
            <option value="">-- Select campus location --</option>
            {CAMPUS_LOCATIONS.map(l => (
              <option key={l.label} value={l.label}>{l.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={pickupLabel}
            onChange={e => setPickupLabel(e.target.value)}
            placeholder="Or enter custom address"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon"
          />
          {pickupPin && (
            <p className="text-xs text-green-600 mt-1">📍 {pickupPin.lat.toFixed(5)}, {pickupPin.lng.toFixed(5)}</p>
          )}
        </div>

        {/* Dropoff */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dropoff Location</label>
          <select
            onChange={handleCampusDropoff}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon mb-2"
            defaultValue=""
          >
            <option value="">-- Select campus location --</option>
            {CAMPUS_LOCATIONS.map(l => (
              <option key={l.label} value={l.label}>{l.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={dropoffLabel}
            onChange={e => setDropoffLabel(e.target.value)}
            placeholder="Or enter custom address"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon"
          />
          {dropoffPin && (
            <p className="text-xs text-red-600 mt-1">🏁 {dropoffPin.lat.toFixed(5)}, {dropoffPin.lng.toFixed(5)}</p>
          )}
        </div>

        {/* Map */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Pin on Map</label>
          <MapPicker
            pickupPin={pickupPin}
            dropoffPin={dropoffPin}
            onPickupChange={handlePickupSelect}
            onDropoffChange={handleDropoffSelect}
            mode="both"
          />
        </div>

        {/* Passengers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Passengers: <span className="text-maroon font-bold">{passengers}</span>
          </label>
          <input
            type="range" min="1" max="5" value={passengers}
            onChange={e => setPassengers(Number(e.target.value))}
            className="w-full accent-maroon"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-maroon hover:bg-maroon-dark text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60"
        >
          {loading ? 'Booking...' : 'Confirm Booking →'}
        </button>
      </form>
    </div>
  );
}

// ── Tracking View ─────────────────────────────────────────────────────────────
function TrackingView({ booking, driverInfo, driverLocation, statusSteps, currentStepIdx, onBack }) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-maroon hover:underline flex items-center gap-1">
        ← Back to Dashboard
      </button>

      {/* Status progress */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">Ride Status</h3>
        <div className="flex items-start">
          {statusSteps.map((step, i) => (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                  i <= currentStepIdx
                    ? 'bg-maroon border-maroon text-white'
                    : 'bg-gray-100 border-gray-200 text-gray-400'
                }`}>
                  {i < currentStepIdx ? '✓' : step.icon}
                </div>
                <p className={`text-xs mt-1 text-center leading-tight ${i <= currentStepIdx ? 'text-maroon font-semibold' : 'text-gray-400'}`}>
                  {step.label}
                </p>
              </div>
              {i < statusSteps.length - 1 && (
                <div className={`flex-1 h-0.5 mt-4 transition-colors ${i < currentStepIdx ? 'bg-maroon' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Driver info */}
      {driverInfo && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-maroon rounded-full flex items-center justify-center text-2xl">
              👨‍💼
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{driverInfo.driverName}</p>
              {driverInfo.vehicleNumber && (
                <p className="text-xs text-gray-500">Vehicle: {driverInfo.vehicleNumber}</p>
              )}
            </div>
            {driverInfo.driverPhone && (
              <a
                href={`tel:${driverInfo.driverPhone}`}
                className="bg-green-100 text-green-700 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-green-200 transition-colors"
              >
                📞 Call
              </a>
            )}
          </div>
          {driverInfo.driverPhone && (
            <p className="text-center text-xs text-gray-500 mt-2">
              Car phone: <span className="font-mono font-semibold">{driverInfo.driverPhone}</span>
            </p>
          )}
        </div>
      )}

      {/* Live map */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">
          Live Map {driverLocation ? <span className="text-xs text-green-600 font-normal">● Live</span> : ''}
        </h3>
        <TrackingMap
          driverLocation={driverLocation}
          pickupPin={booking.pickup}
          dropoffPin={booking.dropoff}
        />
      </div>

      {/* Trip details */}
      <div className="bg-white rounded-xl shadow-sm p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Pickup</p>
          <p className="font-medium">{booking.pickupLabel}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Dropoff</p>
          <p className="font-medium">{booking.dropoffLabel}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Passengers</p>
          <p className="font-medium">{booking.passengers}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Status</p>
          <StatusBadge status={booking.status} />
        </div>
      </div>
    </div>
  );
}
