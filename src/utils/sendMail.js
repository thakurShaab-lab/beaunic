const nodemailer = require('nodemailer')
const env = require('../config/env')
const logger = require('./logger')

// SMTP comes from .env (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS). Until SMTP_HOST is set no email
// is sent: callers get { sent: false, reason: 'not_configured' } and carry on.
let transporter = null
const getTransporter = () => {
    if (!env.smtp.host) return null
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: env.smtp.host,
            port: env.smtp.port,
            secure: env.smtp.secure,
            auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
        })
    }
    return transporter
}

// Every value placed in an email body is escaped
const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

// { to, subject, html, text, fromName, replyTo } -> { sent: true } or { sent: false, reason }
const sendMail = async ({ to, subject, html, text, fromName, replyTo }) => {
    const transport = getTransporter()
    if (!transport) return { sent: false, reason: 'not_configured' }

    try {
        await transport.sendMail({
            from: fromName ? { name: fromName, address: env.smtp.user } : env.smtp.user,
            to,
            subject,
            html,
            text,
            replyTo: replyTo || undefined,
        })
        return { sent: true }
    } catch (err) {
        logger.error(`Email "${subject}" failed: ${err.message}`)
        return { sent: false, reason: 'failed' }
    }
}

module.exports = { sendMail, escapeHtml }
