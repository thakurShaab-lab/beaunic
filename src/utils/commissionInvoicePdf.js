const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

// The commission invoice PDF ("DOWNLOAD INVOICE"): the Invoice Details screen as a file, with the same data and the
// same layout, nothing added:
//   CINV-2026-09                                  [Unpaid]
//   September 2026 · 30 Sep 2026
//   ┌ Booking        Amount            Commission ┐
//   │ BK-24031       ₹8,500                  ₹850 │ ...
//   └─────────────────────────────────────────────┘
//   Commission amounts are calculated at the rate configured by Beaunic Admin.
// Input: the month as /commission/invoice/details returns it (invoiceNumber, periodLabel, dateLabel, statusLabel,
// breakdownHeaders, breakdown [{ bookingNumber, amountLabel, commissionLabel }], note).
//
// The built-in PDF fonts have no ₹ sign: amounts are written "Rs. 8,500" unless a TTF font with ₹ is placed at
// src/assets/invoice-font.ttf (e.g. Noto Sans); then it is used and ₹ is kept, as on the screen.
const FONT_PATH = path.join(__dirname, '..', 'assets', 'invoice-font.ttf')
const FONT_BOLD_PATH = path.join(__dirname, '..', 'assets', 'invoice-font-bold.ttf')

const COLORS = {
    text: '#1A1A1A', muted: '#7D776B', line: '#ECE7DC', headerBg: '#F7F5F0', border: '#E6E1D6',
    paid: '#1F7A3D', paidBg: '#E3F2E6', unpaid: '#A33A3A', unpaidBg: '#FBE3E3',
}

const buildCommissionInvoicePdf = (invoice) =>
    new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: invoice.invoiceNumber, Author: 'Beaunic' } })
        const chunks = []
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const hasFont = fs.existsSync(FONT_PATH)
        const regular = hasFont ? FONT_PATH : 'Helvetica'
        const bold = hasFont ? (fs.existsSync(FONT_BOLD_PATH) ? FONT_BOLD_PATH : FONT_PATH) : 'Helvetica-Bold'
        const amount = (label) => (hasFont ? String(label ?? '') : String(label ?? '').replace(/₹\s?/g, 'Rs. '))

        const left = 50
        const right = doc.page.width - 50
        const width = right - left

        // CINV-2026-09 and the status badge
        let y = 60
        doc.fillColor(COLORS.text).font(bold).fontSize(22).text(invoice.invoiceNumber, left, y)
        const paid = invoice.status === 'paid'
        doc.font(bold).fontSize(10)
        const badgeWidth = doc.widthOfString(invoice.statusLabel) + 24
        doc.roundedRect(right - badgeWidth, y + 4, badgeWidth, 20, 10).fill(paid ? COLORS.paidBg : COLORS.unpaidBg)
        doc.fillColor(paid ? COLORS.paid : COLORS.unpaid).text(invoice.statusLabel, right - badgeWidth, y + 9, { width: badgeWidth, align: 'center' })

        // September 2026 · 30 Sep 2026
        y += 32
        doc.fillColor(COLORS.muted).font(regular).fontSize(12).text(`${invoice.periodLabel} · ${invoice.dateLabel}`, left, y)
        y += 34

        // The breakdown table: Booking · Amount · Commission
        const headers = invoice.breakdownHeaders || { booking: 'Booking', amount: 'Amount', commission: 'Commission' }
        const rowHeight = 34
        const columns = { booking: left + 16, amount: left + width * 0.4, commissionRight: right - 16 }
        const tableTop = y
        const rows = invoice.breakdown || []

        const drawRow = (rowY, cells, { header = false } = {}) => {
            if (header) {
                // Shaded inside the table's rounded top corners
                doc.save()
                doc.roundedRect(left, rowY, width, rowHeight + 12, 12).clip()
                doc.rect(left, rowY, width, rowHeight).fill(COLORS.headerBg)
                doc.restore()
            }
            const textY = rowY + (rowHeight - 12) / 2
            doc.font(header ? bold : regular).fontSize(header ? 10 : 11)
            doc.fillColor(header ? COLORS.muted : COLORS.text).text(cells.booking, columns.booking, textY, { width: columns.amount - columns.booking - 8 })
            doc.fillColor(header ? COLORS.muted : COLORS.text).text(header ? cells.amount : amount(cells.amount), columns.amount, textY, { width: 140 })
            doc.fillColor(COLORS.muted).text(header ? cells.commission : amount(cells.commission), columns.commissionRight - 160, textY, { width: 160, align: 'right' })
        }

        drawRow(y, { booking: headers.booking, amount: headers.amount, commission: headers.commission }, { header: true })
        y += rowHeight
        let pageTop = tableTop
        for (const row of rows) {
            if (y + rowHeight > doc.page.height - 100) {
                doc.roundedRect(left, pageTop, width, y - pageTop, 12).lineWidth(1).strokeColor(COLORS.border).stroke()
                doc.addPage()
                y = 60
                pageTop = y
            }
            doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.line).stroke()
            drawRow(y, { booking: row.bookingNumber, amount: row.amountLabel, commission: row.commissionLabel })
            y += rowHeight
        }
        doc.roundedRect(left, pageTop, width, y - pageTop, 12).lineWidth(1).strokeColor(COLORS.border).stroke()

        // The note
        y += 16
        doc.fillColor(COLORS.muted).font(regular).fontSize(11).text(invoice.note || '', left, y, { width })

        doc.end()
    })

module.exports = { buildCommissionInvoicePdf }
