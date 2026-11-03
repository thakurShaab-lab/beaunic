// "contactNumber" -> "Contact number", "app_id" -> "App ID", "removeMediaIds.0" -> "Remove media IDs"
const fieldLabel = (path = []) => {
    const key = [...path].reverse().find((part) => typeof part === 'string')
    if (!key) return 'Request'

    const words = key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((word) => ({ id: 'ID', ids: 'IDs', pin: 'PIN', otp: 'OTP' }[word] || word))

    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
    return words.join(' ')
}

// Some schema messages don't say which field they are about ("Must be a 10-digit mobile number"),
// so the field name is put in front when the message is shown on its own
const withFieldName = (label, message) => {
    if (/^Must /.test(message)) return `${label} ${message.charAt(0).toLowerCase()}${message.slice(1)}`
    if (/^Invalid characters/.test(message)) return `${label} contains invalid characters`
    if (/^Required /.test(message)) return `${label} is r${message.slice(1)}`

    const minimum = message.match(/^(?:Minimum|Enter at least) (\d+) characters?$/)
    if (minimum) return `${label} must be at least ${minimum[1]} characters`

    return message
}

// Replies with the first problem only, as one message the app can show directly
const sendValidationError = (res, error) => {
    const issue = error.issues[0]
    const field = issue.path.length ? issue.path.join('.') : null

    return res.status(200).json({
        success: false,
        message: field ? withFieldName(fieldLabel(issue.path), issue.message) : issue.message,
        field,
    })
}

module.exports = { sendValidationError, fieldLabel }
