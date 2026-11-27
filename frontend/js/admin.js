const adminAlert = document.getElementById('adminAlert');
let cachedUsers = [];
let cachedRoles = [];
let cachedAllPermissions = [];
let cachedMeta = { categorias: [], autores: [], editoriales: [], formatos: [] };
let cachedRentals = [];
let cachedCoupons = [];
let salesChartInstance = null;
let categoryChartInstance = null;
let bookSearchTimer = null;

function showAdminAlert(message, type = 'info') {
  adminAlert.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function hasPerm(permCode) {
  const user = getStoredUser();
  if (!user) return false;
  if (user.rol === 'ADMIN') return true;
  return (user.permisos || []).includes(permCode);
}

function closeMobileSidebar() {
  document.getElementById('adminSidebar').classList.remove('mobile-open');
  document.getElementById('adminBackdrop').classList.remove('show');
}

function switchAdminSection(sectionId) {
  const targetSection = document.getElementById(sectionId);
  if (!targetSection) return;

  document.querySelectorAll('.admin-section').forEach((sec) => sec.classList.add('d-none'));
  targetSection.classList.remove('d-none');

  document.querySelectorAll('#adminSidebarNav .admin-nav-btn').forEach((btn) => {
    const isActive = btn.dataset.section === sectionId;
    btn.classList.toggle('active', isActive);
    if (isActive && btn.dataset.label) {
      document.getElementById('adminSectionTitle').textContent = btn.dataset.label;
    }
  });

  closeMobileSidebar();
}

function applySidebarPermissions() {
  let firstVisibleSection = null;
  const visibleGroups = new Set();

  document.querySelectorAll('#adminSidebarNav .admin-nav-btn').forEach((btn) => {
    const reqs = (btn.dataset.perm || '').split(',').filter(Boolean);
    const allowed = reqs.length === 0 || reqs.some((p) => hasPerm(p));
    if (!allowed) {
      btn.classList.add('d-none');
    } else {
      btn.classList.remove('d-none');
      if (btn.dataset.group) visibleGroups.add(btn.dataset.group);
      if (!firstVisibleSection) firstVisibleSection = btn.dataset.section;
    }
  });

  document.querySelectorAll('#adminSidebarNav .admin-sidebar-group').forEach((grp) => {
    grp.classList.toggle('d-none', !visibleGroups.has(grp.dataset.group));
  });

  if (firstVisibleSection) {
    switchAdminSection(firstVisibleSection);
  }
}

function initSidebarControls() {
  const sidebar = document.getElementById('adminSidebar');
  const backdrop = document.getElementById('adminBackdrop');

  document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
    if (window.innerWidth < 992) {
      sidebar.classList.toggle('mobile-open');
      backdrop.classList.toggle('show', sidebar.classList.contains('mobile-open'));
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  backdrop.addEventListener('click', closeMobileSidebar);

  document.querySelectorAll('#adminSidebarNav .admin-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchAdminSection(btn.dataset.section));
  });

  document.getElementById('goToDashboardAlertsBtn').addEventListener('click', () => {
    if (hasPerm('DASHBOARD_VER')) {
      switchAdminSection('dashboardTab');
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Continuar cierre de sesion local
    }
    clearSession();
    window.location.href = 'index.html';
  });
}

function checkAdminSession() {
  const user = getStoredUser();
  if (!getToken() || !user || !hasPerm('PANEL_ADMIN_ACCESO')) {
    window.location.href = 'index.html';
    return false;
  }
  document.getElementById('adminRoleLabel').textContent = `${user.nombre} · ${user.rol}`;
  applySidebarPermissions();
  return true;
}

// --- Dashboard y Reportes ---

function renderAlertsBell(alertas) {
  const stockAlerts = alertas.stock_bajo || [];
  const rentalAlerts = alertas.alquileres_vencidos || [];
  const total = stockAlerts.length + rentalAlerts.length;

  const badge = document.getElementById('alertsBellBadge');
  const summary = document.getElementById('alertsBellSummary');
  const listEl = document.getElementById('alertsDropdownList');

  summary.textContent = total;
  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }

  if (total === 0) {
    listEl.innerHTML = '<div class="text-muted text-center py-2">Sin alertas operativas pendientes.</div>';
    return;
  }

  const itemsHtml = [
    ...stockAlerts.slice(0, 4).map((b) => `
      <div class="d-flex align-items-start gap-2 border-bottom py-1">
        <i class="bi bi-exclamation-triangle-fill text-danger mt-1"></i>
        <div><strong>Stock bajo:</strong> ${b.titulo} (${b.stock_fisico} und.)</div>
      </div>
    `),
    ...rentalAlerts.slice(0, 4).map((r) => `
      <div class="d-flex align-items-start gap-2 border-bottom py-1">
        <i class="bi bi-clock-fill text-warning mt-1"></i>
        <div><strong>Alquiler vencido:</strong> ${r.titulo} (${r.email})</div>
      </div>
    `)
  ];

  listEl.innerHTML = itemsHtml.join('');
}

