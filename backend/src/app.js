const express = require('express');

const app = express();

// Middlewares iniciales para procesamiento de peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint de comprobación de estado (Health check)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API de la Librería Virtual Puertas del Saber en ejecución',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
