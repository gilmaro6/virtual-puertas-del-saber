const booksGrid = document.getElementById('booksGrid');
const resultsCount = document.getElementById('resultsCount');
const alertContainer = document.getElementById('alertContainer');
const categoryFilter = document.getElementById('categoryFilter');
const formatFilter = document.getElementById('formatFilter');
const searchInput = document.getElementById('searchInput');

function showAlert(message, type = 'info', target = alertContainer) {
  if (target !== alertContainer) {
    target.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    return;
  }

  const toastEl = document.getElementById('liveToast');
  const toastBody = document.getElementById('liveToastBody');
  const bgMap = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    warning: 'text-bg-warning',
    info: 'text-bg-dark'
  };

  toastEl.className = `toast align-items-center border-0 shadow ${bgMap[type] || 'text-bg-dark'}`;
  toastBody.innerHTML = message;
  bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 4000 }).show();
}

function updateAuthUI() {
  const user = getStoredUser();
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  const userNameBtn = document.getElementById('userNameBtn');
  const adminLink = document.getElementById('adminLink');

  if (user) {
    authButtons.classList.add('d-none');
    userMenu.classList.remove('d-none');
    userNameBtn.textContent = `${user.nombre} (${user.rol})`;
    if (user.rol === 'ADMIN') {
      adminLink.classList.remove('d-none');
    } else {
      adminLink.classList.add('d-none');
    }
  } else {
    authButtons.classList.remove('d-none');
    userMenu.classList.add('d-none');
    adminLink.classList.add('d-none');
  }
}

async function loadMetadata() {
  try {
    const res = await apiRequest('/books/meta');
    const categories = res.data.categorias || [];
    const formats = res.data.formatos || [];

    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nombre;
      categoryFilter.appendChild(opt);
    });

    formats.forEach((fmt) => {
      const opt = document.createElement('option');
      opt.value = fmt.id;
      opt.textContent = fmt.nombre;
      formatFilter.appendChild(opt);
    });
  } catch (error) {
    showAlert(error.message, 'warning');
  }
}

