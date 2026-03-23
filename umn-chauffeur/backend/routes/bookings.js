// backend/routes/bookings.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { assignRequest } = require('../optimizer/vrptw');
const { getAllVehicles, getVehicle, addOptimizerLog } = require('../state');
const { syncRouteToDb } = require('../db/sync');

// ── Operating hours validation (8:00 AM – 1:00 AM next day) ─────────────────
function isWithinOperatingHours(date) {
  const d = new Date(date);
  const h = d.getHours();
  const m = d.getMinutes();
  const totalMinutes = h * 60 + m;
  // 8:00 = 480, 25:00 = 1500 (1 AM next day)
  return totalMinutes >= 480 || totalMinutes < 60; // 8am–1am (wraps midnight)
}

function isCurrentlyOpen() {
  return isWithinOperatingHours(new Date());
}

// POST /api/bookings
router.post('/', (req, res) => {
  const {
    studentName, contactNumber,
    pickupLat, pickupLng, pickupLabel,
    dropoffLat, dropoffLng, dropoffLabel,
    passengers, rideType, requestedTime: rawRequestedTime,
  } = req.body;

  // Validate required fields
  if (!studentName || !contactNumber || pickupLat == null || pickupLng == null || !pickupLabel
    || dropoffLat == null || dropoffLng == null || !dropoffLabel
    || !passengers || !rideType) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  if (passengers < 1 || passengers > 5) {
    return res.status(400).json({ error: 'Passengers must be between 1 and 5.' });
  }

  const now = new Date();

  // Check service hours for new bookings
  if (!isCurrentlyOpen()) {
    return res.status(400).json({ error: 'Service is only available from 8:00 AM to 1:00 AM.' });
  }

  let requestedTime;
  if (rideType === 'on_demand') {
    requestedTime = now;
  } else if (rideType === 'scheduled') {
    if (!rawRequestedTime) {
      return res.status(400).json({ error: 'Scheduled rides require a requested time.' });
    }
    requestedTime = new Date(rawRequestedTime);
    if (isNaN(requestedTime.getTime())) {
      return res.status(400).json({ error: 'Invalid requested time.' });
    }
    if (requestedTime <= now) {
      return res.status(400).json({ error: 'Scheduled time must be in the future.' });
    }
    if (!isWithinOperatingHours(requestedTime)) {
      return res.status(400).json({ error: 'Scheduled pickup must be between 8:00 AM and 1:00 AM.' });
    }
  } else {
    return res.status(400).json({ error: 'rideType must be on_demand or scheduled.' });
  }

  const MAX_WAIT_MINUTES = 15;
  const latestPickup = new Date(requestedTime.getTime() + MAX_WAIT_MINUTES * 60000);

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO bookings
      (student_name, contact_number,
       pickup_lat, pickup_lng, pickup_label,
       dropoff_lat, dropoff_lng, dropoff_label,
       passengers, requested_time, latest_pickup, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  const info = insert.run(
    studentName, contactNumber,
    pickupLat, pickupLng, pickupLabel,
    dropoffLat, dropoffLng, dropoffLabel,
    passengers,
    requestedTime.toISOString(),
    latestPickup.toISOString()
  );

  const bookingId = info.lastInsertRowid;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

  // Run optimizer
  const newRequest = {
    id: bookingId,
    studentName: booking.student_name,
    contactNumber: booking.contact_number,
    pickup: { lat: booking.pickup_lat, lng: booking.pickup_lng, label: booking.pickup_label },
    dropoff: { lat: booking.dropoff_lat, lng: booking.dropoff_lng, label: booking.dropoff_label },
    passengers: booking.passengers,
    requestedTime: new Date(booking.requested_time),
    latestPickup: new Date(booking.latest_pickup),
    status: 'pending',
  };

  const vehicles = getAllVehicles();
  const result = assignRequest(newRequest, vehicles);

  if (result.assigned) {
    // Update booking status
    db.prepare("UPDATE bookings SET status = 'assigned', assigned_driver_id = ? WHERE id = ?")
      .run(result.vehicleId, bookingId);

    const vehicle = getVehicle(result.vehicleId);
    syncRouteToDb(db, vehicle);

    addOptimizerLog({
      type: 'assignment',
      bookingId,
      vehicleId: result.vehicleId,
      vehicleNumber: vehicle ? vehicle.vehicleNumber : null,
      addedCostKm: result.addedCostKm,
    });

    // Emit route:updated to driver via socket (attached to req.app)
    const io = req.app.get('io');
    if (io && vehicle) {
      io.to(`driver:${result.vehicleId}`).emit('route:updated', { route: vehicle.route });
    }

    return res.status(201).json({
      bookingId,
      status: 'assigned',
      driverId: result.vehicleId,
      driverName: vehicle ? vehicle.driverName : null,
      driverPhone: vehicle ? vehicle.phoneNumber : null,
    });
  }

  addOptimizerLog({ type: 'unassigned', bookingId, reason: 'No feasible vehicle found' });
  return res.status(201).json({ bookingId, status: 'pending', message: 'Added to queue; awaiting driver assignment.' });
});

// GET /api/bookings/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  let driverInfo = null;
  if (booking.assigned_driver_id) {
    const vehicle = getVehicle(booking.assigned_driver_id);
    if (vehicle) {
      driverInfo = {
        driverId: vehicle.id,
        driverName: vehicle.driverName,
        driverPhone: vehicle.phoneNumber,
        vehicleNumber: vehicle.vehicleNumber,
        currentLocation: vehicle.currentLocation,
      };
    }
  }

  const stops = db.prepare('SELECT * FROM stops WHERE booking_id = ? ORDER BY sequence_order').all(req.params.id);

  res.json({ booking, stops, driverInfo });
});

module.exports = router;
