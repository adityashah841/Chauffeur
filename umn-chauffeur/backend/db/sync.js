// backend/db/sync.js
// Sync in-memory vehicle route to SQLite

function syncRouteToDb(db, vehicle) {
  if (!vehicle) return;

  // Delete existing stops for this driver
  db.prepare('DELETE FROM stops WHERE driver_id = ?').run(vehicle.id);

  const insert = db.prepare(`
    INSERT INTO stops
      (driver_id, booking_id, type, lat, lng, label,
       time_window_earliest, time_window_latest, scheduled_time, status, sequence_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((stops) => {
    stops.forEach((stop, idx) => {
      insert.run(
        vehicle.id,
        stop.requestId,
        stop.type,
        stop.location.lat,
        stop.location.lng,
        stop.location.label,
        stop.timeWindow && stop.timeWindow.earliest ? stop.timeWindow.earliest.toISOString() : null,
        stop.timeWindow && stop.timeWindow.latest ? stop.timeWindow.latest.toISOString() : null,
        stop.scheduledTime ? (stop.scheduledTime instanceof Date ? stop.scheduledTime.toISOString() : stop.scheduledTime) : null,
        stop.status || 'pending',
        idx
      );
    });
  });

  insertMany(vehicle.route);
}

module.exports = { syncRouteToDb };
