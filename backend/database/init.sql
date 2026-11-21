CREATE DATABASE IF NOT EXISTS puertas_del_saber_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE puertas_del_saber_db;

-- Tabla de usuarios (roles: ADMIN y CLIENTE)
CREATE TABLE IF NOT EXISTS usuarios (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('ADMIN', 'CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de categorias de libros
CREATE TABLE IF NOT EXISTS categorias (
  id CHAR(36) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de catalogo de libros
CREATE TABLE IF NOT EXISTS libros (
  id CHAR(36) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  autor VARCHAR(150) NOT NULL,
  isbn VARCHAR(20) NULL,
  descripcion TEXT NULL,
  precio DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  imagen_url VARCHAR(255) NULL,
  categoria_id CHAR(36) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_libros_isbn (isbn),
  KEY idx_libros_titulo (titulo),
  KEY idx_libros_categoria (categoria_id),
  CONSTRAINT fk_libros_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  estado ENUM('PENDIENTE', 'PAGADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  direccion_envio VARCHAR(255) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pedidos_usuario (usuario_id),
  KEY idx_pedidos_estado (estado),
  CONSTRAINT fk_pedidos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla intermedia de detalle de pedidos
CREATE TABLE IF NOT EXISTS detalle_pedidos (
  id CHAR(36) NOT NULL,
  pedido_id CHAR(36) NOT NULL,
  libro_id CHAR(36) NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(10, 2) NOT NULL,
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

-- Categorias iniciales de ejemplo
INSERT IGNORE INTO categorias (id, nombre, descripcion) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Literatura', 'Novelas, cuentos y obras clasicas de la literatura universal'),
  ('11111111-1111-4111-8111-111111111102', 'Tecnologia', 'Programacion, arquitectura de software e ingenieria'),
  ('11111111-1111-4111-8111-111111111103', 'Historia', 'Ensayos historicos, biografias y cronicas'),
  ('11111111-1111-4111-8111-111111111104', 'Ciencia', 'Divulgacion cientifica, fisica, matematicas y biologia');

-- Libros iniciales de ejemplo
INSERT IGNORE INTO libros (id, titulo, autor, isbn, descripcion, precio, stock, imagen_url, categoria_id) VALUES
  ('22222222-2222-4222-8222-222222222201', 'Cien anos de soledad', 'Gabriel Garcia Marquez', '978-0307474728', 'Obra maestra del realismo magico sobre la familia Buendia en Macondo.', 58000.00, 15, NULL, '11111111-1111-4111-8111-111111111101'),
  ('22222222-2222-4222-8222-222222222202', 'Clean Code', 'Robert C. Martin', '978-0132350884', 'Manual de estilo para el desarrollo agil y codigo limpio de software.', 135000.00, 10, NULL, '11111111-1111-4111-8111-111111111102'),
  ('22222222-2222-4222-8222-222222222203', 'Sapiens: De animales a dioses', 'Yuval Noah Harari', '978-8499926223', 'Breve historia de la humanidad desde la edad de piedra hasta el siglo XXI.', 72000.00, 12, NULL, '11111111-1111-4111-8111-111111111103'),
  ('22222222-2222-4222-8222-222222222204', 'Breve historia del tiempo', 'Stephen Hawking', '978-0553380163', 'Introduccion accesible a la cosmologia, los agujeros negros y el origen del universo.', 64000.00, 8, NULL, '11111111-1111-4111-8111-111111111104');
