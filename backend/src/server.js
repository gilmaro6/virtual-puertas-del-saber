require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await testConnection();
    console.log('[Base de Datos] Conexión a MySQL verificada correctamente');
  } catch (error) {
    console.error('[Base de Datos] Error al conectar con MySQL:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`[Servidor] Backend iniciado en http://localhost:${PORT}`);
    console.log(`[Servidor] Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
