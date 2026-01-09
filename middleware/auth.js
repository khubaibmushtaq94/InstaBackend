import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Token from '../models/Token.js'

// Use the same JWT_SECRET constant as in auth.js to ensure consistency
const JWT_SECRET = (process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production').trim()

export const authenticate = async (req, res, next) => {
  try {
    const tokenString = req.headers.authorization?.split(' ')[1]

    if (!tokenString) {
      return res.status(401).json({ message: 'no token provided' })
    }

    const decoded = jwt.verify(tokenString, JWT_SECRET)

    const tokenRecord = await Token.findOne({
      token: tokenString,
      isActive: true,
      userId: decoded.id,
    })

    if (!tokenRecord) {
      return res.status(401).json({ message: 'token not found or revoked' })
    }

    if (tokenRecord.expiresAt < new Date()) {
      await Token.findByIdAndUpdate(tokenRecord._id, { isActive: false })
      return res.status(401).json({ message: 'token expired' })
    }

    const user = await User.findById(decoded.id).select('-password')

    if (!user) {
      await Token.findByIdAndUpdate(tokenRecord._id, { isActive: false })
      return res.status(401).json({ message: 'user not found' })
    }

    req.user = user
    req.token = tokenRecord

    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      // Invalid signature or malformed token
      return res.status(401).json({ 
        message: 'invalid token',
        error: error.message 
      })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'token expired' })
    }
    res.status(401).json({ 
      message: 'authentication failed',
      error: error.message 
    })
  }
}

