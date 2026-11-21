const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');

async function getCart(usuarioId) {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.libro_id, ci.tipo_operacion, ci.cantidad, ci.agregado_en,
            l.titulo, l.formato, l.precio_venta, l.precio_alquiler, l.stock_fisico, l.portada_url, l.estado
     FROM carrito_items ci
     INNER JOIN libros l ON ci.libro_id = l.id
     WHERE ci.usuario_id = ?
     ORDER BY ci.agregado_en DESC`,
    [usuarioId]
  );

  let total = 0;
  const items = rows.map((row) => {
    const unitPrice = row.tipo_operacion === 'ALQUILER' ? Number(row.precio_alquiler) : Number(row.precio_venta);
    const subtotal = unitPrice * row.cantidad;
    total += subtotal;
    return {
      ...row,
      precio_unitario: unitPrice,
      subtotal
    };
  });

  return { items, total };
}

async function addItem(usuarioId, { libro_id, tipo_operacion = 'COMPRA', cantidad = 1 }) {
  if (!libro_id) {
    throw new AppError('El identificador del libro es obligatorio', 400);
  }

  const qty = Math.max(Number(cantidad) || 1, 1);
  if (!['COMPRA', 'ALQUILER'].includes(tipo_operacion)) {
    throw new AppError('Tipo de operacion invalido', 400);
  }

  const [books] = await pool.query(
    'SELECT id, titulo, formato, stock_fisico, estado FROM libros WHERE id = ?',
    [libro_id]
  );

  if (books.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  const book = books[0];
  if (book.estado === 'DESCONTINUADO') {
    throw new AppError('Este libro no se encuentra disponible', 400);
  }

  const [existing] = await pool.query(
    'SELECT id, cantidad FROM carrito_items WHERE usuario_id = ? AND libro_id = ? AND tipo_operacion = ?',
    [usuarioId, libro_id, tipo_operacion]
  );

  const totalQty = existing.length > 0 ? existing[0].cantidad + qty : qty;

  if (book.formato === 'FISICO' && totalQty > book.stock_fisico) {
    throw new AppError(`Stock insuficiente para ${book.titulo}. Disponible: ${book.stock_fisico}`, 400);
  }

  if (existing.length > 0) {
    await pool.query('UPDATE carrito_items SET cantidad = ? WHERE id = ?', [totalQty, existing[0].id]);
  } else {
    await pool.query(
      'INSERT INTO carrito_items (id, usuario_id, libro_id, tipo_operacion, cantidad) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), usuarioId, libro_id, tipo_operacion, qty]
    );
  }

  return getCart(usuarioId);
}

async function updateItem(usuarioId, itemId, { cantidad }) {
  const qty = Number(cantidad);
  if (!qty || qty < 1) {
    throw new AppError('La cantidad debe ser mayor o igual a 1', 400);
  }

  const [rows] = await pool.query(
    `SELECT ci.id, ci.libro_id, l.formato, l.stock_fisico, l.titulo
     FROM carrito_items ci
     INNER JOIN libros l ON ci.libro_id = l.id
     WHERE ci.id = ? AND ci.usuario_id = ?`,
    [itemId, usuarioId]
  );

  if (rows.length === 0) {
    throw new AppError('Item no encontrado en el carrito', 404);
  }

  const item = rows[0];
  if (item.formato === 'FISICO' && qty > item.stock_fisico) {
    throw new AppError(`Stock insuficiente para ${item.titulo}. Disponible: ${item.stock_fisico}`, 400);
  }

  await pool.query('UPDATE carrito_items SET cantidad = ? WHERE id = ?', [qty, itemId]);
  return getCart(usuarioId);
}

async function removeItem(usuarioId, itemId) {
  const [result] = await pool.query(
    'DELETE FROM carrito_items WHERE id = ? AND usuario_id = ?',
    [itemId, usuarioId]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Item no encontrado en el carrito', 404);
  }

  return getCart(usuarioId);
}

async function clearCart(usuarioId) {
  await pool.query('DELETE FROM carrito_items WHERE usuario_id = ?', [usuarioId]);
  return { items: [], total: 0 };
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart
};