async function loadDashboard() {
  if (!hasPerm('DASHBOARD_VER')) return;
  try {
    const res = await apiRequest('/dashboard/summary');
    const { kpis, alertas, graficas } = res.data;

    document.getElementById('kpiCards').innerHTML = `
      <div class="col-12 col-sm-6 col-xl-3">
        <div class="kpi-card shadow-sm h-100">
          <div>
            <div class="small text-muted fw-medium">Ingresos Totales</div>
            <div class="fs-4 fw-bold text-primary mt-1">${formatCurrency(kpis.ingresos_totales)}</div>
          </div>
          <div class="kpi-icon" style="background: rgba(20, 45, 78, 0.1); color: #142D4E;">
            <i class="bi bi-cash-stack"></i>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <div class="kpi-card shadow-sm h-100">
          <div>
            <div class="small text-muted fw-medium">Pedidos Registrados</div>
            <div class="fs-4 fw-bold mt-1">${kpis.total_pedidos}</div>
            <div class="small text-warning fw-semibold">${kpis.pedidos_pendientes} pendiente(s)</div>
          </div>
          <div class="kpi-icon" style="background: rgba(40, 120, 208, 0.12); color: #2878D0;">
            <i class="bi bi-bag-check"></i>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <div class="kpi-card shadow-sm h-100">
          <div>
            <div class="small text-muted fw-medium">Alquileres Activos</div>
            <div class="fs-4 fw-bold text-success mt-1">${kpis.alquileres_activos}</div>
            <div class="small text-danger fw-semibold">${kpis.alquileres_vencidos} vencido(s)</div>
          </div>
          <div class="kpi-icon" style="background: rgba(25, 135, 84, 0.12); color: #198754;">
            <i class="bi bi-journal-check"></i>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <div class="kpi-card shadow-sm h-100">
          <div>
            <div class="small text-muted fw-medium">Catalogo / Usuarios</div>
            <div class="fs-4 fw-bold mt-1">${kpis.total_libros} <span class="fs-6 text-muted fw-normal">libros</span></div>
            <div class="small text-muted">${kpis.total_usuarios} usuarios registrados</div>
          </div>
          <div class="kpi-icon" style="background: rgba(244, 185, 66, 0.22); color: #9c6d00;">
            <i class="bi bi-collection"></i>
          </div>
        </div>
      </div>
    `;

    renderAlertsBell(alertas);

    document.getElementById('lowStockList').innerHTML = alertas.stock_bajo.length > 0
      ? alertas.stock_bajo.map((b) => `<div class="border-bottom py-1"><strong>${b.titulo}</strong>: ${b.stock_fisico} und. (min. ${b.stock_minimo})</div>`).join('')
      : '<span class="text-muted">Sin alertas de stock bajo.</span>';

    document.getElementById('expiredRentalsList').innerHTML = alertas.alquileres_vencidos.length > 0
      ? alertas.alquileres_vencidos.map((r) => `<div class="border-bottom py-1"><strong>${r.titulo}</strong> - ${r.email} (vencio ${formatDate(r.fecha_vencimiento)})</div>`).join('')
      : '<span class="text-muted">No hay alquileres vencidos.</span>';

    if (typeof Chart !== 'undefined') {
      if (salesChartInstance) salesChartInstance.destroy();
      salesChartInstance = new Chart(document.getElementById('salesChart'), {
        type: 'bar',
        data: {
          labels: graficas.ventas_mes.map((v) => v.mes),
          datasets: [{ label: 'Ventas (COP)', data: graficas.ventas_mes.map((v) => Number(v.total)), backgroundColor: '#142D4E', borderRadius: 6 }]
        }
      });

      if (categoryChartInstance) categoryChartInstance.destroy();
      categoryChartInstance = new Chart(document.getElementById('categoryChart'), {
        type: 'doughnut',
        data: {
          labels: graficas.libros_categoria.map((c) => c.categoria),
          datasets: [{ data: graficas.libros_categoria.map((c) => Number(c.total)), backgroundColor: ['#142D4E', '#2878D0', '#F4B942', '#198754', '#6c757d', '#dc3545'] }]
        }
      });
    }
  } catch (error) {
    showAdminAlert(error.message, 'warning');
  }
}

async function downloadCsvReport(type) {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard/export/${type}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!response.ok) throw new Error('No se pudo exportar el reporte');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${type}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
}

// --- Parametrizacion ---

function renderParamItem(type, item, subtitle = '') {
  const count = Number(item.libros_asociados) || 0;
  return `
    <li class="list-group-item px-0 d-flex justify-content-between align-items-center gap-2">
      <div>
        <span class="fw-medium">${item.nombre}</span>
        ${subtitle ? `<span class="text-muted"> ${subtitle}</span>` : ''}
        <span class="badge bg-${count > 0 ? 'secondary' : 'light text-dark border'} ms-1">${count} libro(s)</span>
      </div>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-primary" onclick="openEditParam('${type}', '${item.id}')" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-outline-danger" onclick="deleteParam('${type}', '${item.id}')" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </li>
  `;
}

async function loadMetaSelects() {
  const res = await apiRequest('/books/meta');
  cachedMeta = res.data;
  const { categorias, autores, editoriales, formatos } = cachedMeta;

  const fillSelect = (id, list, includeEmpty = true) => {
    const el = document.getElementById(id);
    el.innerHTML = includeEmpty ? '<option value="">Seleccionar...</option>' : '';
    list.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.nombre;
      el.appendChild(opt);
    });
  };

  fillSelect('bookCategoria', categorias);
  fillSelect('bookAutor', autores);
  fillSelect('bookEditorial', editoriales);
  fillSelect('bookFormato', formatos, false);

  document.getElementById('categoriesList').innerHTML = categorias.map((c) => renderParamItem('categories', c)).join('');
  document.getElementById('authorsList').innerHTML = autores.map((a) => renderParamItem('authors', a, a.nacionalidad ? `(${a.nacionalidad})` : '')).join('');
  document.getElementById('publishersList').innerHTML = editoriales.map((e) => renderParamItem('publishers', e, e.pais ? `(${e.pais})` : '')).join('');
  document.getElementById('formatsList').innerHTML = formatos.map((f) => renderParamItem('formats', f, `[${f.codigo}]`)).join('');
}

