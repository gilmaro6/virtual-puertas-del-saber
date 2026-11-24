const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');

async function getEffectivePermissions(usuarioId, rolNombre) {
  const [rolePerms] = await pool.query(
    `SELECT p.codigo
     FROM permisos p
     INNER JOIN rol_permisos rp ON p.id = rp.permiso_id
     INNER JOIN roles r ON rp.rol_id = r.id
     WHERE r.nombre = ? AND r.activo = 1`,
    [rolNombre]
  );

  const permSet = new Set(rolePerms.map((row) => row.codigo));

  const [userOverrides] = await pool.query(
    `SELECT p.codigo, up.concedido
     FROM usuario_permisos up
     INNER JOIN permisos p ON up.permiso_id = p.id
     WHERE up.usuario_id = ?`,
    [usuarioId]
  );

  for (const row of userOverrides) {
    if (row.concedido) {
      permSet.add(row.codigo);
    } else {
      permSet.delete(row.codigo);
    }
  }

  return Array.from(permSet).sort();
}

async function listPermissions() {
  const [rows] = await pool.query(
    'SELECT id, codigo, modulo, nombre, descripcion FROM permisos ORDER BY modulo ASC, nombre ASC'
  );
  return rows;
}

async function listRoles() {
  const [roles] = await pool.query(
    `SELECT r.id, r.nombre, r.descripcion, r.es_sistema, r.activo, r.creado_en,
            COUNT(DISTINCT u.id) AS total_usuarios
     FROM roles r
     LEFT JOIN usuarios u ON u.rol = r.nombre
     GROUP BY r.id, r.nombre, r.descripcion, r.es_sistema, r.activo, r.creado_en
     ORDER BY r.es_sistema DESC, r.nombre ASC`
  );

  const [rolePerms] = await pool.query(
    `SELECT rp.rol_id, p.id AS permiso_id, p.codigo
     FROM rol_permisos rp
     INNER JOIN permisos p ON rp.permiso_id = p.id`
  );

  return roles.map((role) => {
    const perms = rolePerms.filter((rp) => rp.rol_id === role.id);
    return {
      ...role,
      permisos_ids: perms.map((p) => p.permiso_id),
      permisos_codigos: perms.map((p) => p.codigo)
    };
  });
}

async function createRole({ nombre, descripcion = null, permisosIds = [] }, adminId, ipOrigen) {
  if (!nombre || !nombre.trim()) {
    throw new AppError('El nombre del rol es obligatorio', 400);
  }

  const normalizedName = nombre.trim().toUpperCase().replace(/\s+/g, '_');
  const [existing] = await pool.query('SELECT id FROM roles WHERE nombre = ?', [normalizedName]);
  if (existing.length > 0) {
    throw new AppError('Ya existe un rol con ese nombre', 409);
  }

  let newRoleId;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [insertRes] = await connection.query(
      'INSERT INTO roles (nombre, descripcion, es_sistema, activo) VALUES (?, ?, 0, 1)',
      [normalizedName, descripcion ? descripcion.trim() : null]
    );
    newRoleId = insertRes.insertId;

    if (Array.isArray(permisosIds) && permisosIds.length > 0) {
      for (const permId of permisosIds) {
        await connection.query(
          'INSERT IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)',
          [newRoleId, Number(permId)]
        );
      }
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
    accion: 'CREAR_ROL',
    entidad: 'roles',
    entidadId: newRoleId,
    detalle: { nombre: normalizedName, total_permisos: permisosIds.length },
    ipOrigen
  });

  const roles = await listRoles();
  return roles.find((r) => Number(r.id) === Number(newRoleId));
}

