const booksGrid = document.getElementById('booksGrid');
const resultsCount = document.getElementById('resultsCount');
const alertContainer = document.getElementById('alertContainer');
const categoryFilter = document.getElementById('categoryFilter');
const formatFilter = document.getElementById('formatFilter');
const sortFilter = document.getElementById('sortFilter');
const searchInput = document.getElementById('searchInput');
const categoryPills = document.getElementById('categoryPills');
const booksPagination = document.getElementById('booksPagination');

let currentPage = 1;
const PAGE_LIMIT = 8;
let favoriteBookIds = new Set();
let searchDebounceTimer = null;
let currentCartSubtotal = 0;
let appliedCoupon = null;

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
    const canAdmin = user.rol === 'ADMIN' || (user.permisos || []).includes('PANEL_ADMIN_ACCESO');
    if (canAdmin) {
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

function syncCategoryPills() {
  const selected = String(categoryFilter.value || '');
  categoryPills.querySelectorAll('.category-pill').forEach((btn) => {
    btn.classList.toggle('active', String(btn.dataset.cat) === selected);
  });
}

function selectCategoryPill(catId) {
  categoryFilter.value = catId;
  syncCategoryPills();
  currentPage = 1;
  loadBooks();
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

    categoryPills.innerHTML = [
      `<button type="button" class="category-pill active" data-cat="" onclick="selectCategoryPill('')"><i class="bi bi-grid"></i> Todas</button>`,
      ...categories.map((cat) => `
        <button type="button" class="category-pill" data-cat="${cat.id}" onclick="selectCategoryPill('${cat.id}')">
          ${cat.nombre}
        </button>
      `)
    ].join('');
  } catch (error) {
    showAlert(error.message, 'warning');
  }
}

async function loadFavoritesIds() {
  const badge = document.getElementById('favCountBadge');
  if (!getToken()) {
    favoriteBookIds = new Set();
    if (badge) badge.textContent = '0';
    return;
  }

  try {
    const res = await apiRequest('/books/favorites/my');
    const items = res.data || [];
    favoriteBookIds = new Set(items.map((item) => item.id));
    if (badge) badge.textContent = String(favoriteBookIds.size);
  } catch {
    favoriteBookIds = new Set();
    if (badge) badge.textContent = '0';
  }
}

async function toggleFavorite(bookId) {
  if (!getToken()) {
    new bootstrap.Modal(document.getElementById('authModal')).show();
    return;
  }

  try {
    const res = await apiRequest(`/books/${bookId}/favorite`, { method: 'POST' });
    const isFav = Boolean(res.data.isFavorite);

    if (isFav) {
      favoriteBookIds.add(bookId);
      showAlert('Libro agregado a tus favoritos.', 'success');
    } else {
      favoriteBookIds.delete(bookId);
      showAlert('Libro eliminado de tus favoritos.', 'info');
    }

    const badge = document.getElementById('favCountBadge');
    if (badge) badge.textContent = String(favoriteBookIds.size);

    document.querySelectorAll(`.fav-btn[data-book-id="${bookId}"]`).forEach((btn) => {
      btn.classList.toggle('is-fav', isFav);
      btn.title = isFav ? 'Quitar de favoritos' : 'Guardar en favoritos';
      const icon = btn.querySelector('i');
      if (icon) icon.className = `bi bi-heart${isFav ? '-fill' : ''}`;
    });
  } catch (error) {
    showAlert(error.message, 'danger');
  }
}

