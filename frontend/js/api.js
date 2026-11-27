const isExternalStaticServer =
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '3000';

const API_BASE_URL = isExternalStaticServer ? 'http://localhost:3000/api' : '/api';
const BACKEND_ORIGIN = isExternalStaticServer ? 'http://localhost:3000' : '';

function resolveAssetUrl(url) {
  if (!url) return '';
  if (url.startsWith('/uploads/')) {
    return `${BACKEND_ORIGIN}${url}`;
  }
  return url;
}

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

function renderOrderTimelineHtml(order) {
  const steps = ['PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'];
  const labels = {
    PENDIENTE: 'Pendiente',
    PAGADO: 'Pagado',
    EN_PREPARACION: 'En preparacion',
    ENVIADO: 'Enviado',
    ENTREGADO: 'Entregado',
    CANCELADO: 'Cancelado'
  };
  const currentIdx = steps.indexOf(order.estado);
  const isCanceled = order.estado === 'CANCELADO';

  const progressBar = isCanceled
    ? '<div class="alert alert-danger py-2 small mb-3"><i class="bi bi-x-circle"></i> Este pedido fue <strong>CANCELADO</strong>.</div>'
    : `
      <div class="order-stepper mb-4">
        ${steps.map((st, idx) => {
          const done = idx <= currentIdx;
          return `
            <div class="order-step ${done ? 'done' : ''} ${idx === currentIdx ? 'current' : ''}">
              <div class="order-step-dot"><i class="bi bi-${done ? 'check' : 'circle'}"></i></div>
              <div class="order-step-label">${labels[st]}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

  const historyList = (order.historial_estados || []).length > 0
    ? order.historial_estados.map((h) => `
        <div class="timeline-item">
          <div class="d-flex justify-content-between align-items-center">
            <strong>${labels[h.estado_nuevo] || h.estado_nuevo}</strong>
            <span class="small text-muted">${formatDate(h.creado_en)}</span>
          </div>
          <div class="small text-secondary">${h.comentario || 'Actualizacion de estado'}</div>
          ${h.nombre ? `<div class="small text-muted">Responsable: ${h.nombre} ${h.apellido || ''}</div>` : ''}
        </div>
      `).join('')
    : '<p class="small text-muted mb-0">Sin registros de historial.</p>';

  return `
    <div class="d-flex flex-wrap justify-content-between align-items-center bg-light border rounded p-2 mb-3 small">
      <div><strong>Orden:</strong> ${order.numero_orden}</div>
      <div><strong>Total:</strong> ${formatCurrency(order.total)} ${order.cupon_codigo ? `<span class="badge bg-success ms-1">Cupon ${order.cupon_codigo}</span>` : ''}</div>
      <div><strong>Estado actual:</strong> <span class="badge bg-${isCanceled ? 'danger' : 'primary'}">${order.estado}</span></div>
    </div>
    ${progressBar}
    <h6 class="fw-bold mb-2">Historial de cambios</h6>
    <div class="order-timeline">${historyList}</div>
  `;
}
