const adminAlert = document.getElementById('adminAlert');
let cachedUsers = [];
let cachedRoles = [];
let cachedAllPermissions = [];
let cachedMeta = { categorias: [], autores: [], editoriales: [], formatos: [] };
let salesChartInstance = null;
let categoryChartInstance = null;

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

function checkAdminSession() {
  const user = getStoredUser();
  if (!getToken() || !user || !hasPerm('PANEL_ADMIN_ACCESO')) {
    window.location.href = 'index.html';
    return false;
  }
  document.getElementById('adminRoleLabel').textContent = `Panel Administrativo (${user.rol})`;
  applyTabPermissions();
  return true;
}

function applyTabPermissions() {
  let firstVisibleActivated = false;
  document.querySelectorAll('#adminTabs .nav-item').forEach((item) => {
    const reqs = (item.dataset.perm || '').split(',').filter(Boolean);
    const allowed = reqs.length === 0 || reqs.some((p) => hasPerm(p));
    if (!allowed) {
      item.classList.add('d-none');
    } else if (!firstVisibleActivated) {
      firstVisibleActivated = true;
      const btn = item.querySelector('button');
      if (btn) new bootstrap.Tab(btn).show();
    }
  });
}

// --- Dashboard y Reportes ---

async function loadDashboard() {
  if (!hasPerm('DASHBOARD_VER')) return;
  try {
    const res = await apiRequest('/dashboard/summary');
    const { kpis, alertas, graficas } = res.data;

    document.getElementById('kpiCards').innerHTML = `
      <div class="col-6 col-lg-3">
        <div class="card card-pds shadow-sm"><div class="card-body">
          <div class="small text-muted">Ingresos Totales</div>
          <div class="fs-4 fw-bold text-primary">${formatCurrency(kpis.ingresos_totales)}</div>
        </div></div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card card-pds shadow-sm"><div class="card-body">
          <div class="small text-muted">Pedidos</div>
          <div class="fs-4 fw-bold">${kpis.total_pedidos} <small class="fs-6 text-warning">(${kpis.pedidos_pendientes} pend.)</small></div>
        </div></div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card card-pds shadow-sm"><div class="card-body">
          <div class="small text-muted">Alquileres Activos</div>
          <div class="fs-4 fw-bold text-success">${kpis.alquileres_activos} <small class="fs-6 text-danger">(${kpis.alquileres_vencidos} venc.)</small></div>
        </div></div>
      </div>
      <div class="col-6 col-lg-3">
        <div class="card card-pds shadow-sm"><div class="card-body">
          <div class="small text-muted">Catalogo / Usuarios</div>
          <div class="fs-4 fw-bold">${kpis.total_libros} <small class="fs-6 text-muted">/ ${kpis.total_usuarios} usr.</small></div>
        </div></div>
      </div>
    `;

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
          datasets: [{ label: 'Ventas (COP)', data: graficas.ventas_mes.map((v) => Number(v.total)), backgroundColor: '#142D4E' }]
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

async function loadAdminBooks() {
  if (!hasPerm('CATALOGO_CREAR') && !hasPerm('CATALOGO_EDITAR')) return;
  const res = await apiRequest('/books?limit=50');
  const tbody = document.getElementById('adminBooksTable');
  tbody.innerHTML = res.data.items.map((b) => `
    <tr>
      <td>
        ${b.portada_url
          ? `<img src="${b.portada_url}" alt="${b.titulo}" class="book-thumb">`
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
        <button class="btn btn-sm btn-outline-primary" onclick="editBook('${b.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteBook('${b.id}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function updateCoverPreview(url) {
  const preview = document.getElementById('bookCoverPreview');
  if (url && url.trim()) {
    preview.src = url.trim();
    preview.classList.remove('d-none');
  } else {
    preview.src = '';
    preview.classList.add('d-none');
  }
}

document.getElementById('bookPortadaUrl').addEventListener('input', (e) => updateCoverPreview(e.target.value));

function prepareNewBook() {
  document.getElementById('bookModalTitle').textContent = 'Registrar Libro';
  document.getElementById('bookForm').reset();
  document.getElementById('bookId').value = '';
  document.getElementById('bookDiasAlquiler').value = 15;
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
    await loadAdminBooks();
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
    await loadAdminBooks();
    await loadMetaSelects();
    await loadInventoryHistory();
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

async function loadAdminOrders() {
  if (!hasPerm('PEDIDOS_VER_TODOS')) return;
  const res = await apiRequest('/orders');
  const tbody = document.getElementById('adminOrdersTable');
  const states = ['PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];

  tbody.innerHTML = res.data.map((o) => `
    <tr>
      <td><strong>${o.numero_orden}</strong></td>
      <td>${o.cliente_nombre} ${o.cliente_apellido}<br><small class="text-muted">${o.cliente_email}</small></td>
      <td>${formatDate(o.creado_en)}</td>
      <td>${formatCurrency(o.total)}</td>
      <td><span class="badge bg-primary">${o.estado}</span></td>
      <td>
        <a href="factura.html?orderId=${o.id}" target="_blank" class="btn btn-sm btn-outline-primary">
          <i class="bi bi-receipt"></i> ${o.numero_factura || 'Ver'}
        </a>
      </td>
      <td>
        <select class="form-select form-select-sm" onchange="changeOrderStatus('${o.id}', this.value)">
          ${states.map((s) => `<option value="${s}" ${s === o.estado ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

async function changeOrderStatus(orderId, estado) {
  try {
    await apiRequest(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado, comentario: 'Actualizacion desde panel administrativo' })
    });
    showAdminAlert('Estado del pedido actualizado.', 'success');
    await loadAdminOrders();
    await loadAuditHistory();
  } catch (error) { showAdminAlert(error.message, 'danger'); }
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

if (checkAdminSession()) {
  loadDashboard();
  loadMetaSelects();
  loadRolesAndPermissions();
  loadAdminBooks();
  loadUsers();
  loadAdminOrders();
  loadInventoryHistory();
  loadAuditHistory();
}
