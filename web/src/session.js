import { setToken } from './api.js';
import { disconnectSocket } from './socket.js';

const ADMIN_TOKEN_KEY = 'aw_admin_token';

export function returnToAdmin(navigate) {
  const adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  if (!adminToken) {
    logout(navigate);
    return;
  }
  setToken(adminToken);
  disconnectSocket();
  navigate('/workers');
}

export function logout(navigate) {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  setToken(null);
  disconnectSocket();
  navigate('/sign-in');
}
