const express = require('express')
const os = require('os')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const dotenv = require('dotenv').config()
const env = require('./src/config/env')
const logger = require('./src/utils/logger')
require('./src/config/db')
require('./src/config/drizzle')
require('./src/config/zod')
const authRoutes = require('./src/routes/auth.routes')
const membershipRoutes = require('./src/routes/membership.routes')
const addressRoutes = require('./src/routes/address.routes')
const profileRoutes = require('./src/routes/profile.routes')
const supportRoutes = require('./src/routes/support.routes')


const app = express()

app.disable('x-powered-by')

app.set('trust proxy', 1)

app.use(helmet())

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Content-Range', 'Content-Disposition', 'Content-Description'],
    maxAge: 1000,
  })
)

app.use(cors())
app.use(express.json())

app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
)

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
)

app.use('/uploaded_files', express.static(env.uploadDir))

app.get('/', (req, res) => {
  res.json({
    status: 'Server running',
    server: {
      hostname: os.hostname(),
      platform: os.platform(),
      architecture: os.arch(),
      osType: os.type(),
      osRelease: os.release(),
      uptime: `${Math.floor(os.uptime() / 3600)} hours ${Math.floor((os.uptime() % 3600) / 60)} minutes`
    },
    runtime: {
      nodeVersion: process.version,
      npmEnvironment: process.env.NODE_ENV || 'development',
      processId: process.pid,
      execPath: process.execPath
    },
    cpu: {
      model: os.cpus()[0]?.model || 'Unknown',
      cores: os.cpus().length,
      loadAverage: os.loadavg()
    },
    memory: {
      total: `${(os.totalmem() / 1024 ** 3).toFixed(2)} GB`,
      free: `${(os.freemem() / 1024 ** 3).toFixed(2)} GB`,
      used: `${((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2)} GB`
    }
  })
})

app.get('/api', (req, res) => {
  res.json({
    name: 'My Backend API',
    description: 'Backend service built with Node.js and Express',
    version: '1.0.0',
    status: 'API is working',
    timestamp: new Date().toISOString(),
    endpoints: {
      '/': {
        method: 'GET',
        description: 'Server status and system information'
      },
      '/api': {
        method: 'GET',
        description: 'API information and available endpoints'
      }
    },
  })
})


app.use('/api/auth', authRoutes)
app.use('/api/membership', membershipRoutes)
app.use('/api/address', addressRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/support', supportRoutes)


const server = app.listen(env.port, '127.0.0.1', () => {
  logger.info(`JV-Cat-Trade-node-api listening on port ${env.port} (${env.nodeEnv})`)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason })
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down')
  server.close(() => process.exit(0))
})