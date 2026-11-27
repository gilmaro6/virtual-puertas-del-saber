const { pool } = require('../config/database');
const AppError = require('../utils/appError');

async function getDashboardSummary() {
  const [[salesStats]] = await pool.query(
    `SELECT COUNT(*) AS total_pedidos,
            COALESCE(SUM(CASE WHEN estado != 'CANCELADO' THEN total ELSE 0 END), 0) AS ingresos_totales,
            SUM(CASE WHEN estado = 'PENDIENTE' THEN 1 ELSE 0 END) AS pedidos_pendientes
     FROM pedidos`
  );

  const [[rentalStats]] = await pool.query(
    `SELECT SUM(CASE WHEN estado = 'ACTIVO' AND fecha_vencimiento >= NOW() THEN 1 ELSE 0 END) AS alquileres_activos,
            SUM(CASE WHEN estado = 'ACTIVO' AND fecha_vencimiento < NOW() THEN 1 ELSE 0 END) AS alquileres_vencidos,
            COALESCE(SUM(multa), 0) AS total_multas
     FROM prestamos_alquileres`
  );

  const [[catalogStats]] = await pool.query(
    `SELECT COUNT(*) AS total_libros,
            (SELECT COUNT(*) FROM usuarios WHERE estado = 'ACTIVO') AS total_usuarios
     FROM libros WHERE estado != 'DESCONTINUADO'`
  );

  const [lowStockAlerts] = await pool.query(
    `SELECT l.id, l.titulo, l.stock_fisico, l.stock_minimo, f.nombre AS formato_nombre
     FROM libros l
     INNER JOIN formatos f ON l.formato_id = f.id
     WHERE f.requiere_stock = 1 AND l.estado != 'DESCONTINUADO' AND l.stock_fisico <= l.stock_minimo
     ORDER BY l.stock_fisico ASC`
  );

  const [expiredRentals] = await pool.query(
    `SELECT pa.id, l.titulo, u.nombre, u.apellido, u.email, pa.fecha_vencimiento
     FROM prestamos_alquileres pa
     INNER JOIN libros l ON pa.libro_id = l.id
     INNER JOIN usuarios u ON pa.usuario_id = u.id
     WHERE pa.estado = 'ACTIVO' AND pa.fecha_vencimiento < NOW()
     ORDER BY pa.fecha_vencimiento ASC`
  );

  const [salesByMonth] = await pool.query(
    `SELECT DATE_FORMAT(creado_en, '%Y-%m') AS mes,
            COUNT(*) AS cantidad,
            COALESCE(SUM(total), 0) AS total
     FROM pedidos
     WHERE estado != 'CANCELADO'
     GROUP BY DATE_FORMAT(creado_en, '%Y-%m')
     ORDER BY mes ASC
     LIMIT 6`
  );

  const [booksByCategory] = await pool.query(
    `SELECT COALESCE(c.nombre, 'Sin categoria') AS categoria, COUNT(l.id) AS total
     FROM libros l
     LEFT JOIN categorias c ON l.categoria_id = c.id
     WHERE l.estado != 'DESCONTINUADO'
     GROUP BY c.nombre
     ORDER BY total DESC`
  );

  return {
    kpis: {
      ingresos_totales: Number(salesStats.ingresos_totales) || 0,
      total_pedidos: Number(salesStats.total_pedidos) || 0,
      pedidos_pendientes: Number(salesStats.pedidos_pendientes) || 0,
      alquileres_activos: Number(rentalStats.alquileres_activos) || 0,
      alquileres_vencidos: Number(rentalStats.alquileres_vencidos) || 0,
      total_multas: Number(rentalStats.total_multas) || 0,
      total_libros: Number(catalogStats.total_libros) || 0,
      total_usuarios: Number(catalogStats.total_usuarios) || 0
    },
    alertas: {
      stock_bajo: lowStockAlerts,
      alquileres_vencidos: expiredRentals
    },
    graficas: {
      ventas_mes: salesByMonth,
      libros_categoria: booksByCategory
    }
  };
}

