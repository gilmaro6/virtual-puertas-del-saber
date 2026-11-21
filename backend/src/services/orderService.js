const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');

function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `PDS-${datePart}-${randomPart}`;
}

async function createOrder(usuarioId, { metodo_pago = 'TARJETA', direccion_envio = null, ciudad = null, notas = null }, ipOrigen) {
  const connection = await pool.getConnection();
  let orderId;
  let numeroOrden;
  let total = 0;

  try {
    await connection.beginTransaction();

    const [cartRows] = await connection.query(
      `SELECT ci.libro_id, ci.tipo_operacion, ci.cantidad,
              l.titulo, f.codigo AS formato, f.requiere_stock, l.precio_venta, l.precio_alquiler, l.stock_fisico, l.estado
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
    const descuento = 0;
    total = subtotalPedido - descuento + impuestos;
    orderId = uuidv4();
    numeroOrden = generateOrderNumber();

    const estadoInicial = metodo_pago === 'EFECTIVO' ? 'PENDIENTE' : 'PAGADO';
    const estadoPago = metodo_pago === 'EFECTIVO' ? 'PENDIENTE' : 'APROBADO';

    await connection.query(
      `INSERT INTO pedidos (id, numero_orden, usuario_id, subtotal, descuento, impuestos, total, estado, direccion_envio, ciudad, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, numeroOrden, usuarioId, subtotalPedido, descuento, impuestos, total, estadoInicial, direccion_envio, ciudad, notas]
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
        const vencimiento = new Date();
        vencimiento.setDate(vencimiento.getDate() + 15);
        await connection.query(
          `INSERT INTO prestamos_alquileres (id, usuario_id, libro_id, pedido_id, fecha_vencimiento, estado)
           VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
          [uuidv4(), usuarioId, item.libro_id, orderId, vencimiento]
        );
      }
    }

    await connection.query(
      `INSERT INTO pagos (id, pedido_id, metodo_pago, referencia_transaccion, monto, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), orderId, metodo_pago, `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`, total, estadoPago]
    );

    await connection.query(
      `INSERT INTO historial_estados_pedido (id, pedido_id, estado_anterior, estado_nuevo, cambiado_por, comentario)
       VALUES (?, ?, NULL, ?, ?, 'Creacion del pedido')`,
      [uuidv4(), orderId, estadoInicial, usuarioId]
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
    `SELECT p.*, pg.metodo_pago, pg.estado AS estado_pago
     FROM pedidos p
     LEFT JOIN pagos pg ON p.id = pg.pedido_id
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
    `SELECT p.*, u.nombre AS cliente_nombre, u.apellido AS cliente_apellido, u.email AS cliente_email
     FROM pedidos p
     INNER JOIN usuarios u ON p.usuario_id = u.id
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

async function returnRental(rentalId, { observaciones = null }, adminId, ipOrigen) {
  const [rows] = await pool.query(
    `SELECT pa.*, f.requiere_stock, l.stock_fisico
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

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      "UPDATE prestamos_alquileres SET estado = 'DEVUELTO', fecha_devolucion_real = NOW(), observaciones = ? WHERE id = ?",
      [observaciones, rentalId]
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

module.exports = {
  createOrder,
  getMyOrders,
  getMyRentals,
  getOrderById,
  listAllOrders,
  updateOrderStatus,
  returnRental,
  getInventoryHistory,
  getAuditHistory
};
