export const isBase64Image = (str) => {
  if (!str || typeof str !== 'string') return false
  return str.startsWith('data:image/') || 
         (str.length > 100 && /^[A-Za-z0-9+/=]+$/.test(str.substring(0, 100)))
}

export const isAzureStorageUrl = (str) => {
  if (!str || typeof str !== 'string') return false
  return str.includes('.blob.core.windows.net')
}

export const isImageUrl = (str) => {
  if (!str || typeof str !== 'string') return false
  try {
    const url = new URL(str)
    return (url.protocol === 'http:' || url.protocol === 'https:') && 
           (str.includes('.jpg') || str.includes('.jpeg') || str.includes('.png') || 
            str.includes('.gif') || str.includes('.webp') || str.includes('.blob.core.windows.net'))
  } catch {
    return false
  }
}

export const getImageSource = (image) => {
  if (!image) return null
  if (isBase64Image(image) || isAzureStorageUrl(image) || isImageUrl(image)) {
    return image
  }
  return image
}

export const isValidImage = (image) => {
  if (!image) return false
  return isBase64Image(image) || isAzureStorageUrl(image) || isImageUrl(image)
}
