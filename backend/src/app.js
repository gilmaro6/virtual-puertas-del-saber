const express = require('express');
const { testConnection } = require('./config/database');

const app = express();

// Middlewares iniciales para procesamiento de peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint de comprobación de estado (Health check)
app.get('/api/health', async (req, res) => {
  try {
    await testConnection();
    res.status(200).json({
      status: 'ok',
      message: 'API de la Librería Virtual Puertas del Saber en ejecución',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'API en ejecución pero sin conexión a la base de datos',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = app;