function renderBooksSkeleton() {
  booksGrid.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="col-12 col-sm-6 col-md-4 col-xl-3">
      <div class="card h-100 book-card p-3">
        <div class="skeleton-box mb-3" style="height: 165px;"></div>
        <div class="skeleton-box mb-2" style="height: 14px; width: 45%;"></div>
        <div class="skeleton-box mb-2" style="height: 18px; width: 90%;"></div>
        <div class="skeleton-box mb-3" style="height: 14px; width: 65%;"></div>
        <div class="skeleton-box mt-auto" style="height: 34px; width: 100%;"></div>
      </div>
    </div>
  `).join('');
}

function renderPagination(pagination) {
  if (!pagination || pagination.totalPages <= 1) {
    booksPagination.innerHTML = '';
    return;
  }

  const { page, totalPages } = pagination;
  const items = [];

  items.push(`
    <li class="page-item ${page <= 1 ? 'disabled' : ''}">
      <button class="page-link" type="button" onclick="goToPage(${page - 1})">Anterior</button>
    </li>
  `);

  for (let p = 1; p <= totalPages; p += 1) {
    items.push(`
      <li class="page-item ${p === page ? 'active' : ''}">
        <button class="page-link" type="button" onclick="goToPage(${p})">${p}</button>
      </li>
    `);
  }

  items.push(`
    <li class="page-item ${page >= totalPages ? 'disabled' : ''}">
      <button class="page-link" type="button" onclick="goToPage(${page + 1})">Siguiente</button>
    </li>
  `);

  booksPagination.innerHTML = items.join('');
}

function goToPage(page) {
  if (page < 1) return;
  currentPage = page;
  loadBooks();
  window.scrollTo({ top: 180, behavior: 'smooth' });
}

async function loadBooks() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.append('q', searchInput.value.trim());
  if (categoryFilter.value) params.append('categoria', categoryFilter.value);
  if (formatFilter.value) params.append('formato', formatFilter.value);
  if (sortFilter.value) params.append('sort', sortFilter.value);
  params.append('page', String(currentPage));
  params.append('limit', String(PAGE_LIMIT));

  renderBooksSkeleton();

  try {
    const res = await apiRequest(`/books?${params.toString()}`);
    const items = res.data.items || [];
    const pagination = res.data.pagination || { total: items.length, page: 1, totalPages: 1 };

    resultsCount.textContent = pagination.total > 0
      ? `Mostrando ${items.length} de ${pagination.total} libro(s)`
      : '0 libros encontrados';

    renderPagination(pagination);

    if (items.length === 0) {
      booksGrid.innerHTML = '<div class="col-12"><div class="alert alert-light border text-center">No se encontraron libros con los filtros seleccionados.</div></div>';
      return;
    }

    booksGrid.innerHTML = items.map((book) => {
      const isFav = favoriteBookIds.has(book.id);
      return `
        <div class="col-12 col-sm-6 col-md-4 col-xl-3">
          <div class="card h-100 book-card">
            <div class="book-cover-wrapper">
              ${book.portada_url
                ? `<img src="${resolveAssetUrl(book.portada_url)}" alt="${book.titulo}" class="book-cover-img" onerror="this.outerHTML='<div class=\\'book-cover-placeholder\\'><i class=\\'bi bi-journal-bookmark fs-1 mb-2\\'></i><span class=\\'small\\'>Sin portada</span></div>'">`
                : `<div class="book-cover-placeholder"><i class="bi bi-journal-bookmark fs-1 mb-2"></i><span class="small fw-medium">${book.categoria_nombre || 'Danzara'}</span></div>`
              }
              <button type="button" class="fav-btn ${isFav ? 'is-fav' : ''}" data-book-id="${book.id}" onclick="toggleFavorite('${book.id}')" title="${isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}">
                <i class="bi bi-heart${isFav ? '-fill' : ''}"></i>
              </button>
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
      `;
    }).join('');
  } catch (error) {
    booksGrid.innerHTML = '';
    booksPagination.innerHTML = '';
    showAlert(error.message, 'danger');
  }
}

function updateCartTotalsUI() {
  const subtotalEl = document.getElementById('cartSubtotal');
  const discountRow = document.getElementById('cartDiscountRow');
  const discountVal = document.getElementById('cartDiscountValue');
  const totalEl = document.getElementById('cartTotal');
  const removeBtn = document.getElementById('removeCouponBtn');

  subtotalEl.textContent = formatCurrency(currentCartSubtotal);

  if (appliedCoupon && currentCartSubtotal > 0) {
    const desc = Math.min(Number(appliedCoupon.descuento) || 0, currentCartSubtotal);
    discountRow.classList.remove('d-none');
    discountVal.textContent = `- ${formatCurrency(desc)}`;
    totalEl.textContent = formatCurrency(Math.max(currentCartSubtotal - desc, 0));
    removeBtn.classList.remove('d-none');
  } else {
    discountRow.classList.add('d-none');
    totalEl.textContent = formatCurrency(currentCartSubtotal);
    removeBtn.classList.add('d-none');
  }
}

function clearAppliedCoupon() {
  appliedCoupon = null;
  document.getElementById('couponInput').value = '';
  document.getElementById('couponFeedback').innerHTML = '';
  updateCartTotalsUI();
}

async function loadCart() {
  const badge = document.getElementById('cartBadge');
  const container = document.getElementById('cartItemsContainer');

  if (!getToken()) {
    badge.textContent = '0';
    container.innerHTML = '<p class="text-muted">Inicia sesion para gestionar tu carrito.</p>';
    currentCartSubtotal = 0;
    clearAppliedCoupon();
    return;
  }

  try {
    const res = await apiRequest('/cart');
    const { items, total } = res.data;
    badge.textContent = items.reduce((acc, item) => acc + item.cantidad, 0);
    currentCartSubtotal = Number(total) || 0;

    if (items.length === 0) {
      container.innerHTML = '<p class="text-muted text-center my-4">Tu carrito esta vacio.</p>';
      clearAppliedCoupon();
      return;
    }

    if (appliedCoupon) {
      try {
        const valRes = await apiRequest('/coupons/validate', {
          method: 'POST',
          body: JSON.stringify({ codigo: appliedCoupon.codigo, subtotal: currentCartSubtotal })
        });
        appliedCoupon = valRes.data;
        document.getElementById('couponFeedback').innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Cupon <strong>${appliedCoupon.codigo}</strong> activo (-${formatCurrency(appliedCoupon.descuento)}).</span>`;
      } catch (err) {
        appliedCoupon = null;
        document.getElementById('couponFeedback').innerHTML = `<span class="text-warning">${err.message}</span>`;
      }
    }
    updateCartTotalsUI();

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
        ${book.portada_url ? `<div class="col-md-4"><img src="${resolveAssetUrl(book.portada_url)}" alt="${book.titulo}" class="img-fluid rounded border"></div>` : ''}
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