function openEditParam(type, id) {
  const mapList = {
    categories: cachedMeta.categorias,
    authors: cachedMeta.autores,
    publishers: cachedMeta.editoriales,
    formats: cachedMeta.formatos
  };
  const item = (mapList[type] || []).find((x) => String(x.id) === String(id));
  if (!item) return;

  if (Number(item.libros_asociados) > 0) {
    showAdminAlert(`No se puede modificar "${item.nombre}" porque tiene ${item.libros_asociados} libro(s) asociado(s).`, 'warning');
    return;
  }

  document.getElementById('paramType').value = type;
  document.getElementById('paramId').value = id;
  document.getElementById('paramName').value = item.nombre;

  const codeGroup = document.getElementById('paramCodeGroup');
  const stockGroup = document.getElementById('paramStockGroup');
  const extraLabel = document.getElementById('paramExtraLabel');
  const extraInput = document.getElementById('paramExtra');

  codeGroup.classList.add('d-none');
  stockGroup.classList.add('d-none');

  if (type === 'categories') {
    document.getElementById('paramEditTitle').textContent = 'Editar Categoria';
    extraLabel.textContent = 'Descripcion';
    extraInput.value = item.descripcion || '';
  } else if (type === 'authors') {
    document.getElementById('paramEditTitle').textContent = 'Editar Autor';
    extraLabel.textContent = 'Nacionalidad';
    extraInput.value = item.nacionalidad || '';
  } else if (type === 'publishers') {
    document.getElementById('paramEditTitle').textContent = 'Editar Editorial';
    extraLabel.textContent = 'Pais';
    extraInput.value = item.pais || '';
  } else if (type === 'formats') {
    document.getElementById('paramEditTitle').textContent = 'Editar Formato';
    codeGroup.classList.remove('d-none');
    stockGroup.classList.remove('d-none');
    document.getElementById('paramCode').value = item.codigo;
    extraLabel.textContent = 'Descripcion';
    extraInput.value = item.descripcion || '';
    document.getElementById('paramStock').value = String(item.requiere_stock ? 1 : 0);
  }

  new bootstrap.Modal(document.getElementById('paramEditModal')).show();
}

document.getElementById('paramEditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('paramType').value;
  const id = document.getElementById('paramId').value;
  const nombre = document.getElementById('paramName').value;
  const extra = document.getElementById('paramExtra').value;

  let body = { nombre };
  if (type === 'categories') body.descripcion = extra;
  if (type === 'authors') body.nacionalidad = extra;
  if (type === 'publishers') body.pais = extra;
  if (type === 'formats') {
    body = {
      codigo: document.getElementById('paramCode').value,
      nombre,
      descripcion: extra,
      requiere_stock: Number(document.getElementById('paramStock').value)
    };
  }

  try {
    await apiRequest(`/books/${type}/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    bootstrap.Modal.getInstance(document.getElementById('paramEditModal')).hide();
    await loadMetaSelects();
    showAdminAlert('Elemento actualizado correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

async function deleteParam(type, id) {
  if (!confirm('Deseas eliminar este elemento de parametrizacion?')) return;
  try {
    await apiRequest(`/books/${type}/${id}`, { method: 'DELETE' });
    await loadMetaSelects();
    showAdminAlert('Elemento eliminado correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'warning');
  }
}

// --- Libros ---

async function loadAdminBooks(q = '') {
  if (!hasPerm('CATALOGO_CREAR') && !hasPerm('CATALOGO_EDITAR')) return;
  const params = new URLSearchParams({ limit: '50' });
  if (q && q.trim()) params.append('q', q.trim());

  const res = await apiRequest(`/books?${params.toString()}`);
  const tbody = document.getElementById('adminBooksTable');
  const items = res.data.items || [];

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">No se encontraron libros con ese criterio.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((b) => `
    <tr>
      <td>
        ${b.portada_url
          ? `<img src="${resolveAssetUrl(b.portada_url)}" alt="${b.titulo}" class="book-thumb">`
          : '<span class="badge bg-light text-secondary border">Sin img</span>'
        }
      </td>
      <td class="fw-semibold">${b.titulo}</td>
      <td>${b.autor_nombre || '-'}</td>
      <td><span class="badge bg-dark">${b.formato_nombre || b.formato}</span></td>
      <td>${formatCurrency(b.precio_venta)}</td>
      <td>${formatCurrency(b.precio_alquiler)}</td>
      <td>${b.stock_fisico}</td>
      <td><span class="badge bg-${b.estado === 'DISPONIBLE' ? 'success' : 'warning'}">${b.estado}</span></td>
      <td>
        <a href="visor.html?bookId=${b.id}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Previsualizar visor"><i class="bi bi-book-half"></i></a>
        <button class="btn btn-sm btn-outline-primary" onclick="editBook('${b.id}')" title="Editar"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteBook('${b.id}')" title="Descontinuar"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('adminBookSearchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loadAdminBooks(document.getElementById('adminBookSearch').value);
});

document.getElementById('adminBookSearch').addEventListener('input', (e) => {
  clearTimeout(bookSearchTimer);
  bookSearchTimer = setTimeout(() => loadAdminBooks(e.target.value), 350);
});

function updateCoverPreview(url) {
  const preview = document.getElementById('bookCoverPreview');
  if (url && url.trim()) {
    preview.src = resolveAssetUrl(url.trim());
    preview.classList.remove('d-none');
  } else {
    preview.src = '';
    preview.classList.add('d-none');
  }
}

document.getElementById('bookPortadaUrl').addEventListener('input', (e) => updateCoverPreview(e.target.value));

document.getElementById('bookPortadaFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('coverUploadStatus');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    statusEl.innerHTML = '<span class="text-danger">Solo se permiten imagenes JPG, PNG o WEBP.</span>';
    e.target.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    statusEl.innerHTML = '<span class="text-danger">La imagen supera el limite de 2 MB.</span>';
    e.target.value = '';
    return;
  }

  statusEl.innerHTML = '<span class="text-primary">Subiendo portada...</span>';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await apiRequest('/books/upload-cover', {
        method: 'POST',
        body: JSON.stringify({ dataUrl: reader.result })
      });
      document.getElementById('bookPortadaUrl').value = res.data.url;
      updateCoverPreview(res.data.url);
      statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Portada cargada en el servidor.</span>';
    } catch (error) {
      statusEl.innerHTML = `<span class="text-danger">${error.message}</span>`;
    }
  };
  reader.readAsDataURL(file);
});

