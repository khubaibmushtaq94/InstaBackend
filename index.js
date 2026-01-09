import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import postRoutes from './routes/posts.js'
import { startTokenCleanup } from './middleware/tokenCleanup.js'
import { initializeContainer } from './utils/azureStorage.js'

const app = express()
const PORT = process.env.PORT 

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.set('trust proxy', true)

mongoose
  .connect(process.env.MONGODB_URI, {
    retryWrites: false,
    autoIndex: false,
  })
  .then(async () => {
    console.log('MongoDB connected')
    
    try {
      const db = mongoose.connection.db
      const collections = await db.listCollections().toArray()
      const collectionNames = collections.map(c => c.name.toLowerCase())
      
      const requiredCollections = ['users', 'posts', 'tokens']
      const missingCollections = requiredCollections.filter(
        name => !collectionNames.includes(name)
      )
      
      if (missingCollections.length > 0) {
        console.warn(`Warning: Collections not found: ${missingCollections.join(', ')}`)
        console.warn('They will be created on first document save.')
        console.warn('IMPORTANT: Make sure your Cosmos DB database has SHARED throughput configured')
        console.warn('to avoid "throughput limit exceeded" errors.')
        console.warn('Configure this in Azure Portal: Database → Scale → Throughput → Shared')
      }
    } catch (error) {
      console.warn('Could not check collections:', error.message)
    }
    
    await initializeContainer()
    startTokenCleanup(60)
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    if (err.message && err.message.includes('throughput')) {
      console.error('COSMOS DB THROUGHPUT ERROR:')
      console.error('Your Cosmos DB account has a 1000 RU/s limit.')
      console.error('Collections are being created with dedicated throughput (400 RU/s each).')
      console.error('SOLUTION:')
      console.error('1. Go to Azure Portal → Your Cosmos DB Account')
      console.error('2. Navigate to your database')
      console.error('3. Go to "Scale" settings')
      console.error('4. Change throughput from "Per collection" to "Shared"')
      console.error('5. Set shared throughput to 1000 RU/s (or higher)')
      console.error('This will allow all collections to share the database throughput.')
    }
  })

app.use('/api/auth', authRoutes)
app.use('/api/posts', postRoutes)

app.get('/', (req, res) => {
  res.send('Server is running')
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

