const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');
const couponService = require('./couponService');

const DAILY_LATE_FEE = 2000;

function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `PDS-${datePart}-${randomPart}`;
}

function validatePaymentDetails(metodoPago, paymentData = {}) {
  if (metodoPago === 'TARJETA') {
    const rawNum = String(paymentData.numero_tarjeta || '').replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(rawNum)) {
      throw new AppError('Numero de tarjeta invalido (debe tener entre 13 y 19 digitos)', 400);
    }
    if (!paymentData.titular || !paymentData.titular.trim()) {
      throw new AppError('El nombre del titular de la tarjeta es obligatorio', 400);
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(String(paymentData.expiracion || '').trim())) {
      throw new AppError('Fecha de expiracion invalida (usa formato MM/AA)', 400);
    }
    if (!/^\d{3,4}$/.test(String(paymentData.cvv || '').trim())) {
      throw new AppError('Codigo CVV invalido (3 o 4 digitos)', 400);
    }

    const franquicia = rawNum.startsWith('4')
      ? 'VISA'
      : rawNum.startsWith('5')
        ? 'MASTERCARD'
        : 'OTRA';

    return {
      franquicia,
      ultimos_4: rawNum.slice(-4),
      titular: paymentData.titular.trim().toUpperCase(),
      cuotas: Math.min(Math.max(Number(paymentData.cuotas) || 1, 1), 36)
    };
  }

  if (metodoPago === 'PSE') {
    if (!paymentData.banco || !paymentData.tipo_persona || !paymentData.numero_documento || !paymentData.email_pse) {
      throw new AppError('Completa todos los campos requeridos para el pago por PSE', 400);
    }
    return {
      banco: paymentData.banco,
      tipo_persona: paymentData.tipo_persona,
      tipo_documento: paymentData.tipo_documento || 'CC',
      numero_documento: String(paymentData.numero_documento).trim(),
      email_pse: String(paymentData.email_pse).trim().toLowerCase(),
      cus_simulado: `CUS-${Math.floor(10000000 + Math.random() * 90000000)}`
    };
  }

  if (metodoPago === 'TRANSFERENCIA') {
    if (!paymentData.banco_origen || !paymentData.numero_comprobante) {
      throw new AppError('Ingresa el banco de origen y el numero de comprobante', 400);
    }
    return {
      banco_origen: paymentData.banco_origen.trim(),
      numero_comprobante: paymentData.numero_comprobante.trim()
    };
  }

  return { modalidad: 'Pago contraentrega en domicilio' };
}

