const mysql = require('mysql2/promise')
const env = require('./env')
const logger = require('../utils/logger')

console.log('Connecting to MySQL Database...', {
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
})

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  connectTimeout: 10000,
});

(async () => {
  let connection

  try {
    connection = await pool.getConnection()

    logger.info('✅ MySQL Database Connected', {
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
    })
  } catch (err) {
    console.error('❌ MySQL Database Connection Failed', {
      message: err.message,
      code: err.code,
      errno: err.errno,
    })
    logger.error('❌ MySQL Database Connection Failed', {
      message: err.message,
      code: err.code,
      errno: err.errno,
    })

    process.exit(1)
  } finally {
    if (connection) {
      connection.release()
    }
  }
})()

module.exports = pool