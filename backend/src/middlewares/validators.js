const AppError = require('../utils/appError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegister(req, res, next) {
  const { nombre, apellido, email, password } = req.body || {};
  if (!nombre || !String(nombre).trim() || !apellido || !String(apellido).trim()) {
    return next(new AppError('Nombre y apellido son obligatorios', 400));
  }
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return next(new AppError('Ingresa un correo electronico valido', 400));
  }
  if (!password || String(password).length < 6) {
    return next(new AppError('La contrasena debe tener al menos 6 caracteres', 400));
  }
  return next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body || {};
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return next(new AppError('Ingresa un correo electronico valido', 400));
  }
  if (!password) {
    return next(new AppError('La contrasena es obligatoria', 400));
  }
  return next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body || {};
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return next(new AppError('Ingresa un correo electronico valido', 400));
  }
  return next();
}

function validateResetPassword(req, res, next) {
  const { email, codigo, nuevaContrasena } = req.body || {};
  if (!email || !EMAIL_REGEX.test(String(email).trim())) {
    return next(new AppError('Ingresa un correo electronico valido', 400));
  }
  if (!codigo || !/^\d{6}$/.test(String(codigo).trim())) {
    return next(new AppError('El codigo de recuperacion debe tener 6 digitos numericos', 400));
  }
  if (!nuevaContrasena || String(nuevaContrasena).length < 6) {
    return next(new AppError('La nueva contrasena debe tener al menos 6 caracteres', 400));
  }
  return next();
}

function validateBookPayload(req, res, next) {
  const { titulo, precio_venta, precio_alquiler, stock_fisico, dias_alquiler } = req.body || {};
  if (req.method === 'POST' && (!titulo || !String(titulo).trim())) {
    return next(new AppError('El titulo del libro es obligatorio', 400));
  }
  if (precio_venta !== undefined && (Number.isNaN(Number(precio_venta)) || Number(precio_venta) < 0)) {
    return next(new AppError('El precio de venta debe ser un numero mayor o igual a 0', 400));
  }
  if (precio_alquiler !== undefined && (Number.isNaN(Number(precio_alquiler)) || Number(precio_alquiler) < 0)) {
    return next(new AppError('El precio de alquiler debe ser un numero mayor o igual a 0', 400));
  }
  if (stock_fisico !== undefined && (Number.isNaN(Number(stock_fisico)) || Number(stock_fisico) < 0)) {
    return next(new AppError('El stock fisico no puede ser negativo', 400));
  }
  if (dias_alquiler !== undefined && (Number.isNaN(Number(dias_alquiler)) || Number(dias_alquiler) < 1)) {
    return next(new AppError('Los dias de alquiler deben ser al menos 1', 400));
  }
  return next();
}

function validateOrderPayload(req, res, next) {
  const { metodo_pago = 'TARJETA' } = req.body || {};
  const allowed = ['TARJETA', 'PSE', 'TRANSFERENCIA', 'EFECTIVO'];
  if (!allowed.includes(metodo_pago)) {
    return next(new AppError('Metodo de pago no soportado', 400));
  }
  return next();
}

function validateCouponPayload(req, res, next) {
  const { codigo, tipo = 'PORCENTAJE', valor } = req.body || {};
  if (!codigo || !/^[A-Za-z0-9_-]{3,40}$/.test(String(codigo).trim())) {
    return next(new AppError('El codigo del cupon debe tener entre 3 y 40 caracteres alfanumericos', 400));
  }
  if (!['PORCENTAJE', 'MONTO_FIJO'].includes(tipo)) {
    return next(new AppError('El tipo de cupon debe ser PORCENTAJE o MONTO_FIJO', 400));
  }
  const numVal = Number(valor);
  if (Number.isNaN(numVal) || numVal <= 0) {
    return next(new AppError('El valor del cupon debe ser mayor a 0', 400));
  }
  if (tipo === 'PORCENTAJE' && numVal > 100) {
    return next(new AppError('Un cupon porcentual no puede superar el 100%', 400));
  }
  return next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateBookPayload,
  validateOrderPayload,
  validateCouponPayload
};
