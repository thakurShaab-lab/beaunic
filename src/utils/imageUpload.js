
const multer = require('multer')

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/HEIC'
        ]

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(
                new Error('Only JPG, PNG, and WEBP images are allowed')
            )
        }

        cb(null, true)
    }
})

module.exports = upload