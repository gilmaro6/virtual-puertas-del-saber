const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'puertas_del_saber_user',
  password: process.env.DB_PASSWORD || 'puertas_del_saber_pass',
  database: process.env.DB_NAME || 'puertas_del_saber_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
    return true;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  testConnection
};