async function createOrder(usuarioId, { metodo_pago = 'TARJETA', direccion_envio = null, ciudad = null, notas = null, datos_pago = {}, codigo_cupon = null }, ipOrigen) {
  const validMethods = ['TARJETA', 'PSE', 'TRANSFERENCIA', 'EFECTIVO'];
  if (!validMethods.includes(metodo_pago)) {
    throw new AppError('Metodo de pago no soportado', 400);
  }

  const sanitizedPayment = validatePaymentDetails(metodo_pago, datos_pago);

  const connection = await pool.getConnection();
  let orderId;
  let numeroOrden;
  let total = 0;

  try {
    await connection.beginTransaction();

    const [cartRows] = await connection.query(
      `SELECT ci.libro_id, ci.tipo_operacion, ci.cantidad,
              l.titulo, f.codigo AS formato, f.requiere_stock, l.precio_venta, l.precio_alquiler, l.stock_fisico, l.dias_alquiler, l.estado
       FROM carrito_items ci
       INNER JOIN libros l ON ci.libro_id = l.id
       INNER JOIN formatos f ON l.formato_id = f.id
       WHERE ci.usuario_id = ?
       FOR UPDATE`,
      [usuarioId]
    );

    if (cartRows.length === 0) {
      throw new AppError('Tu carrito esta vacio', 400);
    }

    let subtotalPedido = 0;
    const preparedItems = [];

    for (const item of cartRows) {
      if (item.estado === 'DESCONTINUADO') {
        throw new AppError(`El libro "${item.titulo}" ya no esta disponible`, 400);
      }

      if (item.requiere_stock && item.stock_fisico < item.cantidad) {
        throw new AppError(`Stock insuficiente para "${item.titulo}". Disponible: ${item.stock_fisico}`, 400);
      }

      const precioUnitario =
        item.tipo_operacion === 'ALQUILER'
          ? Number(item.precio_alquiler)
          : Number(item.precio_venta);
      const itemSubtotal = precioUnitario * item.cantidad;
      subtotalPedido += itemSubtotal;

      preparedItems.push({
        ...item,
        precio_unitario: precioUnitario,
        subtotal: itemSubtotal
      });
    }

    const impuestos = 0;
    let descuento = 0;
    let cuponAplicado = null;

    if (codigo_cupon && String(codigo_cupon).trim()) {
      const cleanCode = String(codigo_cupon).trim().toUpperCase();
      const [couponRows] = await connection.query('SELECT * FROM cupones WHERE codigo = ? FOR UPDATE', [cleanCode]);
      if (couponRows.length === 0) {
        throw new AppError('El codigo de cupon ingresado no existe', 404);
      }
      const coupon = couponRows[0];
      const calc = couponService.calculateCouponDiscount(coupon, subtotalPedido);
      descuento = calc.descuento;
      cuponAplicado = coupon.codigo;
      await connection.query('UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE id = ?', [coupon.id]);
    }

    total = Math.max(subtotalPedido - descuento + impuestos, 0);
    orderId = uuidv4();
    numeroOrden = generateOrderNumber();

    const estadoInicial = metodo_pago === 'EFECTIVO' ? 'PENDIENTE' : 'PAGADO';
    const estadoPago = metodo_pago === 'EFECTIVO' ? 'PENDIENTE' : 'APROBADO';

    await connection.query(
      `INSERT INTO pedidos (id, numero_orden, usuario_id, cupon_codigo, subtotal, descuento, impuestos, total, estado, direccion_envio, ciudad, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, numeroOrden, usuarioId, cuponAplicado, subtotalPedido, descuento, impuestos, total, estadoInicial, direccion_envio, ciudad, notas]
    );

    for (const item of preparedItems) {
      await connection.query(
        `INSERT INTO detalle_pedidos (id, pedido_id, libro_id, tipo_operacion, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), orderId, item.libro_id, item.tipo_operacion, item.cantidad, item.precio_unitario, item.subtotal]
      );

      if (item.requiere_stock) {
        const nuevoStock = item.stock_fisico - item.cantidad;
        const nuevoEstadoLibro = nuevoStock === 0 ? 'AGOTADO' : 'DISPONIBLE';
        await connection.query(
          'UPDATE libros SET stock_fisico = ?, estado = ? WHERE id = ?',
          [nuevoStock, nuevoEstadoLibro, item.libro_id]
        );

        await connection.query(
          `INSERT INTO movimientos_inventario (id, libro_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            item.libro_id,
            usuarioId,
            item.tipo_operacion === 'ALQUILER' ? 'SALIDA_ALQUILER' : 'SALIDA_VENTA',
            item.cantidad,
            item.stock_fisico,
            nuevoStock,
            `Pedido ${numeroOrden}`
          ]
        );
      }

      if (item.tipo_operacion === 'ALQUILER') {
        const dias = Math.max(Number(item.dias_alquiler) || 15, 1);
        const vencimiento = new Date();
        vencimiento.setDate(vencimiento.getDate() + dias);
        await connection.query(
          `INSERT INTO prestamos_alquileres (id, usuario_id, libro_id, pedido_id, fecha_vencimiento, estado)
           VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
          [uuidv4(), usuarioId, item.libro_id, orderId, vencimiento]
        );
      }
    }

    await connection.query(
      `INSERT INTO pagos (id, pedido_id, metodo_pago, referencia_transaccion, monto, estado, detalle_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        orderId,
        metodo_pago,
        `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        total,
        estadoPago,
        JSON.stringify(sanitizedPayment)
      ]
    );

    await connection.query(
      `INSERT INTO historial_estados_pedido (id, pedido_id, estado_anterior, estado_nuevo, cambiado_por, comentario)
       VALUES (?, ?, NULL, ?, ?, 'Creacion del pedido')`,
      [uuidv4(), orderId, estadoInicial, usuarioId]
    );

    const [maxRows] = await connection.query(
      'SELECT COALESCE(MAX(consecutivo), 0) AS max_num FROM facturas FOR UPDATE'
    );
    const nextConsecutivo = maxRows[0].max_num + 1;
    const numeroFactura = `FV-${String(nextConsecutivo).padStart(4, '0')}`;

    await connection.query(
      `INSERT INTO facturas (id, consecutivo, numero_factura, pedido_id, subtotal_exento, subtotal_gravado, iva_porcentaje, iva_valor, total)
       VALUES (?, ?, ?, ?, ?, 0.00, 0.00, 0.00, ?)`,
      [uuidv4(), nextConsecutivo, numeroFactura, orderId, subtotalPedido, total]
    );

    await connection.query('DELETE FROM carrito_items WHERE usuario_id = ?', [usuarioId]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logAudit({
    usuarioId,
    accion: 'CREAR_PEDIDO',
    entidad: 'pedidos',
    entidadId: orderId,
    detalle: { numero_orden: numeroOrden, total, metodo_pago },
    ipOrigen
  });

  return getOrderById(orderId, usuarioId, 'CLIENTE');
}

