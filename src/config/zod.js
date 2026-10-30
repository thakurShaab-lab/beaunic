const { z } = require('zod')

z.config({
    customError: (issue) => {
        if (issue.code === 'invalid_type' && issue.input === undefined) return 'This field is required'
        return undefined
    },
})
