const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'API REST - Libreria Virtual Danzara',
    version: '2.0.0',
    description:
      'Documentacion oficial de la API REST para la plataforma de comercio electronico, alquiler, facturacion, control RBAC y visor protegido e-Reader de la Libreria Virtual Danzara.'
  },
  servers: [
    {
      url: '/api',
      description: 'Servidor API activo'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenido en POST /auth/login o POST /auth/register'
      }
    }
  },
  tags: [
    { name: 'Sistema', description: 'Estado de salud del servicio' },
    { name: 'Autenticacion', description: 'Registro, inicio de sesion, perfil, CAPTCHA y recuperacion de contrasena' },
    { name: 'Catalogo', description: 'Consulta, ordenamiento, paginacion, favoritos, resenas, portadas y parametrizacion' },
    { name: 'Carrito', description: 'Gestion del carrito de compras y alquileres' },
    { name: 'Pedidos y Visor', description: 'Checkout, facturas, seguimiento, alquileres, devoluciones y e-Reader protegido' },
    { name: 'Cupones', description: 'Administracion y validacion de cupones promocionales' },
    { name: 'Usuarios y RBAC', description: 'Gestion de usuarios, roles y permisos individuales' },
    { name: 'Dashboard', description: 'Indicadores KPI, graficas, alertas operativas y exportacion CSV' }
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Verificar estado de la API y conexion a MySQL',
        responses: { 200: { description: 'Servicio saludable y conectado a base de datos' } }
      }
    },
    '/auth/captcha': {
      get: {
        tags: ['Autenticacion'],
        summary: 'Generar reto matematico anti-bot firmado con JWT',
        responses: { 200: { description: 'Pregunta y token temporal de verificacion' } }
      }
    },
    '/auth/register': {
      post: {
        tags: ['Autenticacion'],
        summary: 'Registrar nuevo cliente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre', 'apellido', 'email', 'password', 'captchaToken', 'captchaAnswer'],
                properties: {
                  nombre: { type: 'string' },
                  apellido: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  telefono: { type: 'string' },
                  password: { type: 'string', minLength: 6 },
                  captchaToken: { type: 'string' },
                  captchaAnswer: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Usuario creado con token JWT' }, 400: { description: 'Datos o CAPTCHA invalidos' } }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Autenticacion'],
        summary: 'Iniciar sesion y obtener token JWT con permisos efectivos',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'captchaToken', 'captchaAnswer'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  captchaToken: { type: 'string' },
                  captchaAnswer: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Sesion iniciada' }, 401: { description: 'Credenciales invalidas' } }
      }
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Autenticacion'],
        summary: 'Solicitar codigo temporal de recuperacion de contrasena (tokens_sesion)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'captchaToken', 'captchaAnswer'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  captchaToken: { type: 'string' },
                  captchaAnswer: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Codigo de recuperacion generado' } }
      }
    },
    '/auth/reset-password': {
      post: {
        tags: ['Autenticacion'],
        summary: 'Restablecer contrasena usando el codigo temporal',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'codigo', 'nuevaContrasena'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  codigo: { type: 'string' },
                  nuevaContrasena: { type: 'string', minLength: 6 }
                }
              }
            }
          }
        },
        responses: { 200: { description: 'Contrasena actualizada correctamente' } }
      }
    },
    '/auth/profile': {
      get: {
        tags: ['Autenticacion'],
        security: [{ BearerAuth: [] }],
        summary: 'Consultar perfil del usuario autenticado',
        responses: { 200: { description: 'Perfil del usuario' } }
      },
      put: {
        tags: ['Autenticacion'],
        security: [{ BearerAuth: [] }],
        summary: 'Actualizar datos personales o contrasena propia',
        responses: { 200: { description: 'Perfil actualizado' } }
      }
    },
    '/books': {
      get: {
        tags: ['Catalogo'],
        summary: 'Listar catalogo de libros con filtros, ordenamiento y paginacion',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Busqueda por titulo, autor o ISBN' },
          { name: 'categoria', in: 'query', schema: { type: 'string' } },
          { name: 'formato', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['recent', 'price_asc', 'price_desc', 'rating', 'title'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 12 } }
        ],
        responses: { 200: { description: 'Listado paginado de libros' } }
      },
      post: {
        tags: ['Catalogo'],
        security: [{ BearerAuth: [] }],
        summary: 'Registrar un nuevo libro (permiso CATALOGO_CREAR)',
        responses: { 201: { description: 'Libro creado' } }
      }
    },
    '/books/meta': {
      get: {
        tags: ['Catalogo'],
        summary: 'Obtener categorias, autores, editoriales y formatos parametrizados',
        responses: { 200: { description: 'Metadatos del catalogo' } }
      }
    },
    '/books/favorites/my': {
      get: {
        tags: ['Catalogo'],
        security: [{ BearerAuth: [] }],
        summary: 'Listar libros favoritos del usuario autenticado',
        responses: { 200: { description: 'Lista de favoritos' } }
      }
    },
    '/books/{id}/favorite': {
      post: {
        tags: ['Catalogo'],
        security: [{ BearerAuth: [] }],
        summary: 'Agregar o quitar un libro de favoritos',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Estado de favorito actualizado' } }
      }
    },
    '/books/upload-cover': {
      post: {
        tags: ['Catalogo'],
        security: [{ BearerAuth: [] }],
        summary: 'Subir imagen de portada local (JPG/PNG/WEBP hasta 2 MB)',
        responses: { 201: { description: 'Portada guardada en /uploads/covers' } }
      }
    },
    '/books/{id}': {
      get: {
        tags: ['Catalogo'],
        summary: 'Obtener detalle de un libro y sus resenas',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Detalle del libro' }, 404: { description: 'Libro no encontrado' } }
      },
      put: {
        tags: ['Catalogo'],
        security: [{ BearerAuth: [] }],
        summary: 'Actualizar datos y contenido digital de un libro',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Libro actualizado' } }
      },
      delete: {
        tags: ['Catalogo'],
        security: [{ BearerAuth: [] }],
        summary: 'Descontinuar libro del catalogo',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Libro descontinuado' } }
      }
    },
    '/cart': {
      get: {
        tags: ['Carrito'],
        security: [{ BearerAuth: [] }],
        summary: 'Consultar items y total del carrito',
        responses: { 200: { description: 'Contenido del carrito' } }
      },
      post: {
        tags: ['Carrito'],
        security: [{ BearerAuth: [] }],
        summary: 'Agregar libro para compra o alquiler al carrito',
        responses: { 201: { description: 'Item agregado' } }
      }
    },
    '/coupons': {
      get: {
        tags: ['Cupones'],
        security: [{ BearerAuth: [] }],
        summary: 'Listar cupones registrados (permiso PARAMETRIZACION_GESTIONAR)',
        responses: { 200: { description: 'Lista de cupones' } }
      },
      post: {
        tags: ['Cupones'],
        security: [{ BearerAuth: [] }],
        summary: 'Crear cupon de descuento',
        responses: { 201: { description: 'Cupon creado' } }
      }
    },
    '/coupons/validate': {
      post: {
        tags: ['Cupones'],
        security: [{ BearerAuth: [] }],
        summary: 'Validar codigo de cupon sobre el subtotal del carrito',
        responses: { 200: { description: 'Descuento calculado' }, 400: { description: 'Cupon no aplicable' } }
      }
    },
    '/orders': {
      get: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Listar todos los pedidos con filtro por estado (admin)',
        parameters: [{ name: 'estado', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Listado de pedidos' } }
      },
      post: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Confirmar pedido con pasarela simulada, cupon opcional y factura automatica',
        responses: { 201: { description: 'Pedido y factura generados' } }
      }
    },
    '/orders/my': {
      get: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Historial de pedidos del cliente autenticado',
        responses: { 200: { description: 'Pedidos propios' } }
      }
    },
    '/orders/rentals': {
      get: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Listar todos los alquileres con dias de mora y multa sugerida (admin)',
        parameters: [{ name: 'estado', in: 'query', schema: { type: 'string', enum: ['ACTIVO', 'VENCIDO', 'DEVUELTO'] } }],
        responses: { 200: { description: 'Listado de alquileres' } }
      }
    },
    '/orders/rentals/{rentalId}/return': {
      patch: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Registrar devolucion de alquiler con calculo de mora y reposicion de stock',
        parameters: [{ name: 'rentalId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Devolucion registrada' } }
      }
    },
    '/orders/library/my': {
      get: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Mi Biblioteca Digital con porcentaje de progreso de lectura',
        responses: { 200: { description: 'Libros accesibles en visor' } }
      }
    },
    '/orders/reader/{bookId}': {
      get: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Cargar contenido digital protegido y progreso guardado del lector',
        parameters: [{ name: 'bookId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Contenido autorizado y progreso' }, 403: { description: 'Sin acceso vigente' } }
      }
    },
    '/orders/reader/{bookId}/progress': {
      put: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Guardar capitulo actual, porcentaje, tema y tamano de fuente del e-Reader',
        parameters: [{ name: 'bookId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Progreso guardado' } }
      }
    },
    '/orders/{id}/invoice': {
      get: {
        tags: ['Pedidos y Visor'],
        security: [{ BearerAuth: [] }],
        summary: 'Consultar factura de venta FV-XXXX exenta de IVA (Art. 478 E.T.)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Datos completos de la factura' } }
      }
    },
    '/users': {
      get: {
        tags: ['Usuarios y RBAC'],
        security: [{ BearerAuth: [] }],
        summary: 'Listar y buscar usuarios del sistema',
        responses: { 200: { description: 'Listado de usuarios' } }
      }
    },
    '/roles': {
      get: {
        tags: ['Usuarios y RBAC'],
        security: [{ BearerAuth: [] }],
        summary: 'Listar roles y permisos asociados',
        responses: { 200: { description: 'Catalogo de roles' } }
      }
    },
    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'KPIs, alertas de stock bajo, alquileres vencidos y series para graficas',
        responses: { 200: { description: 'Resumen ejecutivo' } }
      }
    },
    '/dashboard/export/{type}': {
      get: {
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        summary: 'Exportar reporte CSV (sales, inventory, audit)',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['sales', 'inventory', 'audit'] } }],
        responses: { 200: { description: 'Archivo CSV descargable' } }
      }
    }
  }
};

function renderSwaggerHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Docs | Libreria Virtual Danzara</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>
    body { margin: 0; background: #f4f7fb; }
    .swagger-ui .topbar { background-color: #142D4E; border-bottom: 3px solid #F4B942; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
    .danzara-docs-bar {
      background: #142D4E;
      color: #ffffff;
      padding: 0.75rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: Inter, system-ui, sans-serif;
      border-bottom: 3px solid #F4B942;
    }
    .danzara-docs-bar a { color: #F4B942; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="danzara-docs-bar">
    <strong>Libreria Virtual Danzara · Documentacion OpenAPI 3.0</strong>
    <a href="/index.html">Volver a la plataforma</a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/docs.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true
    });
  </script>
</body>
</html>`;
}

module.exports = {
  openApiSpec,
  renderSwaggerHtml
};
