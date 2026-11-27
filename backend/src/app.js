const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { testConnection } = require('./config/database');
const { morganStream } = require('./config/logger');
const { openApiSpec, renderSwaggerHtml } = require('./config/openapi');
const { apiLimiter } = require('./middlewares/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const couponRoutes = require('./routes/couponRoutes');

const app = express();

// Seguridad de cabeceras y CORS (permitir carga de imagenes de portadas desde otro puerto local)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Registro de peticiones HTTP y parseo de cuerpo (4mb para carga de portadas)
app.use(morgan('combined', { stream: morganStream }));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// Carpeta de imagenes subidas localmente
const uploadsDir = path.resolve(__dirname, '../uploads');
const coversDir = path.join(uploadsDir, 'covers');
fs.mkdirSync(coversDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Limitador de peticiones para toda la API
app.use('/api', apiLimiter);

// Endpoint de comprobacion de estado
app.get('/api/health', async (req, res) => {
  try {
    await testConnection();
    res.status(200).json({
      status: 'ok',
      message: 'API de la Libreria Virtual Danzara en ejecucion',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'API en ejecucion pero sin conexion a la base de datos',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

// Documentacion OpenAPI / Swagger UI
app.get('/api/docs.json', (req, res) => {
  res.status(200).json(openApiSpec);
});
app.get('/api/docs', (req, res) => {
  res.status(200).type('html').send(renderSwaggerHtml());
});

// Rutas principales
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/coupons', couponRoutes);

// Servir frontend estatico cuando esta disponible
const frontendPath = path.resolve(__dirname, '../../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// Manejo de rutas no encontradas y errores centralizados
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