let currentLoginCaptchaToken = '';
let currentRegCaptchaToken = '';
let currentRecoverCaptchaToken = '';

async function loadAuthCaptcha(mode = 'both') {
  try {
    if (mode === 'login' || mode === 'both') {
      const res = await apiRequest('/auth/captcha');
      currentLoginCaptchaToken = res.data.captchaToken;
      document.getElementById('loginCaptchaQuestion').textContent = res.data.question;
      document.getElementById('loginCaptchaAnswer').value = '';
    }
    if (mode === 'register' || mode === 'both') {
      const res = await apiRequest('/auth/captcha');
      currentRegCaptchaToken = res.data.captchaToken;
      document.getElementById('regCaptchaQuestion').textContent = res.data.question;
      document.getElementById('regCaptchaAnswer').value = '';
    }
    if (mode === 'recover' || mode === 'both') {
      const res = await apiRequest('/auth/captcha');
      currentRecoverCaptchaToken = res.data.captchaToken;
      document.getElementById('recoverCaptchaQuestion').textContent = res.data.question;
      document.getElementById('recoverCaptchaAnswer').value = '';
    }
  } catch {
    // Silenciar si falla al abrir inicialmente
  }
}

document.getElementById('authModal').addEventListener('show.bs.modal', () => {
  document.getElementById('authAlert').innerHTML = '';
  document.getElementById('resetPasswordForm').classList.add('d-none');
  loadAuthCaptcha('both');
});
document.getElementById('refreshLoginCaptcha').addEventListener('click', () => loadAuthCaptcha('login'));
document.getElementById('refreshRegCaptcha').addEventListener('click', () => loadAuthCaptcha('register'));
document.getElementById('refreshRecoverCaptcha').addEventListener('click', () => loadAuthCaptcha('recover'));
document.getElementById('openRecoverLink').addEventListener('click', (e) => {
  e.preventDefault();
  bootstrap.Tab.getOrCreateInstance(document.getElementById('recoverTabBtn')).show();
});

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const authAlert = document.getElementById('authAlert');
  try {
    const res = await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('recoverEmail').value,
        captchaToken: currentRecoverCaptchaToken,
        captchaAnswer: document.getElementById('recoverCaptchaAnswer').value
      })
    });
    document.getElementById('resetPasswordForm').classList.remove('d-none');
    showAlert(
      `Codigo temporal generado (valido por ${res.data.expira_minutos} min). <strong>Codigo de demostracion: ${res.data.codigo_demo}</strong>`,
      'info',
      authAlert
    );
  } catch (error) {
    showAlert(error.message, 'danger', authAlert);
    loadAuthCaptcha('recover');
  }
});

