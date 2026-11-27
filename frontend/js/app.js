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
let currentCartItems = [];
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

function getCurrentNetTotal() {
  const desc = appliedCoupon && currentCartSubtotal > 0
    ? Math.min(Number(appliedCoupon.descuento) || 0, currentCartSubtotal)
    : 0;
  return { desc, netTotal: Math.max(currentCartSubtotal - desc, 0) };
}

function updateInstallmentHint() {
  const hintEl = document.getElementById('installmentHint');
  const cuotasEl = document.getElementById('cardCuotas');
  if (!hintEl || !cuotasEl) return;
  const { netTotal } = getCurrentNetTotal();
  const cuotas = Math.max(Number(cuotasEl.value) || 1, 1);
  if (netTotal <= 0) {
    hintEl.textContent = '';
    return;
  }
  const perMonth = Math.round(netTotal / cuotas);
  hintEl.textContent = cuotas === 1
    ? `Pago unico de ${formatCurrency(netTotal)} sin intereses.`
    : `${cuotas} cuotas estimadas de ${formatCurrency(perMonth)} / mes.`;
}

function updateCartTotalsUI() {
  const subtotalEl = document.getElementById('cartSubtotal');
  const discountRow = document.getElementById('cartDiscountRow');
  const discountVal = document.getElementById('cartDiscountValue');
  const totalEl = document.getElementById('cartTotal');
  const removeBtn = document.getElementById('removeCouponBtn');

  const coSubtotal = document.getElementById('coSubtotal');
  const coDiscountRow = document.getElementById('coDiscountRow');
  const coDiscountVal = document.getElementById('coDiscountValue');
  const coTotal = document.getElementById('coTotal');
  const checkoutBtnAmount = document.getElementById('checkoutBtnAmount');
  const openCheckoutBtn = document.getElementById('openCheckoutModalBtn');

  const { desc, netTotal } = getCurrentNetTotal();

  subtotalEl.textContent = formatCurrency(currentCartSubtotal);
  if (coSubtotal) coSubtotal.textContent = formatCurrency(currentCartSubtotal);

  if (desc > 0) {
    discountRow.classList.remove('d-none');
    discountVal.textContent = `- ${formatCurrency(desc)}`;
    removeBtn.classList.remove('d-none');
    if (coDiscountRow) coDiscountRow.classList.remove('d-none');
    if (coDiscountVal) coDiscountVal.textContent = `- ${formatCurrency(desc)}`;
  } else {
    discountRow.classList.add('d-none');
    removeBtn.classList.add('d-none');
    if (coDiscountRow) coDiscountRow.classList.add('d-none');
  }

  totalEl.textContent = formatCurrency(netTotal);
  if (coTotal) coTotal.textContent = formatCurrency(netTotal);
  if (checkoutBtnAmount) checkoutBtnAmount.textContent = formatCurrency(netTotal);
  if (openCheckoutBtn) openCheckoutBtn.disabled = currentCartItems.length === 0;

  updateInstallmentHint();
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
    currentCartItems = [];
    clearAppliedCoupon();
    return;
  }

  try {
    const res = await apiRequest('/cart');
    const { items, total } = res.data;
    badge.textContent = items.reduce((acc, item) => acc + item.cantidad, 0);
    currentCartSubtotal = Number(total) || 0;
    currentCartItems = items || [];

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

// --- Pasarela de Pagos Profesional ---

const paymentMethods = ['TARJETA', 'PSE', 'TRANSFERENCIA', 'EFECTIVO'];
let currentPayIndex = 0;

function selectPaymentMethod(method) {
  currentPayIndex = Math.max(paymentMethods.indexOf(method), 0);
  document.getElementById('paymentMethod').value = method;

  document.querySelectorAll('.pay-slide-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });

  document.getElementById('paymentFieldsCard').classList.toggle('d-none', method !== 'TARJETA');
  document.getElementById('paymentFieldsPse').classList.toggle('d-none', method !== 'PSE');
  document.getElementById('paymentFieldsTransfer').classList.toggle('d-none', method !== 'TRANSFERENCIA');
  document.getElementById('paymentFieldsCash').classList.toggle('d-none', method !== 'EFECTIVO');
}

function renderCheckoutSummary() {
  const container = document.getElementById('checkoutSummaryItems');
  if (!container) return;

  container.innerHTML = currentCartItems.map((item) => `
    <div class="d-flex justify-content-between align-items-center gap-2 py-2 border-bottom small">
      <div class="min-w-0">
        <div class="fw-semibold text-truncate">${item.titulo}</div>
        <div class="text-muted">${item.tipo_operacion} &middot; Cant: ${item.cantidad}</div>
      </div>
      <strong class="text-nowrap">${formatCurrency(item.subtotal)}</strong>
    </div>
  `).join('');
  updateCartTotalsUI();
}

document.getElementById('openCheckoutModalBtn').addEventListener('click', () => {
  if (!getToken()) {
    bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cartOffcanvas')).hide();
    new bootstrap.Modal(document.getElementById('authModal')).show();
    return;
  }
  if (currentCartItems.length === 0) {
    showAlert('Agrega al menos un libro antes de ir al pago.', 'warning');
    return;
  }

  document.getElementById('checkoutAlert').innerHTML = '';
  const user = getStoredUser();
  if (user) {
    const holderEl = document.getElementById('cardHolder');
    const pseEmailEl = document.getElementById('pseEmail');
    if (holderEl && !holderEl.value.trim()) {
      holderEl.value = `${user.nombre || ''} ${user.apellido || ''}`.trim().toUpperCase();
      document.getElementById('ccPreviewHolder').textContent = holderEl.value || 'NOMBRE DEL TITULAR';
    }
    if (pseEmailEl && !pseEmailEl.value.trim()) {
      pseEmailEl.value = user.email || '';
    }
  }

  renderCheckoutSummary();
  const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('cartOffcanvas'));
  if (offcanvas) offcanvas.hide();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('checkoutModal')).show();
});

