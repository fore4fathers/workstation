const TOKEN_KEY = 'aw_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, headers } = {}) {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadImages(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];
  const payload = [];
  for (const file of files) {
    const data = await readFileAsDataUrl(file);
    payload.push({ name: file.name, mime: file.type, data });
  }
  const result = await api('/api/admin/uploads', { method: 'POST', body: { files: payload } });
  return result.files || [];
}
