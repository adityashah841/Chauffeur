# ── Backend Dockerfile ────────────────────────────────────────────────────────
# Pure Node.js – no native compilation needed (sql.js is pure WASM).
FROM node:20-alpine

# Install dumb-init for proper PID-1 signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy manifests first so Docker caches the npm install layer
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# SQLite file lives in a dedicated volume at /data
ENV DB_PATH=/data/chauffeur.sqlite
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

# Create the /data directory in case no volume is mounted
RUN mkdir -p /data

# Use dumb-init as PID 1 so SIGTERM is forwarded correctly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
