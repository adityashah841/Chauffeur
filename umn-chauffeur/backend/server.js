// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { initDb } = require('./db/schema');
const { runSeed } = require('./db/seed');
const { initVehicle, getAllVehicles, addOptimizerLog } = require('./state');
const { registerSocketHandlers } = require('./socket/handlers');
const { assignRequest, reoptimize } = require('./optimizer/vrptw');
const { syncRouteToDb } = require('./db/sync');

const bookingsRouter = require('./routes/bookings');
const driversRouter  = require('./routes/drivers');
const stopsRouter    = require('./routes/stops');
const adminRouter    = require('./routes/admin');

const PORT = process.env.PORT || 3001;

// ── Wrap everything in async main so we can await DB init ─────────────────────
async function main() {
  // 1. Init DB (async because sql.js WASM must be loaded first)
  const db = await initDb();
  runSeed(db);

  // 2. Bootstrap in-memory vehicle state from DB ─────────────────────────────
  const drivers   = db.prepare('SELECT * FROM drivers').all();
  const locations = db.prepare('SELECT * FROM driver_locations').all();
  const locMap    = {};
  for (const loc of locations) locMap[loc.driver_id] = loc;

  for (const driver of drivers) {
    const loc = locMap[driver.id];
    initVehicle(driver, loc ? { lat: loc.lat, lng: loc.lng } : null);
  }

  // Restore in-progress routes from DB
  const stops = db.prepare(`
    SELECT s.*, b.student_name, b.contact_number,
           b.pickup_lat, b.pickup_lng, b.pickup_label,
           b.dropoff_lat, b.dropoff_lng, b.dropoff_label,
           b.passengers, b.requested_time, b.latest_pickup
    FROM stops s
    JOIN bookings b ON s.booking_id = b.id
    WHERE s.status = 'pending'
    ORDER BY s.driver_id, s.sequence_order
  `).all();

  const allVehicles = getAllVehicles();
  const vehicleMap  = {};
  for (const v of allVehicles) vehicleMap[v.id] = v;

  for (const stop of stops) {
    const vehicle = vehicleMap[stop.driver_id];
    if (!vehicle) continue;
    vehicle.route.push({
      type:       stop.type,
      requestId:  stop.booking_id,
      location:   { lat: stop.lat, lng: stop.lng, label: stop.label },
      timeWindow: {
        earliest: stop.time_window_earliest ? new Date(stop.time_window_earliest) : null,
        latest:   stop.time_window_latest   ? new Date(stop.time_window_latest)   : null,
      },
      scheduledTime: stop.scheduled_time ? new Date(stop.scheduled_time) : null,
      status: stop.status,
    });
    if (!vehicle.requestMap[stop.booking_id]) {
      vehicle.requestMap[stop.booking_id] = {
        id:            stop.booking_id,
        studentName:   stop.student_name,
        contactNumber: stop.contact_number,
        pickup:  { lat: stop.pickup_lat,  lng: stop.pickup_lng,  label: stop.pickup_label  },
        dropoff: { lat: stop.dropoff_lat, lng: stop.dropoff_lng, label: stop.dropoff_label },
        passengers:    stop.passengers,
        requestedTime: new Date(stop.requested_time),
        latestPickup:  new Date(stop.latest_pickup),
      };
    }
  }
  console.log('[SERVER] Vehicle state initialized.');

  // 3. Initial optimizer pass on any pending bookings ───────────────────────
  const pendingBookings = db.prepare("SELECT * FROM bookings WHERE status = 'pending'").all();
  if (pendingBookings.length > 0) {
    const requests = pendingBookings.map(b => ({
      id: b.id, studentName: b.student_name, contactNumber: b.contact_number,
      pickup:  { lat: b.pickup_lat,  lng: b.pickup_lng,  label: b.pickup_label  },
      dropoff: { lat: b.dropoff_lat, lng: b.dropoff_lng, label: b.dropoff_label },
      passengers: b.passengers,
      requestedTime: new Date(b.requested_time),
      latestPickup:  new Date(b.latest_pickup),
      status: 'pending',
    }));
    const results = reoptimize(requests, getAllVehicles());
    for (const result of results) {
      if (result.assigned) {
        db.prepare("UPDATE bookings SET status = 'assigned', assigned_driver_id = ? WHERE id = ?")
          .run(result.vehicleId, result.requestId);
        const vehicle = require('./state').getVehicle(result.vehicleId);
        if (vehicle) syncRouteToDb(db, vehicle);
        addOptimizerLog({ type: 'initial_assignment', bookingId: result.requestId, vehicleId: result.vehicleId });
      }
    }
    console.log(`[SERVER] Initial optimization: processed ${requests.length} pending booking(s).`);
  }

  // 4. Express + Socket.IO setup ────────────────────────────────────────────
  const app    = express();
  const server = http.createServer(app);
  const io     = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST', 'PATCH'] } });

  app.set('io', io);
  app.use(cors());
  app.use(express.json());

  app.use('/api/bookings', bookingsRouter);
  app.use('/api/drivers',  driversRouter);
  app.use('/api/stops',    stopsRouter);
  app.use('/api/admin',    adminRouter);
  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  registerSocketHandlers(io);

  // 5. Background re-optimization every 3 minutes ───────────────────────────
  setInterval(() => {
    const pending = db.prepare("SELECT * FROM bookings WHERE status = 'pending'").all();
    if (pending.length === 0) return;
    console.log(`[REOPTIMIZE] Background pass on ${pending.length} pending booking(s)...`);

    const requests = pending.map(b => ({
      id: b.id, studentName: b.student_name, contactNumber: b.contact_number,
      pickup:  { lat: b.pickup_lat,  lng: b.pickup_lng,  label: b.pickup_label  },
      dropoff: { lat: b.dropoff_lat, lng: b.dropoff_lng, label: b.dropoff_label },
      passengers: b.passengers,
      requestedTime: new Date(b.requested_time),
      latestPickup:  new Date(b.latest_pickup),
      status: 'pending',
    }));

    const results = reoptimize(requests, getAllVehicles());
    for (const result of results) {
      if (result.assigned) {
        db.prepare("UPDATE bookings SET status = 'assigned', assigned_driver_id = ? WHERE id = ?")
          .run(result.vehicleId, result.requestId);
        const vehicle = require('./state').getVehicle(result.vehicleId);
        if (vehicle) {
          syncRouteToDb(db, vehicle);
          io.to(`driver:${result.vehicleId}`).emit('route:updated', { route: vehicle.route });
        }
        addOptimizerLog({ type: 'reoptimize_assignment', bookingId: result.requestId, vehicleId: result.vehicleId });
      }
    }
  }, 3 * 60 * 1000);

  server.listen(PORT, () => {
    console.log(`[SERVER] UMN Chauffeur backend running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('[SERVER] Fatal startup error:', err);
  process.exit(1);
});
