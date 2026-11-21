CREATE DATABASE IF NOT EXISTS puertas_del_saber_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE puertas_del_saber_db;

-- ==========================================================
-- 1. MODULO DE USUARIOS, VALIDACION Y SESIONES
-- ==========================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telefono VARCHAR(25) NULL,
  documento_identidad VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('ADMIN', 'CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  email_verificado TINYINT(1) NOT NULL DEFAULT 0,
  estado ENUM('ACTIVO', 'INACTIVO', 'BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  intentos_fallidos INT NOT NULL DEFAULT 0,
  ultimo_acceso TIMESTAMP NULL DEFAULT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_email (email),
  UNIQUE KEY uk_usuarios_documento (documento_identidad),
  KEY idx_usuarios_rol_estado (rol, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tokens_sesion (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  tipo ENUM('REFRESH', 'VERIFICACION', 'RECUPERACION') NOT NULL,
  expira_en TIMESTAMP NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  ip_origen VARCHAR(45) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tokens_usuario (usuario_id),
  KEY idx_tokens_tipo_expira (tipo, expira_en),
  CONSTRAINT fk_tokens_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 2. MODULO DE CATALOGO NORMALIZADO
-- ==========================================================

CREATE TABLE IF NOT EXISTS categorias (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_nombre (nombre),
  UNIQUE KEY uk_categorias_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS autores (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  nacionalidad VARCHAR(80) NULL,
  biografia TEXT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_autores_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editoriales (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  pais VARCHAR(80) NULL,
  sitio_web VARCHAR(200) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_editoriales_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS formatos (
  id CHAR(36) NOT NULL,
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  descripcion VARCHAR(255) NULL,
  requiere_stock TINYINT(1) NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_formatos_codigo (codigo),
  UNIQUE KEY uk_formatos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS libros (
  id CHAR(36) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  isbn VARCHAR(20) NULL,
  sinopsis TEXT NULL,
  anio_publicacion SMALLINT NULL,
  idioma VARCHAR(30) NOT NULL DEFAULT 'Espanol',
  paginas INT NULL,
  formato_id CHAR(36) NOT NULL,
  precio_venta DECIMAL(10, 2) NOT NULL,
  precio_alquiler DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  stock_fisico INT NOT NULL DEFAULT 0,
  stock_minimo INT NOT NULL DEFAULT 3,
  portada_url VARCHAR(255) NULL,
  archivo_digital_url VARCHAR(255) NULL,
  categoria_id CHAR(36) NULL,
  autor_id CHAR(36) NULL,
  editorial_id CHAR(36) NULL,
  estado ENUM('DISPONIBLE', 'AGOTADO', 'DESCONTINUADO') NOT NULL DEFAULT 'DISPONIBLE',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_libros_isbn (isbn),
  KEY idx_libros_titulo (titulo),
  KEY idx_libros_formato (formato_id),
  KEY idx_libros_categoria (categoria_id),
  KEY idx_libros_autor (autor_id),
  KEY idx_libros_editorial (editorial_id),
  KEY idx_libros_estado (estado),
  CONSTRAINT fk_libros_formato
    FOREIGN KEY (formato_id) REFERENCES formatos (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_libros_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_libros_autor
    FOREIGN KEY (autor_id) REFERENCES autores (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_libros_editorial
    FOREIGN KEY (editorial_id) REFERENCES editoriales (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resenas (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  libro_id CHAR(36) NOT NULL,
  calificacion TINYINT NOT NULL,
  comentario TEXT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_resena_usuario_libro (usuario_id, libro_id),
  KEY idx_resenas_libro (libro_id),
  CONSTRAINT chk_resena_calificacion CHECK (calificacion BETWEEN 1 AND 5),
  CONSTRAINT fk_resenas_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_resenas_libro
    FOREIGN KEY (libro_id) REFERENCES libros (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 3. MODULO DE CARRITO, COMPRAS, ALQUILERES Y PAGOS
-- ==========================================================

CREATE TABLE IF NOT EXISTS carrito_items (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  libro_id CHAR(36) NOT NULL,
  tipo_operacion ENUM('COMPRA', 'ALQUILER') NOT NULL DEFAULT 'COMPRA',
  cantidad INT NOT NULL DEFAULT 1,
  agregado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_carrito_usuario_libro_tipo (usuario_id, libro_id, tipo_operacion),
  KEY idx_carrito_usuario (usuario_id),
  CONSTRAINT fk_carrito_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_carrito_libro
    FOREIGN KEY (libro_id) REFERENCES libros (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pedidos (
  id CHAR(36) NOT NULL,
  numero_orden VARCHAR(20) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  descuento DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  impuestos DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  total DECIMAL(10, 2) NOT NULL,
  estado ENUM('PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  direccion_envio VARCHAR(255) NULL,
  ciudad VARCHAR(100) NULL,
  notas VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pedidos_numero_orden (numero_orden),
  KEY idx_pedidos_usuario (usuario_id),
  KEY idx_pedidos_estado (estado),
  CONSTRAINT fk_pedidos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS detalle_pedidos (
  id CHAR(36) NOT NULL,
  pedido_id CHAR(36) NOT NULL,
  libro_id CHAR(36) NOT NULL,
  tipo_operacion ENUM('COMPRA', 'ALQUILER') NOT NULL DEFAULT 'COMPRA',
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_detalle_pedido (pedido_id),
  KEY idx_detalle_libro (libro_id),
  CONSTRAINT fk_detalle_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_detalle_libro
    FOREIGN KEY (libro_id) REFERENCES libros (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prestamos_alquileres (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  libro_id CHAR(36) NOT NULL,
  pedido_id CHAR(36) NULL,
  fecha_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_vencimiento TIMESTAMP NOT NULL,
  fecha_devolucion_real TIMESTAMP NULL DEFAULT NULL,
  estado ENUM('ACTIVO', 'DEVUELTO', 'VENCIDO') NOT NULL DEFAULT 'ACTIVO',
  multa DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  observaciones VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_prestamos_usuario (usuario_id),
  KEY idx_prestamos_libro (libro_id),
  KEY idx_prestamos_estado_venc (estado, fecha_vencimiento),
  CONSTRAINT fk_prestamos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_prestamos_libro
    FOREIGN KEY (libro_id) REFERENCES libros (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_prestamos_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos (
  id CHAR(36) NOT NULL,
  pedido_id CHAR(36) NOT NULL,
  metodo_pago ENUM('TARJETA', 'PSE', 'TRANSFERENCIA', 'EFECTIVO') NOT NULL,
  referencia_transaccion VARCHAR(100) NOT NULL,
  monto DECIMAL(10, 2) NOT NULL,
  estado ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO') NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pagos_referencia (referencia_transaccion),
  KEY idx_pagos_pedido (pedido_id),
  CONSTRAINT fk_pagos_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 4. MODULO DE HISTORIAL, INVENTARIO Y AUDITORIA
-- ==========================================================

CREATE TABLE IF NOT EXISTS historial_estados_pedido (
  id CHAR(36) NOT NULL,
  pedido_id CHAR(36) NOT NULL,
  estado_anterior ENUM('PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO') NULL,
  estado_nuevo ENUM('PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO') NOT NULL,
  cambiado_por CHAR(36) NULL,
  comentario VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_historial_pedido (pedido_id),
  KEY idx_historial_usuario (cambiado_por),
  CONSTRAINT fk_historial_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
    CONSTRAINT fk_historial_usuario
    FOREIGN KEY (cambiado_por) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id CHAR(36) NOT NULL,
  libro_id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NULL,
  tipo_movimiento ENUM('ENTRADA', 'SALIDA_VENTA', 'SALIDA_ALQUILER', 'DEVOLUCION', 'AJUSTE') NOT NULL,
  cantidad INT NOT NULL,
  stock_anterior INT NOT NULL,
  stock_nuevo INT NOT NULL,
  motivo VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movimientos_libro (libro_id),
  KEY idx_movimientos_fecha (creado_en),
  CONSTRAINT fk_movimientos_libro
    FOREIGN KEY (libro_id) REFERENCES libros (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_movimientos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auditoria_acciones (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NULL,
  accion VARCHAR(80) NOT NULL,
  entidad VARCHAR(60) NOT NULL,
  entidad_id CHAR(36) NULL,
  detalle JSON NULL,
  ip_origen VARCHAR(45) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auditoria_usuario (usuario_id),
  KEY idx_auditoria_entidad (entidad, entidad_id),
  KEY idx_auditoria_fecha (creado_en),
  CONSTRAINT fk_auditoria_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- 5. VISTA DE CONSULTA PARA CATALOGO DE LIBROS
-- ==========================================================

CREATE OR REPLACE VIEW vw_catalogo_libros AS
SELECT
  l.id,
  l.titulo,
  l.isbn,
  l.sinopsis,
  l.anio_publicacion,
  l.idioma,
  l.paginas,
  f.id AS formato_id,
  f.codigo AS formato,
  f.nombre AS formato_nombre,
  f.requiere_stock,
  l.precio_venta,
  l.precio_alquiler,
  l.stock_fisico,
  l.stock_minimo,
  l.portada_url,
  l.estado,
  c.id AS categoria_id,
  c.nombre AS categoria_nombre,
  c.slug AS categoria_slug,
  a.id AS autor_id,
  a.nombre AS autor_nombre,
  e.id AS editorial_id,
  e.nombre AS editorial_nombre,
  COALESCE(ROUND(AVG(r.calificacion), 1), 0.0) AS calificacion_promedio,
  COUNT(r.id) AS total_resenas,
  l.creado_en,
  l.actualizado_en
FROM libros l
INNER JOIN formatos f ON l.formato_id = f.id
LEFT JOIN categorias c ON l.categoria_id = c.id
LEFT JOIN autores a ON l.autor_id = a.id
LEFT JOIN editoriales e ON l.editorial_id = e.id
LEFT JOIN resenas r ON l.id = r.libro_id
GROUP BY
  l.id, l.titulo, l.isbn, l.sinopsis, l.anio_publicacion,
  l.idioma, l.paginas, f.id, f.codigo, f.nombre, f.requiere_stock,
  l.precio_venta, l.precio_alquiler, l.stock_fisico, l.stock_minimo,
  l.portada_url, l.estado,
  c.id, c.nombre, c.slug,
  a.id, a.nombre,
  e.id, e.nombre,
  l.creado_en, l.actualizado_en;

-- ==========================================================
-- 6. DATOS INICIALES DE CATALOGO (SEED)
-- ==========================================================

INSERT IGNORE INTO categorias (id, nombre, slug, descripcion) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Literatura', 'literatura', 'Novelas, cuentos y obras clasicas de la literatura universal'),
  ('11111111-1111-4111-8111-111111111102', 'Tecnologia', 'tecnologia', 'Programacion, arquitectura de software e ingenieria'),
  ('11111111-1111-4111-8111-111111111103', 'Historia', 'historia', 'Ensayos historicos, biografias y cronicas'),
  ('11111111-1111-4111-8111-111111111104', 'Ciencia', 'ciencia', 'Divulgacion cientifica, fisica, matematicas y biologia'),
  ('11111111-1111-4111-8111-111111111105', 'Negocios', 'negocios', 'Emprendimiento, gestion de proyectos y economia');

INSERT IGNORE INTO autores (id, nombre, nacionalidad, biografia) VALUES
  ('33333333-3333-4333-8333-333333333301', 'Gabriel Garcia Marquez', 'Colombiana', 'Escritor y periodista colombiano, Premio Nobel de Literatura 1982.'),
  ('33333333-3333-4333-8333-333333333302', 'Robert C. Martin', 'Estadounidense', 'Ingeniero de software y autor referente en desarrollo agil y codigo limpio.'),
  ('33333333-3333-4333-8333-333333333303', 'Yuval Noah Harari', 'Israeli', 'Historiador y escritor especializado en historia de la humanidad.'),
  ('33333333-3333-4333-8333-333333333304', 'Stephen Hawking', 'Britanica', 'Fisico teorico y divulgador cientifico.'),
  ('33333333-3333-4333-8333-333333333305', 'Eric Ries', 'Estadounidense', 'Emprendedor y autor de la metodologia Lean Startup.');

INSERT IGNORE INTO editoriales (id, nombre, pais, sitio_web) VALUES
  ('44444444-4444-4444-8444-444444444401', 'Penguin Random House', 'Espana', 'https://www.penguinrandomhouse.com'),
  ('44444444-4444-4444-8444-444444444402', 'Prentice Hall', 'Estados Unidos', 'https://www.pearson.com'),
  ('44444444-4444-4444-8444-444444444403', 'Debate', 'Espana', 'https://www.penguinlibros.com'),
  ('44444444-4444-4444-8444-444444444404', 'Critica', 'Espana', 'https://www.planetadelibros.com');

INSERT IGNORE INTO formatos (id, codigo, nombre, descripcion, requiere_stock) VALUES
  ('55555555-5555-4555-8555-555555555501', 'FISICO', 'Fisico', 'Ejemplar impreso con control de inventario fisico', 1),
  ('55555555-5555-4555-8555-555555555502', 'DIGITAL', 'Digital', 'Libro electronico de entrega inmediata sin stock fisico', 0),
  ('55555555-5555-4555-8555-555555555503', 'AMBOS', 'Fisico y Digital', 'Disponible tanto en version impresa como digital', 1);

INSERT IGNORE INTO libros (
  id, titulo, isbn, sinopsis, anio_publicacion, idioma, paginas, formato_id,
  precio_venta, precio_alquiler, stock_fisico, stock_minimo,
  categoria_id, autor_id, editorial_id, estado
) VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    'Cien anos de soledad',
    '978-0307474728',
    'Obra maestra del realismo magico que narra la historia de la familia Buendia en Macondo.',
    1967, 'Espanol', 496, '55555555-5555-4555-8555-555555555503',
    58000.00, 12000.00, 15, 3,
    '11111111-1111-4111-8111-111111111101',
    '33333333-3333-4333-8333-333333333301',
    '44444444-4444-4444-8444-444444444401',
    'DISPONIBLE'
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    'Clean Code',
    '978-0132350884',
    'Manual practico para escribir codigo limpio, legible y mantenible en proyectos profesionales.',
    2008, 'Ingles', 464, '55555555-5555-4555-8555-555555555503',
    135000.00, 25000.00, 10, 3,
    '11111111-1111-4111-8111-111111111102',
    '33333333-3333-4333-8333-333333333302',
    '44444444-4444-4444-8444-444444444402',
    'DISPONIBLE'
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    'Sapiens: De animales a dioses',
    '978-8499926223',
    'Recorrido historico por la evolucion humana desde la edad de piedra hasta el siglo XXI.',
    2014, 'Espanol', 496, '55555555-5555-4555-8555-555555555503',
    72000.00, 15000.00, 12, 3,
    '11111111-1111-4111-8111-111111111103',
    '33333333-3333-4333-8333-333333333303',
    '44444444-4444-4444-8444-444444444403',
    'DISPONIBLE'
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    'Breve historia del tiempo',
    '978-0553380163',
    'Introduccion clara a la cosmologia, el origen del universo y los agujeros negros.',
    1988, 'Espanol', 256, '55555555-5555-4555-8555-555555555503',
    64000.00, 14000.00, 8, 2,
    '11111111-1111-4111-8111-111111111104',
    '33333333-3333-4333-8333-333333333304',
    '44444444-4444-4444-8444-444444444404',
    'DISPONIBLE'
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    'El metodo Lean Startup',
    '978-8423409495',
    'Guia para crear productos y empresas mediante experimentacion y aprendizaje validado.',
    2011, 'Espanol', 320, '55555555-5555-4555-8555-555555555502',
    52000.00, 10000.00, 0, 0,
    '11111111-1111-4111-8111-111111111105',
    '33333333-3333-4333-8333-333333333305',
    '44444444-4444-4444-8444-444444444401',
    'DISPONIBLE'
  );
