// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { getAllVehicles, getOptimizerLog } = require('../state');

// GET /api/admin/overview
router.get('/overview', (req, res) => {
  const vehicles = getAllVehicles();
  const db = getDb();

  const totalSeats = vehicles.reduce((s, v) => s + v.capacity, 0);
  const usedSeats = vehicles.reduce((s, v) => s + v.currentLoad, 0);

  const pendingCount = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c;
  const assignedCount = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'assigned'").get().c;
  const activeCount = db.prepare(
    "SELECT COUNT(*) as c FROM bookings WHERE status IN ('assigned','picked_up')"
  ).get().c;

  const fleetStatus = vehicles.map(v => ({
    id: v.id,
    driverName: v.driverName,
    vehicleNumber: v.vehicleNumber,
    status: v.status,
    currentLoad: v.currentLoad,
    capacity: v.capacity,
    currentLocation: v.currentLocation,
    route: v.route,
  }));

  res.json({
    fleet: fleetStatus,
    utilization: { usedSeats, totalSeats, pct: totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0 },
    bookings: { pending: pendingCount, assigned: assignedCount, active: activeCount },
    optimizerLog: getOptimizerLog().slice(-50),
  });
});

module.exports = router;
