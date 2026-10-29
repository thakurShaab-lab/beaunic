require('dotenv').config()
const { defineConfig } = require('drizzle-kit')

module.exports = defineConfig({
  dialect: 'mysql',
  schema: './src/schema/*.js',
  out: './drizzle',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  verbose: true,
  strict: true,
})
