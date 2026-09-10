import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket;
let authedToken;

export function connectSocket() {
  const token = getToken();
  if (!token) {
    disconnectSocket();
    return null;
  }
  if (socket && authedToken === token) return socket;
  disconnectSocket();
  authedToken = token;
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function getSocket() {
  return connectSocket();
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  authedToken = null;
}
