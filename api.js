/* ==========================================================================
   AURELA — cliente da API
   Centraliza toda a comunicação com o back-end (autenticação e sincronização
   de dados). Mantém o token JWT salvo no localStorage do navegador.
   ========================================================================== */
const TOKEN_KEY = 'aurela_token';

const Auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
};

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = Auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${window.API_BASE_URL}${path}`, { ...opts, headers });
  } catch (e) {
    throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Ocorreu um erro. Tente novamente.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const Api = {
  register: (name, email, password) =>
    apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email, password) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => apiFetch('/api/auth/me'),
  updateProfile: (payload) => apiFetch('/api/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  forgotPassword: (email) =>
    apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  getState: () => apiFetch('/api/state'),
  syncCollection: (collection, items) =>
    apiFetch('/api/state/collection', { method: 'PUT', body: JSON.stringify({ collection, items }) }),
  syncSettings: (payload) => apiFetch('/api/state/settings', { method: 'PUT', body: JSON.stringify(payload) }),
};
