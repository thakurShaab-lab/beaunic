const { drizzle } = require('drizzle-orm/mysql2')
const pool = require('./db')

const db = drizzle(pool, { mode: 'default' })

module.exports = db
