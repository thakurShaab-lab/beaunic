const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-09-28 10:15:00" -> "28 Sep 2026"
const formatDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
    if (!match || match[1] === '0000') return null
    return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`
}

module.exports = { formatDate }
