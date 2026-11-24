const readerWrapper = document.getElementById('readerWrapper');
const readerBody = document.getElementById('readerBody');
const readerAlert = document.getElementById('readerAlert');
const watermarkLayer = document.getElementById('watermarkLayer');

const params = new URLSearchParams(window.location.search);
const bookId = params.get('bookId');

function showSecurityWarning(msg) {
  readerAlert.innerHTML = `
    <div class="alert alert-warning alert-dismissible fade show py-2 small" role="alert">
      <i class="bi bi-shield-lock-fill"></i> ${msg}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function reportSecurityEvent(evento) {
  if (!bookId || !getToken()) return;
  apiRequest(`/orders/reader/${bookId}/security-event`, {
    method: 'POST',
    body: JSON.stringify({ evento })
  }).catch(() => {});
}

function enableContentProtection() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showSecurityWarning('El menu contextual esta deshabilitado en el visor protegido.');
    reportSecurityEvent('INTENTO_CLIC_DERECHO');
  });

  ['copy', 'cut', 'paste', 'selectstart', 'dragstart'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === 'copy' || evt === 'cut') {
        showSecurityWarning('No esta permitido copiar contenido protegido.');
        reportSecurityEvent('INTENTO_COPIA');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key ? e.key.toLowerCase() : '';
    const blockedCombo =
      key === 'printscreen' ||
      key === 'f12' ||
      (e.ctrlKey && ['p', 's', 'u', 'c'].includes(key)) ||
      (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 's'].includes(key));

    if (blockedCombo) {
      e.preventDefault();
      readerWrapper.classList.add('reader-blurred');
      showSecurityWarning('Accion bloqueada: impresion, descarga o captura de pantalla no permitida.');
      reportSecurityEvent(`ATAJO_BLOQUEADO_${key.toUpperCase()}`);
    }
  });

  window.addEventListener('blur', () => {
    readerWrapper.classList.add('reader-blurred');
    reportSecurityEvent('PERDIDA_DE_FOCO');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      readerWrapper.classList.add('reader-blurred');
    }
  });

  document.getElementById('focusShield').addEventListener('click', () => {
    readerWrapper.classList.remove('reader-blurred');
  });
}

function renderWatermark(lector) {
  const stamp = `${lector.nombre} · ${lector.email} · ${new Date().toLocaleDateString('es-CO')}`;
  watermarkLayer.innerHTML = Array.from({ length: 12 })
    .map(() => `<div class="watermark-item">${stamp}</div>`)
    .join('');
}

async function initReader() {
  if (!bookId || !getToken()) {
    readerBody.innerHTML = '<div class="alert alert-warning mb-0">Debes iniciar sesion y seleccionar un libro valido para leer.</div>';
    return;
  }

  try {
    const res = await apiRequest(`/orders/reader/${bookId}`);
    const { libro, acceso, lector } = res.data;

    document.title = `${libro.titulo} | Visor Danzara`;
    renderWatermark(lector);
    enableContentProtection();

    const accessBadge = acceso.tipo === 'ALQUILER'
      ? `Alquiler vigente hasta ${formatDate(acceso.fecha_vencimiento)}`
      : acceso.tipo === 'COMPRA'
        ? 'Compra permanente'
        : 'Vista de administracion';

    readerBody.innerHTML = `
      <div class="border-bottom pb-3 mb-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h1 class="h3 fw-bold mb-1">${libro.titulo}</h1>
            <div class="small text-muted">${libro.autor_nombre || 'Autor'} &middot; ${libro.editorial_nombre || 'Danzara'}</div>
          </div>
          <span class="badge bg-primary">${accessBadge}</span>
        </div>
      </div>
      <div class="reader-content">${libro.contenido_digital}</div>
    `;
  } catch (error) {
    readerBody.innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
  }
}

initReader();