document.getElementById('backToCartBtn').addEventListener('click', () => {
  bootstrap.Modal.getOrCreateInstance(document.getElementById('checkoutModal')).hide();
  bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cartOffcanvas')).show();
});

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

// Interactividad en vivo de la tarjeta bancaria 3D
document.getElementById('cardNumber').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
  const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  e.target.value = formatted;

  const padded = digits.padEnd(16, '•').replace(/(.{4})(?=.)/g, '$1 ');
  document.getElementById('ccPreviewNumber').textContent = padded;

  const brandBadge = document.getElementById('ccBrandBadge');
  if (digits.startsWith('4')) {
    brandBadge.textContent = 'VISA';
  } else if (digits.startsWith('5')) {
    brandBadge.textContent = 'MASTERCARD';
  } else if (digits.startsWith('3')) {
    brandBadge.textContent = 'AMEX';
  } else {
    brandBadge.textContent = 'TARJETA';
  }
});

document.getElementById('cardHolder').addEventListener('input', (e) => {
  const val = e.target.value.trim().toUpperCase();
  document.getElementById('ccPreviewHolder').textContent = val || 'NOMBRE DEL TITULAR';
});

document.getElementById('cardExp').addEventListener('input', (e) => {
  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
  const formatted = digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  e.target.value = formatted;
  document.getElementById('ccPreviewExp').textContent = formatted || 'MM/AA';
});

document.getElementById('cardCuotas').addEventListener('change', updateInstallmentHint);

function fillTestCard(number, holder, exp, cvv) {
  const numInput = document.getElementById('cardNumber');
  const holderInput = document.getElementById('cardHolder');
  const expInput = document.getElementById('cardExp');
  const cvvInput = document.getElementById('cardCvv');

  numInput.value = number;
  holderInput.value = holder;
  expInput.value = exp;
  cvvInput.value = cvv;

  numInput.dispatchEvent(new Event('input'));
  holderInput.dispatchEvent(new Event('input'));
  expInput.dispatchEvent(new Event('input'));
}

document.getElementById('fillVisaTestBtn').addEventListener('click', () => {
  const user = getStoredUser();
  const name = user ? `${user.nombre} ${user.apellido}`.trim().toUpperCase() : 'CLIENTE PRUEBA VISA';
  fillTestCard('4111111111114242', name, '1229', '123');
});

document.getElementById('fillMasterTestBtn').addEventListener('click', () => {
  const user = getStoredUser();
  const name = user ? `${user.nombre} ${user.apellido}`.trim().toUpperCase() : 'CLIENTE PRUEBA MASTER';
  fillTestCard('5500000000005555', name, '1028', '456');
});

