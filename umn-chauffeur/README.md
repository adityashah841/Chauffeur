# UMN Chauffeur Service

A full-stack prototype for the University of Minnesota's shared ride optimization service, featuring a VRPTW insertion-heuristic optimizer, live location tracking via Socket.IO, and an interactive Leaflet map.

---

## Table of Contents

- [Quick Start — Docker](#quick-start--docker-recommended)
- [Quick Start — Local Dev](#quick-start--local-dev)
- [Application Routes](#application-routes)
- [User Roles](#user-roles)
- [Docker Reference](#docker-reference)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [VRPTW Optimizer](#vrptw-optimizer)
- [Project Structure](#project-structure)

---

## Quick Start — Docker (Recommended)

The fastest way to run this on **any machine** (Windows, macOS, Linux) with no Node.js installation required.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### Run

```bash
# 1. Clone or copy the project folder to the target machine
cd umn-chauffeur

# 2. Build images and start all services
docker compose up --build
```

The first build downloads base images and installs dependencies — takes ~2 minutes. Subsequent starts take only a few seconds.

Open your browser to **http://localhost** once you see:

```
umn-chauffeur-backend  | [SERVER] UMN Chauffeur backend running on http://localhost:3001
umn-chauffeur-frontend | ... nginx ready
```

### Stop

```bash
docker compose down          # stop and remove containers (data is preserved)
docker compose down -v       # stop AND wipe the SQLite database volume
```

### Rebuild after code changes

```bash
docker compose up --build    # rebuilds changed images automatically
```

---

## Quick Start — Local Dev

Requires **Node.js 18+** installed.

```bash
cd umn-chauffeur

# Install all dependencies
npm install
npm run install:all

# Start both servers with hot-reload
npm run dev
```

| Server | URL |
|--------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (Express) | http://localhost:3001 |

### Run optimizer tests

```bash
npm test
# Output: 25 assertions, 0 failures
```

---

## Application Routes

| Path | Description |
|------|-------------|
| `http://localhost/student` | Student app — login, book rides, live tracking |
| `http://localhost/driver` | Driver app — route queue, map, accept/transfer |
| `http://localhost/admin` | Admin dashboard — fleet overview, optimizer log |

*(Replace `localhost` with `localhost:5173` for local dev)*

---

## User Roles

### Student
1. Enter name + contact number on the login screen (stored in `localStorage`)
2. Book a ride — choose **On-Demand** (immediate) or **Scheduled** (future)
3. Select pickup/dropoff from campus quick-picks or drop a pin on the Leaflet map
4. After a driver accepts: see their live location on the map + tap-to-call phone number

### Driver
1. Select your name from the dropdown (4 pre-seeded drivers)
2. View the optimized route as an ordered stop list (PICKUP / DROPOFF badges)
3. **Accept Route** → sends `booking:confirmed` event to all passengers
4. **Transfer Route** → hands off to the next available driver
5. **Mark Stop Done** → notifies the student and updates vehicle load
6. Location broadcasts automatically every 5 seconds (simulates movement toward next stop)

### Admin
- Live fleet map per vehicle (click a vehicle to switch the map view)
- Utilization bar (seats used / total seats)
- All active routes listed with scheduled times
- Color-coded optimizer log (green = assigned, yellow = unassigned)
- Auto-refreshes every 5 seconds

### Operating Hours
Service runs **8:00 AM – 1:00 AM** daily (America/Chicago). Bookings outside these hours are rejected by both the frontend and the API.

---

## Docker Reference

### How the containers are wired

```
Browser
  │
  ▼ port 80
┌─────────────────────┐
│  frontend (nginx)   │  Serves built React SPA
│                     │  Proxies /api/*       → backend:3001
│                     │  Proxies /socket.io/* → backend:3001
└──────────┬──────────┘
           │ internal Docker network (app-net)
           ▼
┌─────────────────────┐
│  backend (Node.js)  │  Express + Socket.IO
│  port 3001          │  Reads/writes SQLite at /data/chauffeur.sqlite
└──────────┬──────────┘
           │
    named volume: umn-chauffeur-db
           │
     /data/chauffeur.sqlite  (persists across restarts)
```

The backend port **3001 is not exposed to the host** — only the nginx container can reach it. This mirrors a production deployment where the app server sits behind a reverse proxy.

### Useful Docker commands

```bash
# View live logs for both services
docker compose logs -f

# View logs for one service only
docker compose logs -f backend
docker compose logs -f frontend

# Open a shell in the running backend container
docker compose exec backend sh

# Inspect the persisted SQLite database
docker compose exec backend node -e "
  const {getDb} = require('./db/schema');
  // DB is async-init; use the adapter directly:
  require('./db/adapter').initAdapter().then(db => {
    console.log('Bookings:', db.prepare('SELECT * FROM bookings').all());
  });
"

# Reset the database (wipe all data and re-seed on next start)
docker compose down -v

# Run the optimizer unit tests inside the container
docker compose exec backend node optimizer/vrptw.test.js

# Rebuild only the backend image (e.g. after a code change)
docker compose up --build backend

# Run in detached (background) mode
docker compose up --build -d
docker compose down   # to stop later
```

### Deploying to a remote server

```bash
# On the remote server (Ubuntu/Debian example):
sudo apt-get install -y docker.io docker-compose-plugin

# Copy the project (or clone from git)
scp -r umn-chauffeur user@your-server:~/

# SSH in and start
ssh user@your-server
cd umn-chauffeur
docker compose up --build -d

# App is now live at http://your-server-ip
```

To expose on a custom port (e.g. 8080 instead of 80), edit `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "8080:80"   # host:container
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend listen port (inside container) |
| `DB_PATH` | `/data/chauffeur.sqlite` | Absolute path for the SQLite file |
| `NODE_ENV` | `production` | Node environment |
| `VITE_BACKEND_URL` | *(unset)* | Set in `.env.development` for local dev only |

---

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + Vite + TailwindCSS | SPA, three role-based pages |
| Maps | Leaflet.js + OpenStreetMap | Free, no API key needed |
| Real-time | Socket.IO 4 | Bidirectional events for location + notifications |
| Backend | Node.js 20 + Express 4 | REST API + Socket.IO server |
| Database | SQLite via sql.js | Pure JS/WASM — no native compilation |
| Optimizer | Custom VRPTW (pure JS) | Insertion heuristic with time-window + detour checks |
| Container | Docker + nginx | Multi-stage build; nginx proxies API + WebSocket |

---

## API Reference

```
POST   /api/bookings            Create booking + trigger optimizer
GET    /api/bookings/:id        Get booking status, stops, and driver info
GET    /api/drivers             List all drivers with live routes (includes DB stop IDs)
POST   /api/drivers/:id/accept  Accept route → emits booking:confirmed to passengers
POST   /api/drivers/:id/transfer Transfer route to next available driver
POST   /api/drivers/:id/location Update driver GPS coordinates
PATCH  /api/stops/:id/complete  Mark a stop done (pickup → picked_up, dropoff → completed)
GET    /api/admin/overview      Fleet stats, all routes, optimizer log (last 50 entries)
GET    /health                  Health check → { ok: true, ts: "..." }
```

### Socket.IO events

| Event | Direction | Payload |
|-------|-----------|---------|
| `booking:confirmed` | server → student | `{ bookingId, driverName, driverPhone, vehicleNumber, estimatedArrival }` |
| `driver:location` | server → student | `{ driverId, lat, lng }` |
| `route:updated` | server → driver | `{ route: [Stop] }` |
| `stop:completed` | server → student | `{ stopId, type, timestamp }` |
| `driver:location` | driver → server | `{ driverId, lat, lng }` |
| `subscribe:booking` | client → server | `{ bookingId }` |
| `subscribe:driver` | client → server | `{ driverId }` |

---

## VRPTW Optimizer

Located at `backend/optimizer/vrptw.js`.

**Algorithm:** Insertion heuristic — for each new request, try every (pickup_index, dropoff_index) pair across every vehicle, check feasibility, pick the minimum-cost insertion.

**Feasibility checks:**
- Time window: `scheduledTime ≤ timeWindow.latest` for every stop
- Detour ratio: shared ride travel time ≤ `1.4×` the solo trip time for all existing passengers
- Capacity: `currentLoad + newPassengers ≤ 5`

**Triggered:**
- Immediately on every new `POST /api/bookings`
- Background re-optimization every **3 minutes** for any still-pending bookings

**Configurable constants** (`vrptw.js`):

| Constant | Default | Meaning |
|----------|---------|---------|
| `MAX_WAIT_MINUTES` | 15 | Max extra wait from pooling |
| `MAX_DETOUR_RATIO` | 1.4 | Shared ride ≤ 1.4× solo trip |
| `VEHICLE_CAPACITY` | 5 | Max passengers per vehicle |
| `AVG_SPEED_KMH` | 30 | Campus urban speed estimate |

**Console output example:**
```
[OPTIMIZER] Inserted booking #3 into vehicle UMN-02 at positions [0, 1]. Added cost: 1.295 km.
```

---

## Seed Data

Four drivers are pre-seeded on first run:

| Name | Vehicle | Phone |
|------|---------|-------|
| Marcus Johnson | UMN-01 | 612-555-0101 |
| Priya Patel | UMN-02 | 612-555-0102 |
| David Kim | UMN-03 | 612-555-0103 |
| Sofia Torres | UMN-04 | 612-555-0104 |

Three demo bookings (near UMN campus, ~5–20 min from `now`) are also seeded so the optimizer and driver views have live data immediately.

---

## Project Structure

```
umn-chauffeur/
├── docker-compose.yml          ← one-command startup for any machine
├── package.json                ← root scripts (dev, install:all, test)
│
├── backend/
│   ├── Dockerfile              ← node:20-alpine, no native compilation
│   ├── .dockerignore
│   ├── package.json            ← sql.js, express, socket.io, cors…
│   ├── server.js               ← async main: DB init → seed → optimize → listen
│   ├── state.js                ← in-memory vehicle Map + optimizer log
│   ├── db/
│   │   ├── adapter.js          ← sql.js wrapper (better-sqlite3-compatible API)
│   │   ├── schema.js           ← async initDb() — CREATE TABLE IF NOT EXISTS
│   │   ├── seed.js             ← 4 drivers + 3 demo bookings
│   │   └── sync.js             ← flush in-memory route → SQLite stops table
│   ├── optimizer/
│   │   ├── vrptw.js            ← VRPTW insertion heuristic engine
│   │   └── vrptw.test.js       ← 25 assertions (node optimizer/vrptw.test.js)
│   ├── routes/
│   │   ├── bookings.js         ← POST/GET /api/bookings
│   │   ├── drivers.js          ← GET/POST /api/drivers/*
│   │   ├── stops.js            ← PATCH /api/stops/:id/complete
│   │   └── admin.js            ← GET /api/admin/overview
│   └── socket/
│       └── handlers.js         ← Socket.IO event registration
│
└── frontend/
    ├── Dockerfile              ← multi-stage: node builder → nginx:alpine
    ├── .dockerignore
    ├── nginx.conf              ← SPA routing + /api/ + /socket.io/ proxies
    ├── .env.development        ← VITE_BACKEND_URL=http://localhost:3001 (dev only)
    ├── vite.config.js          ← Vite proxy config for local dev
    ├── tailwind.config.js      ← UMN maroon #7A0019 + gold #FFCC33
    └── src/
        ├── main.jsx            ← React Router: /student /driver /admin
        ├── socket.js           ← io() — same-origin in Docker, direct in dev
        ├── pages/
        │   ├── StudentApp.jsx  ← login, booking form, live tracking
        │   ├── DriverApp.jsx   ← route list, map, accept/transfer/complete
        │   └── AdminApp.jsx    ← fleet overview, optimizer log
        └── components/
            ├── MapPicker.jsx   ← click-to-pin Leaflet map (booking form)
            ├── TrackingMap.jsx ← live driver dot + student pins
            ├── RouteMap.jsx    ← ordered numbered stop markers
            ├── UMNHeader.jsx   ← shared header with role badge + nav
            └── StatusBadge.jsx ← colored status chips
```
