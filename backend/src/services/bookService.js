const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const AppError = require('../utils/appError');
const { logAudit } = require('./auditService');

function buildSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureNoBooksLinked(column, id, entityLabel) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM libros WHERE ${column} = ?`,
    [id]
  );
  const total = rows[0].total;
  if (total > 0) {
    throw new AppError(
      `No se puede modificar ni eliminar ${entityLabel} porque tiene ${total} libro(s) asociado(s)`,
      409
    );
  }
}

async function listBooks({ q, categoria, formato, estado, page = 1, limit = 12 }) {
  const conditions = [];
  const params = [];

  if (q) {
    conditions.push('(titulo LIKE ? OR autor_nombre LIKE ? OR isbn LIKE ?)');
    const term = `%${q.trim()}%`;
    params.push(term, term, term);
  }

  if (categoria) {
    conditions.push('(categoria_id = ? OR categoria_slug = ?)');
    params.push(categoria, categoria);
  }

  if (formato) {
    conditions.push('(formato_id = ? OR formato = ?)');
    params.push(formato, formato);
  }

  if (estado) {
    conditions.push('estado = ?');
    params.push(estado);
  } else {
    conditions.push("estado != 'DESCONTINUADO'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM vw_catalogo_libros ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT * FROM vw_catalogo_libros ${whereClause}
     ORDER BY creado_en DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    items: rows,
    pagination: {
      total: countRows[0].total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(countRows[0].total / safeLimit)
    }
  };
}

async function getBookById(id) {
  const [rows] = await pool.query('SELECT * FROM vw_catalogo_libros WHERE id = ?', [id]);
  if (rows.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  const [reviews] = await pool.query(
    `SELECT r.id, r.calificacion, r.comentario, r.creado_en,
            u.nombre, u.apellido
     FROM resenas r
     INNER JOIN usuarios u ON r.usuario_id = u.id
     WHERE r.libro_id = ?
     ORDER BY r.creado_en DESC`,
    [id]
  );

  return {
    ...rows[0],
    resenas: reviews
  };
}

async function getCatalogMetadata() {
  const [categorias] = await pool.query(
    `SELECT c.id, c.nombre, c.slug, c.descripcion, COUNT(l.id) AS libros_asociados
     FROM categorias c
     LEFT JOIN libros l ON l.categoria_id = c.id
     WHERE c.activo = 1
     GROUP BY c.id, c.nombre, c.slug, c.descripcion
     ORDER BY c.nombre ASC`
  );
  const [autores] = await pool.query(
    `SELECT a.id, a.nombre, a.nacionalidad, COUNT(l.id) AS libros_asociados
     FROM autores a
     LEFT JOIN libros l ON l.autor_id = a.id
     GROUP BY a.id, a.nombre, a.nacionalidad
     ORDER BY a.nombre ASC`
  );
  const [editoriales] = await pool.query(
    `SELECT e.id, e.nombre, e.pais, COUNT(l.id) AS libros_asociados
     FROM editoriales e
     LEFT JOIN libros l ON l.editorial_id = e.id
     GROUP BY e.id, e.nombre, e.pais
     ORDER BY e.nombre ASC`
  );
  const [formatos] = await pool.query(
    `SELECT f.id, f.codigo, f.nombre, f.descripcion, f.requiere_stock, COUNT(l.id) AS libros_asociados
     FROM formatos f
     LEFT JOIN libros l ON l.formato_id = f.id
     WHERE f.activo = 1
     GROUP BY f.id, f.codigo, f.nombre, f.descripcion, f.requiere_stock
     ORDER BY f.nombre ASC`
  );

  return { categorias, autores, editoriales, formatos };
}

async function createBook(data, usuarioId, ipOrigen) {
  const {
    titulo,
    isbn = null,
    sinopsis = null,
    anio_publicacion = null,
    idioma = 'Espanol',
    paginas = null,
    formato_id,
    precio_venta,
    precio_alquiler = 0,
    stock_fisico = 0,
    stock_minimo = 3,
    portada_url = null,
    archivo_digital_url = null,
    categoria_id = null,
    autor_id = null,
    editorial_id = null
  } = data;

  if (!titulo || precio_venta === undefined || !formato_id) {
    throw new AppError('El titulo, formato y precio de venta son obligatorios', 400);
  }

  const [formats] = await pool.query('SELECT id, requiere_stock FROM formatos WHERE id = ?', [formato_id]);
  if (formats.length === 0) {
    throw new AppError('Formato seleccionado no existe', 400);
  }

  if (isbn) {
    const [existing] = await pool.query('SELECT id FROM libros WHERE isbn = ?', [isbn.trim()]);
    if (existing.length > 0) {
      throw new AppError('Ya existe un libro con ese ISBN', 409);
    }
  }

  const id = uuidv4();
  const stockNum = Math.max(Number(stock_fisico) || 0, 0);
  const estadoInicial = formats[0].requiere_stock && stockNum === 0 ? 'AGOTADO' : 'DISPONIBLE';

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO libros (
        id, titulo, isbn, sinopsis, anio_publicacion, idioma, paginas, formato_id,
        precio_venta, precio_alquiler, stock_fisico, stock_minimo,
        portada_url, archivo_digital_url, categoria_id, autor_id, editorial_id, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        titulo.trim(),
        isbn ? isbn.trim() : null,
        sinopsis,
        anio_publicacion,
        idioma,
        paginas,
        formato_id,
        Number(precio_venta),
        Number(precio_alquiler) || 0,
        stockNum,
        Number(stock_minimo) || 0,
        portada_url,
        archivo_digital_url,
        categoria_id || null,
        autor_id || null,
        editorial_id || null,
        estadoInicial
      ]
    );

    if (stockNum > 0) {
      await connection.query(
        `INSERT INTO movimientos_inventario (id, libro_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo)
         VALUES (?, ?, ?, 'ENTRADA', ?, 0, ?, 'Registro inicial de libro')`,
        [uuidv4(), id, usuarioId, stockNum, stockNum]
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
    usuarioId,
    accion: 'CREAR_LIBRO',
    entidad: 'libros',
    entidadId: id,
    detalle: { titulo: titulo.trim(), stock_fisico: stockNum },
    ipOrigen
  });

  return getBookById(id);
}

async function updateBook(id, data, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT * FROM libros WHERE id = ?', [id]);
  if (rows.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  const current = rows[0];
  const nextFormatoId = data.formato_id || current.formato_id;
  const [formats] = await pool.query('SELECT id, requiere_stock FROM formatos WHERE id = ?', [nextFormatoId]);
  if (formats.length === 0) {
    throw new AppError('Formato seleccionado no existe', 400);
  }

  const nextStock = data.stock_fisico !== undefined ? Math.max(Number(data.stock_fisico), 0) : current.stock_fisico;
  let nextEstado = data.estado || current.estado;

  if (!data.estado && formats[0].requiere_stock) {
    nextEstado = nextStock === 0 ? 'AGOTADO' : 'DISPONIBLE';
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE libros SET
        titulo = ?, isbn = ?, sinopsis = ?, anio_publicacion = ?, idioma = ?, paginas = ?,
        formato_id = ?, precio_venta = ?, precio_alquiler = ?, stock_fisico = ?, stock_minimo = ?,
        portada_url = ?, archivo_digital_url = ?, categoria_id = ?, autor_id = ?, editorial_id = ?, estado = ?
       WHERE id = ?`,
      [
        data.titulo !== undefined ? data.titulo.trim() : current.titulo,
        data.isbn !== undefined ? (data.isbn ? data.isbn.trim() : null) : current.isbn,
        data.sinopsis !== undefined ? data.sinopsis : current.sinopsis,
        data.anio_publicacion !== undefined ? data.anio_publicacion : current.anio_publicacion,
        data.idioma !== undefined ? data.idioma : current.idioma,
        data.paginas !== undefined ? data.paginas : current.paginas,
        nextFormatoId,
        data.precio_venta !== undefined ? Number(data.precio_venta) : current.precio_venta,
        data.precio_alquiler !== undefined ? Number(data.precio_alquiler) : current.precio_alquiler,
        nextStock,
        data.stock_minimo !== undefined ? Number(data.stock_minimo) : current.stock_minimo,
        data.portada_url !== undefined ? data.portada_url : current.portada_url,
        data.archivo_digital_url !== undefined ? data.archivo_digital_url : current.archivo_digital_url,
        data.categoria_id !== undefined ? (data.categoria_id || null) : current.categoria_id,
        data.autor_id !== undefined ? (data.autor_id || null) : current.autor_id,
        data.editorial_id !== undefined ? (data.editorial_id || null) : current.editorial_id,
        nextEstado,
        id
      ]
    );

    if (nextStock !== current.stock_fisico) {
      await connection.query(
        `INSERT INTO movimientos_inventario (id, libro_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, motivo)
         VALUES (?, ?, ?, 'AJUSTE', ?, ?, ?, ?)`,
        [
          uuidv4(),
          id,
          usuarioId,
          Math.abs(nextStock - current.stock_fisico),
          current.stock_fisico,
          nextStock,
          data.motivo_ajuste || 'Actualizacion manual de inventario'
        ]
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
    usuarioId,
    accion: 'ACTUALIZAR_LIBRO',
    entidad: 'libros',
    entidadId: id,
    detalle: { stock_anterior: current.stock_fisico, stock_nuevo: nextStock },
    ipOrigen
  });

  return getBookById(id);
}

