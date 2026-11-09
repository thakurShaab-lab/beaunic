const { z } = require('zod')
const { sendValidationError } = require('../utils/validationError')
const env = require('../config/env')
const homeModel = require('../models/home.model')
const serviceModel = require('../models/service.model')
const addressModel = require('../models/address.model')
const favoriteModel = require('../models/favorite.model')
const { validateRequestDevice } = require('./device&app.controller')
const { findLoggedInCustomer } = require('./profile.controller')
const { withImageUrls, rupees, durationLabel } = require('./service.controller')
const { resolveMediaUrl } = require('../utils/mediaUrl')
const { convertNulls } = require('../utils/convertNulls')

const BANNER_FOLDER = 'header_images'
const CATEGORY_FOLDER = 'category'
const SECTION_LIMIT = 10

const homeSchema = z.object({
    app_id: z.union([z.string(), z.number()]),
    device_id: z.string().trim().min(1, 'Device ID is required'),
}).strict()

const SERVICE_TYPE_LABELS = { salon: 'Salon', home_service: 'Home Service' }

// Images already on the server, for the sections that are static for now
const image = (folder, file) => `${env.staticFileBaseUrl.replace(/\/+$/, '')}/${folder}/${file}`
const IMAGES = {
    bridal: image(CATEGORY_FOLDER, 'featured_img11.jpg'),
    preBridal: image(CATEGORY_FOLDER, 'fas-khan-e23hvqigh6q-unsplash.jpg'),
    facial: image(CATEGORY_FOLDER, 'woman-receiving-microdermabrasion-therapy-forehead-beauty-spa1.jpg'),
    pedicure: image(CATEGORY_FOLDER, 'pedicurist-master-makes-pedicure-woman-s-legs-spa-treatment-concept.jpg'),
    manicure: image(CATEGORY_FOLDER, 'manicurist-master-makes-manicure-woman-s-hands-spa-treatment-concept.jpg'),
    massage: image(CATEGORY_FOLDER, 'beauty-spa-1.jpg'),
    homeService: image(CATEGORY_FOLDER, '594461584076570.jpg'),
    salonOne: image(BANNER_FOLDER, 'banner3.jpg'),
    salonTwo: image(BANNER_FOLDER, 'banner1.jpg'),
    salonThree: image(BANNER_FOLDER, 'banner2.jpg'),
}

// 2600 -> "2.6k"
const shortCount = (value) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value))

// "★ 4.8 (2.1k) · 45 min"; "★ 4.8 · 1 hr 10 min" when there's no count; just the duration when there's no rating
const ratingLine = ({ averageRating, reviewCount, duration }) => {
    const rating = averageRating > 0 ? `★ ${averageRating}${reviewCount ? ` (${shortCount(reviewCount)})` : ''}` : null
    return [rating, duration ? durationLabel(duration) : null].filter(Boolean).join(' · ') || null
}

// ----- Static sections (dummy data until these are built) -----

const NEARBY_SALONS = [
    { salonId: null, salonName: 'The Bridal Room', image: IMAGES.salonOne, rating: 4.8, reviewCount: 1240, distance: 18, location: 'Lanka, Ghazipur', isOpen: true, openDays: 'Mon–Sun' },
    { salonId: null, salonName: 'Beaunic Salon Academy', image: IMAGES.salonTwo, rating: 4.9, reviewCount: 2600, distance: 0.8, location: 'Main Market, Dildarnagar', isOpen: true, openDays: 'Mon–Sun' },
    { salonId: null, salonName: 'Glow Studio', image: IMAGES.salonThree, rating: 4.5, reviewCount: 640, distance: 3.4, location: 'Zamania Road, Zamania', isOpen: false, openDays: 'Tue–Sun' },
]

const RECOMMENDED_SERVICES = [
    { serviceId: null, serviceName: 'Hydra Glow Facial', image: IMAGES.facial, price: 1499, averageRating: 4.8, reviewCount: 0, duration: 70 },
    { serviceId: null, serviceName: 'Crystal Spa Pedicure', image: IMAGES.pedicure, price: 1099, averageRating: 4.8, reviewCount: 0, duration: 75 },
    { serviceId: null, serviceName: 'Head & Shoulder Massage', image: IMAGES.massage, price: 499, averageRating: 4.7, reviewCount: 0, duration: 30 },
]

