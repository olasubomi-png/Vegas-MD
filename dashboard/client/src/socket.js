import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;

export function getSocket() {
  if (socket) return socket;
  socket = io('/', { auth: { token: getToken() }, autoConnect: false });
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  s.auth = { token: getToken() };
  if (!s.connected) s.connect();
  return s;
}
