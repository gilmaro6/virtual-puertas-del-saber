const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

async function logAudit({ usuarioId = null, accion, entidad, entidadId = null, detalle = null, ipOrigen = null }) {
  try {
    await pool.query(
      `INSERT INTO auditoria_acciones (id, usuario_id, accion, entidad, entidad_id, detalle, ip_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        usuarioId,
        accion,
        entidad,
        entidadId !== null && entidadId !== undefined ? String(entidadId) : null,
        detalle ? JSON.stringify(detalle) : null,
        ipOrigen
      ]
    );
  } catch (error) {
    logger.warn(`No se pudo registrar auditoria (${accion}): ${error.message}`);
  }
}

module.exports = {
  logAudit
};
