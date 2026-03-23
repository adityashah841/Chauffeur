// backend/optimizer/vrptw.js
// VRPTW Insertion Heuristic Engine

const MAX_WAIT_MINUTES = 15;
const MAX_DETOUR_RATIO = 1.4;
const VEHICLE_CAPACITY = 5;
const AVG_SPEED_KMH = 30;

// ---------------------------------------------------------------------------
// Haversine distance in km
// ---------------------------------------------------------------------------
function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c = 2 * Math.asin(
    Math.sqrt(
      sinDLat * sinDLat +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng
    )
  );
  return R * c;
}

function toRad(deg) { return deg * Math.PI / 180; }

// Travel time in minutes between two locations
function travelMinutes(a, b) {
  return (haversineKm(a, b) / AVG_SPEED_KMH) * 60;
}

// Total route distance in km
function routeDistanceKm(stops, startLocation) {
  if (!stops || stops.length === 0) return 0;
  let dist = 0;
  let prev = startLocation || stops[0].location;
  for (const stop of stops) {
    dist += haversineKm(prev, stop.location);
    prev = stop.location;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Clone a route (array of stops) deeply enough for mutation
// ---------------------------------------------------------------------------
function cloneRoute(route) {
  return route.map(s => ({ ...s, timeWindow: s.timeWindow ? { ...s.timeWindow } : null }));
}

// ---------------------------------------------------------------------------
// Recalculate scheduledTime for every stop in a route starting from currentTime
// at currentLocation.
// ---------------------------------------------------------------------------
function recalcScheduledTimes(route, currentLocation, currentTime) {
  let prevLocation = currentLocation;
  let prevTime = currentTime instanceof Date ? currentTime : new Date(currentTime);

  for (const stop of route) {
    const travelMs = travelMinutes(prevLocation, stop.location) * 60 * 1000;
    const arrivedAt = new Date(prevTime.getTime() + travelMs);

    // Honor time window earliest (if vehicle arrives early, it waits)
    const earliest = stop.timeWindow && stop.timeWindow.earliest
      ? new Date(stop.timeWindow.earliest)
      : null;
    const scheduled = (earliest && arrivedAt < earliest) ? earliest : arrivedAt;

    stop.scheduledTime = scheduled;
    prevLocation = stop.location;
    prevTime = scheduled;
  }
  return route;
}

// ---------------------------------------------------------------------------
// Check feasibility of a candidate route for a new request
// ---------------------------------------------------------------------------
function isFeasible(route, newRequest, currentLocation, currentTime, existingRequests) {
  if (!route || route.length === 0) return true;

  recalcScheduledTimes(route, currentLocation, currentTime);

  for (const stop of route) {
    // Check time window latest
    if (stop.timeWindow && stop.timeWindow.latest) {
      const latest = new Date(stop.timeWindow.latest);
      if (stop.scheduledTime > latest) return false;
    }
  }

  // Check new request pickup is within latestPickup
  const newPickupStop = route.find(s => s.requestId === newRequest.id && s.type === 'pickup');
  if (newPickupStop) {
    const latestPickup = new Date(newRequest.latestPickup);
    if (newPickupStop.scheduledTime > latestPickup) return false;
  }

  // Check detour ratio for all existing requests in the route
  if (existingRequests && existingRequests.length > 0) {
    for (const req of existingRequests) {
      if (req.id === newRequest.id) continue;

      const pickupStop = route.find(s => s.requestId === req.id && s.type === 'pickup');
      const dropoffStop = route.find(s => s.requestId === req.id && s.type === 'dropoff');

      if (!pickupStop || !dropoffStop) continue;

      const sharedTravelMs = dropoffStop.scheduledTime - pickupStop.scheduledTime;
      const sharedTravelMin = sharedTravelMs / 60000;

      // Solo travel time = direct distance / speed
      const soloTravelMin = travelMinutes(req.pickup, req.dropoff);

      if (soloTravelMin > 0 && sharedTravelMin / soloTravelMin > MAX_DETOUR_RATIO) {
        return false;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Compute insertion cost: added distance from inserting new stops
// ---------------------------------------------------------------------------
function computeCost(originalRoute, newRoute, currentLocation) {
  const origDist = routeDistanceKm(originalRoute, currentLocation);
  const newDist = routeDistanceKm(newRoute, currentLocation);
  return newDist - origDist;
}

// ---------------------------------------------------------------------------
// Main assignment function
// ---------------------------------------------------------------------------
function assignRequest(newRequest, vehicles) {
  let bestVehicle = null;
  let bestPickupIndex = null;
  let bestDropoffIndex = null;
  let bestCost = Infinity;

  for (const vehicle of vehicles) {
    // Capacity check
    if (vehicle.currentLoad + newRequest.passengers > VEHICLE_CAPACITY) {
      continue;
    }

    const route = vehicle.route || [];
    const currentLocation = vehicle.currentLocation || { lat: 44.9740, lng: -93.2277 };
    const currentTime = vehicle.currentTime || new Date();

    // Get existing requests already in this vehicle's route
    const existingRequestIds = [...new Set(route.map(s => s.requestId))];
    const existingRequests = existingRequestIds
      .map(id => vehicle.requestMap ? vehicle.requestMap[id] : null)
      .filter(Boolean);

    const newPickupStop = {
      type: 'pickup',
      requestId: newRequest.id,
      location: newRequest.pickup,
      timeWindow: {
        earliest: new Date(newRequest.requestedTime),
        latest: new Date(newRequest.latestPickup),
      },
    };

    const newDropoffStop = {
      type: 'dropoff',
      requestId: newRequest.id,
      location: newRequest.dropoff,
      timeWindow: {
        earliest: new Date(newRequest.requestedTime),
        // Dropoff latest = latestPickup + MAX_DETOUR_RATIO * solo travel time
        latest: new Date(
          new Date(newRequest.latestPickup).getTime() +
          MAX_DETOUR_RATIO * travelMinutes(newRequest.pickup, newRequest.dropoff) * 60000
        ),
      },
    };

    // Try all insertion positions for pickup (i) and dropoff (j >= i)
    for (let i = 0; i <= route.length; i++) {
      for (let j = i; j <= route.length; j++) {
        const candidate = cloneRoute(route);
        // Insert pickup at i, then dropoff at j+1 (after pickup)
        candidate.splice(i, 0, { ...newPickupStop });
        candidate.splice(j + 1, 0, { ...newDropoffStop });

        if (isFeasible(candidate, newRequest, currentLocation, currentTime, [
          ...existingRequests,
          newRequest,
        ])) {
          const cost = computeCost(route, candidate, currentLocation);
          if (cost < bestCost) {
            bestCost = cost;
            bestVehicle = vehicle;
            bestPickupIndex = i;
            bestDropoffIndex = j + 1;
          }
        }
      }
    }
  }

  if (bestVehicle) {
    // Apply insertion
    const newPickupStop = {
      type: 'pickup',
      requestId: newRequest.id,
      location: newRequest.pickup,
      timeWindow: {
        earliest: new Date(newRequest.requestedTime),
        latest: new Date(newRequest.latestPickup),
      },
    };

    const newDropoffStop = {
      type: 'dropoff',
      requestId: newRequest.id,
      location: newRequest.dropoff,
      timeWindow: {
        earliest: new Date(newRequest.requestedTime),
        latest: new Date(
          new Date(newRequest.latestPickup).getTime() +
          MAX_DETOUR_RATIO * travelMinutes(newRequest.pickup, newRequest.dropoff) * 60000
        ),
      },
    };

    bestVehicle.route.splice(bestPickupIndex, 0, newPickupStop);
    bestVehicle.route.splice(bestDropoffIndex, 0, newDropoffStop);
    bestVehicle.currentLoad += newRequest.passengers;
    if (!bestVehicle.requestMap) bestVehicle.requestMap = {};
    bestVehicle.requestMap[newRequest.id] = newRequest;

    // Recalculate scheduled times for the updated route
    recalcScheduledTimes(
      bestVehicle.route,
      bestVehicle.currentLocation || { lat: 44.9740, lng: -93.2277 },
      bestVehicle.currentTime || new Date()
    );

    console.log(
      `[OPTIMIZER] Inserted booking #${newRequest.id} into vehicle ${bestVehicle.vehicleNumber} ` +
      `at positions [${bestPickupIndex}, ${bestDropoffIndex}]. ` +
      `Added cost: ${bestCost.toFixed(3)} km.`
    );

    return { assigned: true, vehicleId: bestVehicle.id, addedCostKm: bestCost };
  }

  console.log(`[OPTIMIZER] Booking #${newRequest.id} could not be inserted into any vehicle. Needs new vehicle/driver.`);
  return { assigned: false };
}

// ---------------------------------------------------------------------------
// Re-optimization pass: try to assign all pending/unassigned requests
// ---------------------------------------------------------------------------
function reoptimize(pendingRequests, vehicles) {
  const results = [];
  for (const req of pendingRequests) {
    const result = assignRequest(req, vehicles);
    results.push({ requestId: req.id, ...result });
  }
  return results;
}

module.exports = {
  assignRequest,
  reoptimize,
  haversineKm,
  travelMinutes,
  routeDistanceKm,
  recalcScheduledTimes,
  isFeasible,
  computeCost,
  cloneRoute,
  MAX_WAIT_MINUTES,
  MAX_DETOUR_RATIO,
  VEHICLE_CAPACITY,
  AVG_SPEED_KMH,
};
