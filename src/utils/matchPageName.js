const normalisePageName = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/&/g, ' ')
        .replace(/\band\b/g, ' ')
        .replace(/[^a-z0-9]/g, '')

const editDistance = (a, b) => {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

    for (let i = 1; i <= a.length; i++) {
        const current = [i]
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            )
        }
        previous = current
    }

    return previous[b.length]
}

const MIN_CONTAINED_LENGTH = 4

const matchScore = (wanted, candidate) => {
    if (!candidate) return null
    if (wanted === candidate) return 0

    const [shorter, longer] = wanted.length <= candidate.length ? [wanted, candidate] : [candidate, wanted]
    if (shorter.length >= MIN_CONTAINED_LENGTH && longer.includes(shorter) && shorter.length * 2 >= longer.length) {
        return 1 + (longer.length - shorter.length) / longer.length
    }

    const distance = editDistance(wanted, candidate)
    const allowed = Math.max(1, Math.floor(Math.max(wanted.length, candidate.length) / 4))
    return distance <= allowed ? 2 + distance : null
}

const findBestPage = (requestedName, pages) => {
    const wanted = normalisePageName(requestedName)
    if (!wanted) return null

    const ranked = pages
        .map((page) => {
            const scores = [page.pageName, page.friendlyUrl]
                .map((name) => matchScore(wanted, normalisePageName(name)))
                .filter((score) => score !== null)
            return { page, score: scores.length ? Math.min(...scores) : null }
        })
        .filter((entry) => entry.score !== null)
        .sort((a, b) => a.score - b.score)

    if (!ranked.length) return null
    if (ranked.length > 1 && ranked[1].score === ranked[0].score) return null

    return ranked[0].page
}

module.exports = { normalisePageName, findBestPage }
