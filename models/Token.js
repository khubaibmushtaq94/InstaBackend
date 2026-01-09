import mongoose from 'mongoose'

const tokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  userAgent: {
    type: String,
    default: '',
  },
  ipAddress: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
})

tokenSchema.index({ userId: 1, isActive: 1 })
tokenSchema.index({ token: 1, isActive: 1 })

const Token = mongoose.model('Token', tokenSchema)

export default Token