document.getElementById('copyBankAccountBtn').addEventListener('click', async () => {
  const text = document.getElementById('bankAccountText').textContent.trim();
  const btn = document.getElementById('copyBankAccountBtn');
  try {
    await navigator.clipboard.writeText(text);
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Copiado';
    setTimeout(() => {
      btn.innerHTML = '<i class="bi bi-clipboard"></i> Copiar cuenta';
    }, 2000);
  } catch {
    showAlert(`Cuenta bancaria: ${text}`, 'info');
  }
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

let pendingCardPayload = null;
let currentThreeDsOtp = '';

async function finalizeOrderSubmission(payload) {
  const checkoutAlert = document.getElementById('checkoutAlert');
  const overlay = document.getElementById('checkoutProcessingOverlay');
  const procTitle = document.getElementById('processingTitle');
  const procSub = document.getElementById('processingSubtitle');

  overlay.classList.remove('d-none');
  procTitle.textContent = 'Aprobando transaccion...';
  procSub.textContent = 'Registrando pedido, descontando inventario y generando factura FV-XXXX...';

  try {
    await new Promise((r) => setTimeout(r, 750));
    const res = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    overlay.classList.add('d-none');
    clearAppliedCoupon();
    document.getElementById('checkoutForm').reset();
    document.getElementById('ccPreviewNumber').textContent = '•••• •••• •••• ••••';
    document.getElementById('ccPreviewHolder').textContent = 'NOMBRE DEL TITULAR';
    document.getElementById('ccPreviewExp').textContent = 'MM/AA';
    document.getElementById('ccBrandBadge').textContent = 'TARJETA';
    selectPaymentMethod('TARJETA');

    bootstrap.Modal.getOrCreateInstance(document.getElementById('checkoutModal')).hide();
    await loadCart();
    await loadBooks();

    const refInfo = res.data.pago && res.data.pago.referencia_transaccion
      ? `<br><span class="small text-muted">Referencia: <strong>${res.data.pago.referencia_transaccion}</strong> · Metodo: <strong>${res.data.pago.metodo_pago}</strong></span>`
      : '';
    document.getElementById('orderSuccessMessage').innerHTML =
      `Tu pedido <strong>${res.data.numero_orden}</strong> fue aprobado por <strong>${formatCurrency(res.data.total)}</strong>.${refInfo}`;
    document.getElementById('orderSuccessInvoiceLink').href = `factura.html?orderId=${res.data.id}`;
    new bootstrap.Modal(document.getElementById('orderSuccessModal')).show();
  } catch (error) {
    overlay.classList.add('d-none');
    showAlert(error.message, 'danger', checkoutAlert);
  }
}

function openThreeDsChallenge(payload) {
  pendingCardPayload = payload;
  currentThreeDsOtp = String(Math.floor(100000 + Math.random() * 900000));

  const rawNum = String(payload.datos_pago.numero_tarjeta || '').replace(/\D/g, '');
  const brand = rawNum.startsWith('4')
    ? 'Verified by VISA · 3D Secure'
    : rawNum.startsWith('5')
      ? 'Mastercard ID Check · 3D Secure'
      : 'Verificacion Bancaria 3D Secure';

  const { netTotal } = getCurrentNetTotal();
  document.getElementById('threeDsBrandTitle').innerHTML = `<i class="bi bi-shield-lock-fill text-warning"></i> ${brand}`;
  document.getElementById('threeDsMaskedCard').textContent = `•••• •••• •••• ${rawNum.slice(-4)}`;
  document.getElementById('threeDsAmount').textContent = formatCurrency(netTotal);
  document.getElementById('threeDsDemoOtp').textContent = currentThreeDsOtp;
  document.getElementById('threeDsOtpInput').value = '';
  document.getElementById('threeDsAlert').innerHTML = '';

  bootstrap.Modal.getOrCreateInstance(document.getElementById('threeDsModal')).show();
}

document.getElementById('autofillThreeDsBtn').addEventListener('click', () => {
  document.getElementById('threeDsOtpInput').value = currentThreeDsOtp;
});

document.getElementById('confirmThreeDsBtn').addEventListener('click', async () => {
  const entered = document.getElementById('threeDsOtpInput').value.trim();
  if (entered !== currentThreeDsOtp) {
    showAlert('Codigo 3D Secure incorrecto. Ingresa los 6 digitos de prueba.', 'danger', document.getElementById('threeDsAlert'));
    return;
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('threeDsModal')).hide();
  if (pendingCardPayload) {
    const toSend = pendingCardPayload;
    pendingCardPayload = null;
    await finalizeOrderSubmission(toSend);
  }
});

document.getElementById('rejectThreeDsBtn').addEventListener('click', () => {
  pendingCardPayload = null;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('threeDsModal')).hide();
  showAlert(
    'Transaccion rechazada en verificacion 3D Secure por el banco emisor (simulacion). Puedes intentar con otra tarjeta o metodo de pago.',
    'danger',
    document.getElementById('checkoutAlert')
  );
});

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const checkoutAlert = document.getElementById('checkoutAlert');
  checkoutAlert.innerHTML = '';

  if (!getToken()) {
    showAlert('Debes iniciar sesion para confirmar un pedido.', 'warning', checkoutAlert);
    return;
  }

  const metodo_pago = document.getElementById('paymentMethod').value;
  const direccion_envio = document.getElementById('shippingAddress').value;
  const ciudad = document.getElementById('shippingCity').value;
  const codigo_cupon = appliedCoupon ? appliedCoupon.codigo : null;

  if (metodo_pago === 'PSE') {
    const banco = document.getElementById('pseBank').value;
    const tipo_persona = document.getElementById('psePersonType').value;
    const tipo_documento = document.getElementById('pseDocType').value;
    const numero_documento = document.getElementById('pseDocNumber').value.trim();
    const email_pse = document.getElementById('pseEmail').value.trim();

    if (!banco || !numero_documento || !email_pse) {
      showAlert('Selecciona tu entidad bancaria e ingresa documento y correo registrado en PSE.', 'warning', checkoutAlert);
      return;
    }

    const bankUrls = {
      Bancolombia: 'https://sucursalpersonas.transaccionesbancolombia.com/bancolombia/jump.jsp?cerrarSesion=true',
      Davivienda: 'https://personas.davivienda.com/',
      'Banco de Bogota': 'https://virtual.bancodebogota.co/',
      'BBVA Colombia': 'https://personas.bbvanet.com.co/',
      'Banco de Occidente': 'https://www.bancodeoccidente.com.co/',
      Nequi: 'https://www.nequi.com.co/',
      Daviplata: 'https://www.daviplata.com/'
    };
    const officialUrl = bankUrls[banco] || 'https://www.pse.com.co/persona';

    const { netTotal } = getCurrentNetTotal();
    sessionStorage.setItem('pds_pending_pse', JSON.stringify({
      metodo_pago: 'PSE',
      datos_pago: { banco, tipo_persona, tipo_documento, numero_documento, email_pse },
      codigo_cupon,
      direccion_envio,
      ciudad,
      net_total: netTotal,
      items_count: currentCartItems.reduce((acc, it) => acc + it.cantidad, 0),
      cus_preview: `CUS-${Math.floor(10000000 + Math.random() * 90000000)}`
    }));

    // Abrir la pagina oficial de ingreso de la entidad bancaria en una nueva pestana
    window.open(officialUrl, '_blank', 'noopener,noreferrer');

    const overlay = document.getElementById('checkoutProcessingOverlay');
    document.getElementById('processingTitle').textContent = `Abriendo portal oficial de ${banco}...`;
    document.getElementById('processingSubtitle').textContent = 'Redirigiendo a pantalla de confirmacion de retorno PSE';
    overlay.classList.remove('d-none');

    setTimeout(() => {
      window.location.href = 'pasarela-banco.html';
    }, 600);
    return;
  }

  if (metodo_pago === 'TARJETA') {
    const rawNum = document.getElementById('cardNumber').value.replace(/\s+/g, '');
    const titular = document.getElementById('cardHolder').value.trim();
    const expiracion = document.getElementById('cardExp').value.trim();
    const cvv = document.getElementById('cardCvv').value.trim();
    const cuotas = document.getElementById('cardCuotas').value;

    if (!/^\d{13,19}$/.test(rawNum)) {
      showAlert('Numero de tarjeta invalido (debe tener entre 13 y 19 digitos).', 'warning', checkoutAlert);
      return;
    }
    if (!titular) {
      showAlert('Ingresa el nombre del titular de la tarjeta.', 'warning', checkoutAlert);
      return;
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiracion)) {
      showAlert('Fecha de expiracion invalida (usa formato MM/AA).', 'warning', checkoutAlert);
      return;
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      showAlert('Codigo CVV invalido (3 o 4 digitos).', 'warning', checkoutAlert);
      return;
    }

    openThreeDsChallenge({
      metodo_pago: 'TARJETA',
      datos_pago: { numero_tarjeta: rawNum, titular, expiracion, cvv, cuotas },
      codigo_cupon,
      direccion_envio,
      ciudad
    });
    return;
  }

  let datos_pago = {};
  if (metodo_pago === 'TRANSFERENCIA') {
    datos_pago = {
      banco_origen: document.getElementById('transferBank').value,
      numero_comprobante: document.getElementById('transferRef').value
    };
  }

  await finalizeOrderSubmission({
    metodo_pago,
    datos_pago,
    codigo_cupon,
    direccion_envio,
    ciudad
  });
});

