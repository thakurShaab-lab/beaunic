const convertNulls = (obj) => {
    if (obj === null) {
        return ""
    }

    if (Array.isArray(obj)) {
        return obj.map(convertNulls)
    }

    if (typeof obj !== "object") {
        return obj
    }

    const result = {}

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = convertNulls(obj[key])
        }
    }

    return result
}

module.exports = { convertNulls }