function prepareNewBook() {
  document.getElementById('bookModalTitle').textContent = 'Registrar Libro';
  document.getElementById('bookForm').reset();
  document.getElementById('bookId').value = '';
  document.getElementById('bookDiasAlquiler').value = 15;
  document.getElementById('bookPortadaFile').value = '';
  document.getElementById('coverUploadStatus').textContent = 'Formatos permitidos: JPG, PNG o WEBP (max. 2 MB).';
  updateCoverPreview('');
}

async function editBook(id) {
  const res = await apiRequest(`/books/${id}/editor`);
  const b = res.data;
  document.getElementById('bookModalTitle').textContent = 'Editar Libro';
  document.getElementById('bookId').value = b.id;
  document.getElementById('bookTitulo').value = b.titulo;
  document.getElementById('bookIsbn').value = b.isbn || '';
  document.getElementById('bookCategoria').value = b.categoria_id || '';
  document.getElementById('bookAutor').value = b.autor_id || '';
  document.getElementById('bookEditorial').value = b.editorial_id || '';
  document.getElementById('bookFormato').value = b.formato_id || '';
  document.getElementById('bookPrecioVenta').value = b.precio_venta;
  document.getElementById('bookPrecioAlquiler').value = b.precio_alquiler;
  document.getElementById('bookStock').value = b.stock_fisico;
  document.getElementById('bookDiasAlquiler').value = b.dias_alquiler || 15;
  document.getElementById('bookPortadaUrl').value = b.portada_url || '';
  document.getElementById('bookSinopsis').value = b.sinopsis || '';
  document.getElementById('bookContenidoDigital').value = b.contenido_digital || '';
  updateCoverPreview(b.portada_url || '');
  new bootstrap.Modal(document.getElementById('bookModal')).show();
}