async function getMyOrders(usuarioId) {
  const [rows] = await pool.query(
    `SELECT p.*, pg.metodo_pago, pg.estado AS estado_pago, f.numero_factura
     FROM pedidos p
     LEFT JOIN pagos pg ON p.id = pg.pedido_id
     LEFT JOIN facturas f ON p.id = f.pedido_id
     WHERE p.usuario_id = ?
     ORDER BY p.creado_en DESC`,
    [usuarioId]
  );
  return rows;
}

async function getMyRentals(usuarioId) {
  const [rows] = await pool.query(
    `SELECT pa.*, l.titulo, l.formato, l.portada_url, l.archivo_digital_url
     FROM prestamos_alquileres pa
     INNER JOIN libros l ON pa.libro_id = l.id
     WHERE pa.usuario_id = ?
     ORDER BY pa.fecha_inicio DESC`,
    [usuarioId]
  );
  return rows;
}

async function getOrderById(orderId, usuarioId, rol) {
  const [orders] = await pool.query(
    `SELECT p.*, u.nombre AS cliente_nombre, u.apellido AS cliente_apellido, u.email AS cliente_email
     FROM pedidos p
     INNER JOIN usuarios u ON p.usuario_id = u.id
     WHERE p.id = ?`,
    [orderId]
  );

  if (orders.length === 0) {
    throw new AppError('Pedido no encontrado', 404);
  }

  const order = orders[0];
  if (rol !== 'ADMIN' && order.usuario_id !== usuarioId) {
    throw new AppError('No tienes permisos para ver este pedido', 403);
  }

  const [items] = await pool.query(
    `SELECT dp.*, l.titulo, l.isbn, f.codigo AS formato
     FROM detalle_pedidos dp
     INNER JOIN libros l ON dp.libro_id = l.id
     INNER JOIN formatos f ON l.formato_id = f.id
     WHERE dp.pedido_id = ?`,
    [orderId]
  );

  const [pagos] = await pool.query('SELECT * FROM pagos WHERE pedido_id = ?', [orderId]);

  const [historial] = await pool.query(
    `SELECT h.*, u.nombre, u.apellido
     FROM historial_estados_pedido h
     LEFT JOIN usuarios u ON h.cambiado_por = u.id
     WHERE h.pedido_id = ?
     ORDER BY h.creado_en ASC`,
    [orderId]
  );

  return {
    ...order,
    items,
    pago: pagos[0] || null,
    historial_estados: historial
  };
}

