// backend/state.js
// In-memory state for live vehicle routes and locations

const vehicles = new Map(); // vehicleId -> Vehicle object
const optimizerLog = [];    // log of optimizer decisions (for admin view)

/**
 * Vehicle shape:
 * {
 *   id: Number,
 *   driverName: String,
 *   vehicleNumber: String,
 *   phoneNumber: String,
 *   capacity: 5,
 *   currentLoad: Number,
 *   currentLocation: { lat, lng },
 *   currentTime: Date,
 *   route: [Stop],
 *   requestMap: { [requestId]: Request },
 *   status: 'available' | 'on_route',
 * }
 */

function initVehicle(driver, location) {
  vehicles.set(driver.id, {
    id: driver.id,
    driverName: driver.name,
    vehicleNumber: driver.vehicle_number,
    phoneNumber: driver.phone_number,
    capacity: 5,
    currentLoad: 0,
    currentLocation: location || { lat: 44.9740, lng: -93.2277 },
    currentTime: new Date(),
    route: [],
    requestMap: {},
    status: driver.status || 'available',
  });
}

function getVehicle(id) {
  return vehicles.get(Number(id));
}

function getAllVehicles() {
  return Array.from(vehicles.values());
}

function updateVehicleLocation(driverId, lat, lng) {
  const v = vehicles.get(Number(driverId));
  if (v) {
    v.currentLocation = { lat, lng };
    v.currentTime = new Date();
  }
}

function addOptimizerLog(entry) {
  optimizerLog.push({ ...entry, timestamp: new Date().toISOString() });
  if (optimizerLog.length > 200) optimizerLog.shift(); // keep last 200 entries
}

function getOptimizerLog() {
  return [...optimizerLog];
}

module.exports = {
  vehicles,
  initVehicle,
  getVehicle,
  getAllVehicles,
  updateVehicleLocation,
  addOptimizerLog,
  getOptimizerLog,
};
