const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, stack }) => {
    const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    return stack ? `${base}\n${stack}` : base;
  })
);

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    }),
    new transports.Console({
      format: format.combine(format.colorize(), logFormat)
    })
  ]
});

const morganStream = {
  write: (message) => logger.info(message.trim())
};

module.exports = {
  logger,
  morganStream
};