async function listAllOrders({ estado }) {
  const conditions = [];
  const params = [];

  if (estado) {
    conditions.push('p.estado = ?');
    params.push(estado);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT p.*, u.nombre AS cliente_nombre, u.apellido AS cliente_apellido, u.email AS cliente_email,
            f.numero_factura
     FROM pedidos p
     INNER JOIN usuarios u ON p.usuario_id = u.id
     LEFT JOIN facturas f ON p.id = f.pedido_id
     ${whereClause}
     ORDER BY p.creado_en DESC`,
    params
  );

  return rows;
}

async function updateOrderStatus(orderId, { estado, comentario = null }, adminId, ipOrigen) {
  const validStates = ['PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO'];
  if (!validStates.includes(estado)) {
    throw new AppError('Estado de pedido invalido', 400);
  }

  const [rows] = await pool.query('SELECT id, estado FROM pedidos WHERE id = ?', [orderId]);
  if (rows.length === 0) {
    throw new AppError('Pedido no encontrado', 404);
  }

  const estadoAnterior = rows[0].estado;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, orderId]);
    await connection.query(
      `INSERT INTO historial_estados_pedido (id, pedido_id, estado_anterior, estado_nuevo, cambiado_por, comentario)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), orderId, estadoAnterior, estado, adminId, comentario]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logAudit({
    usuarioId: adminId,
    accion: 'CAMBIAR_ESTADO_PEDIDO',
    entidad: 'pedidos',
    entidadId: orderId,
    detalle: { estado_anterior: estadoAnterior, estado_nuevo: estado },
    ipOrigen
  });

  return getOrderById(orderId, adminId, 'ADMIN');
}

