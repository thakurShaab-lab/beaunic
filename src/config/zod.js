const { z } = require('zod')
const { fieldLabel } = require('../utils/validationError')

const sizeUnit = (origin, n) => (origin === 'string' ? ` character${n === 1 ? '' : 's'}` : origin === 'array' ? ` item${n === 1 ? '' : 's'}` : '')

z.config({
    customError: (issue) => {
        const label = fieldLabel(issue.path)

        switch (issue.code) {
            case 'invalid_type':
                if (issue.input === undefined) return `${label} is required`
                return `${label} must be a valid ${issue.expected}`
            case 'invalid_value':
                return `${label} must be one of: ${issue.values.join(', ')}`
            case 'too_small':
                return `${label} must be at least ${issue.minimum}${sizeUnit(issue.origin, Number(issue.minimum))}`
            case 'too_big':
                return `${label} must be at most ${issue.maximum}${sizeUnit(issue.origin, Number(issue.maximum))}`
            case 'invalid_format':
                return `Enter a valid ${label.toLowerCase()}`
            case 'unrecognized_keys':
                return `Unknown field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}`
            default:
                return undefined
        }
    },
})
