const dayjs = require('dayjs')

const FORMATS = {
  1: (sep) => `DD MMM${sep} YYYY`,
  2: (sep) => `DD MMMM${sep} YYYY`,
  3: (sep) => `ddd MMM DD${sep} YYYY`,
  4: (sep) => `dddd MMMM DD${sep} YYYY`,
  5: (sep) => `dddd MMMM DD${sep} YYYY${sep} hh:mm:ss`,
  6: (sep) => `dddd MMMM DD${sep} YYYY${sep} HH:mm A`,
  7: (sep) => `DD MMM${sep} YYYY${sep} HH:mm A`,
  8: (sep) => `DD MMM${sep} YYYY${sep} hh:mm`,
  9: (sep) => `MMM DD${sep} YYYY [[]dddd[]]`,
  10: () => `MMMM YYYY`,
  11: () => `DD`,
  12: (sep) => `DD${sep}MMM YYYY`,
}

function getDateFormat(date, format, separator1 = ',') {
  const parsed = dayjs(date)
  const d = parsed.isValid() ? parsed : dayjs(0)
  const template = FORMATS[format]
  if (!template) return undefined
  return d.format(template(separator1))
}

module.exports = { getDateFormat }