function handleReturnedPayment() {
  const raw = sessionStorage.getItem('pds_payment_result');
  if (!raw) return;
  sessionStorage.removeItem('pds_payment_result');

  if (window.location.search.includes('payment=')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  try {
    const result = JSON.parse(raw);
    if (result.status === 'APPROVED' && result.order) {
      const ord = result.order;
      const cus = ord.pago && ord.pago.detalle_pago
        ? (() => {
            try {
              const d = typeof ord.pago.detalle_pago === 'string' ? JSON.parse(ord.pago.detalle_pago) : ord.pago.detalle_pago;
              return d.cus_simulado || '';
            } catch {
              return '';
            }
          })()
        : '';
      document.getElementById('orderSuccessMessage').innerHTML =
        `Pago PSE aprobado por <strong>${result.bank || 'tu entidad bancaria'}</strong>.<br>Pedido <strong>${ord.numero_orden}</strong> por <strong>${formatCurrency(ord.total)}</strong>${cus ? `<br><span class="small text-muted">Comprobante PSE: <strong>${cus}</strong></span>` : ''}`;
      document.getElementById('orderSuccessInvoiceLink').href = `factura.html?orderId=${ord.id}`;
      new bootstrap.Modal(document.getElementById('orderSuccessModal')).show();
    } else if (result.status === 'REJECTED') {
      showAlert(`<strong>Pago rechazado (${result.bank || 'PSE'}):</strong> ${result.reason || 'Transaccion no aprobada.'}`, 'danger');
    } else if (result.status === 'CANCELLED') {
      showAlert(result.reason || 'Operacion cancelada en el portal bancario.', 'warning');
    }
  } catch {
    // Ignorar formato invalido
  }
}

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
        ${items.map((item) => {
          const pct = Math.min(Math.max(Math.round(Number(item.progreso_porcentaje) || 0), 0), 100);
          return `
          <div class="col-md-6">
            <div class="card border h-100">
              <div class="card-body d-flex flex-column justify-content-between gap-2">
                <div class="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <h6 class="fw-bold mb-1">${item.titulo}</h6>
                    <span class="badge bg-${item.tipo_acceso === 'COMPRA' ? 'primary' : 'info text-dark'}">${item.tipo_acceso}</span>
                    <span class="badge bg-${item.estado_acceso === 'ACTIVO' ? 'success' : 'secondary'}">${item.estado_acceso}</span>
                    ${item.fecha_vencimiento ? `<div class="small text-muted mt-1">Vence: ${formatDate(item.fecha_vencimiento)}</div>` : ''}
                  </div>
                  ${item.estado_acceso === 'ACTIVO' && item.tiene_contenido_digital
                    ? `<a href="visor.html?bookId=${item.libro_id}" class="btn btn-pds btn-sm text-nowrap"><i class="bi bi-book-half"></i> ${pct > 0 ? 'Continuar' : 'Leer'}</a>`
                    : '<span class="small text-muted">No disponible</span>'
                  }
                </div>
                ${item.tiene_contenido_digital ? `
                  <div>
                    <div class="d-flex justify-content-between small text-muted mb-1">
                      <span>Progreso de lectura</span>
                      <span class="fw-semibold">${pct}%</span>
                    </div>
                    <div class="progress" style="height: 6px;">
                      <div class="progress-bar" role="progressbar" style="width: ${pct}%; background-color: var(--pds-secondary);"></div>
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
        }).join('')}
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
  handleReturnedPayment();
}

initStore();