const SPECIAL_OFFERS = [
    { offerId: 1, title: 'Bridal Season Offer', tag: 'BRIDAL', description: 'Offer details are set by Beaunic.', couponCode: 'BRI#123', discountType: 'percentage', discountValue: 20, image: IMAGES.bridal, validFrom: null, validTill: null },
    { offerId: 2, title: 'First Booking Offer', tag: 'FIRST', description: 'Offer details are set by Beaunic.', couponCode: null, discountType: 'amount', discountValue: 100, image: IMAGES.preBridal, validFrom: null, validTill: null },
]

const TRENDING_SERVICES = [
    { serviceId: null, serviceName: 'Hydra Glow Facial', category: 'Facial', image: IMAGES.facial, price: 1499, averageRating: 4.8, reviewCount: 1240, bookedThisWeek: 1240, duration: 70 },
    { serviceId: null, serviceName: 'Signature Bridal Makeup', category: 'Bridal', image: IMAGES.bridal, price: 14999, averageRating: 4.9, reviewCount: 860, bookedThisWeek: 860, duration: 180 },
    { serviceId: null, serviceName: 'Facial at Home', category: 'Home Services', image: IMAGES.homeService, price: 999, averageRating: 4.7, reviewCount: 790, bookedThisWeek: 790, duration: 60 },
    { serviceId: null, serviceName: 'Gel Polish Manicure', category: 'Manicure', image: IMAGES.manicure, price: 699, averageRating: 4.6, reviewCount: 610, bookedThisWeek: 610, duration: 45 },
]

// ----- Formatters -----

const trimmed = (value) => (value && String(value).trim()) || null

// The customer's default address book entry, and the two header lines:
// "Dildarnagar" (the last part of the address line, else the city) over "Ghazipur, Uttar Pradesh 232326"
const formatAddress = (address) => {
    if (!address) return null
    const city = trimmed(address.city)
    const statePin = [trimmed(address.state), trimmed(address.zipcode)].filter(Boolean).join(' ') || null
    const parts = [trimmed(address.address), city, trimmed(address.state)].filter(Boolean)
    const area = trimmed(String(address.address || '').split(',').pop())

    return {
        addressId: address.addressId,
        address: address.address,
        city: address.city,
        state: address.state,
        pincode: address.zipcode,
        fullAddress: parts.length ? `${parts.join(', ')}${trimmed(address.zipcode) ? ` ${trimmed(address.zipcode)}` : ''}` : null,
        title: area || city,
        subtitle: [area ? city : null, statePin].filter(Boolean).join(', ') || null,
    }
}

const formatHomeService = (row, imageUrl) => {
    const averageRating = Number(Number(row.averageRating).toFixed(1))
    const duration = row.serviceDuration ?? null
    return {
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        image: imageUrl,
        price: row.servicePrice !== null ? Number(row.servicePrice) : null,
        priceLabel: row.servicePrice !== null ? rupees(row.servicePrice) : 'Price not set',
        averageRating,
        reviewCount: row.reviewCount,
        duration,
        durationLabel: duration !== null ? durationLabel(duration) : null,
        ratingLabel: ratingLine({ averageRating, reviewCount: row.reviewCount, duration }),
        serviceType: row.serviceType !== 'null' ? row.serviceType : null,
        serviceTypeLabel: SERVICE_TYPE_LABELS[row.serviceType] || null,
        salonId: row.salonId,
        salonName: row.salonName,
    }
}

const formatStaticService = (service) => ({
    ...service,
    priceLabel: rupees(service.price),
    durationLabel: durationLabel(service.duration),
    ratingLabel: ratingLine(service),
})

// ----- API -----

