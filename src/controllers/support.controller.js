const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const supportModel = require('../models/support.model')
const { validateRequestDevice } = require('./device&app.controller')
const { buildContactDetails } = require('../utils/contactDetails')
const { convertNulls } = require('../utils/convertNulls')

// The FAQ tabs, in screen order; the first is open when none is asked for
const FAQ_TABS = { booking: 'Booking Help', payment: 'Payment Help', refund: 'Refund Help' }

const supportSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    // Optional: "booking", "Booking Help", ...; blank, null or missing opens Booking Help
    faqCategory: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s*help$/, '') : value),
        z.enum(Object.keys(FAQ_TABS), { error: 'FAQ category must be one of: booking, payment, refund' }).optional()
    ),
}).strict()

const getSupportDetails = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = supportSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    const faqCategory = parsed.data.faqCategory ?? 'booking'

    try {
        const [admin, faqs, faqCounts] = await Promise.all([
            supportModel.findSupportDetails(),
            supportModel.findFaqs(faqCategory),
            supportModel.countFaqsByCategory(),
        ])
        if (!admin) {
            return res.status(200).json({ success: false, message: 'Support details are not available right now.' })
        }

        const contact = buildContactDetails(admin)
        const countOf = (key) => Number(faqCounts.find((row) => row.faqCategory === key)?.total || 0)

        return res.status(200).json({
            success: true,
            message: 'Support details fetched successfully',
            data: convertNulls({
                ...contact,
                // FAQs: the tab chips, and the questions of the open tab
                faqTabs: Object.entries(FAQ_TABS).map(([key, label]) => ({ key, label, count: countOf(key), isSelected: key === faqCategory })),
                selectedFaqCategory: faqCategory,
                faqs: faqs.map((faq) => ({ faqId: faq.faqId, question: faq.question, answer: faq.answer })),
                // "Still need help?" card; its buttons open Contact Support (call / email above) and Raise Complaint (/complaint/add)
                stillNeedHelp: {
                    title: 'Still need help?',
                    // "Our team is available Monday – Sunday. Beaunic Salon Academy, Dildarnagar."
                    message: `Our team is available Monday – Sunday. ${['Beaunic Salon Academy', contact.supportAddress.address].filter(Boolean).join(', ')}.`,
                    actions: [
                        { key: 'contact_support', label: 'Contact Support' },
                        { key: 'raise_complaint', label: 'Raise Complaint' },
                    ],
                },
            }),
        })
    } catch (err) {
        console.error('Get support details error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getSupportDetails }