function escapeCsv(value) {
  const str = String(value === null || value === undefined ? '' : value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function exportCsvReport(type) {
  let headers = [];
  let rows = [];

  if (type === 'sales') {
    headers = ['Orden', 'Factura', 'Cliente', 'Correo', 'Fecha', 'Estado', 'Metodo Pago', 'Total'];
    const [data] = await pool.query(
      `SELECT p.numero_orden, f.numero_factura, CONCAT(u.nombre, ' ', u.apellido) AS cliente,
              u.email, p.creado_en, p.estado, pg.metodo_pago, p.total
       FROM pedidos p
       INNER JOIN usuarios u ON p.usuario_id = u.id
       LEFT JOIN facturas f ON p.id = f.pedido_id
       LEFT JOIN pagos pg ON p.id = pg.pedido_id
       ORDER BY p.creado_en DESC`
    );
    rows = data.map((r) => [
      r.numero_orden, r.numero_factura || '-', r.cliente, r.email,
      new Date(r.creado_en).toISOString(), r.estado, r.metodo_pago || '-', r.total
    ]);
  } else if (type === 'inventory') {
    headers = ['Fecha', 'Libro', 'Tipo Movimiento', 'Cantidad', 'Stock Anterior', 'Stock Nuevo', 'Motivo'];
    const [data] = await pool.query(
      `SELECT m.creado_en, l.titulo, m.tipo_movimiento, m.cantidad, m.stock_anterior, m.stock_nuevo, m.motivo
       FROM movimientos_inventario m
       INNER JOIN libros l ON m.libro_id = l.id
       ORDER BY m.creado_en DESC`
    );
    rows = data.map((r) => [
      new Date(r.creado_en).toISOString(), r.titulo, r.tipo_movimiento,
      r.cantidad, r.stock_anterior, r.stock_nuevo, r.motivo || ''
    ]);
  } else if (type === 'rentals') {
    headers = ['Orden', 'Libro', 'Formato', 'Cliente', 'Correo', 'Inicio', 'Vencimiento', 'Devolucion Real', 'Estado', 'Multa COP', 'Observaciones'];
    const [data] = await pool.query(
      `SELECT p.numero_orden, l.titulo, f.codigo AS formato, CONCAT(u.nombre, ' ', u.apellido) AS cliente,
              u.email, pa.fecha_inicio, pa.fecha_vencimiento, pa.fecha_devolucion_real,
              CASE WHEN pa.estado = 'ACTIVO' AND pa.fecha_vencimiento < NOW() THEN 'VENCIDO' ELSE pa.estado END AS estado_efectivo,
              pa.multa, pa.observaciones
       FROM prestamos_alquileres pa
       INNER JOIN usuarios u ON pa.usuario_id = u.id
       INNER JOIN libros l ON pa.libro_id = l.id
       INNER JOIN formatos f ON l.formato_id = f.id
       LEFT JOIN pedidos p ON pa.pedido_id = p.id
       ORDER BY pa.fecha_inicio DESC`
    );
    rows = data.map((r) => [
      r.numero_orden || '-', r.titulo, r.formato, r.cliente, r.email,
      new Date(r.fecha_inicio).toISOString(),
      new Date(r.fecha_vencimiento).toISOString(),
      r.fecha_devolucion_real ? new Date(r.fecha_devolucion_real).toISOString() : '-',
      r.estado_efectivo, Number(r.multa) || 0, r.observaciones || ''
    ]);
  } else if (type === 'audit') {
    headers = ['Fecha', 'Usuario', 'Accion', 'Entidad', 'IP'];
    const [data] = await pool.query(
      `SELECT a.creado_en, u.email, a.accion, a.entidad, a.ip_origen
       FROM auditoria_acciones a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       ORDER BY a.creado_en DESC`
    );
    rows = data.map((r) => [
      new Date(r.creado_en).toISOString(), r.email || 'Sistema', r.accion, r.entidad, r.ip_origen || ''
    ]);
  } else {
    throw new AppError('Tipo de reporte invalido', 400);
  }

  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(','))
  ];
  return `\uFEFF${csvLines.join('\n')}`;
}

module.exports = {
  getDashboardSummary,
  exportCsvReport
};
