const { logger } = require('../config/logger');
const AppError = require('../utils/appError');

function notFoundHandler(req, res, next) {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  logger.error(`${statusCode} - ${err.message} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`, {
    stack: err.stack
  });

  const message =
    err.isOperational || !isProduction
      ? err.message
      : 'Error interno del servidor';

  res.status(statusCode).json({
    status: 'error',
    message
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