async function deleteBook(id, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT id, titulo FROM libros WHERE id = ?', [id]);
  if (rows.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  await pool.query("UPDATE libros SET estado = 'DESCONTINUADO' WHERE id = ?", [id]);

  await logAudit({
    usuarioId,
    accion: 'DESCONTINUAR_LIBRO',
    entidad: 'libros',
    entidadId: id,
    detalle: { titulo: rows[0].titulo },
    ipOrigen
  });
}

async function addOrUpdateReview(libroId, usuarioId, { calificacion, comentario = null }) {
  const score = Number(calificacion);
  if (!score || score < 1 || score > 5) {
    throw new AppError('La calificacion debe estar entre 1 y 5', 400);
  }

  const [books] = await pool.query('SELECT id FROM libros WHERE id = ?', [libroId]);
  if (books.length === 0) {
    throw new AppError('Libro no encontrado', 404);
  }

  const [existing] = await pool.query(
    'SELECT id FROM resenas WHERE usuario_id = ? AND libro_id = ?',
    [usuarioId, libroId]
  );

  if (existing.length > 0) {
    await pool.query(
      'UPDATE resenas SET calificacion = ?, comentario = ? WHERE id = ?',
      [score, comentario, existing[0].id]
    );
  } else {
    await pool.query(
      'INSERT INTO resenas (id, usuario_id, libro_id, calificacion, comentario) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), usuarioId, libroId, score, comentario]
    );
  }

  return getBookById(libroId);
}

// --- Parametrizacion: Categorias ---

async function createCategory({ nombre, descripcion = null }) {
  if (!nombre) throw new AppError('El nombre de la categoria es obligatorio', 400);
  const slug = buildSlug(nombre);
  const id = uuidv4();
  await pool.query(
    'INSERT INTO categorias (id, nombre, slug, descripcion) VALUES (?, ?, ?, ?)',
    [id, nombre.trim(), slug, descripcion]
  );
  return { id, nombre: nombre.trim(), slug, descripcion };
}

async function updateCategory(id, { nombre, descripcion = null }, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Categoria no encontrada', 404);

  await ensureNoBooksLinked('categoria_id', id, 'esta categoria');

  if (!nombre) throw new AppError('El nombre de la categoria es obligatorio', 400);
  const slug = buildSlug(nombre);
  await pool.query(
    'UPDATE categorias SET nombre = ?, slug = ?, descripcion = ? WHERE id = ?',
    [nombre.trim(), slug, descripcion, id]
  );

  await logAudit({ usuarioId, accion: 'ACTUALIZAR_CATEGORIA', entidad: 'categorias', entidadId: id, ipOrigen });
  return { id, nombre: nombre.trim(), slug, descripcion };
}

async function deleteCategory(id, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT id FROM categorias WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Categoria no encontrada', 404);

  await ensureNoBooksLinked('categoria_id', id, 'esta categoria');
  await pool.query('DELETE FROM categorias WHERE id = ?', [id]);
  await logAudit({ usuarioId, accion: 'ELIMINAR_CATEGORIA', entidad: 'categorias', entidadId: id, ipOrigen });
}

// --- Parametrizacion: Autores ---

async function createAuthor({ nombre, nacionalidad = null, biografia = null }) {
  if (!nombre) throw new AppError('El nombre del autor es obligatorio', 400);
  const id = uuidv4();
  await pool.query(
    'INSERT INTO autores (id, nombre, nacionalidad, biografia) VALUES (?, ?, ?, ?)',
    [id, nombre.trim(), nacionalidad, biografia]
  );
  return { id, nombre: nombre.trim(), nacionalidad, biografia };
}

async function updateAuthor(id, { nombre, nacionalidad = null, biografia = null }, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT * FROM autores WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Autor no encontrado', 404);

  await ensureNoBooksLinked('autor_id', id, 'este autor');

  if (!nombre) throw new AppError('El nombre del autor es obligatorio', 400);
  await pool.query(
    'UPDATE autores SET nombre = ?, nacionalidad = ?, biografia = ? WHERE id = ?',
    [nombre.trim(), nacionalidad, biografia, id]
  );

  await logAudit({ usuarioId, accion: 'ACTUALIZAR_AUTOR', entidad: 'autores', entidadId: id, ipOrigen });
  return { id, nombre: nombre.trim(), nacionalidad, biografia };
}

async function deleteAuthor(id, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT id FROM autores WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Autor no encontrado', 404);

  await ensureNoBooksLinked('autor_id', id, 'este autor');
  await pool.query('DELETE FROM autores WHERE id = ?', [id]);
  await logAudit({ usuarioId, accion: 'ELIMINAR_AUTOR', entidad: 'autores', entidadId: id, ipOrigen });
}

// --- Parametrizacion: Editoriales ---

async function createPublisher({ nombre, pais = null, sitio_web = null }) {
  if (!nombre) throw new AppError('El nombre de la editorial es obligatorio', 400);
  const id = uuidv4();
  await pool.query(
    'INSERT INTO editoriales (id, nombre, pais, sitio_web) VALUES (?, ?, ?, ?)',
    [id, nombre.trim(), pais, sitio_web]
  );
  return { id, nombre: nombre.trim(), pais, sitio_web };
}

async function updatePublisher(id, { nombre, pais = null, sitio_web = null }, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT * FROM editoriales WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Editorial no encontrada', 404);

  await ensureNoBooksLinked('editorial_id', id, 'esta editorial');

  if (!nombre) throw new AppError('El nombre de la editorial es obligatorio', 400);
  await pool.query(
    'UPDATE editoriales SET nombre = ?, pais = ?, sitio_web = ? WHERE id = ?',
    [nombre.trim(), pais, sitio_web, id]
  );

  await logAudit({ usuarioId, accion: 'ACTUALIZAR_EDITORIAL', entidad: 'editoriales', entidadId: id, ipOrigen });
  return { id, nombre: nombre.trim(), pais, sitio_web };
}

async function deletePublisher(id, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT id FROM editoriales WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Editorial no encontrada', 404);

  await ensureNoBooksLinked('editorial_id', id, 'esta editorial');
  await pool.query('DELETE FROM editoriales WHERE id = ?', [id]);
  await logAudit({ usuarioId, accion: 'ELIMINAR_EDITORIAL', entidad: 'editoriales', entidadId: id, ipOrigen });
}

// --- Parametrizacion: Formatos ---

async function createFormat({ codigo, nombre, descripcion = null, requiere_stock = 1 }) {
  if (!codigo || !nombre) {
    throw new AppError('El codigo y el nombre del formato son obligatorios', 400);
  }
  const cleanCode = codigo.trim().toUpperCase().replace(/\s+/g, '_');
  const id = uuidv4();
  await pool.query(
    'INSERT INTO formatos (id, codigo, nombre, descripcion, requiere_stock) VALUES (?, ?, ?, ?, ?)',
    [id, cleanCode, nombre.trim(), descripcion, requiere_stock ? 1 : 0]
  );
  return { id, codigo: cleanCode, nombre: nombre.trim(), descripcion, requiere_stock: requiere_stock ? 1 : 0 };
}

async function updateFormat(id, { codigo, nombre, descripcion = null, requiere_stock = 1 }, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT * FROM formatos WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Formato no encontrado', 404);

  await ensureNoBooksLinked('formato_id', id, 'este formato');

  if (!codigo || !nombre) {
    throw new AppError('El codigo y el nombre del formato son obligatorios', 400);
  }
  const cleanCode = codigo.trim().toUpperCase().replace(/\s+/g, '_');
  await pool.query(
    'UPDATE formatos SET codigo = ?, nombre = ?, descripcion = ?, requiere_stock = ? WHERE id = ?',
    [cleanCode, nombre.trim(), descripcion, requiere_stock ? 1 : 0, id]
  );

  await logAudit({ usuarioId, accion: 'ACTUALIZAR_FORMATO', entidad: 'formatos', entidadId: id, ipOrigen });
  return { id, codigo: cleanCode, nombre: nombre.trim(), descripcion, requiere_stock: requiere_stock ? 1 : 0 };
}

async function deleteFormat(id, usuarioId, ipOrigen) {
  const [rows] = await pool.query('SELECT id FROM formatos WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Formato no encontrado', 404);

  await ensureNoBooksLinked('formato_id', id, 'este formato');
  await pool.query('DELETE FROM formatos WHERE id = ?', [id]);
  await logAudit({ usuarioId, accion: 'ELIMINAR_FORMATO', entidad: 'formatos', entidadId: id, ipOrigen });
}

module.exports = {
  listBooks,
  getBookById,
  getCatalogMetadata,
  createBook,
  updateBook,
  deleteBook,
  addOrUpdateReview,
  createCategory,
  updateCategory,
  deleteCategory,
  createAuthor,
  updateAuthor,
  deleteAuthor,
  createPublisher,
  updatePublisher,
  deletePublisher,
  createFormat,
  updateFormat,
  deleteFormat
};
