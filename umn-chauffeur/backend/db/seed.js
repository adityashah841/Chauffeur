// backend/db/seed.js
const { getDb } = require('./schema');

// UMN campus landmark coordinates
const UMN_LOCATIONS = [
  { label: 'Coffman Memorial Union', lat: 44.9726, lng: -93.2350 },
  { label: 'Coffman Memorial Union', lat: 44.9726, lng: -93.2350 },
  { label: 'Walter Library', lat: 44.9745, lng: -93.2355 },
  { label: 'Northrop Auditorium', lat: 44.9718, lng: -93.2319 },
  { label: 'Rec Center (SREC)', lat: 44.9766, lng: -93.2330 },
  { label: 'Dinkytown (4th St SE)', lat: 44.9827, lng: -93.2283 },
  { label: 'Como Ave & 15th Ave SE', lat: 44.9789, lng: -93.2260 },
  { label: 'Pioneer Hall', lat: 44.9730, lng: -93.2310 },
  { label: 'Mayo Memorial Building', lat: 44.9736, lng: -93.2280 },
  { label: 'Weisman Art Museum', lat: 44.9742, lng: -93.2373 },
  { label: 'TCF Bank Stadium (Huntington Bank Stadium)', lat: 44.9779, lng: -93.2239 },
  { label: 'University Village Apartments', lat: 44.9840, lng: -93.2230 },
  { label: 'Stadium Village (Washington Ave SE)', lat: 44.9778, lng: -93.2263 },
  { label: 'Marcy-Holmes (2nd St SE)', lat: 44.9845, lng: -93.2435 },
];

const DRIVERS = [
  { id: 1, name: 'Marcus Johnson', vehicle_number: 'UMN-01', phone_number: '612-555-0101', status: 'available' },
  { id: 2, name: 'Priya Patel',    vehicle_number: 'UMN-02', phone_number: '612-555-0102', status: 'available' },
  { id: 3, name: 'David Kim',      vehicle_number: 'UMN-03', phone_number: '612-555-0103', status: 'available' },
  { id: 4, name: 'Sofia Torres',   vehicle_number: 'UMN-04', phone_number: '612-555-0104', status: 'available' },
];

function seedDrivers(db) {
  const existing = db.prepare('SELECT id FROM drivers').all();
  if (existing.length > 0) return;

  const insert = db.prepare(
    'INSERT INTO drivers (id, name, vehicle_number, phone_number, status) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((drivers) => {
    for (const d of drivers) insert.run(d.id, d.name, d.vehicle_number, d.phone_number, d.status);
  });
  insertMany(DRIVERS);

  // Seed starting locations near UMN
  const insertLoc = db.prepare(
    'INSERT OR REPLACE INTO driver_locations (driver_id, lat, lng, updated_at) VALUES (?, ?, ?, datetime("now"))'
  );
  insertLoc.run(1, 44.9730, -93.2310);
  insertLoc.run(2, 44.9760, -93.2340);
  insertLoc.run(3, 44.9800, -93.2280);
  insertLoc.run(4, 44.9745, -93.2260);

  console.log('[SEED] 4 drivers inserted.');
}

function seedBookings(db) {
  const existing = db.prepare('SELECT id FROM bookings').all();
  if (existing.length > 0) return;

  const now = new Date();
  // Set demo bookings to happen soon from "now" (relative times)
  const t1 = new Date(now.getTime() + 5 * 60000);   // 5 min from now
  const t2 = new Date(now.getTime() + 12 * 60000);  // 12 min from now
  const t3 = new Date(now.getTime() + 20 * 60000);  // 20 min from now

  const MAX_WAIT = 15; // minutes

  const bookings = [
    {
      student_name: 'Alex Rivera',
      contact_number: '612-555-1001',
      pickup_lat: 44.9726, pickup_lng: -93.2350, pickup_label: 'Coffman Memorial Union',
      dropoff_lat: 44.9827, dropoff_lng: -93.2283, dropoff_label: 'Dinkytown (4th St SE)',
      passengers: 2,
      requested_time: t1.toISOString(),
      latest_pickup: new Date(t1.getTime() + MAX_WAIT * 60000).toISOString(),
      status: 'pending',
    },
    {
      student_name: 'Jordan Lee',
      contact_number: '612-555-1002',
      pickup_lat: 44.9745, pickup_lng: -93.2355, pickup_label: 'Walter Library',
      dropoff_lat: 44.9789, dropoff_lng: -93.2260, dropoff_label: 'Como Ave & 15th Ave SE',
      passengers: 1,
      requested_time: t2.toISOString(),
      latest_pickup: new Date(t2.getTime() + MAX_WAIT * 60000).toISOString(),
      status: 'pending',
    },
    {
      student_name: 'Sam Nguyen',
      contact_number: '612-555-1003',
      pickup_lat: 44.9718, pickup_lng: -93.2319, pickup_label: 'Northrop Auditorium',
      dropoff_lat: 44.9778, dropoff_lng: -93.2263, dropoff_label: 'Stadium Village (Washington Ave SE)',
      passengers: 3,
      requested_time: t3.toISOString(),
      latest_pickup: new Date(t3.getTime() + MAX_WAIT * 60000).toISOString(),
      status: 'pending',
    },
  ];

  const insert = db.prepare(`
    INSERT INTO bookings
      (student_name, contact_number,
       pickup_lat, pickup_lng, pickup_label,
       dropoff_lat, dropoff_lng, dropoff_label,
       passengers, requested_time, latest_pickup, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows) => {
    for (const r of rows) {
      insert.run(
        r.student_name, r.contact_number,
        r.pickup_lat, r.pickup_lng, r.pickup_label,
        r.dropoff_lat, r.dropoff_lng, r.dropoff_label,
        r.passengers, r.requested_time, r.latest_pickup, r.status
      );
    }
  });
  insertMany(bookings);

  console.log('[SEED] 3 demo bookings inserted.');
}

function runSeed(db) {
  seedDrivers(db);
  seedBookings(db);
}

module.exports = { runSeed, DRIVERS };
