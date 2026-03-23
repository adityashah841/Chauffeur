// backend/routes/stops.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { getVehicle, getAllVehicles } = require('../state');

// PATCH /api/stops/:id/complete — mark a stop as done
router.patch('/:id/complete', (req, res) => {
  const stopId = Number(req.params.id);
  const db = getDb();

  const stop = db.prepare('SELECT * FROM stops WHERE id = ?').get(stopId);
  if (!stop) return res.status(404).json({ error: 'Stop not found.' });

  const newStatus = stop.type === 'pickup' ? 'picked_up' : 'completed';

  db.prepare("UPDATE stops SET status = 'done' WHERE id = ?").run(stopId);

  // Update in-memory route stop status
  const vehicle = getVehicle(stop.driver_id);
  if (vehicle) {
    const routeStop = vehicle.route.find(s =>
      s.requestId === stop.booking_id && s.type === stop.type
    );
    if (routeStop) routeStop.status = 'done';

    // Update vehicle load
    if (stop.type === 'pickup') {
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(stop.booking_id);
      if (booking) {
        db.prepare("UPDATE bookings SET status = 'picked_up' WHERE id = ?").run(stop.booking_id);
      }
    } else if (stop.type === 'dropoff') {
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(stop.booking_id);
      if (booking) {
        db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(stop.booking_id);
        vehicle.currentLoad = Math.max(0, vehicle.currentLoad - (booking.passengers || 1));
      }

      // Check if all stops in route are done
      const allDone = vehicle.route.every(s => s.status === 'done');
      if (allDone) {
        vehicle.status = 'available';
        vehicle.route = [];
        vehicle.requestMap = {};
        vehicle.currentLoad = 0;
        db.prepare("UPDATE drivers SET status = 'available' WHERE id = ?").run(stop.driver_id);
      }
    }
  }

  // Notify student via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`student:${stop.booking_id}`).emit('stop:completed', {
      stopId,
      type: stop.type,
      timestamp: new Date().toISOString(),
    });
  }

  res.json({ ok: true, stopId, newStatus });
});

module.exports = router;
