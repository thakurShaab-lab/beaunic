const env = require('../config/env')
const salonModel = require('../models/salon.model')
const addressModel = require('../models/address.model')
const serviceModel = require('../models/service.model')
const reviewModel = require('../models/review.model')
const geoModel = require('../models/geo.model')
const { coordinatesOf, saveGpsLocation, savedId, cityTitle } = require('./addressLocation.service')
const { resolveMediaUrl } = require('../utils/mediaUrl')
const { istDateLabels } = require('../utils/istDateLabels')
const { withImageUrls, rupees } = require('../controllers/service.controller')
const { salonNow } = require('../controllers/slot.controller')
const { initialsOf } = require('../controllers/employee.controller')

// Nearby Salons: one search for both ways of choosing where the customer is (live GPS position, or one of their
// saved addresses), the salon cards, and the selected salon's About / Services / Reviews.
// Distances are worked out by MySQL, never in Node.

const SALON_LOGO_FOLDER = 'salon_logos'
// The badge on the cover: "Salon" / "Salon & Home"
const SERVICE_TYPE_LABELS = { salon: 'Salon', home_service: 'Salon & Home' }
const TAG_COUNT = 3
const COVER_IMAGES = 5
const REVIEWS_ON_DETAILS = 10
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// The "Rating" chip
const RATING_OPTIONS = [4, 4.5, 4.7]

// Kilometres per degree of latitude. A little under ST_Distance_Sphere's own (6,370,986 m radius = 111.19 km),
// so the box is always slightly bigger than the circle and never cuts off a salon inside the radius.
const KM_PER_DEGREE = 111.045

// The latitude / longitude range around the point that holds the whole circle. Longitude is left open near the
// poles and where the range would cross the ±180° line (then only latitude narrows the rows).
const boundingBox = (latitude, longitude, radiusKm) => {
    const latitudeDelta = radiusKm / KM_PER_DEGREE
    const box = {
        minLatitude: Math.max(latitude - latitudeDelta, -90),
        maxLatitude: Math.min(latitude + latitudeDelta, 90),
    }

    const cos = Math.cos((latitude * Math.PI) / 180)
    if (box.minLatitude > -90 && box.maxLatitude < 90 && cos > 0.01) {
        const longitudeDelta = (radiusKm / (KM_PER_DEGREE * cos)) * 1.01
        if (longitude - longitudeDelta >= -180 && longitude + longitudeDelta <= 180) {
            box.minLongitude = longitude - longitudeDelta
            box.maxLongitude = longitude + longitudeDelta
        }
    }

    return box
}

const SEARCH_ERRORS = {
    address_not_found: 'Address not found.',
    address_location_unknown: 'We couldn\'t find the location of this address. Please update the address or use your current location.',
}

const trimmed = (value) => (value && String(value).trim()) || null

// "Main Market, Dildarnagar": the address line and locality (repeats left out)
const shortAddress = (row) => {
    const parts = []
    for (const part of [row.address, row.city].map(trimmed)) {
        if (part && !parts.some((seen) => seen.toLowerCase().includes(part.toLowerCase()))) parts.push(part)
    }
    return parts.join(', ') || null
}

// Where to search from. { addressId } = a saved address of this customer (only their own is found);
// otherwise { latitude, longitude } = the live GPS position, which is saved on a User's default address.
// Returns { error } or { source, addressId, latitude, longitude, label }.
const resolveSearchPoint = async (customer, { latitude, longitude, addressId }) => {
    if (addressId !== undefined) {
        const row = await addressModel.findCustomerAddress(customer.customerId, addressId)
        if (!row) return { error: 'address_not_found' }

        const point = await coordinatesOf(row)
        if (point.error) return { error: 'address_location_unknown' }

        return {
            source: 'saved_address',
            addressId: row.addressId,
            latitude: point.latitude,
            longitude: point.longitude,
            // "Dildarnagar": the locality, else the last part of the address line
            label: trimmed(row.city) || trimmed(String(row.address || '').split(',').pop()),
        }
    }

    if (customer.customerType === '2') await saveGpsLocation(customer, { latitude, longitude })

    return { source: 'current_location', addressId: null, latitude, longitude, label: null }
}

