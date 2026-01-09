import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Token from '../models/Token.js'
import { uploadProfileImage } from '../middleware/upload.js'
import { uploadFile } from '../utils/azureStorage.js'

const router = express.Router()
const JWT_SECRET = (process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production').trim()
const TOKEN_EXPIRY_DAYS = 30

const generateToken = async (userId, req = null) => {
  const expiresIn = `${TOKEN_EXPIRY_DAYS}d`
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS)

  const userAgent = req?.get('user-agent') || ''
  const ipAddress = req?.ip || req?.connection?.remoteAddress || ''

  const tokenRecord = new Token({
    userId,
    token,
    expiresAt,
    userAgent,
    ipAddress,
    isActive: true,
  })

  try {
    await tokenRecord.save()
  } catch (error) {
    if (error.message && error.message.includes('throughput limit')) {
      throw new Error('Database throughput limit exceeded. Please configure your Cosmos DB database to use shared throughput instead of per-collection throughput.')
    }
    throw error
  }

  return token
}

const revokeToken = async (tokenString) => {
  await Token.findOneAndUpdate(
    { token: tokenString },
    { isActive: false },
    { new: true }
  )
}

const revokeAllUserTokens = async (userId) => {
  await Token.updateMany(
    { userId, isActive: true },
    { isActive: false }
  )
}

router.post('/signup', uploadProfileImage, async (req, res) => {
  try {
    const name = req.body.name?.trim()
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password
    const userType = req.body.userType?.toLowerCase()
    const profileImageFile = req.file

    if (!name || !email || !password || !userType) {
      return res.status(400).json({ message: 'all fields required' })
    }

    if (!['consumer', 'creator'].includes(userType)) {
      return res.status(400).json({ message: 'userType must be consumer or creator' })
    }

    if (userType === 'creator' && !profileImageFile) {
      return res.status(400).json({ message: 'profile image required for creators' })
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'password must be at least 6 characters' })
    }

    const existingUser = await User.findOne({ email, userType })
    if (existingUser) {
      return res.status(400).json({ message: `account with this email already exists as ${userType}` })
    }

    let profileImageUrl = null
    if (profileImageFile) {
      try {
        if (!profileImageFile.mimetype.startsWith('image/')) {
          return res.status(400).json({ message: 'profile image must be an image file' })
        }
        
        if (profileImageFile.size > 5 * 1024 * 1024) {
          return res.status(400).json({ message: 'profile image must be less than 5MB' })
        }
        
        const fileExtension = profileImageFile.originalname.split('.').pop() || 'jpg'
        const fileName = `profile-${email.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${fileExtension}`
        
        profileImageUrl = await uploadFile(
          profileImageFile.buffer,
          fileName,
          profileImageFile.mimetype,
          'image'
        )
      } catch (uploadError) {
        return res.status(500).json({ 
          message: 'failed to upload profile image to storage', 
          error: uploadError.message 
        })
      }
    }

    const userData = { name, email, password, userType }
    if (profileImageUrl) {
      userData.profileImage = profileImageUrl
    }

    const user = new User(userData)
    await user.save()

    const token = await generateToken(user._id, req)

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        profileImage: user.profileImage,
      },
    })
  } catch (error) {
    if (error.message && error.message.includes('throughput')) {
      return res.status(500).json({
        message: 'Database configuration error. Please contact administrator.',
        error: 'Database throughput limit exceeded. Configure Cosmos DB to use shared throughput.'
      })
    }
    res.status(500).json({ message: 'signup failed', error: error.message })
  }
})

router.use((error, req, res, next) => {
  if (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'file too large, max 50MB' })
    }
    if (error.message === 'Only image and video files are allowed') {
      return res.status(400).json({ message: error.message })
    }
    if (error.message) {
      return res.status(400).json({ message: error.message })
    }
  }
  next(error)
})

router.post('/login', async (req, res) => {
  try {
    const { email, password, userType } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password required' })
    }

    if (!userType || !['consumer', 'creator'].includes(userType)) {
      return res.status(400).json({ message: 'userType must be consumer or creator' })
    }

    const user = await User.findOne({ email, userType })
    if (!user) {
      return res.status(401).json({ message: 'invalid credentials or account type not found' })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'invalid credentials' })
    }

    const token = await generateToken(user._id, req)

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        profileImage: user.profileImage,
      },
    })
  } catch (error) {
    if (error.message && error.message.includes('throughput')) {
      return res.status(500).json({
        message: 'Database configuration error. Please contact administrator.',
        error: 'Database throughput limit exceeded. Configure Cosmos DB to use shared throughput.'
      })
    }
    res.status(500).json({ message: 'login failed', error: error.message })
  }
})

router.post('/logout', async (req, res) => {
  try {
    const tokenString = req.headers.authorization?.split(' ')[1]

    if (tokenString) {
      await revokeToken(tokenString)
    }

    res.json({ message: 'logged out successfully' })
  } catch (error) {
    res.status(500).json({ message: 'logout failed', error: error.message })
  }
})

router.post('/logout-all', async (req, res) => {
  try {
    const tokenString = req.headers.authorization?.split(' ')[1]

    if (!tokenString) {
      return res.status(401).json({ message: 'no token provided' })
    }

    try {
      const decoded = jwt.verify(tokenString, JWT_SECRET)
      await revokeAllUserTokens(decoded.id)

      res.json({ message: 'logged out from all devices' })
    } catch (error) {
      res.status(401).json({ message: 'invalid token' })
    }
  } catch (error) {
    res.status(500).json({ message: 'logout failed', error: error.message })
  }
})

router.get('/tokens', async (req, res) => {
  try {
    const tokenString = req.headers.authorization?.split(' ')[1]

    if (!tokenString) {
      return res.status(401).json({ message: 'no token provided' })
    }

    const decoded = jwt.verify(tokenString, JWT_SECRET)
    const tokens = await Token.find({
      userId: decoded.id,
      isActive: true,
    }).select('-token -__v').sort({ createdAt: -1 })

    res.json({
      tokens: tokens.map(t => ({
        id: t._id,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        userAgent: t.userAgent,
        ipAddress: t.ipAddress,
        isCurrent: t.token === tokenString,
      })),
    })
  } catch (error) {
    res.status(401).json({ message: 'invalid token' })
  }
})

export { revokeToken, revokeAllUserTokens }
export default router

