// ===== FAQ ACCORDION =====
document.querySelectorAll('.faq-q').forEach((q) => {
  q.addEventListener('click', () => {
    const item = q.parentElement;
    const isOpen = item.classList.contains('open');

    // Cerrar todos los demás
    document.querySelectorAll('.faq-item').forEach((i) => {
      i.classList.remove('open');
    });

    // Abrir el actual solo si estaba cerrado
    if (!isOpen) {
      item.classList.add('open');
    }
  });
});
