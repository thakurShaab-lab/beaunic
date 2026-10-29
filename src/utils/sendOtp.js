const env = require('../config/env')
const logger = require('./logger')

// Delivers a login OTP to the customer's mobile number.
// Plug the real SMS gateway in as a new provider case once one is chosen.
const sendOtp = async (mobileNumber, otp) => {
    switch (env.notifyProvider) {
        case 'console':
            logger.info(`Login OTP for ${mobileNumber}: ${otp}`)
            return

        default:
            throw new Error(`Unsupported NOTIFY_PROVIDER: ${env.notifyProvider}`)
    }
}

module.exports = { sendOtp }
