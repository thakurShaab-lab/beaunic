const multer = require('multer')
const upload = require('../utils/imageUpload')

const EMPTY_VALUES = new Set(['', 'null', 'undefined'])

const looksLikeJson = (value) => /^(\[[\s\S]*\]|\{[\s\S]*\})$/.test(value)

const REMOVE = Symbol('remove')

const normaliseValue = (value) => {
    if (value === null || value === undefined) return REMOVE

    if (typeof value === 'number' || typeof value === 'bigint') return String(value)

    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (EMPTY_VALUES.has(trimmed)) return REMOVE

        if (looksLikeJson(trimmed)) {
            try {
                return normaliseValue(JSON.parse(trimmed))
            } catch {
                return value
            }
        }

        return value
    }

    if (Array.isArray(value)) {
        return value.map(normaliseValue).filter((item) => item !== REMOVE)
    }

    if (typeof value === 'object') return normaliseObject(value)

    return value
}

const normaliseObject = (obj) => {
    const result = {}

    for (const [key, value] of Object.entries(obj)) {
        const normalised = normaliseValue(value)
        if (normalised !== REMOVE) result[key] = normalised
    }

    return result
}

const UPLOAD_ERRORS = {
    LIMIT_FILE_SIZE: 'File is too large. Maximum size is 5 MB.',
    LIMIT_FILE_COUNT: 'Too many files uploaded.',
    LIMIT_FIELD_COUNT: 'Too many form fields.',
    LIMIT_PART_COUNT: 'Too many form parts.',
}

const sendUploadError = (res, err) => {
    if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `File upload is not allowed in the "${err.field}" field.`
            : UPLOAD_ERRORS[err.code] || 'Invalid form data.'

        return res.status(200).json({ success: false, message })
    }

    return res.status(200).json({ success: false, message: err.message || 'Invalid form data.' })
}


const parsePayload = (fileField) => {
    const parseForm = fileField ? upload.single(fileField) : upload.none()

    return (req, res, next) => {
        parseForm(req, res, (err) => {
            if (err) return sendUploadError(res, err)

            req.body = normaliseObject(req.body || {})
            next()
        })
    }
}

module.exports = { parsePayload, normaliseObject }