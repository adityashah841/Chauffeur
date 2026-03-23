// backend/routes/drivers.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { getAllVehicles, getVehicle, updateVehicleLocation } = require('../state');
const { syncRouteToDb } = require('../db/sync');

// GET /api/drivers — list all drivers + current route (with DB stop IDs)
router.get('/', (req, res) => {
  const vehicles = getAllVehicles();
  const db = getDb();

  res.json(vehicles.map(v => {
    // Fetch DB stop IDs for this driver's pending stops, indexed by sequence_order
    const dbStops = db.prepare(
      'SELECT id, sequence_order, booking_id, type, status FROM stops WHERE driver_id = ? ORDER BY sequence_order'
    ).all(v.id);

    const routeWithIds = v.route.map((stop, idx) => {
      const dbStop = dbStops.find(s => s.sequence_order === idx);
      return {
        ...stop,
        dbStopId: dbStop ? dbStop.id : null,
        // Serialize Date objects for JSON
        scheduledTime: stop.scheduledTime instanceof Date ? stop.scheduledTime.toISOString() : stop.scheduledTime,
        timeWindow: stop.timeWindow ? {
          earliest: stop.timeWindow.earliest instanceof Date ? stop.timeWindow.earliest.toISOString() : stop.timeWindow.earliest,
          latest: stop.timeWindow.latest instanceof Date ? stop.timeWindow.latest.toISOString() : stop.timeWindow.latest,
        } : null,
      };
    });

    return {
      id: v.id,
      driverName: v.driverName,
      vehicleNumber: v.vehicleNumber,
      phoneNumber: v.phoneNumber,
      status: v.status,
      currentLoad: v.currentLoad,
      capacity: v.capacity,
      currentLocation: v.currentLocation,
      routeLength: v.route.length,
      route: routeWithIds,
    };
  }));
});

// POST /api/drivers/:id/accept — driver accepts assigned route
router.post('/:id/accept', (req, res) => {
  const driverId = Number(req.params.id);
  const vehicle = getVehicle(driverId);
  if (!vehicle) return res.status(404).json({ error: 'Driver not found.' });

  vehicle.status = 'on_route';
  const db = getDb();
  db.prepare("UPDATE drivers SET status = 'on_route' WHERE id = ?").run(driverId);

  // Notify all students on this route
  const io = req.app.get('io');
  if (io) {
    const bookingIds = [...new Set(vehicle.route.map(s => s.requestId))];
    for (const bookingId of bookingIds) {
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
      if (booking) {
        // Find estimated arrival for this booking's pickup
        const pickupStop = vehicle.route.find(s => s.requestId === bookingId && s.type === 'pickup');
        io.to(`student:${bookingId}`).emit('booking:confirmed', {
          bookingId,
          driverName: vehicle.driverName,
          driverPhone: vehicle.phoneNumber,
          vehicleNumber: vehicle.vehicleNumber,
          estimatedArrival: pickupStop ? pickupStop.scheduledTime : null,
        });
      }
    }
  }

  res.json({ ok: true, status: vehicle.status });
});

// POST /api/drivers/:id/transfer — transfer route to next available driver
router.post('/:id/transfer', (req, res) => {
  const driverId = Number(req.params.id);
  const vehicle = getVehicle(driverId);
  if (!vehicle) return res.status(404).json({ error: 'Driver not found.' });

  const allVehicles = getAllVehicles();
  const nextDriver = allVehicles.find(v => v.id !== driverId && v.status === 'available');

  if (!nextDriver) {
    return res.status(409).json({ error: 'No available driver to transfer to.' });
  }

  // Transfer route and load
  nextDriver.route = [...vehicle.route];
  nextDriver.currentLoad = vehicle.currentLoad;
  nextDriver.requestMap = { ...vehicle.requestMap };

  vehicle.route = [];
  vehicle.currentLoad = 0;
  vehicle.requestMap = {};
  vehicle.status = 'available';

  const db = getDb();
  db.prepare("UPDATE drivers SET status = 'available' WHERE id = ?").run(driverId);
  db.prepare("UPDATE drivers SET status = 'on_route' WHERE id = ?").run(nextDriver.id);

  // Update booking assignments
  const bookingIds = [...new Set(nextDriver.route.map(s => s.requestId))];
  for (const bookingId of bookingIds) {
    db.prepare("UPDATE bookings SET assigned_driver_id = ? WHERE id = ?").run(nextDriver.id, bookingId);
  }

  syncRouteToDb(db, nextDriver);

  const io = req.app.get('io');
  if (io) {
    io.to(`driver:${nextDriver.id}`).emit('route:updated', { route: nextDriver.route });
    for (const bookingId of bookingIds) {
      io.to(`student:${bookingId}`).emit('booking:confirmed', {
        bookingId,
        driverName: nextDriver.driverName,
        driverPhone: nextDriver.phoneNumber,
        vehicleNumber: nextDriver.vehicleNumber,
        transferredFrom: vehicle.driverName,
      });
    }
  }

  res.json({
    ok: true,
    transferredTo: { id: nextDriver.id, name: nextDriver.driverName, vehicle: nextDriver.vehicleNumber },
  });
});

// POST /api/drivers/:id/location — driver updates GPS coordinates
router.post('/:id/location', (req, res) => {
  const driverId = Number(req.params.id);
  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required.' });

  updateVehicleLocation(driverId, lat, lng);

  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO driver_locations (driver_id, lat, lng, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(driverId, lat, lng);

  // Broadcast to all students in this driver's route
  const vehicle = getVehicle(driverId);
  const io = req.app.get('io');
  if (io && vehicle) {
    const bookingIds = [...new Set(vehicle.route.map(s => s.requestId))];
    for (const bookingId of bookingIds) {
      io.to(`student:${bookingId}`).emit('driver:location', { driverId, lat, lng });
    }
  }

  res.json({ ok: true });
});

module.exports = router;
