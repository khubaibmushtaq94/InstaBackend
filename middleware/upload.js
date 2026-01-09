import multer from 'multer'

const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else if (file.mimetype.startsWith('video/')) {
    cb(null, true)
  } else {
    cb(new Error('Only image and video files are allowed'), false)
  }
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: fileFilter,
})

export const uploadSingle = upload.single('file')

export const uploadMedia = (req, res, next) => {
  const isMultipart = req.headers['content-type']?.includes('multipart/form-data')
  
  if (isMultipart) {
    upload.single('media')(req, res, next)
  } else {
    next()
  }
}

export const uploadProfileImage = (req, res, next) => {
  const contentType = req.headers['content-type'] || ''
  const isMultipart = contentType.includes('multipart/form-data')
  
  if (isMultipart) {
    upload.single('profileImage')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'file too large, max 50MB' })
        }
        if (err.message === 'Only image and video files are allowed') {
          return res.status(400).json({ message: err.message })
        }
        return res.status(400).json({ message: err.message || 'file upload error' })
      }
      next()
    })
  } else {
    next()
  }
}
