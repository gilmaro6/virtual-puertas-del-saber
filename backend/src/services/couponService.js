const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');

function calculateCouponDiscount(coupon, subtotal) {
  const numericSubtotal = Number(subtotal) || 0;
  if (!coupon) {
    throw new AppError('Cupon no encontrado', 404);
  }
  if (!coupon.activo) {
    throw new AppError('Este cupon se encuentra inactivo', 400);
  }
  if (coupon.fecha_expiracion && new Date(coupon.fecha_expiracion).getTime() < Date.now()) {
    throw new AppError('Este cupon ha expirado', 400);
  }
  if (coupon.usos_maximos !== null && coupon.usos_maximos !== undefined && Number(coupon.usos_actuales) >= Number(coupon.usos_maximos)) {
    throw new AppError('Este cupon alcanzo su limite maximo de usos', 400);
  }
  if (numericSubtotal < Number(coupon.monto_minimo || 0)) {
    throw new AppError(`El monto minimo para usar este cupon es ${Number(coupon.monto_minimo).toLocaleString('es-CO')} COP`, 400);
  }

  let descuento = 0;
  if (coupon.tipo === 'PORCENTAJE') {
    descuento = Math.round((numericSubtotal * Number(coupon.valor)) / 100);
  } else {
    descuento = Math.round(Number(coupon.valor));
  }

  descuento = Math.min(Math.max(descuento, 0), numericSubtotal);
  return {
    descuento,
    total_con_descuento: Math.max(numericSubtotal - descuento, 0)
  };
}

async function listCoupons() {
  const [rows] = await pool.query('SELECT * FROM cupones ORDER BY creado_en DESC');
  return rows;
}

async function validateCouponCode(codigo, subtotal) {
  if (!codigo || !String(codigo).trim()) {
    throw new AppError('Ingresa un codigo de cupon', 400);
  }
  const cleanCode = String(codigo).trim().toUpperCase();
  const [rows] = await pool.query('SELECT * FROM cupones WHERE codigo = ?', [cleanCode]);
  if (rows.length === 0) {
    throw new AppError('El codigo de cupon ingresado no existe', 404);
  }

  const coupon = rows[0];
  const calc = calculateCouponDiscount(coupon, subtotal);
  return {
    id: coupon.id,
    codigo: coupon.codigo,
    descripcion: coupon.descripcion,
    tipo: coupon.tipo,
    valor: Number(coupon.valor),
    ...calc
  };
}

async function createCoupon(data, adminId, ipOrigen) {
  const {
    codigo,
    descripcion = null,
    tipo = 'PORCENTAJE',
    valor,
    monto_minimo = 0,
    usos_maximos = null,
    fecha_expiracion = null,
    activo = 1
  } = data;

  if (!codigo || !String(codigo).trim()) {
    throw new AppError('El codigo del cupon es obligatorio', 400);
  }
  if (!['PORCENTAJE', 'MONTO_FIJO'].includes(tipo)) {
    throw new AppError('Tipo de cupon invalido', 400);
  }

  const numValor = Number(valor);
  if (Number.isNaN(numValor) || numValor <= 0) {
    throw new AppError('El valor del cupon debe ser mayor a 0', 400);
  }
  if (tipo === 'PORCENTAJE' && numValor > 100) {
    throw new AppError('Un cupon porcentual no puede superar el 100%', 400);
  }

  const cleanCode = String(codigo).trim().toUpperCase().replace(/\s+/g, '');
  const [existing] = await pool.query('SELECT id FROM cupones WHERE codigo = ?', [cleanCode]);
  if (existing.length > 0) {
    throw new AppError('Ya existe un cupon con ese codigo', 409);
  }

  const [res] = await pool.query(
    `INSERT INTO cupones (codigo, descripcion, tipo, valor, monto_minimo, usos_maximos, fecha_expiracion, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cleanCode,
      descripcion ? String(descripcion).trim() : null,
      tipo,
      numValor,
      Math.max(Number(monto_minimo) || 0, 0),
      usos_maximos ? Math.max(Number(usos_maximos), 1) : null,
      fecha_expiracion || null,
      activo ? 1 : 0
    ]
  );

  await logAudit({
    usuarioId: adminId,
    accion: 'CREAR_CUPON',
    entidad: 'cupones',
    entidadId: res.insertId,
    detalle: { codigo: cleanCode, tipo, valor: numValor },
    ipOrigen
  });

  const [rows] = await pool.query('SELECT * FROM cupones WHERE id = ?', [res.insertId]);
  return rows[0];
}

async function updateCoupon(id, data, adminId, ipOrigen) {
  const numericId = Number(id);
  const [rows] = await pool.query('SELECT * FROM cupones WHERE id = ?', [numericId]);
  if (rows.length === 0) {
    throw new AppError('Cupon no encontrado', 404);
  }

  const current = rows[0];
  const nextActivo = data.activo !== undefined ? (data.activo ? 1 : 0) : current.activo;
  const nextDesc = data.descripcion !== undefined ? data.descripcion : current.descripcion;
  const nextMin = data.monto_minimo !== undefined ? Math.max(Number(data.monto_minimo) || 0, 0) : current.monto_minimo;
  const nextMaxUses = data.usos_maximos !== undefined ? (data.usos_maximos ? Number(data.usos_maximos) : null) : current.usos_maximos;
  const nextExp = data.fecha_expiracion !== undefined ? (data.fecha_expiracion || null) : current.fecha_expiracion;

  await pool.query(
    `UPDATE cupones
     SET descripcion = ?, monto_minimo = ?, usos_maximos = ?, fecha_expiracion = ?, activo = ?
     WHERE id = ?`,
    [nextDesc, nextMin, nextMaxUses, nextExp, nextActivo, numericId]
  );

  await logAudit({
    usuarioId: adminId,
    accion: 'ACTUALIZAR_CUPON',
    entidad: 'cupones',
    entidadId: numericId,
    detalle: { codigo: current.codigo, activo: nextActivo },
    ipOrigen
  });

  const [updated] = await pool.query('SELECT * FROM cupones WHERE id = ?', [numericId]);
  return updated[0];
}

async function deleteCoupon(id, adminId, ipOrigen) {
  const numericId = Number(id);
  const [rows] = await pool.query('SELECT * FROM cupones WHERE id = ?', [numericId]);
  if (rows.length === 0) {
    throw new AppError('Cupon no encontrado', 404);
  }

  await pool.query('DELETE FROM cupones WHERE id = ?', [numericId]);
  await logAudit({
    usuarioId: adminId,
    accion: 'ELIMINAR_CUPON',
    entidad: 'cupones',
    entidadId: numericId,
    detalle: { codigo: rows[0].codigo },
    ipOrigen
  });
}

module.exports = {
  calculateCouponDiscount,
  listCoupons,
  validateCouponCode,
  createCoupon,
  updateCoupon,
  deleteCoupon
};
