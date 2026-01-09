import Token from '../models/Token.js'

export const cleanupExpiredTokens = async () => {
  try {
    const result = await Token.updateMany(
      {
        expiresAt: { $lt: new Date() },
        isActive: true,
      },
      {
        isActive: false,
      }
    )

    return result.modifiedCount
  } catch (error) {
    return 0
  }
}

export const startTokenCleanup = (intervalMinutes = 60) => {
  cleanupExpiredTokens()

  setInterval(() => {
    cleanupExpiredTokens()
  }, intervalMinutes * 60 * 1000)
}

