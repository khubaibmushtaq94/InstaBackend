import mongoose from 'mongoose'

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
})

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userAvatar: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'gif'],
    default: 'image',
  },
  media: {
    type: String,
    default: null,
  },
  caption: {
    type: String,
    default: '',
    trim: true,
  },
  likes: {
    type: Number,
    default: 0,
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  comments: [commentSchema],
}, {
  timestamps: true,
})

postSchema.index({ userId: 1, createdAt: -1 })

const Post = mongoose.model('Post', postSchema)

export default Post