async function deleteBook(id) {
  if (!confirm('Deseas descontinuar este libro del catalogo?')) return;
  try {
    await apiRequest(`/books/${id}`, { method: 'DELETE' });
    showAdminAlert('Libro descontinuado correctamente.', 'success');
    await loadAdminBooks(document.getElementById('adminBookSearch').value);
    await loadDashboard();
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
}

document.getElementById('bookForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('bookId').value;
  const payload = {
    titulo: document.getElementById('bookTitulo').value,
    isbn: document.getElementById('bookIsbn').value || null,
    categoria_id: document.getElementById('bookCategoria').value || null,
    autor_id: document.getElementById('bookAutor').value || null,
    editorial_id: document.getElementById('bookEditorial').value || null,
    formato_id: document.getElementById('bookFormato').value,
    precio_venta: Number(document.getElementById('bookPrecioVenta').value),
    precio_alquiler: Number(document.getElementById('bookPrecioAlquiler').value),
    stock_fisico: Number(document.getElementById('bookStock').value),
    dias_alquiler: Number(document.getElementById('bookDiasAlquiler').value) || 15,
    portada_url: document.getElementById('bookPortadaUrl').value.trim() || null,
    sinopsis: document.getElementById('bookSinopsis').value,
    contenido_digital: document.getElementById('bookContenidoDigital').value
  };

  try {
    if (id) {
      await apiRequest(`/books/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showAdminAlert('Libro actualizado correctamente.', 'success');
    } else {
      await apiRequest('/books', { method: 'POST', body: JSON.stringify(payload) });
      showAdminAlert('Libro creado correctamente.', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('bookModal')).hide();
    await loadAdminBooks(document.getElementById('adminBookSearch').value);
    await loadMetaSelects();
    await loadInventoryHistory();
    await loadDashboard();
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/books/categories', {
      method: 'POST',
      body: JSON.stringify({ nombre: document.getElementById('catNombre').value, descripcion: document.getElementById('catDescripcion').value })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Categoria agregada correctamente.', 'success');
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

document.getElementById('authorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/books/authors', {
      method: 'POST',
      body: JSON.stringify({ nombre: document.getElementById('authorNombre').value, nacionalidad: document.getElementById('authorNacionalidad').value })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Autor agregado correctamente.', 'success');
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

document.getElementById('publisherForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/books/publishers', {
      method: 'POST',
      body: JSON.stringify({ nombre: document.getElementById('pubNombre').value, pais: document.getElementById('pubPais').value })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Editorial agregada correctamente.', 'success');
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

document.getElementById('formatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/books/formats', {
      method: 'POST',
      body: JSON.stringify({
        codigo: document.getElementById('fmtCodigo').value,
        nombre: document.getElementById('fmtNombre').value,
        requiere_stock: Number(document.getElementById('fmtRequiereStock').value)
      })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Formato agregado correctamente.', 'success');
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

// --- Roles y Permisos ---

async function loadRolesAndPermissions() {
  if (!hasPerm('ROLES_PERMISOS_GESTIONAR') && !hasPerm('USUARIOS_VER')) return;
  const rolesRes = await apiRequest('/roles');
  cachedRoles = rolesRes.data;

  const roleSelect = document.getElementById('editUserRol');
  roleSelect.innerHTML = cachedRoles.map((r) => `<option value="${r.nombre}">${r.nombre}</option>`).join('');

  if (!hasPerm('ROLES_PERMISOS_GESTIONAR')) return;
  const permsRes = await apiRequest('/roles/permissions');
  cachedAllPermissions = permsRes.data;

  document.getElementById('rolesTableBody').innerHTML = cachedRoles.map((r) => `
    <tr>
      <td><span class="badge bg-light text-dark border me-1">#${r.id}</span><strong>${r.nombre}</strong><br><small class="text-muted">${r.descripcion || ''}</small></td>
      <td><span class="badge bg-primary">${r.permisos_codigos.length} permiso(s)</span></td>
      <td>${r.total_usuarios}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openRolePermsModal('${r.id}')" title="Configurar permisos">
          <i class="bi bi-shield-check"></i>
        </button>
        ${!r.es_sistema ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteRole('${r.id}')"><i class="bi bi-trash"></i></button>` : ''}
      </td>
    </tr>
  `).join('');
}

document.getElementById('createRoleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/roles', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('newRoleName').value,
        descripcion: document.getElementById('newRoleDesc').value
      })
    });
    e.target.reset();
    await loadRolesAndPermissions();
    showAdminAlert('Rol creado correctamente. Ahora puedes asignarle permisos.', 'success');
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

function openRolePermsModal(roleId) {
  const role = cachedRoles.find((r) => String(r.id) === String(roleId));
  if (!role) return;
  document.getElementById('editRoleId').value = roleId;
  document.getElementById('rolePermsModalTitle').textContent = `Permisos del Rol: ${role.nombre}`;

  const rolePermIds = (role.permisos_ids || []).map(String);
  document.getElementById('rolePermsCheckboxes').innerHTML = cachedAllPermissions.map((p) => {
    const checked = rolePermIds.includes(String(p.id)) ? 'checked' : '';
    return `
      <div class="col-md-6">
        <label class="border rounded p-2 d-flex align-items-start gap-2 small w-100">
          <input type="checkbox" class="form-check-input mt-1 role-perm-chk" value="${p.id}" ${checked}>
          <span><strong>[${p.modulo}]</strong> ${p.nombre}<br><span class="text-muted">${p.codigo}</span></span>
        </label>
      </div>
    `;
  }).join('');

  new bootstrap.Modal(document.getElementById('rolePermsModal')).show();
}

document.getElementById('saveRolePermsBtn').addEventListener('click', async () => {
  const roleId = document.getElementById('editRoleId').value;
  const permisosIds = Array.from(document.querySelectorAll('.role-perm-chk:checked')).map((el) => el.value);
  try {
    await apiRequest(`/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permisosIds })
    });
    bootstrap.Modal.getInstance(document.getElementById('rolePermsModal')).hide();
    await loadRolesAndPermissions();
    showAdminAlert('Permisos del rol actualizados.', 'success');
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

async function deleteRole(roleId) {
  if (!confirm('Deseas eliminar este rol?')) return;
  try {
    await apiRequest(`/roles/${roleId}`, { method: 'DELETE' });
    await loadRolesAndPermissions();
    showAdminAlert('Rol eliminado correctamente.', 'success');
  } catch (error) { showAdminAlert(error.message, 'warning'); }
}

// --- Usuarios ---

async function loadUsers(q = '') {
  if (!hasPerm('USUARIOS_VER')) return;
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  const res = await apiRequest(`/users${query}`);
  cachedUsers = res.data;

  document.getElementById('adminUsersTable').innerHTML = cachedUsers.map((u) => `
    <tr>
      <td class="fw-semibold">${u.nombre} ${u.apellido}</td>
      <td>${u.email}</td>
      <td>${u.documento_identidad || '-'}</td>
      <td>${u.telefono || '-'}</td>
      <td><span class="badge bg-${u.rol === 'ADMIN' ? 'dark' : 'secondary'}">${u.rol}</span></td>
      <td><span class="badge bg-${u.estado === 'ACTIVO' ? 'success' : 'danger'}">${u.estado}</span></td>
      <td class="small">${formatDate(u.ultimo_acceso)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEditUser('${u.id}')" title="Editar datos"><i class="bi bi-person-gear"></i></button>
        ${hasPerm('ROLES_PERMISOS_GESTIONAR') ? `<button class="btn btn-sm btn-outline-dark" onclick="openUserPermissions('${u.id}')" title="Asignar permisos"><i class="bi bi-shield-lock"></i></button>` : ''}
        <button class="btn btn-sm btn-outline-warning" onclick="openResetPassword('${u.id}')" title="Cambiar contrasena"><i class="bi bi-key"></i></button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('userSearchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loadUsers(document.getElementById('userSearchInput').value);
});

function openEditUser(userId) {
  const user = cachedUsers.find((u) => u.id === userId);
  if (!user) return;
  document.getElementById('editUserId').value = user.id;
  document.getElementById('editUserNombre').value = user.nombre;
  document.getElementById('editUserApellido').value = user.apellido;
  document.getElementById('editUserTelefono').value = user.telefono || '';
  document.getElementById('editUserDocumento').value = user.documento_identidad || '';
  document.getElementById('editUserRol').value = user.rol;
  document.getElementById('editUserEstado').value = user.estado;
  new bootstrap.Modal(document.getElementById('userEditModal')).show();
}

document.getElementById('userEditForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  try {
    await apiRequest(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: document.getElementById('editUserNombre').value,
        apellido: document.getElementById('editUserApellido').value,
        telefono: document.getElementById('editUserTelefono').value,
        documento_identidad: document.getElementById('editUserDocumento').value,
        rol: document.getElementById('editUserRol').value,
        estado: document.getElementById('editUserEstado').value
      })
    });
    bootstrap.Modal.getInstance(document.getElementById('userEditModal')).hide();
    showAdminAlert('Usuario actualizado correctamente.', 'success');
    await loadUsers();
    await loadAuditHistory();
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

async function openUserPermissions(userId) {
  try {
    const res = await apiRequest(`/users/${userId}/permissions`);
    const { user, permisos } = res.data;
    document.getElementById('permUserId').value = user.id;
    document.getElementById('userPermHeader').textContent = `Usuario: ${user.nombre} ${user.apellido} (${user.email}) — Rol actual: ${user.rol}`;

    document.getElementById('userPermsTableBody').innerHTML = permisos.map((p) => `
      <tr>
        <td><span class="badge bg-light text-dark border">${p.modulo}</span></td>
        <td class="small"><strong>${p.nombre}</strong><br><span class="text-muted">${p.codigo}</span></td>
        <td><span class="badge bg-${p.heredado ? 'success' : 'secondary'}">${p.heredado ? 'Si' : 'No'}</span></td>
        <td>
          <select class="form-select form-select-sm user-perm-select" data-permid="${p.id}">
            <option value="HEREDADO" ${p.estado === 'HEREDADO' ? 'selected' : ''}>Heredado del rol</option>
            <option value="CONCEDIDO" ${p.estado === 'CONCEDIDO' ? 'selected' : ''}>Conceder permiso</option>
            <option value="REVOCADO" ${p.estado === 'REVOCADO' ? 'selected' : ''}>Revocar permiso</option>
          </select>
        </td>
      </tr>
    `).join('');

    new bootstrap.Modal(document.getElementById('userPermissionsModal')).show();
  } catch (error) { showAdminAlert(error.message, 'danger'); }
}

document.getElementById('saveUserPermsBtn').addEventListener('click', async () => {
  const userId = document.getElementById('permUserId').value;
  const overrides = Array.from(document.querySelectorAll('.user-perm-select')).map((el) => ({
    permiso_id: el.dataset.permid,
    estado: el.value
  }));

  try {
    await apiRequest(`/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ overrides })
    });
    bootstrap.Modal.getInstance(document.getElementById('userPermissionsModal')).hide();
    showAdminAlert('Permisos individuales asignados correctamente.', 'success');
    await loadAuditHistory();
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

