// backend/db/schema.js
const { initAdapter, getDb, DB_PATH } = require('./adapter');

async function initDb() {
  const db = await initAdapter();

  db.execMulti(`
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      vehicle_number TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      status TEXT DEFAULT 'available'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      pickup_lat REAL NOT NULL,
      pickup_lng REAL NOT NULL,
      pickup_label TEXT NOT NULL,
      dropoff_lat REAL NOT NULL,
      dropoff_lng REAL NOT NULL,
      dropoff_label TEXT NOT NULL,
      passengers INTEGER NOT NULL,
      requested_time TEXT NOT NULL,
      latest_pickup TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      assigned_driver_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      booking_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      label TEXT NOT NULL,
      time_window_earliest TEXT,
      time_window_latest TEXT,
      scheduled_time TEXT,
      status TEXT DEFAULT 'pending',
      sequence_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS driver_locations (
      driver_id INTEGER PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}

module.exports = { initDb, getDb, DB_PATH };
