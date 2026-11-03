// Contact details from the main tbl_admin row, shared by Help & Support and the Contact Us page
const COUNTRY_CODE = '+91'

const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

const digitsOnly = (value) => (clean(value) ? value.replace(/\D/g, '') : null)

const displayPhone = (value) => {
    const digits = digitsOnly(value)
    if (!digits) return null
    return digits.length === 10 ? `${COUNTRY_CODE} ${digits}` : `+${digits}`
}

const dialPhone = (value) => {
    const digits = digitsOnly(value)
    if (!digits) return null
    return digits.length === 10 ? `${COUNTRY_CODE}${digits}` : `+${digits}`
}

const singleLine = (value) =>
    clean(value) ? value.split(/\r?\n/).map((line) => line.trim().replace(/\s*,$/, '')).filter(Boolean).join(', ') : null

const websiteUrl = (value) => {
    const site = clean(value)
    if (!site) return null
    return /^https?:\/\//i.test(site) ? site : `https://${site}`
}

const buildContactDetails = (admin) => {
    const phone = clean(admin.phone) || clean(admin.mobile)
    const website = clean(admin.website)
    const whatsapp = clean(admin.whatsappNumber)
    const email = clean(admin.contactEmail) || clean(admin.adminEmail)

    return {
        title: 'BEAUNIC SALON ACADEMY',
        availability: 'Support available Monday - Sunday',
        supportCall: {
            label: 'Call',
            number: displayPhone(phone),
            link: phone && `tel:${dialPhone(phone)}`,
        },
        supportEmail: {
            label: 'Email',
            address: email,
            link: email && `mailto:${email}`,
        },
        supportWebsite: {
            label: 'Website',
            name: website,
            link: websiteUrl(website),
        },
        supportAddress: {
            label: 'Address',
            address: singleLine(admin.corporateAddress) || singleLine(admin.address),
        },
        supporTwhatsapp: {
            number: displayPhone(whatsapp),
            link: whatsapp && `https://wa.me/${dialPhone(whatsapp).slice(1)}`,
        },
        supportSocialLinks: {
            facebook: clean(admin.facebookLink),
            instagram: clean(admin.instagramLink),
            youtube: clean(admin.youtubeLink),
            twitter: clean(admin.twitterLink),
            linkedin: clean(admin.linkedinLink),
        },
    }
}

module.exports = { buildContactDetails }