async function loadBooks() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.append('q', searchInput.value.trim());
  if (categoryFilter.value) params.append('categoria', categoryFilter.value);
  if (formatFilter.value) params.append('formato', formatFilter.value);

  try {
    const res = await apiRequest(`/books?${params.toString()}`);
    const items = res.data.items || [];
    resultsCount.textContent = `${items.length} libro(s) encontrado(s)`;

    if (items.length === 0) {
      booksGrid.innerHTML = '<div class="col-12"><div class="alert alert-light border text-center">No se encontraron libros con los filtros seleccionados.</div></div>';
      return;
    }

    booksGrid.innerHTML = items.map((book) => `
      <div class="col-12 col-sm-6 col-md-4 col-xl-3">
        <div class="card h-100 book-card">
          <div class="book-cover-wrapper">
            ${book.portada_url
              ? `<img src="${book.portada_url}" alt="${book.titulo}" class="book-cover-img" onerror="this.outerHTML='<div class=\\'book-cover-placeholder\\'><i class=\\'bi bi-journal-bookmark fs-1 mb-2\\'></i><span class=\\'small\\'>Sin portada</span></div>'">`
              : `<div class="book-cover-placeholder"><i class="bi bi-journal-bookmark fs-1 mb-2"></i><span class="small fw-medium">${book.categoria_nombre || 'Danzara'}</span></div>`
            }
            <span class="badge badge-formato">${book.formato}</span>
          </div>
          <div class="card-body p-3 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start mb-1">
              <span class="badge bg-secondary-subtle text-dark">${book.categoria_nombre || 'General'}</span>
              <span class="small text-warning fw-semibold"><i class="bi bi-star-fill"></i> ${book.calificacion_promedio}</span>
            </div>
            <h6 class="card-title book-title fw-bold mb-1">${book.titulo}</h6>
            <p class="text-muted small mb-1">${book.autor_nombre || 'Autor por definir'}</p>
            <p class="card-text small text-secondary flex-grow-1 mb-2">${book.sinopsis ? book.sinopsis.slice(0, 75) + '...' : ''}</p>
            <div class="border-top pt-2 mt-auto">
              <div class="d-flex justify-content-between small mb-2">
                <span>Compra: <strong class="price-tag">${formatCurrency(book.precio_venta)}</strong></span>
                <span>Alquiler: <strong>${formatCurrency(book.precio_alquiler)}</strong></span>
              </div>
              <div class="d-flex gap-1">
                <button class="btn btn-pds btn-sm flex-grow-1" onclick="addToCart('${book.id}', 'COMPRA', true)">
                  <i class="bi bi-bag-check"></i> Comprar
                </button>
                <button class="btn btn-outline-primary btn-sm" onclick="addToCart('${book.id}', 'ALQUILER', true)">
                  Alquilar
                </button>
                <button class="btn btn-gold btn-sm" onclick="addToCart('${book.id}', 'COMPRA', false)" title="Agregar al carrito y seguir viendo">
                  <i class="bi bi-cart-plus"></i>
                </button>
                <button class="btn btn-outline-secondary btn-sm" onclick="openBookDetail('${book.id}')" title="Ver detalle">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function loadCart() {
  const badge = document.getElementById('cartBadge');
  const container = document.getElementById('cartItemsContainer');
  const totalEl = document.getElementById('cartTotal');

  if (!getToken()) {
    badge.textContent = '0';
    container.innerHTML = '<p class="text-muted">Inicia sesion para gestionar tu carrito.</p>';
    totalEl.textContent = '$0';
    return;
  }

  try {
    const res = await apiRequest('/cart');
    const { items, total } = res.data;
    badge.textContent = items.reduce((acc, item) => acc + item.cantidad, 0);
    totalEl.textContent = formatCurrency(total);

    if (items.length === 0) {
      container.innerHTML = '<p class="text-muted text-center my-4">Tu carrito esta vacio.</p>';
      return;
    }

    container.innerHTML = items.map((item) => `
      <div class="card mb-2 border">
        <div class="card-body p-2">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="fw-semibold small">${item.titulo}</div>
              <span class="badge bg-info-subtle text-dark">${item.tipo_operacion}</span>
              <span class="small text-muted ms-1">${formatCurrency(item.precio_unitario)} c/u</span>
            </div>
            <button class="btn btn-sm btn-link text-danger p-0" onclick="removeCartItem('${item.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-2">
            <div class="input-group input-group-sm" style="width: 100px;">
              <button class="btn btn-outline-secondary" onclick="changeCartQty('${item.id}', ${item.cantidad - 1})">-</button>
              <input type="text" class="form-control text-center" value="${item.cantidad}" readonly>
              <button class="btn btn-outline-secondary" onclick="changeCartQty('${item.id}', ${item.cantidad + 1})">+</button>
            </div>
            <strong class="small">${formatCurrency(item.subtotal)}</strong>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    container.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

async function addToCart(bookId, tipo, openCart = false) {
  if (!getToken()) {
    const modal = new bootstrap.Modal(document.getElementById('authModal'));
    modal.show();
    return;
  }

  try {
    await apiRequest('/cart', {
      method: 'POST',
      body: JSON.stringify({ libro_id: bookId, tipo_operacion: tipo, cantidad: 1 })
    });
    await loadCart();
    if (openCart) {
      bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cartOffcanvas')).show();
    } else {
      showAlert('Libro agregado al carrito.', 'success');
    }
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function changeCartQty(itemId, qty) {
  if (qty < 1) return removeCartItem(itemId);
  try {
    await apiRequest(`/cart/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ cantidad: qty })
    });
    await loadCart();
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function removeCartItem(itemId) {
  try {
    await apiRequest(`/cart/${itemId}`, { method: 'DELETE' });
    await loadCart();
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

async function openBookDetail(bookId) {
  const body = document.getElementById('bookDetailBody');
  const titleEl = document.getElementById('detailTitle');
  const modal = new bootstrap.Modal(document.getElementById('bookDetailModal'));

  body.innerHTML = '<p class="text-muted">Cargando informacion...</p>';
  modal.show();

  try {
    const res = await apiRequest(`/books/${bookId}`);
    const book = res.data;
    titleEl.textContent = book.titulo;

    const reviewsHtml = (book.resenas || []).length > 0
      ? book.resenas.map((r) => `
          <div class="border rounded p-2 mb-2">
            <div class="d-flex justify-content-between small fw-semibold">
              <span>${r.nombre} ${r.apellido}</span>
              <span class="text-warning">${'★'.repeat(r.calificacion)}</span>
            </div>
            <p class="small mb-0 text-muted">${r.comentario || ''}</p>
          </div>
        `).join('')
      : '<p class="small text-muted">Aun no hay resenas para este libro.</p>';

    body.innerHTML = `
      <div class="row g-3 mb-3">
        ${book.portada_url ? `<div class="col-md-4"><img src="${book.portada_url}" alt="${book.titulo}" class="img-fluid rounded border"></div>` : ''}
        <div class="${book.portada_url ? 'col-md-8' : 'col-12'}">
          <p><strong>Autor:</strong> ${book.autor_nombre || 'N/A'} | <strong>Editorial:</strong> ${book.editorial_nombre || 'N/A'}</p>
          <p><strong>ISBN:</strong> ${book.isbn || 'N/A'} | <strong>Formato:</strong> ${book.formato} | <strong>Stock fisico:</strong> ${book.stock_fisico}</p>
          <p>${book.sinopsis || 'Sin descripcion disponible.'}</p>
        </div>
      </div>
      <hr>
      <h6 class="fw-bold">Resenas (${book.total_resenas})</h6>
      <div class="mb-3">${reviewsHtml}</div>
      ${getToken() ? `
        <form onsubmit="submitReview(event, '${book.id}')" class="border-top pt-3">
          <div class="row g-2">
            <div class="col-md-3">
              <select class="form-select form-select-sm" id="reviewScore" required>
                <option value="5">5 Estrellas</option>
                <option value="4">4 Estrellas</option>
                <option value="3">3 Estrellas</option>
                <option value="2">2 Estrellas</option>
                <option value="1">1 Estrella</option>
              </select>
            </div>
            <div class="col-md-7">
              <input type="text" class="form-control form-control-sm" id="reviewComment" placeholder="Escribe tu comentario...">
            </div>
            <div class="col-md-2">
              <button type="submit" class="btn btn-pds btn-sm w-100">Enviar</button>
            </div>
          </div>
        </form>
      ` : '<p class="small text-muted">Inicia sesion para dejar una resena.</p>'}
    `;
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

async function submitReview(event, bookId) {
  event.preventDefault();
  try {
    await apiRequest(`/books/${bookId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        calificacion: Number(document.getElementById('reviewScore').value),
        comentario: document.getElementById('reviewComment').value
      })
    });
    bootstrap.Modal.getInstance(document.getElementById('bookDetailModal')).hide();
    await loadBooks();
    showAlert('Resena registrada correctamente.', 'success');
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const authAlert = document.getElementById('authAlert');
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      })
    });
    saveSession(res.data.token, res.data.user);
    bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
    updateAuthUI();
    await loadCart();
    showAlert(`Bienvenido, ${res.data.user.nombre}.`, 'success');
  } catch (error) {
    showAlert(error.message, 'danger', authAlert);
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const authAlert = document.getElementById('authAlert');
  try {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('regNombre').value,
        apellido: document.getElementById('regApellido').value,
        email: document.getElementById('regEmail').value,
        telefono: document.getElementById('regTelefono').value,
        password: document.getElementById('regPassword').value
      })
    });
    saveSession(res.data.token, res.data.user);
    bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
    updateAuthUI();
    await loadCart();
    showAlert('Cuenta creada correctamente.', 'success');
  } catch (error) {
    showAlert(error.message, 'danger', authAlert);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // Continuar cierre de sesion local
  }
  clearSession();
  updateAuthUI();
  await loadCart();
  showAlert('Sesion cerrada.', 'info');
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!getToken()) {
    showAlert('Debes iniciar sesion para confirmar un pedido.', 'warning');
    return;
  }

  try {
    const res = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        metodo_pago: document.getElementById('paymentMethod').value,
        direccion_envio: document.getElementById('shippingAddress').value,
        ciudad: document.getElementById('shippingCity').value
      })
    });
    bootstrap.Offcanvas.getInstance(document.getElementById('cartOffcanvas')).hide();
    await loadCart();
    await loadBooks();

    document.getElementById('orderSuccessMessage').innerHTML =
      `Tu pedido <strong>${res.data.numero_orden}</strong> fue registrado por <strong>${formatCurrency(res.data.total)}</strong>.`;
    document.getElementById('orderSuccessInvoiceLink').href = `factura.html?orderId=${res.data.id}`;
    new bootstrap.Modal(document.getElementById('orderSuccessModal')).show();
  } catch (error) {
    showAlert(error.message, 'danger');
  }
});

