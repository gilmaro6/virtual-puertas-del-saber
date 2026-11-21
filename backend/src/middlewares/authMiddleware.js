const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo';

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Token de autenticacion requerido', 401));
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return next(new AppError('Token invalido o expirado', 401));
    }

    const [rows] = await pool.query(
      'SELECT id, nombre, apellido, email, rol, estado FROM usuarios WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) {
      return next(new AppError('Usuario no encontrado', 401));
    }

    const user = rows[0];
    if (user.estado !== 'ACTIVO') {
      return next(new AppError('Cuenta inactiva o bloqueada', 403));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Usuario no autenticado', 401));
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return next(new AppError('No tienes permisos para acceder a este recurso', 403));
    }

    next();
  };
}

module.exports = {
  verifyToken,
  requireRole
};