// The Home screen, section by section in the order they appear
const getHomePage = async (req, res) => {
    if (!(await validateRequestDevice(req, res))) return

    const parsed = homeSchema.safeParse(req.body)

    if (!parsed.success) return sendValidationError(res, parsed.error)

    try {
        const customer = await findLoggedInCustomer(req, res, parsed.data)
        if (!customer) return

        // Every database section in one round of parallel queries
        const [address, favoritesCount, banners, categories, popular, atHome] = await Promise.all([
            addressModel.findDefaultAddress(customer.customerId),
            favoriteModel.countCustomerFavorites(customer.customerId),
            homeModel.findHeaderBanners(),
            homeModel.findHomeCategories(),
            homeModel.findHomeServices('popular', SECTION_LIMIT),
            homeModel.findHomeServices('home', SECTION_LIMIT),
        ])

        // Images: one media query for both service sections, then every file checked at once
        const serviceIds = [...new Set([...popular, ...atHome].map((row) => row.serviceId))]
        const [media, bannerImages, categoryImages] = await Promise.all([
            serviceIds.length ? serviceModel.findMediaForServices(serviceIds).then((rows) => withImageUrls(req, rows)) : [],
            Promise.all(banners.map((row) => resolveMediaUrl(req, BANNER_FOLDER, row.image, null, env.staticFileBaseUrl))),
            Promise.all(categories.map((row) => resolveMediaUrl(req, CATEGORY_FOLDER, row.categoryImage, null, env.staticFileBaseUrl))),
        ])
        // First row per service is its cover (findMediaForServices puts covers first)
        const covers = new Map()
        for (const row of media) if (!covers.has(row.serviceId) && row.url) covers.set(row.serviceId, row.url)

        const location = formatAddress(address)

        return res.status(200).json({
            success: true,
            message: 'Home page fetched successfully',
            data: convertNulls({
                // 1. Customer address (header)
                customerAddress: location,
                // 2. Favorites count (♡ badge)
                favoritesCount,
                // 3. Search
                search: {
                    greeting: 'Hello!',
                    customerName: customer.firstName,
                    title: 'What service are you looking for?',
                    placeholder: 'Search services, salons & products',
                },
                // 4. Header banners (below the search)
                banners: banners.map((row, index) => ({
                    bannerId: row.bannerId,
                    imageUrl: bannerImages[index],
                    redirectUrl: row.redirectUrl,
                    title: row.title,
                    subtitle: row.subtitle,
                    displayOrder: index + 1,
                    isActive: row.status === '1',
                })).filter((banner) => banner.imageUrl),
                // 5. Categories
                categories: categories.map((row, index) => ({
                    categoryId: row.categoryId,
                    categoryName: row.categoryName,
                    categoryImage: categoryImages[index],
                    displayOrder: row.sortOrder ?? index + 1,
                    isActive: row.status === '1',
                })),
                // 6. Popular services
                popularServices: {
                    title: 'Popular Services',
                    services: popular.map((row) => formatHomeService(row, covers.get(row.serviceId) || null)),
                },
                // 7. Services at home
                servicesAtHome: {
                    title: 'Services at Home',
                    subtitle: 'Trained professionals at your doorstep',
                    services: atHome.map((row) => formatHomeService(row, covers.get(row.serviceId) || null)),
                },
                // 8. Nearby salons (static for now)
                nearbySalons: {
                    title: 'Nearby Salons',
                    subtitle: location?.title ? `Near ${location.title}` : null,
                    isStatic: true,
                    salons: NEARBY_SALONS.map((salon) => ({
                        ...salon,
                        distanceLabel: `${salon.distance} km`,
                        statusLabel: `${salon.isOpen ? 'Open' : 'Closed'} · ${salon.openDays}`,
                        reviewCountLabel: `${shortCount(salon.reviewCount)} reviews`,
                    })),
                },
                // 9. Recommended for you (static for now)
                recommendedServices: {
                    title: 'Recommended For You',
                    isStatic: true,
                    services: RECOMMENDED_SERVICES.map(formatStaticService),
                },
                // 10. Special offers (static for now)
                specialOffers: {
                    title: 'Special Offers',
                    isStatic: true,
                    offers: SPECIAL_OFFERS.map((offer) => ({
                        ...offer,
                        discountLabel: offer.discountType === 'percentage' ? `${offer.discountValue}% off` : `${rupees(offer.discountValue)} off`,
                    })),
                },
                // 11. Trending services (static for now)
                trendingServices: {
                    title: 'Trending Services',
                    isStatic: true,
                    services: TRENDING_SERVICES.map((service, index) => ({
                        rank: index + 1,
                        ...formatStaticService(service),
                        // "1,240 booked this week · Facial"
                        subtitle: `${service.bookedThisWeek.toLocaleString('en-IN')} booked this week · ${service.category}`,
                    })),
                },
            }),
        })
    } catch (err) {
        console.error('Home page error:', err)
        return res.status(200).json({ success: false, message: 'Something went wrong' })
    }
}

module.exports = { getHomePage }
