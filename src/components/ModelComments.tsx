// components/ModelComments.tsx
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader } from './ui/card'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Separator } from './ui/separator'
import { 
  MessageSquare, 
  Send, 
  User, 
  Clock, 
  Heart,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { useWorker } from '../hooks/useWorker'

interface User {
  id: string
  email: string
  name?: string
}

interface Model {
  id: string
  name: string
  description: string
  author: string
  modality: string
  anatomy: string
}

interface Comment {
  id: string
  modelId: string
  userId: string
  userName: string
  userEmail: string
  content: string
  createdAt: string
  likes: number
}

interface ModelCommentsProps {
  isOpen: boolean
  onClose: () => void
  model: Model | null
  user: User
}

export function ModelComments({ isOpen, onClose, model, user }: ModelCommentsProps) {
  const { fetchWithAuth, fetchPublic } = useWorker()
  
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (isOpen && model) {
      loadComments()
    }
  }, [isOpen, model])

  const loadComments = async () => {
    if (!model) return
    
    setLoading(true)
    setError('')
    
    try {
      // Comments are publicly readable
      const data = await fetchPublic(`/comments/model/${model.id}`)
      setComments(data.comments || [])
    } catch (error) {
      console.error('Error loading comments:', error)
      setError('Failed to load comments. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newComment.trim() || !model) return
    
    setSubmitting(true)
    setError('')
    setSuccess('')
    
    try {
      const commentData = {
        modelId: model.id,
        content: newComment.trim(),
      }

      const data = await fetchWithAuth('/comments', {
        method: 'POST',
        body: JSON.stringify(commentData)
      })

      setComments(prev => [data.comment, ...prev])
      setNewComment('')
      setSuccess('Comment added successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (error) {
      console.error('Error submitting comment:', error)
      setError('Failed to submit comment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLikeComment = async (commentId: string) => {
    try {
      const data = await fetchWithAuth(`/comments/${commentId}/like`, {
        method: 'POST'
      })
      setComments(prev => prev.map(comment => 
        comment.id === commentId ? data.comment : comment
      ))
    } catch (error) {
      console.error('Error liking comment:', error)
    }
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
      return `${diffInMinutes}m ago`
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays}d ago`
    }
  }

  if (!model) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-3">
            <MessageSquare className="h-5 w-5" />
            <div>
              <span>Comments for {model.name}</span>
              <Badge variant="secondary" className="ml-2">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            Share your thoughts and experiences with this {model.modality} {model.anatomy.toLowerCase()} model by {model.author}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Add Comment Form */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(user.name || user.email)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{user.name || 'Anonymous User'}</p>
                  <p className="text-xs text-gray-500">Share your thoughts</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={`What do you think about ${model.name}? Share your experience, insights, or questions...`}
                  className="min-h-20 resize-none"
                  disabled={submitting}
                />
                
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                
                {success && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">{success}</AlertDescription>
                  </Alert>
                )}
                
                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-500">
                    {newComment.length}/500 characters
                  </p>
                  <Button 
                    type="submit" 
                    disabled={!newComment.trim() || submitting || newComment.length > 500}
                    size="sm"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3 mr-2" />
                        Post Comment
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Separator />

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {loading ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 animate-pulse text-gray-400" />
                <p className="text-gray-500">Loading comments...</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500">No comments yet</p>
                <p className="text-sm text-gray-400">Be the first to share your thoughts!</p>
              </div>
            ) : (
              comments.map((comment) => (
                <Card key={comment.id} className="transition-all hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="flex space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(comment.userName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{comment.userName}</p>
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <Clock className="h-3 w-3" />
                              <span>{formatDate(comment.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed">{comment.content}</p>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLikeComment(comment.id)}
                            className="h-8 px-2 text-xs"
                          >
                            <Heart className="h-3 w-3 mr-1" />
                            {comment.likes || 0}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}