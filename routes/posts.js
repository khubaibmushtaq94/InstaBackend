import express from 'express'
import Post from '../models/Post.js'
import User from '../models/User.js'
import { authenticate } from '../middleware/auth.js'
import { uploadMedia } from '../middleware/upload.js'
import { uploadFile, deleteFile } from '../utils/azureStorage.js'

const router = express.Router()

router.get('/', authenticate, async (req, res) => {
  try {
    let query = {}

    if (req.user.userType === 'creator') {
      query.userId = req.user._id
    } else if (req.user.userType === 'consumer') {
      query.userId = { $ne: req.user._id }
    }

    if (req.query.search && req.user.userType === 'consumer') {
      const searchRegex = new RegExp(req.query.search, 'i')
      query.$or = [
        { caption: searchRegex },
        { userName: searchRegex },
      ]
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name')
      .lean()

    const formattedPosts = await Promise.all(posts.map(async post => {
      const postUser = await User.findById(post.userId).select('profileImage')
      const avatar = postUser?.profileImage || post.userAvatar || post.userName?.charAt(0).toUpperCase() || ''

      return {
        id: post._id.toString(),
        userId: post.userId._id?.toString() || post.userId.toString(),
        userName: post.userName,
        userAvatar: avatar,
        userProfileImage: postUser?.profileImage || null,
        type: post.type,
        media: post.media,
        caption: post.caption,
        likes: post.likes || 0,
        likedBy: post.likedBy?.map(id => id.toString()) || [],
        comments: post.comments?.map(comment => ({
          id: comment._id.toString(),
          userId: comment.userId.toString(),
          userName: comment.userName,
          text: comment.text,
          timestamp: comment.createdAt || Date.now(),
        })) || [],
        timestamp: post.createdAt || Date.now(),
      }
    }))

    res.json(formattedPosts)
  } catch (error) {
    res.status(500).json({ message: 'failed to fetch posts', error: error.message })
  }
})

router.post('/', authenticate, uploadMedia, async (req, res) => {
  try {
    if (req.user.userType !== 'creator') {
      return res.status(403).json({ message: 'only creators can create posts' })
    }

    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError })
    }

    const { type, mediaUrl, caption } = req.body
    const mediaFile = req.file

    if (type === 'text' && !caption?.trim()) {
      return res.status(400).json({ message: 'caption required for text posts' })
    }

    let mediaUrlFinal = null

    if (type !== 'text') {
      if (mediaFile) {
        try {
          if (mediaFile.size > 50 * 1024 * 1024) {
            return res.status(400).json({ message: 'file too large, max 50MB' })
          }
          
          const fileExtension = mediaFile.originalname.split('.').pop() || 
            (type === 'video' ? 'mp4' : type === 'gif' ? 'gif' : 'jpg')
          const fileName = `post-${req.user._id}-${Date.now()}.${fileExtension}`
          
          mediaUrlFinal = await uploadFile(
            mediaFile.buffer,
            fileName,
            mediaFile.mimetype,
            type
          )
          
        } catch (uploadError) {
          return res.status(500).json({ 
            message: 'failed to upload media file to storage', 
            error: uploadError.message 
          })
        }
      } else if (mediaUrl) {
        mediaUrlFinal = mediaUrl
      } else if (type === 'image') {
        mediaUrlFinal = `https://picsum.photos/600/600?random=${Date.now()}`
      } else {
        return res.status(400).json({ message: 'media file or URL required' })
      }
    }

    const post = new Post({
      userId: req.user._id,
      userName: req.user.name,
      userAvatar: req.user.profileImage || req.user.name.charAt(0).toUpperCase(),
      type: type || 'image',
      media: mediaUrlFinal,
      caption: caption || '',
    })

    await post.save()

    const formattedPost = {
      id: post._id.toString(),
      userId: post.userId.toString(),
      userName: post.userName,
      userAvatar: post.userAvatar,
      userProfileImage: req.user.profileImage || null,
      type: post.type,
      media: post.media,
      caption: post.caption,
      likes: 0,
      likedBy: [],
      comments: [],
      timestamp: post.createdAt,
    }

    res.status(201).json(formattedPost)
  } catch (error) {
    res.status(500).json({ message: 'failed to create post', error: error.message })
  }
})

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { caption } = req.body
    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({ message: 'post not found' })
    }

    if (post.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'not authorized' })
    }

    post.caption = caption || post.caption
    await post.save()

    res.json({ message: 'post updated', post })
  } catch (error) {
    res.status(500).json({ message: 'failed to update post', error: error.message })
  }
})

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({ message: 'post not found' })
    }

    if (post.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'not authorized' })
    }

    if (post.media && post.media.includes('.blob.core.windows.net')) {
      try {
        await deleteFile(post.media)
      } catch (deleteError) {
      }
    }

    await post.deleteOne()

    res.json({ message: 'post deleted' })
  } catch (error) {
    res.status(500).json({ message: 'failed to delete post', error: error.message })
  }
})

router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({ message: 'post not found' })
    }

    const userId = req.user.id.toString()
    const isLiked = post.likedBy.some(id => id.toString() === userId)

    if (isLiked) {
      post.likedBy = post.likedBy.filter(id => id.toString() !== userId)
      post.likes = Math.max(0, post.likes - 1)
    } else {
      post.likedBy.push(req.user.id)
      post.likes += 1
    }

    await post.save()

    res.json({
      likes: post.likes,
      likedBy: post.likedBy.map(id => id.toString()),
    })
  } catch (error) {
    res.status(500).json({ message: 'failed to toggle like', error: error.message })
  }
})

router.post('/:id/comment', authenticate, async (req, res) => {
  try {
    const { text } = req.body

    if (!text?.trim()) {
      return res.status(400).json({ message: 'comment text required' })
    }

    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({ message: 'post not found' })
    }

    const user = await User.findById(req.user.id)

    post.comments.push({
      userId: user._id,
      userName: user.name,
      text: text.trim(),
    })

    await post.save()

    const newComment = post.comments[post.comments.length - 1]

    res.status(201).json({
      id: newComment._id.toString(),
      userId: newComment.userId.toString(),
      userName: newComment.userName,
      text: newComment.text,
      timestamp: newComment.createdAt || Date.now(),
    })
  } catch (error) {
    res.status(500).json({ message: 'failed to add comment', error: error.message })
  }
})

router.delete('/:postId/comment/:commentId', authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId)

    if (!post) {
      return res.status(404).json({ message: 'post not found' })
    }

    const comment = post.comments.id(req.params.commentId)

    if (!comment) {
      return res.status(404).json({ message: 'comment not found' })
    }

    const isOwner = comment.userId.toString() === req.user.id.toString()
    const isPostOwner = post.userId.toString() === req.user.id.toString()

    if (!isOwner && !isPostOwner) {
      return res.status(403).json({ message: 'not authorized' })
    }

    comment.deleteOne()
    await post.save()

    res.json({ message: 'comment deleted' })
  } catch (error) {
    res.status(500).json({ message: 'failed to delete comment', error: error.message })
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

export default router

