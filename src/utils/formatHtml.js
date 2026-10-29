
const cheerio = require('cheerio')

/**
 * Converts HTML into clean, readable plain text.
 *
 * @param {string|null|undefined} html - HTML content
 * @param {object} options - Formatting options
 * @param {boolean} options.preserveLists - Add bullets/numbers to lists
 * @returns {string} Formatted plain text
 */
const formatHtml = (html, options = {}) => {
    const {
        preserveLists = true
    } = options

    if (typeof html !== 'string' || !html.trim()) {
        return ''
    }

    const $ = cheerio.load(html, null, false)

    $('br').replaceWith('\n')

    $('p, div, section, article, blockquote, h1, h2, h3, h4, h5, h6')
        .each((_, element) => {
            $(element).prepend('\n')
            $(element).append('\n')
        })

    if (preserveLists) {
        $('ul').each((_, element) => {
            $(element).prepend('\n')
            $(element).append('\n')
        })

        $('ol').each((_, element) => {
            $(element).prepend('\n')
            $(element).append('\n')
        })

        $('li').each((_, element) => {
            const parent = $(element).parent()
            const isOrderedList = parent.is('ol')

            let prefix = '• '

            if (isOrderedList) {
                const siblings = $(element).prevAll('li').length
                prefix = `${siblings + 1}. `
            }

            $(element).prepend(`\n${prefix}`)
        })
    } else {
        $('li').prepend(' ')
    }

    let text = $.root().text()

    return text
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

module.exports = {
    formatHtml
}