const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');

async function listUsers({ q = '' }) {
  const conditions = [];
  const params = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    conditions.push('(nombre LIKE ? OR apellido LIKE ? OR email LIKE ? OR documento_identidad LIKE ?)');
    params.push(term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT id, nombre, apellido, email, telefono, documento_identidad, rol,
            email_verificado, estado, intentos_fallidos, ultimo_acceso, creado_en
     FROM usuarios
     ${whereClause}
     ORDER BY creado_en DESC`,
    params
  );

  return rows;
}

async function updateUser(userId, data, adminId, ipOrigen) {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [userId]);
  if (rows.length === 0) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const current = rows[0];
  const validStates = ['ACTIVO', 'INACTIVO', 'BLOQUEADO'];

  const nextRol = data.rol ? data.rol.trim().toUpperCase() : current.rol;
  const nextEstado = data.estado || current.estado;

  const [roleRows] = await pool.query('SELECT id, nombre FROM roles WHERE nombre = ? AND activo = 1', [nextRol]);
  if (roleRows.length === 0) {
    throw new AppError('El rol seleccionado no existe o esta inactivo', 400);
  }
  if (!validStates.includes(nextEstado)) {
    throw new AppError('Estado invalido', 400);
  }

  const resetAttempts = nextEstado === 'ACTIVO' ? 0 : current.intentos_fallidos;

  await pool.query(
    `UPDATE usuarios
     SET nombre = ?, apellido = ?, telefono = ?, documento_identidad = ?,
         rol = ?, rol_id = ?, estado = ?, intentos_fallidos = ?
     WHERE id = ?`,
    [
      data.nombre !== undefined ? data.nombre.trim() : current.nombre,
      data.apellido !== undefined ? data.apellido.trim() : current.apellido,
      data.telefono !== undefined ? (data.telefono ? data.telefono.trim() : null) : current.telefono,
      data.documento_identidad !== undefined
        ? (data.documento_identidad ? data.documento_identidad.trim() : null)
        : current.documento_identidad,
      roleRows[0].nombre,
      roleRows[0].id,
      nextEstado,
      resetAttempts,
      userId
    ]
  );

  await logAudit({
    usuarioId: adminId,
    accion: 'ADMIN_ACTUALIZAR_USUARIO',
    entidad: 'usuarios',
    entidadId: userId,
    detalle: { rol: nextRol, estado: nextEstado },
    ipOrigen
  });

  const [updated] = await pool.query(
    `SELECT id, nombre, apellido, email, telefono, documento_identidad, rol,
            email_verificado, estado, intentos_fallidos, ultimo_acceso, creado_en
     FROM usuarios WHERE id = ?`,
    [userId]
  );
  return updated[0];
}

async function resetUserPassword(userId, { nueva_contrasena }, adminId, ipOrigen) {
  if (!nueva_contrasena || nueva_contrasena.length < 6) {
    throw new AppError('La nueva contrasena debe tener al menos 6 caracteres', 400);
  }

  const [rows] = await pool.query('SELECT id, email FROM usuarios WHERE id = ?', [userId]);
  if (rows.length === 0) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const passwordHash = await bcrypt.hash(nueva_contrasena, 10);
  await pool.query(
    "UPDATE usuarios SET password_hash = ?, intentos_fallidos = 0, estado = 'ACTIVO' WHERE id = ?",
    [passwordHash, userId]
  );

  await logAudit({
    usuarioId: adminId,
    accion: 'ADMIN_RESET_PASSWORD',
    entidad: 'usuarios',
    entidadId: userId,
    detalle: { email: rows[0].email },
    ipOrigen
  });
}

module.exports = {
  listUsers,
  updateUser,
  resetUserPassword
};
