const readerWrapper = document.getElementById('readerWrapper');
const readerBody = document.getElementById('readerBody');
const readerAlert = document.getElementById('readerAlert');
const watermarkLayer = document.getElementById('watermarkLayer');
const readerToolbar = document.getElementById('readerToolbar');
const chapterSelect = document.getElementById('chapterSelect');
const prevChapterBtn = document.getElementById('prevChapterBtn');
const nextChapterBtn = document.getElementById('nextChapterBtn');
const fontSizeLabel = document.getElementById('fontSizeLabel');
const progressPercentLabel = document.getElementById('progressPercentLabel');
const readingProgressBar = document.getElementById('readingProgressBar');
const saveProgressStatus = document.getElementById('saveProgressStatus');

const params = new URLSearchParams(window.location.search);
const bookId = params.get('bookId');

let readerBook = null;
let readerAccessBadge = '';
let chapters = [];
let readerState = {
  capitulo_actual: 0,
  porcentaje: 0,
  tema: 'DIA',
  tamano_fuente: 17
};
let saveProgressTimer = null;

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

function parseChapters(rawText) {
  const clean = String(rawText || '').trim();
  if (!clean) return [{ title: 'Capitulo 1', content: 'Sin contenido disponible.' }];

  const headingRegex = /^(?:cap[ií]tulo|parte|secci[oó]n)\s+[^\n]+/gim;
  const matches = [...clean.matchAll(headingRegex)];

  if (matches.length >= 2) {
    return matches.map((m, idx) => {
      const start = m.index;
      const end = idx + 1 < matches.length ? matches[idx + 1].index : clean.length;
      const block = clean.slice(start, end).trim();
      const firstLineEnd = block.indexOf('\n');
      const title = firstLineEnd > -1 ? block.slice(0, firstLineEnd).trim() : m[0].trim();
      const body = firstLineEnd > -1 ? block.slice(firstLineEnd + 1).trim() : '';
      return { title, content: body || block };
    });
  }

  const separatorParts = clean.split(/\n\s*(?:---+|\*\*\*+|===+)\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (separatorParts.length >= 2) {
    return separatorParts.map((part, idx) => {
      const lines = part.split('\n');
      const title = lines[0].length <= 80 ? lines[0].trim() : `Seccion ${idx + 1}`;
      const body = lines[0].length <= 80 ? lines.slice(1).join('\n').trim() : part;
      return { title, content: body || part };
    });
  }

  if (clean.length > 2200) {
    const paragraphs = clean.split(/\n\n+/);
    const sections = [];
    let buffer = '';
    paragraphs.forEach((p) => {
      if ((buffer + '\n\n' + p).length > 1800 && buffer) {
        sections.push(buffer.trim());
        buffer = p;
      } else {
        buffer = buffer ? `${buffer}\n\n${p}` : p;
      }
    });
    if (buffer) sections.push(buffer.trim());
    if (sections.length >= 2) {
      return sections.map((sec, idx) => ({ title: `Seccion ${idx + 1}`, content: sec }));
    }
  }

  const lines = clean.split('\n');
  const firstLine = lines[0].trim();
  if (/^(?:cap[ií]tulo|parte|secci[oó]n)/i.test(firstLine) && lines.length > 1) {
    return [{ title: firstLine, content: lines.slice(1).join('\n').trim() }];
  }

  return [{ title: 'Lectura completa', content: clean }];
}

function applyTheme(tema, persist = false) {
  const safeTheme = ['DIA', 'SEPIA', 'NOCHE'].includes(tema) ? tema : 'DIA';
  readerState.tema = safeTheme;

  document.body.classList.remove('theme-dia', 'theme-sepia', 'theme-noche');
  document.body.classList.add(`theme-${safeTheme.toLowerCase()}`);

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    const active = btn.dataset.theme === safeTheme;
    btn.classList.toggle('btn-pds', active);
    btn.classList.toggle('btn-outline-secondary', !active);
  });

  if (persist) scheduleProgressSave();
}

function applyFontSize(sizePx, persist = false) {
  const safeSize = Math.min(Math.max(Math.floor(Number(sizePx) || 17), 14), 26);
  readerState.tamano_fuente = safeSize;
  fontSizeLabel.textContent = `${safeSize}px`;

  const contentEl = document.getElementById('readerChapterContent');
  if (contentEl) {
    contentEl.style.fontSize = `${safeSize}px`;
  }

  if (persist) scheduleProgressSave();
}

function updateProgressUI(percent) {
  const safePct = Math.min(Math.max(Math.round(Number(percent) || 0), 0), 100);
  readerState.porcentaje = safePct;
  progressPercentLabel.textContent = `${safePct}%`;
  readingProgressBar.style.width = `${safePct}%`;
}

function computeScrollPercent() {
  const total = Math.max(chapters.length, 1);
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const withinChapter = docHeight > 40
    ? Math.min(Math.max(window.scrollY / docHeight, 0), 1)
    : 1;

  const rawPct = ((readerState.capitulo_actual + withinChapter) / total) * 100;
  return Math.min(Math.max(Math.round(rawPct), readerState.porcentaje), 100);
}

function scheduleProgressSave(immediate = false) {
  if (!bookId || !getToken()) return;
  clearTimeout(saveProgressTimer);

  const persistFn = async () => {
    saveProgressStatus.textContent = 'Guardando...';
    try {
      await apiRequest(`/orders/reader/${bookId}/progress`, {
        method: 'PUT',
        body: JSON.stringify(readerState)
      });
      saveProgressStatus.textContent = 'Progreso guardado';
    } catch {
      saveProgressStatus.textContent = '';
    }
  };

  if (immediate) {
    persistFn();
  } else {
    saveProgressTimer = setTimeout(persistFn, 700);
  }
}

