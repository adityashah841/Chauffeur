// backend/socket/handlers.js
const { getDb } = require('../db/schema');
const { getVehicle, updateVehicleLocation } = require('../state');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Student subscribes to their booking updates
    socket.on('subscribe:booking', ({ bookingId }) => {
      socket.join(`student:${bookingId}`);
      console.log(`[SOCKET] Socket ${socket.id} subscribed to booking:${bookingId}`);
    });

    // Driver subscribes to route updates
    socket.on('subscribe:driver', ({ driverId }) => {
      socket.join(`driver:${driverId}`);
      console.log(`[SOCKET] Socket ${socket.id} subscribed as driver:${driverId}`);
    });

    // Driver broadcasts location
    socket.on('driver:location', ({ driverId, lat, lng }) => {
      updateVehicleLocation(driverId, lat, lng);

      // Persist to DB
      try {
        const db = getDb();
        db.prepare(`
          INSERT OR REPLACE INTO driver_locations (driver_id, lat, lng, updated_at)
          VALUES (?, ?, ?, datetime('now'))
        `).run(driverId, lat, lng);
      } catch (e) {
        console.error('[SOCKET] Error saving location:', e.message);
      }

      // Broadcast to students on this driver's route
      const vehicle = getVehicle(driverId);
      if (vehicle) {
        const bookingIds = [...new Set(vehicle.route.map(s => s.requestId))];
        for (const bookingId of bookingIds) {
          io.to(`student:${bookingId}`).emit('driver:location', { driverId, lat, lng });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = { registerSocketHandlers };