document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const authAlert = document.getElementById('authAlert');
  try {
    await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('recoverEmail').value,
        codigo: document.getElementById('resetCodeInput').value,
        nuevaContrasena: document.getElementById('resetNewPassInput').value
      })
    });
    e.target.reset();
    document.getElementById('resetPasswordForm').classList.add('d-none');
    bootstrap.Tab.getOrCreateInstance(document.getElementById('loginTabBtn')).show();
    loadAuthCaptcha('login');
    showAlert('Contrasena actualizada correctamente. Ahora puedes iniciar sesion.', 'success', authAlert);
  } catch (error) {
    showAlert(error.message, 'danger', authAlert);
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const authAlert = document.getElementById('authAlert');
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value,
        captchaToken: currentLoginCaptchaToken,
        captchaAnswer: document.getElementById('loginCaptchaAnswer').value
      })
    });
    saveSession(res.data.token, res.data.user);
    bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
    updateAuthUI();
    await Promise.all([loadCart(), loadFavoritesIds()]);
    await loadBooks();
    showAlert(`Bienvenido, ${res.data.user.nombre}.`, 'success');
  } catch (error) {
    showAlert(error.message, 'danger', authAlert);
    loadAuthCaptcha('login');
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
        password: document.getElementById('regPassword').value,
        captchaToken: currentRegCaptchaToken,
        captchaAnswer: document.getElementById('regCaptchaAnswer').value
      })
    });
    saveSession(res.data.token, res.data.user);
    bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
    updateAuthUI();
    await Promise.all([loadCart(), loadFavoritesIds()]);
    await loadBooks();
    showAlert('Cuenta creada correctamente.', 'success');
  } catch (error) {
    showAlert(error.message, 'danger', authAlert);
    loadAuthCaptcha('register');
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
  await Promise.all([loadCart(), loadFavoritesIds()]);
  await loadBooks();
  showAlert('Sesion cerrada.', 'info');
});

// --- Mi Perfil ---

document.getElementById('openProfileBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  document.getElementById('profileAlert').innerHTML = '';
  document.getElementById('profilePassCurrent').value = '';
  document.getElementById('profilePassNew').value = '';

  const modal = new bootstrap.Modal(document.getElementById('profileModal'));
  modal.show();

  try {
    const res = await apiRequest('/auth/profile');
    const p = res.data;
    document.getElementById('profileEmail').textContent = p.email;
    document.getElementById('profileRole').textContent = p.rol;
    document.getElementById('profileDoc').textContent = p.documento_identidad || 'No registrado';
    document.getElementById('profileNombre').value = p.nombre || '';
    document.getElementById('profileApellido').value = p.apellido || '';
    document.getElementById('profileTelefono').value = p.telefono || '';
  } catch (error) {
    showAlert(error.message, 'danger', document.getElementById('profileAlert'));
  }
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const profileAlert = document.getElementById('profileAlert');
  const payload = {
    nombre: document.getElementById('profileNombre').value,
    apellido: document.getElementById('profileApellido').value,
    telefono: document.getElementById('profileTelefono').value
  };

  const passNew = document.getElementById('profilePassNew').value;
  if (passNew) {
    payload.passwordActual = document.getElementById('profilePassCurrent').value;
    payload.passwordNueva = passNew;
  }

  try {
    const res = await apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const updated = res.data;
    const stored = getStoredUser();
    if (stored) {
      stored.nombre = updated.nombre;
      stored.apellido = updated.apellido;
      saveSession(getToken(), stored);
      updateAuthUI();
    }
    bootstrap.Modal.getInstance(document.getElementById('profileModal')).hide();
    showAlert('Perfil actualizado correctamente.', 'success');
  } catch (error) {
    showAlert(error.message, 'danger', profileAlert);
  }
});

