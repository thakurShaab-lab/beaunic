const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Saved times are UTC (authModel.nowString); shown in Indian time.
// "2026-10-05 20:00:00" -> { date: "06 Oct 2026", time: "01:30 AM", dateTime: "06 Oct 2026 · 01:30 AM" }
const istDateLabels = (utcDateTime) => {
    const date = new Date(`${String(utcDateTime || '').replace(' ', 'T')}Z`)
    if (!utcDateTime || Number.isNaN(date.getTime())) return { date: null, time: null, dateTime: null }

    const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).map((part) => [part.type, part.value])
    )
    const hour = Number(p.hour)
    const day = `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.year}`
    const time = `${String(hour % 12 || 12).padStart(2, '0')}:${p.minute} ${hour < 12 ? 'AM' : 'PM'}`

    return { date: day, time, dateTime: `${day} · ${time}` }
}

module.exports = { istDateLabels }
