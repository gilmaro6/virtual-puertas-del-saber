const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const MAX_FAILED_ATTEMPTS = 5;

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function register({ nombre, apellido, email, password, telefono = null, documentoIdentidad = null }, ipOrigen) {
  if (!nombre || !apellido || !email || !password) {
    throw new AppError('Nombre, apellido, correo y contrasena son obligatorios', 400);
  }

  if (password.length < 6) {
    throw new AppError('La contrasena debe tener al menos 6 caracteres', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existingEmail] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [normalizedEmail]);
  if (existingEmail.length > 0) {
    throw new AppError('El correo electronico ya esta registrado', 409);
  }

  if (documentoIdentidad) {
    const [existingDoc] = await pool.query(
      'SELECT id FROM usuarios WHERE documento_identidad = ?',
      [documentoIdentidad.trim()]
    );
    if (existingDoc.length > 0) {
      throw new AppError('El documento de identidad ya esta registrado', 409);
    }
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO usuarios (id, nombre, apellido, email, telefono, documento_identidad, password_hash, rol)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'CLIENTE')`,
    [
      id,
      nombre.trim(),
      apellido.trim(),
      normalizedEmail,
      telefono ? telefono.trim() : null,
      documentoIdentidad ? documentoIdentidad.trim() : null,
      passwordHash
    ]
  );

  const user = {
    id,
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    email: normalizedEmail,
    rol: 'CLIENTE'
  };

  const token = generateAccessToken(user);

  await logAudit({
    usuarioId: id,
    accion: 'REGISTRO_USUARIO',
    entidad: 'usuarios',
    entidadId: id,
    detalle: { email: normalizedEmail, rol: 'CLIENTE' },
    ipOrigen
  });

  return { user, token };
}

async function login({ email, password }, ipOrigen) {
  if (!email || !password) {
    throw new AppError('Correo y contrasena son obligatorios', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [rows] = await pool.query(
    `SELECT id, nombre, apellido, email, password_hash, rol, estado, intentos_fallidos
     FROM usuarios WHERE email = ?`,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    throw new AppError('Credenciales invalidas', 401);
  }

  const user = rows[0];

  if (user.estado === 'BLOQUEADO') {
    throw new AppError('Cuenta bloqueada por multiples intentos fallidos. Contacta al administrador.', 403);
  }

  if (user.estado !== 'ACTIVO') {
    throw new AppError('La cuenta se encuentra inactiva', 403);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    const newAttempts = user.intentos_fallidos + 1;
    const shouldBlock = newAttempts >= MAX_FAILED_ATTEMPTS;

    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = ?, estado = ? WHERE id = ?',
      [newAttempts, shouldBlock ? 'BLOQUEADO' : user.estado, user.id]
    );

    if (shouldBlock) {
      await logAudit({
        usuarioId: user.id,
        accion: 'CUENTA_BLOQUEADA',
        entidad: 'usuarios',
        entidadId: user.id,
        detalle: { intentos: newAttempts },
        ipOrigen
      });
    }

    throw new AppError('Credenciales invalidas', 401);
  }

  await pool.query(
    'UPDATE usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = ?',
    [user.id]
  );

  const safeUser = {
    id: user.id,
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email,
    rol: user.rol
  };

  const token = generateAccessToken(safeUser);

  await logAudit({
    usuarioId: user.id,
    accion: 'LOGIN',
    entidad: 'usuarios',
    entidadId: user.id,
    detalle: { email: user.email },
    ipOrigen
  });

  return { user: safeUser, token };
}

async function getProfile(usuarioId) {
  const [rows] = await pool.query(
    `SELECT id, nombre, apellido, email, telefono, documento_identidad, rol,
            email_verificado, estado, ultimo_acceso, creado_en
     FROM usuarios WHERE id = ?`,
    [usuarioId]
  );

  if (rows.length === 0) {
    throw new AppError('Usuario no encontrado', 404);
  }

  return rows[0];
}

async function updateProfile(usuarioId, { nombre, apellido, telefono, passwordActual, passwordNueva }, ipOrigen) {
  const [rows] = await pool.query(
    'SELECT id, nombre, apellido, telefono, password_hash FROM usuarios WHERE id = ?',
    [usuarioId]
  );

  if (rows.length === 0) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const currentUser = rows[0];
  let newPasswordHash = currentUser.password_hash;

  if (passwordNueva) {
    if (!passwordActual) {
      throw new AppError('Debes ingresar tu contrasena actual para cambiarla', 400);
    }
    if (passwordNueva.length < 6) {
      throw new AppError('La nueva contrasena debe tener al menos 6 caracteres', 400);
    }
    const validCurrent = await bcrypt.compare(passwordActual, currentUser.password_hash);
    if (!validCurrent) {
      throw new AppError('La contrasena actual es incorrecta', 400);
    }
    newPasswordHash = await bcrypt.hash(passwordNueva, 10);
  }

  const updatedNombre = nombre ? nombre.trim() : currentUser.nombre;
  const updatedApellido = apellido ? apellido.trim() : currentUser.apellido;
  const updatedTelefono = telefono !== undefined ? (telefono ? telefono.trim() : null) : currentUser.telefono;

  await pool.query(
    'UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ?, password_hash = ? WHERE id = ?',
    [updatedNombre, updatedApellido, updatedTelefono, newPasswordHash, usuarioId]
  );

  await logAudit({
    usuarioId,
    accion: 'ACTUALIZAR_PERFIL',
    entidad: 'usuarios',
    entidadId: usuarioId,
    detalle: { cambio_password: Boolean(passwordNueva) },
    ipOrigen
  });

  return getProfile(usuarioId);
}

async function logout(usuarioId, ipOrigen) {
  await logAudit({
    usuarioId,
    accion: 'LOGOUT',
    entidad: 'usuarios',
    entidadId: usuarioId,
    ipOrigen
  });
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  logout
};