// --- Mis Favoritos ---

async function openFavoritesModal() {
  const body = document.getElementById('accountModalBody');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('accountModal'));
  document.querySelector('#accountModal .modal-title').textContent = 'Mis Libros Favoritos';
  body.innerHTML = '<p class="text-muted">Cargando favoritos...</p>';
  modal.show();

  try {
    const res = await apiRequest('/books/favorites/my');
    const items = res.data || [];
    favoriteBookIds = new Set(items.map((item) => item.id));
    document.getElementById('favCountBadge').textContent = String(favoriteBookIds.size);

    if (items.length === 0) {
      body.innerHTML = '<div class="alert alert-light border text-center mb-0">Aun no has guardado libros en tu lista de favoritos.</div>';
      return;
    }

    body.innerHTML = `
      <div class="row g-3">
        ${items.map((book) => `
          <div class="col-md-6">
            <div class="card border h-100">
              <div class="card-body p-2 d-flex gap-2 align-items-center">
                ${book.portada_url
                  ? `<img src="${resolveAssetUrl(book.portada_url)}" alt="${book.titulo}" class="book-thumb">`
                  : '<div class="book-thumb d-flex align-items-center justify-content-center bg-light text-muted"><i class="bi bi-book"></i></div>'
                }
                <div class="flex-grow-1 min-w-0">
                  <div class="fw-bold small text-truncate">${book.titulo}</div>
                  <div class="text-muted small text-truncate">${book.autor_nombre || 'Autor por definir'}</div>
                  <div class="small mt-1">
                    <strong class="price-tag">${formatCurrency(book.precio_venta)}</strong>
                    <span class="text-muted ms-1">| Alq: ${formatCurrency(book.precio_alquiler)}</span>
                  </div>
                </div>
                <div class="d-flex flex-column gap-1">
                  <button class="btn btn-pds btn-sm" onclick="addToCart('${book.id}', 'COMPRA', true)" title="Comprar"><i class="bi bi-cart-plus"></i></button>
                  <button class="btn btn-outline-danger btn-sm" onclick="removeFavoriteFromModal('${book.id}')" title="Quitar"><i class="bi bi-heartbreak"></i></button>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

async function removeFavoriteFromModal(bookId) {
  await toggleFavorite(bookId);
  await openFavoritesModal();
}

document.getElementById('openFavoritesBtn').addEventListener('click', (e) => {
  e.preventDefault();
  openFavoritesModal();
});

// --- Pasarela de Pagos ---

const paymentMethods = ['TARJETA', 'PSE', 'TRANSFERENCIA', 'EFECTIVO'];
let currentPayIndex = 0;

function selectPaymentMethod(method) {
  currentPayIndex = Math.max(paymentMethods.indexOf(method), 0);
  document.getElementById('paymentMethod').value = method;

  document.querySelectorAll('.pay-slide-btn').forEach((btn) => {
    const active = btn.dataset.method === method;
    btn.className = `btn btn-sm ${active ? 'btn-pds' : 'btn-outline-primary'} flex-fill pay-slide-btn`;
  });

  document.getElementById('paymentFieldsCard').classList.toggle('d-none', method !== 'TARJETA');
  document.getElementById('paymentFieldsPse').classList.toggle('d-none', method !== 'PSE');
  document.getElementById('paymentFieldsTransfer').classList.toggle('d-none', method !== 'TRANSFERENCIA');
  document.getElementById('paymentFieldsCash').classList.toggle('d-none', method !== 'EFECTIVO');
}

document.querySelectorAll('.pay-slide-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectPaymentMethod(btn.dataset.method));
});
document.getElementById('prevPayBtn').addEventListener('click', () => {
  currentPayIndex = (currentPayIndex - 1 + paymentMethods.length) % paymentMethods.length;
  selectPaymentMethod(paymentMethods[currentPayIndex]);
});
document.getElementById('nextPayBtn').addEventListener('click', () => {
  currentPayIndex = (currentPayIndex + 1) % paymentMethods.length;
  selectPaymentMethod(paymentMethods[currentPayIndex]);
});

