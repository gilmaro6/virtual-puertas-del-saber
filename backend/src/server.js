require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');
const { logger } = require('./config/logger');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await testConnection();
    logger.info('Conexion a MySQL verificada correctamente');
  } catch (error) {
    logger.error(`Error al conectar con MySQL: ${error.message}`);
  }

  app.listen(PORT, () => {
    logger.info(`Backend iniciado en http://localhost:${PORT}`);
    logger.info(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