async function listAllRentals({ estado }) {
  const conditions = [];
  const params = [];

  if (estado === 'VENCIDO') {
    conditions.push("((pa.estado = 'ACTIVO' AND pa.fecha_vencimiento < NOW()) OR pa.estado = 'VENCIDO')");
  } else if (estado === 'ACTIVO') {
    conditions.push("pa.estado = 'ACTIVO' AND pa.fecha_vencimiento >= NOW()");
  } else if (estado === 'DEVUELTO') {
    conditions.push("pa.estado = 'DEVUELTO'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT pa.*,
            u.nombre AS cliente_nombre, u.apellido AS cliente_apellido, u.email AS cliente_email,
            l.titulo AS libro_titulo, f.codigo AS formato, f.requiere_stock,
            p.numero_orden,
            GREATEST(0, DATEDIFF(COALESCE(pa.fecha_devolucion_real, NOW()), pa.fecha_vencimiento)) AS dias_mora
     FROM prestamos_alquileres pa
     INNER JOIN usuarios u ON pa.usuario_id = u.id
     INNER JOIN libros l ON pa.libro_id = l.id
     INNER JOIN formatos f ON l.formato_id = f.id
     LEFT JOIN pedidos p ON pa.pedido_id = p.id
     ${whereClause}
     ORDER BY pa.fecha_inicio DESC`,
    params
  );

  return rows.map((row) => {
    const diasMora = Number(row.dias_mora) || 0;
    const estadoEfectivo = row.estado === 'ACTIVO' && diasMora > 0 ? 'VENCIDO' : row.estado;
    const multaSugerida = diasMora * DAILY_LATE_FEE;
    return {
      ...row,
      dias_mora: diasMora,
      estado_efectivo: estadoEfectivo,
      multa_sugerida: multaSugerida,
      tarifa_mora_diaria: DAILY_LATE_FEE
    };
  });
}

async function returnRental(rentalId, { observaciones = null, multa = undefined }, adminId, ipOrigen) {
  const [rows] = await pool.query(
    `SELECT pa.*, f.requiere_stock, l.stock_fisico,
            GREATEST(0, DATEDIFF(NOW(), pa.fecha_vencimiento)) AS dias_mora
     FROM prestamos_alquileres pa
     INNER JOIN libros l ON pa.libro_id = l.id
     INNER JOIN formatos f ON l.formato_id = f.id
     WHERE pa.id = ?`,
    [rentalId]
  );

  if (rows.length === 0) {
    throw new AppError('Prestamo o alquiler no encontrado', 404);
  }

  const rental = rows[0];
  if (rental.estado === 'DEVUELTO') {
    throw new AppError('Este alquiler ya fue marcado como devuelto', 400);
  }

  const diasMora = Number(rental.dias_mora) || 0;
  const multaCalculada = multa !== undefined && multa !== null && multa !== ''
    ? Math.max(Number(multa) || 0, 0)
    : diasMora * DAILY_LATE_FEE;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      "UPDATE prestamos_alquileres SET estado = 'DEVUELTO', fecha_devolucion_real = NOW(), multa = ?, observaciones = ? WHERE id = ?",
      [multaCalculada, observaciones, rentalId]
    );

    if (rental.requiere_stock) {
      const nuevoStock = rental.stock_fisico + 1;
      await connection.query(
        "UPDATE libros SET stock_fisico = ?, estado = 'DISPONIBLE' WHERE id = ?",
        [nuevoStock, rental.libro_id]
      );
      await connection.query(
        `INSERT INTO movimientos_inventario (id, libro_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo)
         VALUES (?, ?, ?, 'DEVOLUCION', 1, ?, ?, 'Devolucion de alquiler')`,
        [uuidv4(), rental.libro_id, adminId, rental.stock_fisico, nuevoStock]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logAudit({
    usuarioId: adminId,
    accion: 'DEVOLUCION_ALQUILER',
    entidad: 'prestamos_alquileres',
    entidadId: rentalId,
    detalle: { dias_mora: diasMora, multa: multaCalculada },
    ipOrigen
  });

  const [updated] = await pool.query('SELECT * FROM prestamos_alquileres WHERE id = ?', [rentalId]);
  return updated[0];
}

async function getInventoryHistory(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(
    `SELECT m.*, l.titulo AS libro_titulo, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
     FROM movimientos_inventario m
     INNER JOIN libros l ON m.libro_id = l.id
     LEFT JOIN usuarios u ON m.usuario_id = u.id
     ORDER BY m.creado_en DESC
     LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

async function getAuditHistory(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(
    `SELECT a.*, u.email AS usuario_email, u.rol AS usuario_rol
     FROM auditoria_acciones a
     LEFT JOIN usuarios u ON a.usuario_id = u.id
     ORDER BY a.creado_en DESC
     LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

async function getOrderInvoice(orderId, usuarioId, rol) {
  const [orders] = await pool.query(
    `SELECT p.*, u.nombre AS cliente_nombre, u.apellido AS cliente_apellido,
            u.email AS cliente_email, u.telefono AS cliente_telefono,
            u.documento_identidad AS cliente_documento
     FROM pedidos p
     INNER JOIN usuarios u ON p.usuario_id = u.id
     WHERE p.id = ?`,
    [orderId]
  );

  if (orders.length === 0) {
    throw new AppError('Pedido no encontrado', 404);
  }

  const order = orders[0];
  if (rol !== 'ADMIN' && order.usuario_id !== usuarioId) {
    throw new AppError('No tienes permisos para consultar esta factura', 403);
  }

  const [facturas] = await pool.query('SELECT * FROM facturas WHERE pedido_id = ?', [orderId]);
  if (facturas.length === 0) {
    throw new AppError('Factura no encontrada para este pedido', 404);
  }

  const [items] = await pool.query(
    `SELECT dp.*, l.titulo, l.isbn, f.nombre AS formato_nombre, f.codigo AS formato
     FROM detalle_pedidos dp
     INNER JOIN libros l ON dp.libro_id = l.id
     INNER JOIN formatos f ON l.formato_id = f.id
     WHERE dp.pedido_id = ?`,
    [orderId]
  );

  const [pagos] = await pool.query('SELECT * FROM pagos WHERE pedido_id = ?', [orderId]);

  return {
    libreria: {
      nombre: 'Libreria Virtual Danzara',
      nit: '901.450.320-1',
      regimen: 'Regimen Comun - Venta de Libros',
      direccion: 'Carrera 5 # 12-34, Centro',
      telefono: '+57 310 555 0198',
      correo: 'contacto@libreriadanzara.com'
    },
    factura: facturas[0],
    pedido: {
      id: order.id,
      numero_orden: order.numero_orden,
      cupon_codigo: order.cupon_codigo || null,
      subtotal: Number(order.subtotal) || 0,
      descuento: Number(order.descuento) || 0,
      estado: order.estado,
      direccion_envio: order.direccion_envio,
      ciudad: order.ciudad,
      notas: order.notas,
      creado_en: order.creado_en
    },
    cliente: {
      nombre: `${order.cliente_nombre} ${order.cliente_apellido}`.trim(),
      email: order.cliente_email,
      telefono: order.cliente_telefono,
      documento_identidad: order.cliente_documento
    },
    pago: pagos[0] || null,
    items: items.map((item) => ({
      ...item,
      iva_porcentaje: 0
    }))
  };
}

async function getMyLibrary(usuarioId) {
  const [purchased] = await pool.query(
    `SELECT DISTINCT l.id AS libro_id, l.titulo, l.portada_url, a.nombre AS autor_nombre,
            'COMPRA' AS tipo_acceso, NULL AS fecha_vencimiento, 'ACTIVO' AS estado_acceso,
            (l.contenido_digital IS NOT NULL AND CHAR_LENGTH(l.contenido_digital) > 0) AS tiene_contenido_digital,
            COALESCE(pl.porcentaje, 0) AS progreso_porcentaje,
            COALESCE(pl.capitulo_actual, 0) AS capitulo_actual
     FROM detalle_pedidos dp
     INNER JOIN pedidos p ON dp.pedido_id = p.id
     INNER JOIN libros l ON dp.libro_id = l.id
     LEFT JOIN autores a ON l.autor_id = a.id
     LEFT JOIN progreso_lectura pl ON pl.usuario_id = ? AND pl.libro_id = l.id
     WHERE p.usuario_id = ? AND dp.tipo_operacion = 'COMPRA' AND p.estado != 'CANCELADO'`,
    [usuarioId, usuarioId]
  );

  const [rented] = await pool.query(
    `SELECT pa.libro_id, l.titulo, l.portada_url, a.nombre AS autor_nombre,
            'ALQUILER' AS tipo_acceso, pa.fecha_vencimiento,
            CASE WHEN pa.fecha_vencimiento >= NOW() AND pa.estado = 'ACTIVO' THEN 'ACTIVO' ELSE 'VENCIDO' END AS estado_acceso,
            (l.contenido_digital IS NOT NULL AND CHAR_LENGTH(l.contenido_digital) > 0) AS tiene_contenido_digital,
            COALESCE(pl.porcentaje, 0) AS progreso_porcentaje,
            COALESCE(pl.capitulo_actual, 0) AS capitulo_actual
     FROM prestamos_alquileres pa
     INNER JOIN libros l ON pa.libro_id = l.id
     LEFT JOIN autores a ON l.autor_id = a.id
     LEFT JOIN progreso_lectura pl ON pl.usuario_id = ? AND pl.libro_id = l.id
     WHERE pa.usuario_id = ?
     ORDER BY pa.fecha_inicio DESC`,
    [usuarioId, usuarioId]
  );

  return [...purchased, ...rented];
}

async function getBookForReader(bookId, user, ipOrigen) {
  const [books] = await pool.query(
    `SELECT l.id, l.titulo, l.isbn, l.contenido_digital, l.portada_url,
            a.nombre AS autor_nombre, e.nombre AS editorial_nombre
     FROM libros l
     LEFT JOIN autores a ON l.autor_id = a.id
     LEFT JOIN editoriales e ON l.editorial_id = e.id
     WHERE l.id = ?`,
    [bookId]
  );

  if (books.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  const book = books[0];
  if (!book.contenido_digital) {
    throw new AppError('Este libro aun no tiene contenido digital parametrizado para lectura en pantalla', 404);
  }

  const isStaff = (user.permisos || []).includes('CATALOGO_EDITAR');
  let accessType = isStaff ? 'ADMINISTRACION' : null;
  let expiresAt = null;

  if (!isStaff) {
    const [purchases] = await pool.query(
      `SELECT dp.id FROM detalle_pedidos dp
       INNER JOIN pedidos p ON dp.pedido_id = p.id
       WHERE p.usuario_id = ? AND dp.libro_id = ? AND dp.tipo_operacion = 'COMPRA' AND p.estado != 'CANCELADO'
       LIMIT 1`,
      [user.id, bookId]
    );

    if (purchases.length > 0) {
      accessType = 'COMPRA';
    } else {
      const [rentals] = await pool.query(
        `SELECT id, fecha_vencimiento FROM prestamos_alquileres
         WHERE usuario_id = ? AND libro_id = ? AND estado = 'ACTIVO' AND fecha_vencimiento >= NOW()
         ORDER BY fecha_vencimiento DESC LIMIT 1`,
        [user.id, bookId]
      );
      if (rentals.length > 0) {
        accessType = 'ALQUILER';
        expiresAt = rentals[0].fecha_vencimiento;
      }
    }
  }

  if (!accessType) {
    throw new AppError('No tienes una compra o alquiler vigente para leer este libro', 403);
  }

  await logAudit({
    usuarioId: user.id,
    accion: 'LECTURA_LIBRO_DIGITAL',
    entidad: 'libros',
    entidadId: bookId,
    detalle: { titulo: book.titulo, tipo_acceso: accessType },
    ipOrigen
  });

  const [progressRows] = await pool.query(
    'SELECT capitulo_actual, porcentaje, tema, tamano_fuente, actualizado_en FROM progreso_lectura WHERE usuario_id = ? AND libro_id = ?',
    [user.id, bookId]
  );
  const progreso = progressRows.length > 0
    ? {
        capitulo_actual: Number(progressRows[0].capitulo_actual) || 0,
        porcentaje: Number(progressRows[0].porcentaje) || 0,
        tema: progressRows[0].tema || 'DIA',
        tamano_fuente: Number(progressRows[0].tamano_fuente) || 17,
        actualizado_en: progressRows[0].actualizado_en
      }
    : {
        capitulo_actual: 0,
        porcentaje: 0,
        tema: 'DIA',
        tamano_fuente: 17,
        actualizado_en: null
      };

  return {
    libro: book,
    acceso: { tipo: accessType, fecha_vencimiento: expiresAt },
    lector: {
      nombre: `${user.nombre} ${user.apellido}`.trim(),
      email: user.email
    },
    progreso
  };
}

async function saveReadingProgress(bookId, usuarioId, { capitulo_actual = 0, porcentaje = 0, tema = 'DIA', tamano_fuente = 17 }) {
  const validThemes = ['DIA', 'SEPIA', 'NOCHE'];
  const safeTema = validThemes.includes(String(tema).toUpperCase()) ? String(tema).toUpperCase() : 'DIA';
  const safeCapitulo = Math.max(Math.floor(Number(capitulo_actual) || 0), 0);
  const safePorcentaje = Math.min(Math.max(Number(porcentaje) || 0, 0), 100);
  const safeFuente = Math.min(Math.max(Math.floor(Number(tamano_fuente) || 17), 14), 26);

  const [books] = await pool.query('SELECT id FROM libros WHERE id = ?', [bookId]);
  if (books.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  await pool.query(
    `INSERT INTO progreso_lectura (usuario_id, libro_id, capitulo_actual, porcentaje, tema, tamano_fuente)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       capitulo_actual = VALUES(capitulo_actual),
       porcentaje = VALUES(porcentaje),
       tema = VALUES(tema),
       tamano_fuente = VALUES(tamano_fuente)`,
    [usuarioId, bookId, safeCapitulo, safePorcentaje, safeTema, safeFuente]
  );

  return {
    capitulo_actual: safeCapitulo,
    porcentaje: safePorcentaje,
    tema: safeTema,
    tamano_fuente: safeFuente
  };
}

async function logReaderSecurityEvent(bookId, usuarioId, evento, ipOrigen) {
  await logAudit({
    usuarioId,
    accion: 'ALERTA_SEGURIDAD_LECTOR',
    entidad: 'libros',
    entidadId: bookId,
    detalle: { evento: String(evento || 'INTENTO_CAPTURA').slice(0, 80) },
    ipOrigen
  });
}

module.exports = {
  validatePaymentDetails,
  createOrder,
  getMyOrders,
  getMyRentals,
  getMyLibrary,
  getBookForReader,
  saveReadingProgress,
  logReaderSecurityEvent,
  getOrderById,
  getOrderInvoice,
  listAllOrders,
  listAllRentals,
  updateOrderStatus,
  returnRental,
  getInventoryHistory,
  getAuditHistory
};
