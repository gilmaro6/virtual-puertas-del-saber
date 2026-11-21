const adminAlert = document.getElementById('adminAlert');
let cachedUsers = [];
let cachedMeta = { categorias: [], autores: [], editoriales: [], formatos: [] };

function showAdminAlert(message, type = 'info') {
  adminAlert.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function checkAdminSession() {
  const user = getStoredUser();
  if (!getToken() || !user || user.rol !== 'ADMIN') {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

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

  document.getElementById('categoriesList').innerHTML = categorias
    .map((c) => renderParamItem('categories', c))
    .join('');

  document.getElementById('authorsList').innerHTML = autores
    .map((a) => renderParamItem('authors', a, a.nacionalidad ? `(${a.nacionalidad})` : ''))
    .join('');

  document.getElementById('publishersList').innerHTML = editoriales
    .map((e) => renderParamItem('publishers', e, e.pais ? `(${e.pais})` : ''))
    .join('');

  document.getElementById('formatsList').innerHTML = formatos
    .map((f) => renderParamItem('formats', f, `[${f.codigo}]`))
    .join('');
}

function openEditParam(type, id) {
  const mapList = {
    categories: cachedMeta.categorias,
    authors: cachedMeta.autores,
    publishers: cachedMeta.editoriales,
    formats: cachedMeta.formatos
  };
  const item = (mapList[type] || []).find((x) => x.id === id);
  if (!item) return;

  if (Number(item.libros_asociados) > 0) {
    showAdminAlert(
      `No se puede modificar "${item.nombre}" porque tiene ${item.libros_asociados} libro(s) asociado(s).`,
      'warning'
    );
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

async function loadAdminBooks() {
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

document.getElementById('bookPortadaUrl').addEventListener('input', (e) => {
  updateCoverPreview(e.target.value);
});

function prepareNewBook() {
  document.getElementById('bookModalTitle').textContent = 'Registrar Libro';
  document.getElementById('bookForm').reset();
  document.getElementById('bookId').value = '';
  updateCoverPreview('');
}

async function editBook(id) {
  const res = await apiRequest(`/books/${id}`);
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
  document.getElementById('bookPortadaUrl').value = b.portada_url || '';
  document.getElementById('bookSinopsis').value = b.sinopsis || '';
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
    portada_url: document.getElementById('bookPortadaUrl').value.trim() || null,
    sinopsis: document.getElementById('bookSinopsis').value
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
      body: JSON.stringify({
        nombre: document.getElementById('catNombre').value,
        descripcion: document.getElementById('catDescripcion').value
      })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Categoria agregada correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

document.getElementById('authorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/books/authors', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('authorNombre').value,
        nacionalidad: document.getElementById('authorNacionalidad').value
      })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Autor agregado correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

document.getElementById('publisherForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/books/publishers', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('pubNombre').value,
        pais: document.getElementById('pubPais').value
      })
    });
    e.target.reset();
    await loadMetaSelects();
    showAdminAlert('Editorial agregada correctamente.', 'success');
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
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
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

async function loadUsers(q = '') {
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
        <button class="btn btn-sm btn-outline-primary" onclick="openEditUser('${u.id}')" title="Editar datos">
          <i class="bi bi-person-gear"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="openResetPassword('${u.id}')" title="Cambiar contrasena">
          <i class="bi bi-key"></i>
        </button>
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
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
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
      body: JSON.stringify({
        nueva_contrasena: document.getElementById('resetNewPassword').value
      })
    });
    bootstrap.Modal.getInstance(document.getElementById('userPasswordModal')).hide();
    showAdminAlert('Contrasena restablecida correctamente.', 'success');
    await loadAuditHistory();
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
});

async function loadAdminOrders() {
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
  } catch (error) {
    showAdminAlert(error.message, 'danger');
  }
}

async function loadInventoryHistory() {
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
  loadMetaSelects();
  loadAdminBooks();
  loadUsers();
  loadAdminOrders();
  loadInventoryHistory();
  loadAuditHistory();
}