const shortCount = (value) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value))
const reviewCountLabel = (count) => `${shortCount(count)} review${count === 1 ? '' : 's'}`

// 840 m -> 0.84 km, "0.8 km"; 12,345 m -> "12 km"
const distanceKm = (metres) => (metres === null || metres === undefined || Number.isNaN(metres) ? null : Number((metres / 1000).toFixed(2)))
const distanceLabel = (km) => (km === null ? null : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`)

const coordinate = (value) => (value === null || value === undefined ? null : Number(value))

const ratingOf = (ratings, salonId) => {
    const row = ratings.find((item) => item.salonId === salonId)
    return {
        rating: row ? Number(Number(row.averageRating).toFixed(1)) : 0,
        reviewCount: row ? Number(row.reviewCount) : 0,
    }
}

const logoUrl = (req, logo) => resolveMediaUrl(req, SALON_LOGO_FOLDER, logo, null, env.staticFileBaseUrl)

// Cover images of services, first one per service (cover first): Map serviceId -> url
const serviceCovers = async (req, serviceIds) => {
    const media = await withImageUrls(req, await serviceModel.findMediaForServices(serviceIds))
    const covers = new Map()
    for (const item of media) if (item.url && !covers.has(item.serviceId)) covers.set(item.serviceId, item.url)
    return covers
}

// ---------- Open · Mon–Sun ----------
// There are no business hours, so this comes from the salon's active slots in the coming 7 days:
// open now = a slot today that hasn't ended yet; the days = the weekdays with slots.

const addDays = (isoDate, days) => {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// 0 = Mon ... 6 = Sun
const weekdayOf = (isoDate) => {
    const [year, month, day] = isoDate.split('-').map(Number)
    return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

// [0..6] -> "Mon–Sun", [0,1,2,3,4] -> "Mon–Fri", [0,2,4] -> "Mon, Wed, Fri"
const daysLabel = (days) => {
    if (!days.length) return null
    const sorted = [...new Set(days)].sort((x, y) => x - y)
    const runs = []
    for (const day of sorted) {
        const last = runs[runs.length - 1]
        if (last && day === last[1] + 1) last[1] = day
        else runs.push([day, day])
    }
    return runs.map(([from, to]) => (to - from >= 2 ? `${DAY_NAMES[from]}–${DAY_NAMES[to]}` : from === to ? DAY_NAMES[from] : `${DAY_NAMES[from]}, ${DAY_NAMES[to]}`)).join(', ')
}

const openStatuses = async (salonIds) => {
    const now = salonNow()
    const rows = await salonModel.findSlotDays(salonIds, now.date, addDays(now.date, 6))

    return new Map(salonIds.map((salonId) => {
        const own = rows.filter((row) => row.salonId === salonId)
        const isOpen = own.some((row) => row.slotDate === now.date && String(row.lastEndTime).slice(0, 5) > now.time)
        const openDays = daysLabel(own.map((row) => weekdayOf(row.slotDate)))
        return [salonId, { isOpen: isOpen ? 1 : 0, openDays, statusLabel: [isOpen ? 'Open' : 'Closed', openDays].filter(Boolean).join(' · ') }]
    }))
}

// ---------- Nearby Salons list ----------

// One card: cover, logo, "Beaunic Salon Academy", "Main Market, Dildarnagar · 0.8 km", ★ 4.9, three service tags,
// "Open · Mon–Sun · 1.2k reviews", "View Salon"
const formatSalonCard = (row, { logo, coverImage, rating, tags, status }) => {
    const km = distanceKm(row.distanceMetres)
    const location = shortAddress(row)

    return {
        salonId: row.salonId,
        salonName: row.salonName,
        coverImage,
        logo,
        // Shown when there is no logo: "AU"
        initials: initialsOf(row.salonName),
        serviceType: row.serviceType,
        badgeLabel: SERVICE_TYPE_LABELS[row.serviceType] || null,
        rating: rating.rating,
        ratingLabel: rating.rating.toFixed(1),
        reviewCount: rating.reviewCount,
        reviewCountLabel: reviewCountLabel(rating.reviewCount),
        location,
        distance: km,
        distanceLabel: distanceLabel(km),
        subtitle: [location, distanceLabel(km)].filter(Boolean).join(' · ') || null,
        services: tags,
        isOpen: status.isOpen,
        openDays: status.openDays,
        statusLabel: status.statusLabel,
        // "Open · Mon–Sun · 1.2k reviews"
        footerLabel: `${status.statusLabel} · ${reviewCountLabel(rating.reviewCount)}`,
        buttonLabel: 'View Salon',
        latitude: coordinate(row.latitude),
        longitude: coordinate(row.longitude),
    }
}

const ALL = { value: 'all', label: 'All' }

// The three chips and their options (page 1 only; later pages keep the options the app already has)
const buildFilters = async (query, filters) => {
    const [areas, categoryCounts] = await Promise.all([salonModel.findNearbyAreas(query), salonModel.findNearbyCategories(query)])
    const categories = await salonModel.findCategoryNames(categoryCounts.map((row) => row.categoryId))
    const selectedCategory = categories.find((category) => category.categoryId === filters.categoryId)

    return [
        {
            key: 'location',
            label: 'Location',
            selected: filters.area ?? 'all',
            selectedLabel: `Location: ${filters.area ?? 'All'}`,
            options: [ALL, ...areas.map((row) => ({ value: row.area, label: row.area, count: row.total }))],
        },
        {
            key: 'service',
            label: 'Service',
            selected: filters.categoryId ?? 'all',
            selectedLabel: `Service: ${filters.categoryId === undefined ? 'All' : selectedCategory?.categoryName || 'All'}`,
            options: [ALL, ...categories.map((category) => ({
                value: category.categoryId,
                label: category.categoryName,
                count: categoryCounts.find((row) => row.categoryId === category.categoryId)?.total || 0,
            }))],
        },
        {
            key: 'rating',
            label: 'Rating',
            selected: filters.minRating ?? 'all',
            selectedLabel: filters.minRating === undefined ? 'Rating: All' : `Rating ${filters.minRating}+`,
            options: [ALL, ...RATING_OPTIONS.map((value) => ({ value, label: `${value}+` }))],
        },
    ]
}

// One page of salons within radiusKm of the point, nearest first.
// filters: { area, categoryId, minRating } (all optional)
const searchNearbySalons = async (req, point, { radiusKm, filters, page, limit }) => {
    const query = {
        latitude: point.latitude,
        longitude: point.longitude,
        radiusMetres: radiusKm * 1000,
        box: boundingBox(point.latitude, point.longitude, radiusKm),
        filters,
    }

    const [rows, filterChips] = await Promise.all([
        salonModel.findNearbySalons({ ...query, limit, offset: (page - 1) * limit }),
        page === 1 ? buildFilters(query, filters) : null,
    ])
    // Past the last page there are no rows to carry the total, so count separately (only then)
    const total = rows.length ? rows[0].total : page > 1 ? await salonModel.countNearbySalons(query) : 0

    const salonIds = rows.map((row) => row.salonId)
    const [ratings, topServices, statuses, logos] = await Promise.all([
        salonModel.findSalonRatings(salonIds),
        salonModel.findTopServices(salonIds, TAG_COUNT),
        openStatuses(salonIds),
        Promise.all(rows.map((row) => logoUrl(req, row.logo))),
    ])
    const covers = await serviceCovers(req, topServices.map((service) => service.serviceId))

    const totalPages = Math.ceil(total / limit)
    const near = point.label || 'you'

    return {
        // "4 salons near Dildarnagar"
        subtitle: `${total} salon${total === 1 ? '' : 's'} near ${near}`,
        filters: filterChips,
        salons: rows.map((row, index) => {
            const own = topServices.filter((service) => service.salonId === row.salonId)
            return formatSalonCard(row, {
                logo: logos[index],
                coverImage: own.map((service) => covers.get(service.serviceId)).find(Boolean) || null,
                rating: ratingOf(ratings, row.salonId),
                tags: own.map((service) => service.serviceName),
                status: statuses.get(row.salonId),
            })
        }),
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
    }
}

// ---------- Salon details ----------

// "+91 70073 03966" style: 10-digit Indian numbers get +91
const contactLabel = (number) => {
    const digits = String(number || '').replace(/\D/g, '')
    if (/^\d{10}$/.test(digits)) return `+91 ${digits}`
    return trimmed(number)
}

// "45 min" etc. from wl_durations
const durationLabel = (service) => trimmed(service.durationName)

// Price shown and the struck-through original ("₹499" over "₹699") when a lower discounted price is set
const servicePrice = (service) => {
    const price = service.servicePrice !== null ? Number(service.servicePrice) : null
    const discounted = service.serviceDiscountedPrice !== null ? Number(service.serviceDiscountedPrice) : null
    const hasDiscount = price !== null && discounted !== null && discounted > 0 && discounted < price
    const shown = hasDiscount ? discounted : price
    return {
        price: shown,
        priceLabel: shown !== null ? rupees(shown) : 'Price not set',
        originalPrice: hasDiscount ? price : null,
        originalPriceLabel: hasDiscount ? rupees(price) : null,
    }
}

// "hair, skin and makeup"
const listOf = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

// There is no salon description column, so About is written from the salon's own details
const aboutText = ({ salonName, serviceType, place, categoryNames }) => {
    if (!categoryNames.length) return null
    const where = serviceType === 'home_service' ? 'at the salon and at home' : 'at the salon'
    return `${salonName} offers ${listOf(categoryNames.map((name) => name.toLowerCase()))} services ${where}${place ? ` in ${place}` : ''}.`
}

const formatReview = (row) => {
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || 'Customer'
    return {
        reviewId: row.reviewId,
        name,
        initials: initialsOf(name),
        dateLabel: istDateLabels(row.reviewAddedDate).date,
        rating: Number(row.rating),
        reviewText: row.reviewText,
        serviceName: row.serviceName,
    }
}

const ACTIVE_REVIEWS = { status: '1' }

// The Reviews tab: "4.9", ★★★★★, "1.2k reviews", the 5..1 bars and a page of reviews
const salonReviews = async (salonId, { page, limit }) => {
    const [summary, byRating, rows] = await Promise.all([
        reviewModel.findPartnerRatingSummary(salonId, ACTIVE_REVIEWS),
        reviewModel.countPartnerReviewsByRating(salonId, ACTIVE_REVIEWS),
        reviewModel.findPartnerReviews(salonId, ACTIVE_REVIEWS, { sortBy: 'newest', limit, offset: (page - 1) * limit }),
    ])
    const total = summary.totalReviews
    const averageRating = Number(summary.averageRating.toFixed(1))
    const totalPages = Math.ceil(total / limit)

    return {
        averageRating,
        averageRatingLabel: averageRating.toFixed(1),
        reviewCount: total,
        reviewCountLabel: reviewCountLabel(total),
        distribution: [5, 4, 3, 2, 1].map((stars) => {
            const count = byRating[stars] || 0
            return { stars, count, percent: total ? Math.round((count / total) * 100) : 0 }
        }),
        reviews: rows.map(formatReview),
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages },
    }
}

// The selected salon: header, About (details, call / map / enquire), Services and Reviews.
// point is optional (no distance without it).
const getSalonDetails = async (req, salonId, point) => {
    const row = await salonModel.findActiveSalon(salonId, point)
    if (!row) return null

    const countryId = savedId(row.country)
    const cityId = savedId(row.state)
    const [names, ratings, services, logo, statuses, reviews] = await Promise.all([
        countryId || cityId ? geoModel.findCountryAndCityNames(countryId, cityId) : {},
        salonModel.findSalonRatings([salonId]),
        salonModel.findSalonServices(salonId),
        logoUrl(req, row.logo),
        openStatuses([salonId]),
        salonReviews(salonId, { page: 1, limit: REVIEWS_ON_DETAILS }),
    ])
    const covers = await serviceCovers(req, services.map((service) => service.serviceId))

    // Category names for About (sub-categories count as their parent)
    const parentIds = [...new Set(services.map((service) => service.parentCategoryId).filter((id) => id > 0))]
    const parents = await salonModel.findCategoryNames(parentIds)
    const categoryNames = [...new Set(services.map((service) =>
        parents.find((parent) => parent.categoryId === service.parentCategoryId)?.categoryName || service.categoryName).filter(Boolean))]

    // The partner form saves a wl_cities ID in "state" (title like "Ghazipur (UP)") and a country ID; older rows
    // hold the names
    const cityRow = cityId ? names.cityName : null
    const city = cityId ? cityTitle(cityRow) : trimmed(row.city)
    const state = cityId ? (String(cityRow || '').match(/\(([^)]+)\)/)?.[1] || null) : trimmed(row.state)
    const country = countryId ? names.countryName : trimmed(row.country)
    const location = shortAddress(row)
    const latitude = coordinate(row.latitude)
    const longitude = coordinate(row.longitude)
    const fullAddress = [location, city !== row.city ? city : null, state, row.zipcode && row.zipcode.trim()].filter(Boolean).join(', ') || null
    const mapLink = latitude !== null && longitude !== null
        ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
        : fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.salonName}, ${fullAddress}`)}` : null
    const contactNumber = trimmed(row.addressMobile) || trimmed(row.accountMobile)

    const card = formatSalonCard(row, {
        logo,
        coverImage: services.map((service) => covers.get(service.serviceId)).find(Boolean) || null,
        rating: ratingOf(ratings, salonId),
        tags: services.slice(0, TAG_COUNT).map((service) => service.serviceName),
        status: statuses.get(salonId),
    })

    return {
        salon: {
            ...card,
            // The header photos: the services' cover images
            coverImages: [...new Set(services.map((service) => covers.get(service.serviceId)).filter(Boolean))].slice(0, COVER_IMAGES),
        },
        tabs: [
            { key: 'about', label: 'About' },
            { key: 'services', label: 'Services', count: services.length },
            { key: 'reviews', label: 'Reviews', count: reviews.reviewCount },
        ],
        about: {
            description: aboutText({ salonName: row.salonName, serviceType: row.serviceType, place: city || trimmed(row.city), categoryNames }),
            details: [
                { key: 'email', label: 'Email', value: row.email },
                { key: 'contactNumber', label: 'Contact Number', value: contactLabel(contactNumber) },
                { key: 'address', label: 'Address', value: trimmed(row.address) },
                { key: 'country', label: 'Country', value: country },
                { key: 'state', label: 'State', value: state },
                { key: 'city', label: 'City', value: city },
                { key: 'location', label: 'Location', value: location },
                { key: 'pinCode', label: 'PIN Code', value: trimmed(row.zipcode) },
            ],
            email: row.email,
            contactNumber,
            fullAddress,
            latitude,
            longitude,
            mapLink,
            // The three buttons: call, "View on Map", "Enquire" (/api/enquiry/send with this salonId)
            actions: [
                { key: 'call', label: 'Call', value: contactNumber, isEnabled: contactNumber ? 1 : 0 },
                { key: 'map', label: 'View on Map', value: mapLink, isEnabled: mapLink ? 1 : 0 },
                { key: 'enquire', label: 'Enquire', value: String(salonId), isEnabled: 1 },
            ],
        },
        services: services.map((service) => ({
            serviceId: service.serviceId,
            serviceName: service.serviceName,
            categoryName: service.categoryName,
            image: covers.get(service.serviceId) || null,
            durationLabel: durationLabel(service),
            ...servicePrice(service),
            buttonLabel: 'Book',
            isBookable: service.servicePrice !== null ? 1 : 0,
        })),
        reviews,
    }
}

module.exports = { resolveSearchPoint, searchNearbySalons, getSalonDetails, salonReviews, boundingBox, distanceLabel, daysLabel, SEARCH_ERRORS }
