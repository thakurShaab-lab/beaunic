const winston = require('winston')
const path = require('path')
const env = require('../config/env')

const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(process.cwd(), 'logs', 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(process.cwd(), 'logs', 'combined.log') }),
  ],
})

if (env.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  )
}

module.exports = logger