document.getElementById('applyCouponBtn').addEventListener('click', async () => {
  const code = document.getElementById('couponInput').value.trim();
  const feedback = document.getElementById('couponFeedback');
  if (!getToken()) {
    feedback.innerHTML = '<span class="text-warning">Inicia sesion para aplicar un cupon.</span>';
    return;
  }
  if (!code) {
    feedback.innerHTML = '<span class="text-warning">Ingresa un codigo de cupon.</span>';
    return;
  }
  if (currentCartSubtotal <= 0) {
    feedback.innerHTML = '<span class="text-warning">Agrega al menos un libro al carrito primero.</span>';
    return;
  }

  try {
    const res = await apiRequest('/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ codigo: code, subtotal: currentCartSubtotal })
    });
    appliedCoupon = res.data;
    feedback.innerHTML = `<span class="text-success"><i class="bi bi-check-circle"></i> Cupon <strong>${appliedCoupon.codigo}</strong> aplicado (-${formatCurrency(appliedCoupon.descuento)}).</span>`;
    updateCartTotalsUI();
  } catch (error) {
    appliedCoupon = null;
    feedback.innerHTML = `<span class="text-danger">${error.message}</span>`;
    updateCartTotalsUI();
  }
});

document.getElementById('removeCouponBtn').addEventListener('click', clearAppliedCoupon);

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!getToken()) {
    showAlert('Debes iniciar sesion para confirmar un pedido.', 'warning');
    return;
  }

  const metodo_pago = document.getElementById('paymentMethod').value;
  let datos_pago = {};

  if (metodo_pago === 'TARJETA') {
    datos_pago = {
      numero_tarjeta: document.getElementById('cardNumber').value,
      titular: document.getElementById('cardHolder').value,
      expiracion: document.getElementById('cardExp').value,
      cvv: document.getElementById('cardCvv').value,
      cuotas: document.getElementById('cardCuotas').value
    };
  } else if (metodo_pago === 'PSE') {
    datos_pago = {
      banco: document.getElementById('pseBank').value,
      tipo_persona: document.getElementById('psePersonType').value,
      tipo_documento: document.getElementById('pseDocType').value,
      numero_documento: document.getElementById('pseDocNumber').value,
      email_pse: document.getElementById('pseEmail').value
    };
  } else if (metodo_pago === 'TRANSFERENCIA') {
    datos_pago = {
      banco_origen: document.getElementById('transferBank').value,
      numero_comprobante: document.getElementById('transferRef').value
    };
  }

  try {
    const res = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        metodo_pago,
        datos_pago,
        codigo_cupon: appliedCoupon ? appliedCoupon.codigo : null,
        direccion_envio: document.getElementById('shippingAddress').value,
        ciudad: document.getElementById('shippingCity').value
      })
    });
    clearAppliedCoupon();
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

// --- Biblioteca e Historial ---

