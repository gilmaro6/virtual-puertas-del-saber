const isExternalStaticServer =
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '3000';

const API_BASE_URL = isExternalStaticServer ? 'http://localhost:3000/api' : '/api';

function getToken() {
  return localStorage.getItem('pds_token');
}

function getStoredUser() {
  const raw = localStorage.getItem('pds_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem('pds_token', token);
  localStorage.setItem('pds_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('pds_token');
  localStorage.removeItem('pds_user');
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearSession();
    }
    throw new Error(payload.message || 'Ocurrio un error al comunicarse con el servidor');
  }

  return payload;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
