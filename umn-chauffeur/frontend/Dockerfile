# ── Frontend Dockerfile ───────────────────────────────────────────────────────
# Stage 1: Build the React app with Vite
# Stage 2: Serve with nginx (tiny alpine image, ~25 MB total)

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# In Docker production, Socket.IO will connect to the same origin so nginx
# can proxy it. Leave VITE_BACKEND_URL unset (the app defaults to same-origin).
RUN npm run build

# ── Stage 2: nginx serving ────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Replace default nginx config with ours
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built React bundle
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