document.getElementById('openLibraryBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  const body = document.getElementById('accountModalBody');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('accountModal'));
  document.querySelector('#accountModal .modal-title').textContent = 'Mi Biblioteca Digital';
  body.innerHTML = '<p class="text-muted">Cargando biblioteca...</p>';
  modal.show();

  try {
    const res = await apiRequest('/orders/library/my');
    const items = res.data || [];
    if (items.length === 0) {
      body.innerHTML = '<div class="alert alert-light border text-center mb-0">Aun no tienes libros comprados o alquilados.</div>';
      return;
    }

    body.innerHTML = `
      <div class="row g-3">
        ${items.map((item) => `
          <div class="col-md-6">
            <div class="card border h-100">
              <div class="card-body d-flex justify-content-between align-items-center gap-2">
                <div>
                  <h6 class="fw-bold mb-1">${item.titulo}</h6>
                  <span class="badge bg-${item.tipo_acceso === 'COMPRA' ? 'primary' : 'info text-dark'}">${item.tipo_acceso}</span>
                  <span class="badge bg-${item.estado_acceso === 'ACTIVO' ? 'success' : 'secondary'}">${item.estado_acceso}</span>
                  ${item.fecha_vencimiento ? `<div class="small text-muted mt-1">Vence: ${formatDate(item.fecha_vencimiento)}</div>` : ''}
                </div>
                ${item.estado_acceso === 'ACTIVO' && item.tiene_contenido_digital
                  ? `<a href="visor.html?bookId=${item.libro_id}" class="btn btn-pds btn-sm"><i class="bi bi-book-half"></i> Leer</a>`
                  : '<span class="small text-muted">No disponible</span>'
                }
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
});

document.getElementById('openAccountBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  const body = document.getElementById('accountModalBody');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('accountModal'));
  document.querySelector('#accountModal .modal-title').textContent = 'Mi Historial de Pedidos y Alquileres';
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
              <div class="d-flex gap-1">
                <a href="factura.html?orderId=${o.id}" target="_blank" class="btn btn-sm btn-outline-primary" title="Ver factura">
                  <i class="bi bi-receipt"></i> ${o.numero_factura || 'Ver'}
                </a>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="openClientOrderTimeline('${o.id}')" title="Seguimiento">
                  <i class="bi bi-clock-history"></i>
                </button>
              </div>
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
            <td>
              ${r.estado === 'ACTIVO'
                ? `<a href="visor.html?bookId=${r.libro_id}" class="btn btn-sm btn-outline-primary"><i class="bi bi-book-half"></i> Leer</a>`
                : '-'
              }
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" class="text-center text-muted">No tienes alquileres activos.</td></tr>';

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
          <thead><tr><th>Libro</th><th>Inicio</th><th>Vencimiento</th><th>Estado</th><th>Lectura</th></tr></thead>
          <tbody>${rentalsHtml}</tbody>
        </table>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
});

async function openClientOrderTimeline(orderId) {
  const body = document.getElementById('clientOrderTimelineBody');
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('clientOrderTimelineModal'));
  body.innerHTML = '<p class="text-muted">Cargando seguimiento...</p>';
  modal.show();
  try {
    const res = await apiRequest(`/orders/${orderId}`);
    body.innerHTML = renderOrderTimelineHtml(res.data);
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
  }
}

// --- Eventos de busqueda y filtros ---

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  currentPage = 1;
  loadBooks();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage = 1;
    loadBooks();
  }, 350);
});

categoryFilter.addEventListener('change', () => {
  syncCategoryPills();
  currentPage = 1;
  loadBooks();
});

formatFilter.addEventListener('change', () => {
  currentPage = 1;
  loadBooks();
});

sortFilter.addEventListener('change', () => {
  currentPage = 1;
  loadBooks();
});

document.getElementById('applyFiltersBtn').addEventListener('click', () => {
  currentPage = 1;
  loadBooks();
});

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  searchInput.value = '';
  categoryFilter.value = '';
  formatFilter.value = '';
  sortFilter.value = 'recent';
  syncCategoryPills();
  currentPage = 1;
  loadBooks();
});

async function initStore() {
  updateAuthUI();
  await Promise.all([loadMetadata(), loadFavoritesIds(), loadCart()]);
  await loadBooks();
}

initStore();
