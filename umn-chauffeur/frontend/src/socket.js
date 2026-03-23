// frontend/src/socket.js
// VITE_BACKEND_URL is set in .env.development for local dev (→ http://localhost:3001).
// In Docker it is NOT set, so Socket.IO connects to the same origin and nginx
// reverse-proxies /socket.io/ to the backend container automatically.
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL; // undefined in production

export const socket = BACKEND_URL
  ? io(BACKEND_URL, { autoConnect: false })
  : io({ autoConnect: false }); // same-origin → nginx proxy

export function connectSocket() {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}

export default socket;
