import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob'
import dotenv from 'dotenv'
dotenv.config()

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
const CONTAINER_IMAGES = process.env.AZURE_STORAGE_CONTAINER_IMAGES || 'images'
const CONTAINER_VIDEOS = process.env.AZURE_STORAGE_CONTAINER_VIDEOS || 'videos'
const CONTAINER_GIFS = process.env.AZURE_STORAGE_CONTAINER_GIFS || 'gif'

const blobServiceClient = AZURE_STORAGE_CONNECTION_STRING
  ? BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
  : null

const getAccountNameAndKey = () => {
  if (!AZURE_STORAGE_CONNECTION_STRING) return null
  const parts = AZURE_STORAGE_CONNECTION_STRING.split(';')
  let accountName = null
  let accountKey = null
  
  for (const part of parts) {
    if (part.startsWith('AccountName=')) {
      accountName = part.split('=')[1]
    }
    if (part.startsWith('AccountKey=')) {
      accountKey = part.split('=')[1]
    }
  }
  
  if (accountName && accountKey) {
    return { accountName, accountKey }
  }
  return null
}

const generateSASUrl = (containerName, blobName) => {
  const accountInfo = getAccountNameAndKey()
  if (!accountInfo) {
    return null
  }

  try {
    const sharedKeyCredential = new StorageSharedKeyCredential(accountInfo.accountName, accountInfo.accountKey)
    const expiresOn = new Date()
    expiresOn.setFullYear(expiresOn.getFullYear() + 1)

    const sasOptions = {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    }

    const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString()
    return `https://${accountInfo.accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`
  } catch (error) {
    return null
  }
}

const CONTAINERS = [
  { name: CONTAINER_IMAGES, type: 'images' },
  { name: CONTAINER_VIDEOS, type: 'videos' },
  { name: CONTAINER_GIFS, type: 'gifs' },
]

const initializeSingleContainer = async (containerName) => {
  if (!blobServiceClient) {
    return false
  }

  try {
    const containerClient = blobServiceClient.getContainerClient(containerName)
    const exists = await containerClient.exists()
    
    if (!exists) {
      try {
        await containerClient.create({
          access: 'blob',
        })
      } catch (error) {
        if (error.message && error.message.includes('Public access is not permitted')) {
          await containerClient.create({
            access: 'none',
          })
        } else {
          throw error
        }
      }
    }
    return true
  } catch (error) {
    return false
  }
}

export const initializeContainer = async () => {
  if (!blobServiceClient) {
    return
  }

  for (const container of CONTAINERS) {
    await initializeSingleContainer(container.name)
  }
}

const getContainerName = (contentType, postType = null) => {
  if (postType === 'gif' || contentType === 'image/gif') {
    return CONTAINER_GIFS
  }
  if (postType === 'video' || contentType?.startsWith('video/')) {
    return CONTAINER_VIDEOS
  }
  if (postType === 'image' || contentType?.startsWith('image/')) {
    return CONTAINER_IMAGES
  }
  return CONTAINER_IMAGES
}

export const uploadFile = async (fileBuffer, fileName, contentType, postType = null) => {
  if (!blobServiceClient) {
    throw new Error('Azure Storage not configured. Please set AZURE_STORAGE_CONNECTION_STRING in environment variables.')
  }

  try {
    const containerName = getContainerName(contentType, postType)
    await initializeSingleContainer(containerName)
    const containerClient = blobServiceClient.getContainerClient(containerName)
    const timestamp = Date.now()
    const uniqueFileName = `${timestamp}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const blockBlobClient = containerClient.getBlockBlobClient(uniqueFileName)
    
    await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    })

    const sasUrl = generateSASUrl(containerName, uniqueFileName)
    if (sasUrl) {
      return sasUrl
    }

    return blockBlobClient.url
  } catch (error) {
    throw new Error(`Failed to upload file: ${error.message}`)
  }
}

const parseAzureUrl = (fileUrl) => {
  if (!fileUrl || !fileUrl.includes('.blob.core.windows.net')) {
    return null
  }

  try {
    const url = new URL(fileUrl)
    const pathParts = url.pathname.split('/').filter(p => p)
    
    if (pathParts.length < 2) {
      return null
    }
    
    const containerName = pathParts[0]
    const blobName = pathParts.slice(1).join('/')
    
    return { containerName, blobName }
  } catch (error) {
    return null
  }
}

export const deleteFile = async (fileUrl) => {
  if (!blobServiceClient || !fileUrl) {
    return false
  }

  try {
    const parsed = parseAzureUrl(fileUrl)
    if (!parsed) {
      return false
    }
    
    const { containerName, blobName } = parsed
    const containerClient = blobServiceClient.getContainerClient(containerName)
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    
    await blockBlobClient.delete()
    return true
  } catch (error) {
    return false
  }
}

export const isStorageConfigured = () => {
  return !!blobServiceClient
}