function openResetPassword(userId) {
  const user = cachedUsers.find((u) => u.id === userId);
  if (!user) return;
  document.getElementById('resetPassUserId').value = user.id;
  document.getElementById('resetPassUserEmail').textContent = user.email;
  document.getElementById('resetNewPassword').value = '';
  new bootstrap.Modal(document.getElementById('userPasswordModal')).show();
}

document.getElementById('userPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('resetPassUserId').value;
  try {
    await apiRequest(`/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ nueva_contrasena: document.getElementById('resetNewPassword').value })
    });
    bootstrap.Modal.getInstance(document.getElementById('userPasswordModal')).hide();
    showAdminAlert('Contrasena restablecida correctamente.', 'success');
    await loadAuditHistory();
  } catch (error) { showAdminAlert(error.message, 'danger'); }
});

// --- Pedidos e Historial ---

async function loadAdminOrders(estado = '') {
  if (!hasPerm('PEDIDOS_VER_TODOS')) return;
  const query = estado ? `?estado=${encodeURIComponent(estado)}` : '';
  const res = await apiRequest(`/orders${query}`);
  const tbody = document.getElementById('adminOrdersTable');
  const states = ['PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];
  const items = res.data || [];

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No hay pedidos para el estado seleccionado.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((o) => `
    <tr>
      <td><strong>${o.numero_orden}</strong></td>
      <td>${o.cliente_nombre} ${o.cliente_apellido}<br><small class="text-muted">${o.cliente_email}</small></td>
      <td>${formatDate(o.creado_en)}</td>
      <td>${formatCurrency(o.total)}</td>
      <td><span class="badge bg-primary">${o.estado}</span></td>
      <td>
        <div class="d-flex gap-1">
          <a href="factura.html?orderId=${o.id}" target="_blank" class="btn btn-sm btn-outline-primary" title="Ver factura">
            <i class="bi bi-receipt"></i> ${o.numero_factura || 'Ver'}
          </a>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="openAdminOrderTimeline('${o.id}')" title="Ver seguimiento">
            <i class="bi bi-clock-history"></i>
          </button>
        </div>
      </td>
      <td>
        <select class="form-select form-select-sm" onchange="changeOrderStatus('${o.id}', this.value)">
          ${states.map((s) => `<option value="${s}" ${s === o.estado ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

document.getElementById('adminOrderStatusFilter').addEventListener('change', (e) => {
  loadAdminOrders(e.target.value);
});

async function changeOrderStatus(orderId, estado) {
  try {
    await apiRequest(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, comentario: 'Actualizacion desde panel administrativo' })
    });
    showAdminAlert('Estado del pedido actualizado.', 'success');
    await loadAdminOrders(document.getElementById('adminOrderStatusFilter').value);
    await loadAuditHistory();
    await loadDashboard();
  } catch (error) { showAdminAlert(error.message, 'danger'); }
}

async function openAdminOrderTimeline(orderId) {
  const body = document.getElementById('orderTimelineBody');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('orderTimelineModal'));
  body.innerHTML = '<p class="text-muted">Cargando historial del pedido...</p>';
  modal.show();
  try {
    const res = await apiRequest(`/orders/${orderId}`);
    body.innerHTML = renderOrderTimelineHtml(res.data);
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
  }
}

// --- Alquileres y Devoluciones ---

async function loadAdminRentals(estado = '') {
  if (!hasPerm('PEDIDOS_VER_TODOS')) return;
  const query = estado ? `?estado=${encodeURIComponent(estado)}` : '';
  const res = await apiRequest(`/orders/rentals${query}`);
  cachedRentals = res.data || [];
  const tbody = document.getElementById('adminRentalsTable');

  if (cachedRentals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No hay alquileres registrados para este filtro.</td></tr>';
    return;
  }

  tbody.innerHTML = cachedRentals.map((r) => {
    const badgeColor = r.estado_efectivo === 'DEVUELTO'
      ? 'secondary'
      : r.estado_efectivo === 'VENCIDO'
        ? 'danger'
        : 'success';
    const multaMostrar = r.estado === 'DEVUELTO' ? Number(r.multa) : Number(r.multa_sugerida);
    return `
      <tr>
        <td>
          <div class="fw-semibold">${r.libro_titulo}</div>
          <span class="badge bg-light text-dark border">${r.formato}</span>
        </td>
        <td>${r.cliente_nombre} ${r.cliente_apellido}<br><small class="text-muted">${r.cliente_email}</small></td>
        <td class="small">${r.numero_orden || '-'}</td>
        <td class="small">
          <div>Ini: ${formatDate(r.fecha_inicio)}</div>
          <div>Ven: <strong>${formatDate(r.fecha_vencimiento)}</strong></div>
        </td>
        <td><span class="badge bg-${badgeColor}">${r.estado_efectivo}</span></td>
        <td class="small">
          ${r.dias_mora > 0
            ? `<span class="text-danger fw-semibold">${r.dias_mora} dia(s)</span><br>${formatCurrency(multaMostrar)}`
            : '<span class="text-muted">Sin mora</span>'
          }
        </td>
        <td>
          ${r.estado !== 'DEVUELTO' && hasPerm('PEDIDOS_CAMBIAR_ESTADO')
            ? `<button class="btn btn-sm btn-pds" onclick="openReturnRentalModal('${r.id}')"><i class="bi bi-check2-circle"></i> Devolver</button>`
            : `<span class="small text-muted">${r.fecha_devolucion_real ? `Devuelto ${formatDate(r.fecha_devolucion_real)}` : '-'}</span>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

document.getElementById('adminRentalStatusFilter').addEventListener('change', (e) => {
  loadAdminRentals(e.target.value);
});

function openReturnRentalModal(rentalId) {
  const r = cachedRentals.find((item) => item.id === rentalId);
  if (!r) return;
  document.getElementById('returnRentalId').value = r.id;
  document.getElementById('returnRentalMulta').value = r.multa_sugerida || 0;
  document.getElementById('returnRentalObs').value = r.observaciones || '';
  document.getElementById('returnRentalSummary').innerHTML = `
    <div><strong>Libro:</strong> ${r.libro_titulo} (${r.formato})</div>
    <div><strong>Cliente:</strong> ${r.cliente_nombre} ${r.cliente_apellido} (${r.cliente_email})</div>
    <div><strong>Vencimiento:</strong> ${formatDate(r.fecha_vencimiento)}</div>
    <div class="${r.dias_mora > 0 ? 'text-danger fw-semibold' : 'text-success'}">
      ${r.dias_mora > 0 ? `Retraso detectado: ${r.dias_mora} dia(s) · Multa sugerida: ${formatCurrency(r.multa_sugerida)}` : 'Dentro del plazo establecido (sin multa).'}
    </div>
  `;
  new bootstrap.Modal(document.getElementById('returnRentalModal')).show();
}

document.getElementById('returnRentalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rentalId = document.getElementById('returnRentalId').value;
  try {
    await apiRequest(`/orders/rentals/${rentalId}/return`, {
      method: 'PATCH',
      body: JSON.stringify({
        multa: Number(document.getElementById('returnRentalMulta').value) || 0,
        observaciones: document.getElementById('returnRentalObs').value
      })
    });
    bootstrap.Modal.getInstance(document.getElementById('returnRentalModal')).hide();
    showAdminAlert('Devolucion registrada correctamente.', 'success');
    await Promise.all([
      loadAdminRentals(document.getElementById('adminRentalStatusFilter').value),
      loadAdminBooks(document.getElementById('adminBookSearch').value),
      loadInventoryHistory(),
      loadAuditHistory(),
      loadDashboard()
    ]);
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

// --- Cupones y Descuentos ---

async function loadCoupons() {
  if (!hasPerm('PARAMETRIZACION_GESTIONAR')) return;
  const res = await apiRequest('/coupons');
  cachedCoupons = res.data || [];
  const tbody = document.getElementById('adminCouponsTable');

  if (cachedCoupons.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No hay cupones registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = cachedCoupons.map((c) => `
    <tr>
      <td>
        <strong>${c.codigo}</strong>
        ${c.descripcion ? `<br><small class="text-muted">${c.descripcion}</small>` : ''}
      </td>
      <td>${c.tipo === 'PORCENTAJE' ? `${Number(c.valor)}%` : formatCurrency(c.valor)}</td>
      <td class="small">${formatCurrency(c.monto_minimo)}</td>
      <td class="small">${c.usos_actuales} / ${c.usos_maximos || '∞'}</td>
      <td>
        <span class="badge bg-${c.activo ? 'success' : 'secondary'}">${c.activo ? 'ACTIVO' : 'INACTIVO'}</span>
      </td>
      <td>
        <button class="btn btn-sm btn-outline-${c.activo ? 'warning' : 'success'}" onclick="toggleCouponStatus(${c.id}, ${c.activo ? 0 : 1})" title="${c.activo ? 'Desactivar' : 'Activar'}">
          <i class="bi bi-${c.activo ? 'pause-circle' : 'play-circle'}"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteCoupon(${c.id})" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('couponForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const expVal = document.getElementById('couponExp').value;
  try {
    await apiRequest('/coupons', {
      method: 'POST',
      body: JSON.stringify({
        codigo: document.getElementById('couponCode').value,
        tipo: document.getElementById('couponType').value,
        valor: Number(document.getElementById('couponValor').value),
        monto_minimo: Number(document.getElementById('couponMin').value) || 0,
        usos_maximos: document.getElementById('couponMaxUses').value ? Number(document.getElementById('couponMaxUses').value) : null,
        fecha_expiracion: expVal ? expVal.replace('T', ' ') + ':00' : null,
        descripcion: document.getElementById('couponDesc').value
      })
    });
    e.target.reset();
    await loadCoupons();
    await loadAuditHistory();
    showAdminAlert('Cupon creado correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

async function toggleCouponStatus(id, activo) {
  try {
    await apiRequest(`/coupons/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ activo })
    });
    await loadCoupons();
    showAdminAlert(`Cupon ${activo ? 'activado' : 'desactivado'}.`, 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
}

async function deleteCoupon(id) {
  if (!confirm('Deseas eliminar este cupon?')) return;
  try {
    await apiRequest(`/coupons/${id}`, { method: 'DELETE' });
    await loadCoupons();
    showAdminAlert('Cupon eliminado correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
}

async function loadInventoryHistory() {
  if (!hasPerm('INVENTARIO_VER')) return;
  const res = await apiRequest('/orders/history/inventory?limit=30');
  document.getElementById('inventoryHistoryTable').innerHTML = res.data.map((m) => `
    <tr>
      <td>${formatDate(m.creado_en)}</td>
      <td>${m.libro_titulo}</td>
      <td><span class="badge bg-secondary">${m.tipo_movimiento}</span></td>
      <td>${m.cantidad}</td>
      <td>${m.stock_anterior}</td>
      <td>${m.stock_nuevo}</td>
      <td>${m.motivo || '-'}</td>
    </tr>
  `).join('');
}

async function loadAuditHistory() {
  if (!hasPerm('AUDITORIA_VER')) return;
  const res = await apiRequest('/orders/history/audit?limit=30');
  document.getElementById('auditHistoryTable').innerHTML = res.data.map((a) => `
    <tr>
      <td>${formatDate(a.creado_en)}</td>
      <td>${a.usuario_email || 'Sistema'}</td>
      <td><strong>${a.accion}</strong></td>
      <td>${a.entidad}</td>
      <td>${a.ip_origen || '-'}</td>
    </tr>
  `).join('');
}

initSidebarControls();

if (checkAdminSession()) {
  loadDashboard();
  loadMetaSelects();
  loadRolesAndPermissions();
  loadAdminBooks();
  loadUsers();
  loadAdminOrders();
  loadAdminRentals();
  loadCoupons();
  loadInventoryHistory();
  loadAuditHistory();
}
