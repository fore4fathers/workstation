import { setToken } from './api.js';
import { disconnectSocket } from './socket.js';

export function logout(navigate) {
  setToken(null);
  disconnectSocket();
  navigate('/login');
}
