const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

// The invoice PDF for /booking/invoice/download: the same content as the Invoice sheet, nothing more.
// Built in memory and sent to the app; never saved on the server.
// Put the Beaunic logo at src/assets/invoice-logo.png to show it in the header; without it the name is written instead.
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'invoice-logo.png')

const COLORS = { black: '#000000', gold: '#C9A34E', text: '#1A1A1A', muted: '#8A8579', line: '#E6E1D6', green: '#1F7A3D', greenBg: '#E3F2E6', amber: '#8A5A00', amberBg: '#FFF3D6' }

// The built-in PDF fonts have no ₹ sign, so amounts are written "Rs. 1,299"
const pdfAmount = (label) => String(label || '').replace(/₹\s?/g, 'Rs. ')

// invoice: the object /booking/invoice returns. Resolves to a Buffer.
const buildInvoicePdf = (invoice) =>
    new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: 'Beaunic' } })
        const chunks = []
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const left = 50
        const right = doc.page.width - 50
        const width = right - left

        // Header band: logo on the left, INVOICE and the number on the right
        doc.rect(0, 0, doc.page.width, 120).fill(COLORS.black)
        if (fs.existsSync(LOGO_PATH)) {
            doc.image(LOGO_PATH, left, 30, { fit: [150, 60] })
        } else {
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(28).text('beaunic', left, 38)
            doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8).text('SALON & ACADEMY', left, 72, { characterSpacing: 1 })
        }
        doc.fillColor(COLORS.gold).font('Helvetica-Bold').fontSize(16).text(invoice.title.toUpperCase(), left, 42, { width, align: 'right', characterSpacing: 3 })
        doc.fillColor('#BDB6A6').font('Helvetica').fontSize(11).text(invoice.invoiceNumber, left, 66, { width, align: 'right' })

        // From / Billed to
        let y = 150
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10)
        doc.text(invoice.from.label, left, y)
        doc.text(invoice.billedTo.label, left, y, { width, align: 'right' })
        y += 16
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(13)
        doc.text(invoice.from.name || '', left, y, { width: width / 2 - 10 })
        const fromBottom = doc.y
        doc.text(invoice.billedTo.name || '', left + width / 2 + 10, y, { width: width / 2 - 10, align: 'right' })
        y = Math.max(fromBottom, doc.y) + 16

        const divider = () => {
            doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.line).stroke()
            y += 16
        }
        divider()

        // The service, its date and time, and the amount
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(12).text(invoice.service.name || '', left, y, { width: width - 120 })
        doc.font('Helvetica-Bold').text(pdfAmount(invoice.service.amountLabel), right - 120, y, { width: 120, align: 'right' })
        y = doc.y + 4
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text(invoice.service.scheduleLabel, left, y, { width: width - 120 })
        y = doc.y + 14
        divider()

        // Total
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(16).text('Total', left, y)
        doc.text(pdfAmount(invoice.totalLabel), left, y, { width, align: 'right' })
        y += 30

        // "Payment · Paid · UPI" and the badge
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(11).text(invoice.paymentLabel, left, y + 4)
        const paid = invoice.paymentStatusLabel === 'Paid'
        doc.font('Helvetica-Bold').fontSize(10)
        const badgeWidth = doc.widthOfString(invoice.paymentStatusLabel) + 24
        doc.roundedRect(right - badgeWidth, y, badgeWidth, 20, 10).fill(paid ? COLORS.greenBg : COLORS.amberBg)
        doc.fillColor(paid ? COLORS.green : COLORS.amber).text(invoice.paymentStatusLabel, right - badgeWidth, y + 5, { width: badgeWidth, align: 'center' })

        doc.end()
    })

module.exports = { buildInvoicePdf }
