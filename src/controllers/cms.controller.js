const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const cmsModel = require('../models/cms.model')
const supportModel = require('../models/support.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findBestPage, normalisePageName } = require('../utils/matchPageName')
const { buildContactDetails } = require('../utils/contactDetails')
const { convertNulls } = require('../utils/convertNulls')
const { formatDate } = require('../utils/formatDate')

const cmsPageSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
    pageName: z.string().trim().min(1, 'Page name is required').max(100),
}).strict()


// Contact Us has no wl_cms_pages row; its details come from tbl_admin (the same data as Help & Support)
const CONTACT_PAGE = { pageId: null, pageName: 'Contact Us', friendlyUrl: 'contact-us', isContactPage: true }

// Used only when the admin hasn't added a real Contact Us page
const withContactPage = (pages) =>
    pages.some((page) => normalisePageName(page.pageName) === normalisePageName(CONTACT_PAGE.pageName))
        ? pages
        : [...pages, CONTACT_PAGE]

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

// The same details as HTML, so the app can show Contact Us like any other CMS page
const contactContent = (contact) => {
    const rows = [
        [contact.supportCall.label, contact.supportCall.number],
        [contact.supportEmail.label, contact.supportEmail.address],
        [contact.supportWebsite.label, contact.supportWebsite.name],
        [contact.supportAddress.label, contact.supportAddress.address],
        ['WhatsApp', contact.supporTwhatsapp.number],
    ].filter(([, value]) => value)

    return [
        `<h2>${escapeHtml(contact.title)}</h2>`,
        `<p>${escapeHtml(contact.availability)}</p>`,
        `<ul>${rows.map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join('')}</ul>`,
    ].join('')
}

const sendContactPage = async (res) => {
    const admin = await supportModel.findSupportDetails()
    if (!admin) {
        return res.status(200).json({ success: false, message: 'Contact details are not available right now.' })
    }

    const contact = buildContactDetails(admin)

    return res.status(200).json({
        success: true,
        message: 'Page fetched successfully',
        data: convertNulls({
            pageId: CONTACT_PAGE.pageId,
            pageName: CONTACT_PAGE.pageName,
            friendlyUrl: CONTACT_PAGE.friendlyUrl,
            content: contactContent(contact),
            shortDescription: null,
            updatedAt: null,
            lastUpdatedLabel: null,
            contactDetails: contact,
        }),
    })
}

const getCmsPage = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = cmsPageSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        // Every active page is matched by name, so new pages added in the admin work without code changes
        const match = findBestPage(parsed.data.pageName, withContactPage(await cmsModel.findActivePageNames()))
        if (match?.isContactPage) return await sendContactPage(res)

        // Every page ends with a Contact section, so the tbl_admin details are sent with each one
        const [page, admin] = match
            ? await Promise.all([cmsModel.findActivePageById(match.pageId), supportModel.findSupportDetails()])
            : [null, null]

        if (!page) {
            return res.status(200).json({ success: false, message: 'Page not found.' })
        }

        const updatedOn = formatDate(page.pageUpdatedDate)

        return res.status(200).json({
            success: true,
            message: 'Page fetched successfully',
            data: convertNulls({
                pageId: page.pageId,
                pageName: page.pageName,
                friendlyUrl: page.friendlyUrl,
                // HTML from the admin editor (headings, paragraphs, lists)
                content: page.pageDescription,
                shortDescription: page.pageShortDescription,
                updatedAt: page.pageUpdatedDate,
                lastUpdatedLabel: updatedOn ? `Last updated ${updatedOn}` : null,
                contactDetails: admin ? buildContactDetails(admin) : null,
            }),
        })
    } catch (err) {
        console.error('Get CMS page error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getCmsPage }