function renderCurrentChapter(shouldScrollTop = false, persist = false) {
  const total = chapters.length;
  const idx = Math.min(Math.max(readerState.capitulo_actual, 0), total - 1);
  readerState.capitulo_actual = idx;
  const chapter = chapters[idx];

  chapterSelect.value = String(idx);
  prevChapterBtn.disabled = idx <= 0;
  nextChapterBtn.disabled = idx >= total - 1;

  const isLastChapter = idx === total - 1;
  const basePercent = Math.round(((idx + 1) / total) * 100);
  const nextPercent = Math.max(readerState.porcentaje, total === 1 ? readerState.porcentaje : Math.round((idx / total) * 100));

  readerBody.innerHTML = `
    <div class="border-bottom pb-3 mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <h1 class="h3 fw-bold mb-1">${readerBook.titulo}</h1>
          <div class="small text-muted">${readerBook.autor_nombre || 'Autor'} &middot; ${readerBook.editorial_nombre || 'Danzara'}</div>
        </div>
        <span class="badge bg-primary">${readerAccessBadge}</span>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2 class="h5 fw-bold mb-0">${chapter.title}</h2>
      <span class="small text-muted">Seccion ${idx + 1} de ${total}</span>
    </div>

    <div class="reader-content" id="readerChapterContent" style="font-size: ${readerState.tamano_fuente}px;">${chapter.content}</div>

    <div class="border-top mt-4 pt-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
      <button type="button" class="btn btn-outline-secondary btn-sm" id="footerPrevBtn" ${idx <= 0 ? 'disabled' : ''}>
        <i class="bi bi-arrow-left"></i> Anterior
      </button>
      <div class="d-flex gap-2">
        ${isLastChapter
          ? `<button type="button" class="btn btn-success btn-sm" id="finishBookBtn"><i class="bi bi-check2-circle"></i> Marcar lectura completada (100%)</button>`
          : `<button type="button" class="btn btn-pds btn-sm" id="footerNextBtn">Siguiente capitulo <i class="bi bi-arrow-right"></i></button>`
        }
      </div>
    </div>
  `;

  const footerPrev = document.getElementById('footerPrevBtn');
  if (footerPrev) {
    footerPrev.addEventListener('click', () => goToChapter(idx - 1));
  }
  const footerNext = document.getElementById('footerNextBtn');
  if (footerNext) {
    footerNext.addEventListener('click', () => goToChapter(idx + 1));
  }
  const finishBtn = document.getElementById('finishBookBtn');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      updateProgressUI(100);
      scheduleProgressSave(true);
    });
  }

  updateProgressUI(isLastChapter && basePercent === 100 && readerState.porcentaje === 0 ? 100 : nextPercent);

  if (shouldScrollTop) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (persist) {
    scheduleProgressSave();
  }
}

function goToChapter(idx) {
  if (idx < 0 || idx >= chapters.length) return;
  readerState.capitulo_actual = idx;
  const pct = Math.round(((idx + 1) / chapters.length) * 100);
  if (pct > readerState.porcentaje) {
    readerState.porcentaje = idx === chapters.length - 1 ? Math.max(readerState.porcentaje, 90) : pct;
  }
  renderCurrentChapter(true, true);
}

function bindToolbarEvents() {
  chapterSelect.addEventListener('change', (e) => goToChapter(Number(e.target.value)));
  prevChapterBtn.addEventListener('click', () => goToChapter(readerState.capitulo_actual - 1));
  nextChapterBtn.addEventListener('click', () => goToChapter(readerState.capitulo_actual + 1));

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme, true));
  });

  document.getElementById('fontDecBtn').addEventListener('click', () => {
    applyFontSize(readerState.tamano_fuente - 1, true);
  });
  document.getElementById('fontIncBtn').addEventListener('click', () => {
    applyFontSize(readerState.tamano_fuente + 1, true);
  });

  let scrollDebounce = null;
  window.addEventListener('scroll', () => {
    if (!readerBook) return;
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      const nextPct = computeScrollPercent();
      if (nextPct > readerState.porcentaje) {
        updateProgressUI(nextPct);
        scheduleProgressSave();
      }
    }, 350);
  });
}

async function initReader() {
  if (!bookId || !getToken()) {
    readerBody.innerHTML = '<div class="alert alert-warning mb-0">Debes iniciar sesion y seleccionar un libro valido para leer.</div>';
    return;
  }

  try {
    const res = await apiRequest(`/orders/reader/${bookId}`);
    const { libro, acceso, lector, progreso } = res.data;

    readerBook = libro;
    document.title = `${libro.titulo} | Visor Danzara`;
    renderWatermark(lector);
    enableContentProtection();

    readerAccessBadge = acceso.tipo === 'ALQUILER'
      ? `Alquiler vigente hasta ${formatDate(acceso.fecha_vencimiento)}`
      : acceso.tipo === 'COMPRA'
        ? 'Compra permanente'
        : 'Vista de administracion';

    chapters = parseChapters(libro.contenido_digital);
    chapterSelect.innerHTML = chapters.map((ch, i) => `<option value="${i}">${i + 1}. ${ch.title}</option>`).join('');

    if (progreso) {
      readerState = {
        capitulo_actual: Math.min(Math.max(Number(progreso.capitulo_actual) || 0, 0), chapters.length - 1),
        porcentaje: Number(progreso.porcentaje) || 0,
        tema: progreso.tema || 'DIA',
        tamano_fuente: Number(progreso.tamano_fuente) || 17
      };
    }

    readerToolbar.classList.remove('d-none');
    bindToolbarEvents();
    applyTheme(readerState.tema, false);
    applyFontSize(readerState.tamano_fuente, false);
    renderCurrentChapter(false, false);
  } catch (error) {
    readerBody.innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
  }
}

initReader();