document.getElementById('openAccountBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  const body = document.getElementById('accountModalBody');
  const modal = new bootstrap.Modal(document.getElementById('accountModal'));
  body.innerHTML = '<p class="text-muted">Cargando historial...</p>';
  modal.show();

  try {
    const [ordersRes, rentalsRes] = await Promise.all([
      apiRequest('/orders/my'),
      apiRequest('/orders/rentals/my')
    ]);

    const ordersHtml = ordersRes.data.length > 0
      ? ordersRes.data.map((o) => `
          <tr>
            <td><strong>${o.numero_orden}</strong></td>
            <td>${formatDate(o.creado_en)}</td>
            <td><span class="badge bg-primary">${o.estado}</span></td>
            <td>${o.metodo_pago || '-'}</td>
            <td>${formatCurrency(o.total)}</td>
            <td>
              <a href="factura.html?orderId=${o.id}" target="_blank" class="btn btn-sm btn-outline-primary">
                <i class="bi bi-receipt"></i> ${o.numero_factura || 'Ver'}
              </a>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" class="text-center text-muted">No tienes pedidos registrados.</td></tr>';

    const rentalsHtml = rentalsRes.data.length > 0
      ? rentalsRes.data.map((r) => `
          <tr>
            <td>${r.titulo}</td>
            <td>${formatDate(r.fecha_inicio)}</td>
            <td>${formatDate(r.fecha_vencimiento)}</td>
            <td><span class="badge bg-${r.estado === 'ACTIVO' ? 'success' : 'secondary'}">${r.estado}</span></td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="text-center text-muted">No tienes alquileres activos.</td></tr>';

    body.innerHTML = `
      <h6 class="fw-bold">Mis Pedidos</h6>
      <div class="table-responsive mb-4">
        <table class="table table-sm table-bordered">
          <thead><tr><th>Orden</th><th>Fecha</th><th>Estado</th><th>Pago</th><th>Total</th><th>Factura</th></tr></thead>
          <tbody>${ordersHtml}</tbody>
        </table>
      </div>
      <h6 class="fw-bold">Mis Alquileres y Prestamos</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <thead><tr><th>Libro</th><th>Inicio</th><th>Vencimiento</th><th>Estado</th></tr></thead>
          <tbody>${rentalsHtml}</tbody>
        </table>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
});

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loadBooks();
});
document.getElementById('applyFiltersBtn').addEventListener('click', loadBooks);
document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  searchInput.value = '';
  categoryFilter.value = '';
  formatFilter.value = '';
  loadBooks();
});

updateAuthUI();
loadMetadata();
loadBooks();
loadCart();
