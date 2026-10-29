require('dotenv').config()

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiBasePath: process.env.API_BASE_PATH || '/api',
  staticFileBaseUrl: process.env.STATIC_FILE_BASE_URL || '',

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  },

  legacyApiKey: process.env.LEGACY_API_KEY || '',

  uploadDir: process.env.UPLOAD_DIR || '',

  aws: {
    region: process.env.AWS_REGION || 'us-east-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  corsAdminOrigin: process.env.CORS_ADMIN_ORIGIN || '',

  // KNET payment gateway terminal resource key, used to decrypt KNET's postback
  // (Payment.php had a live key hardcoded in source intentionally not copied here).
  knetTerminalResourceKey: process.env.KNET_TERMINAL_RESOURCE_KEY || '',

  // Dmailer.php never set explicit SMTP config (its config block was commented
  // out), relying on CI's default mail config - fill these in for real delivery.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  // OTP delivery channel - only 'console' (logs the OTP) is implemented until an SMS gateway is wired in.
  notifyProvider: process.env.NOTIFY_PROVIDER || 'console',

  logLevel: process.env.LOG_LEVEL || 'info',
}