async function loadInvoice() {
  const container = document.getElementById('invoiceContainer');
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');

  if (!orderId || !getToken()) {
    container.innerHTML = '<div class="alert alert-warning mb-0">No se encontro el pedido o debes iniciar sesion para consultar esta factura.</div>';
    return;
  }

  try {
    const res = await apiRequest(`/orders/${orderId}/invoice`);
    const { libreria, factura, pedido, cliente, pago, items } = res.data;

    document.title = `${factura.numero_factura} | ${libreria.nombre}`;

    const itemsRows = items.map((item, idx) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td class="small">${item.isbn || 'N/A'}</td>
        <td>
          <div class="fw-semibold">${item.titulo}</div>
          <small class="text-muted">${item.formato_nombre || item.formato} &middot; ${item.tipo_operacion}</small>
        </td>
        <td class="text-center">${item.cantidad}</td>
        <td class="text-end">${formatCurrency(item.precio_unitario)}</td>
        <td class="text-center">0% (Exento)</td>
        <td class="text-end fw-semibold">${formatCurrency(item.subtotal)}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="invoice-header row align-items-center g-3">
        <div class="col-sm-7 d-flex align-items-center gap-3">
          <img src="assets/images/logo-danzara.jpg" alt="Logo Danzara" style="width: 72px; height: 72px; object-fit: cover; border-radius: 0.5rem; border: 2px solid var(--pds-accent);">
          <div>
            <h2 class="h4 fw-bold mb-1" style="color: var(--pds-primary);">${libreria.nombre}</h2>
            <div class="small text-muted">NIT: ${libreria.nit} &middot; ${libreria.regimen}</div>
            <div class="small text-muted">${libreria.direccion} &middot; Tel: ${libreria.telefono}</div>
            <div class="small text-muted">${libreria.correo}</div>
          </div>
        </div>
        <div class="col-sm-5 text-sm-end">
          <div class="invoice-number-box d-inline-block text-start w-100">
            <div class="small fw-bold text-uppercase" style="color: var(--pds-primary);">Factura de Venta</div>
            <div class="fs-4 fw-bold" style="color: var(--pds-secondary);">No. ${factura.numero_factura}</div>
            <div class="small text-muted">Fecha: ${formatDate(factura.fecha_emision)}</div>
            <div class="small text-muted">Orden: <strong>${pedido.numero_orden}</strong></div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-4 small">
        <div class="col-sm-7">
          <div class="p-3 rounded border bg-light">
            <div class="fw-bold text-uppercase mb-1" style="color: var(--pds-primary);">Datos del Cliente</div>
            <div><strong>Nombre:</strong> ${cliente.nombre}</div>
            <div><strong>Documento:</strong> ${cliente.documento_identidad || 'No registrado'}</div>
            <div><strong>Correo:</strong> ${cliente.email} &middot; <strong>Tel:</strong> ${cliente.telefono || 'N/A'}</div>
            <div><strong>Direccion:</strong> ${pedido.direccion_envio || 'Entrega digital / En tienda'}${pedido.ciudad ? ` - ${pedido.ciudad}` : ''}</div>
          </div>
        </div>
        <div class="col-sm-5">
          <div class="p-3 rounded border bg-light h-100">
            <div class="fw-bold text-uppercase mb-1" style="color: var(--pds-primary);">Informacion de Pago</div>
            <div><strong>Metodo:</strong> ${pago ? pago.metodo_pago : 'N/A'}</div>
            <div><strong>Referencia:</strong> ${pago ? pago.referencia_transaccion : 'N/A'}</div>
            <div><strong>Estado Pago:</strong> ${pago ? pago.estado : pedido.estado}</div>
            <div><strong>Estado Pedido:</strong> ${pedido.estado}</div>
          </div>
        </div>
      </div>

      <div class="table-responsive mb-4">
        <table class="table table-bordered table-sm align-middle mb-0">
          <thead>
            <tr>
              <th class="text-center">#</th>
              <th>ISBN</th>
              <th>Descripcion</th>
              <th class="text-center">Cant.</th>
              <th class="text-end">V. Unitario</th>
              <th class="text-center">IVA</th>
              <th class="text-end">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
      </div>

      <div class="row justify-content-end mb-4">
        <div class="col-sm-6 col-md-5">
          <table class="table table-sm table-borderless mb-0 small">
            <tr>
              <td class="text-muted">Subtotal Exento (0%):</td>
              <td class="text-end fw-semibold">${formatCurrency(factura.subtotal_exento)}</td>
            </tr>
            <tr>
              <td class="text-muted">Subtotal Base Gravada (19%):</td>
              <td class="text-end fw-semibold">${formatCurrency(factura.subtotal_gravado)}</td>
            </tr>
            <tr>
              <td class="text-muted">IVA (${factura.iva_porcentaje}%):</td>
              <td class="text-end fw-semibold">${formatCurrency(factura.iva_valor)}</td>
            </tr>
            <tr class="border-top border-2">
              <td class="fs-6 fw-bold" style="color: var(--pds-primary);">TOTAL A PAGAR:</td>
              <td class="fs-6 fw-bold text-end" style="color: var(--pds-primary);">${formatCurrency(factura.total)}</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="border-top pt-3 small text-muted text-center">
        <div><strong>Nota fiscal:</strong> ${factura.nota_fiscal}</div>
        <div>Documento equivalente a factura de venta comercial. Gracias por apoyar la lectura y la cultura en ${libreria.nombre}.</div>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
  }
}

loadInvoice();
