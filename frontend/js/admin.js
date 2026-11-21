const adminAlert = document.getElementById('adminAlert');

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

async function loadMetaSelects() {
  const res = await apiRequest('/books/meta');
  const { categorias, autores, editoriales } = res.data;

  const fillSelect = (id, list) => {
    const el = document.getElementById(id);
    el.innerHTML = '<option value="">Seleccionar...</option>';
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
}

async function loadAdminBooks() {
  const res = await apiRequest('/books?limit=50');
  const tbody = document.getElementById('adminBooksTable');
  tbody.innerHTML = res.data.items.map((b) => `
    <tr>
      <td class="fw-semibold">${b.titulo}</td>
      <td>${b.autor_nombre || '-'}</td>
      <td><span class="badge bg-dark">${b.formato}</span></td>
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

function prepareNewBook() {
  document.getElementById('bookModalTitle').textContent = 'Registrar Libro';
  document.getElementById('bookForm').reset();
  document.getElementById('bookId').value = '';
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
  document.getElementById('bookFormato').value = b.formato;
  document.getElementById('bookPrecioVenta').value = b.precio_venta;
  document.getElementById('bookPrecioAlquiler').value = b.precio_alquiler;
  document.getElementById('bookStock').value = b.stock_fisico;
  document.getElementById('bookSinopsis').value = b.sinopsis || '';
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
    formato: document.getElementById('bookFormato').value,
    precio_venta: Number(document.getElementById('bookPrecioVenta').value),
    precio_alquiler: Number(document.getElementById('bookPrecioAlquiler').value),
    stock_fisico: Number(document.getElementById('bookStock').value),
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
    await loadInventoryHistory();
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
  loadAdminOrders();
  loadInventoryHistory();
  loadAuditHistory();
}