async function updateRolePermissions(rolId, permisosIds, adminId, ipOrigen) {
  const numericRoleId = Number(rolId);
  const [roles] = await pool.query('SELECT id, nombre FROM roles WHERE id = ?', [numericRoleId]);
  if (roles.length === 0) {
    throw new AppError('Rol no encontrado', 404);
  }

  const role = roles[0];
  let finalPerms = Array.isArray(permisosIds) ? permisosIds.map((p) => Number(p)).filter(Boolean) : [];

  if (role.nombre === 'ADMIN') {
    const [critical] = await pool.query(
      "SELECT id FROM permisos WHERE codigo IN ('PANEL_ADMIN_ACCESO', 'ROLES_PERMISOS_GESTIONAR')"
    );
    for (const c of critical) {
      if (!finalPerms.includes(Number(c.id))) {
        finalPerms.push(Number(c.id));
      }
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM rol_permisos WHERE rol_id = ?', [numericRoleId]);

    for (const permId of finalPerms) {
      await connection.query(
        'INSERT IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)',
        [numericRoleId, permId]
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
    accion: 'ACTUALIZAR_PERMISOS_ROL',
    entidad: 'roles',
    entidadId: numericRoleId,
    detalle: { rol: role.nombre, total_permisos: finalPerms.length },
    ipOrigen
  });

  const updated = await listRoles();
  return updated.find((r) => Number(r.id) === numericRoleId);
}

async function deleteRole(rolId, adminId, ipOrigen) {
  const numericRoleId = Number(rolId);
  const [roles] = await pool.query('SELECT id, nombre, es_sistema FROM roles WHERE id = ?', [numericRoleId]);
  if (roles.length === 0) {
    throw new AppError('Rol no encontrado', 404);
  }

  const role = roles[0];
  if (role.es_sistema) {
    throw new AppError('No se puede eliminar un rol base del sistema', 409);
  }

  const [users] = await pool.query('SELECT COUNT(*) AS total FROM usuarios WHERE rol = ?', [role.nombre]);
  if (users[0].total > 0) {
    throw new AppError(`No se puede eliminar este rol porque tiene ${users[0].total} usuario(s) asignado(s)`, 409);
  }

  await pool.query('DELETE FROM roles WHERE id = ?', [numericRoleId]);
  await logAudit({
    usuarioId: adminId,
    accion: 'ELIMINAR_ROL',
    entidad: 'roles',
    entidadId: numericRoleId,
    detalle: { nombre: role.nombre },
    ipOrigen
  });
}

async function getUserPermissionsDetail(usuarioId) {
  const [users] = await pool.query(
    'SELECT id, nombre, apellido, email, rol FROM usuarios WHERE id = ?',
    [usuarioId]
  );
  if (users.length === 0) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const user = users[0];
  const [allPerms] = await pool.query(
    'SELECT id, codigo, modulo, nombre, descripcion FROM permisos ORDER BY modulo ASC, nombre ASC'
  );
  const [rolePerms] = await pool.query(
    `SELECT rp.permiso_id
     FROM rol_permisos rp
     INNER JOIN roles r ON rp.rol_id = r.id
     WHERE r.nombre = ?`,
    [user.rol]
  );
  const [overrides] = await pool.query(
    'SELECT permiso_id, concedido FROM usuario_permisos WHERE usuario_id = ?',
    [usuarioId]
  );

  const roleSet = new Set(rolePerms.map((rp) => rp.permiso_id));
  const overrideMap = new Map(overrides.map((o) => [o.permiso_id, Boolean(o.concedido)]));

  const detalle = allPerms.map((p) => {
    const heredado = roleSet.has(p.id);
    const hasOverride = overrideMap.has(p.id);
    const estado = hasOverride ? (overrideMap.get(p.id) ? 'CONCEDIDO' : 'REVOCADO') : 'HEREDADO';
    const efectivo = hasOverride ? overrideMap.get(p.id) : heredado;
    return {
      ...p,
      heredado,
      estado,
      efectivo
    };
  });

  return { user, permisos: detalle };
}

async function updateUserPermissions(usuarioId, overrides, adminId, ipOrigen) {
  const [users] = await pool.query('SELECT id, email FROM usuarios WHERE id = ?', [usuarioId]);
  if (users.length === 0) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM usuario_permisos WHERE usuario_id = ?', [usuarioId]);

    if (Array.isArray(overrides)) {
      for (const item of overrides) {
        if (item.estado === 'CONCEDIDO' || item.estado === 'REVOCADO') {
          await connection.query(
            `INSERT INTO usuario_permisos (usuario_id, permiso_id, concedido, asignado_por)
             VALUES (?, ?, ?, ?)`,
            [usuarioId, Number(item.permiso_id), item.estado === 'CONCEDIDO' ? 1 : 0, adminId]
          );
        }
      }
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
    accion: 'ASIGNAR_PERMISOS_USUARIO',
    entidad: 'usuarios',
    entidadId: usuarioId,
    detalle: { email: users[0].email },
    ipOrigen
  });

  return getUserPermissionsDetail(usuarioId);
}

module.exports = {
  getEffectivePermissions,
  listPermissions,
  listRoles,
  createRole,
  updateRolePermissions,
  deleteRole,
  getUserPermissionsDetail,
  updateUserPermissions
};
