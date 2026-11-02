const jwt = require('jsonwebtoken')

const generateToken = (customer) =>
  jwt.sign(
    {
      customerId: customer.customerId,
      customerType: customer.customerType,
    },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '5h',
    }
  )

module.exports = { generateToken }
