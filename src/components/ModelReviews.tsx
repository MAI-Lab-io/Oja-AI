// components/ModelReviews.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Separator } from './ui/separator'
import { Alert, AlertDescription } from './ui/alert'
import { Star, MessageSquare, ThumbsUp, Calendar, Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useWorker } from '../hooks/useWorker'

interface User {
  id: string
  email: string
  name?: string
}

interface Review {
  id: string
  userId: string
  userName: string
  userEmail: string
  modelName: string
  modelType: string
  rating: number
  title: string
  content: string
  createdAt: string
  likes: number
  category: string
}

interface ModelReviewsProps {
  user: User
  modelName: string
  modelType?: string
  onReviewAdded?: () => void
}

export function ModelReviews({ user, modelName, modelType, onReviewAdded }: ModelReviewsProps) {
  const { fetchWithAuth, fetchPublic } = useWorker()
  
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [newReview, setNewReview] = useState({
    rating: 5,
    title: '',
    content: '',
    category: 'general'
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (modelName) {
      loadModelReviews()
    }
  }, [modelName])

  const loadModelReviews = async () => {
    try {
      // Reviews are publicly readable
      const data = await fetchPublic(`/reviews/model/${encodeURIComponent(modelName)}`)
      setReviews(data.reviews || [])
    } catch (error) {
      console.error('Error loading model reviews:', error)
    } finally {
      setLoading(false)
    }
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReview.title.trim() || !newReview.content.trim()) {
      setError('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const reviewData = {
        modelName: modelName,
        modelType: modelType || 'Unknown',
        rating: newReview.rating,
        title: newReview.title.trim(),
        content: newReview.content.trim(),
        category: newReview.category
      }

      await fetchWithAuth('/reviews', {
        method: 'POST',
        body: JSON.stringify(reviewData)
      })

      setSuccess('Review submitted successfully!')
      setNewReview({
        rating: 5,
        title: '',
        content: '',
        category: 'general'
      })
      setShowReviewForm(false)
      loadModelReviews()
      onReviewAdded?.()
    } catch (error) {
      console.error('Error submitting review:', error)
      setError('Failed to submit review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const likeReview = async (reviewId: string) => {
    try {
      await fetchWithAuth(`/reviews/${reviewId}/like`, { method: 'POST' })
      loadModelReviews()
    } catch (error) {
      console.error('Error liking review:', error)
    }
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ))
  }

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0'

  const ratingDistribution = Array.from({ length: 5 }, (_, i) => {
    const star = 5 - i
    const count = reviews.filter(r => r.rating === star).length
    const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0
    return { star, count, percentage }
  })

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <MessageSquare className="h-8 w-8 animate-pulse text-indigo-600 mr-2" />
            <span className="text-gray-600">Loading reviews...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Review Summary */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">Reviews for {modelName}</CardTitle>
              <CardDescription>
                {reviews.length} review{reviews.length !== 1 ? 's' : ''} from the community
              </CardDescription>
            </div>
            <Button 
              onClick={() => setShowReviewForm(true)}
              size="sm"
              disabled={showReviewForm}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Review
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reviews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Average Rating */}
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-2">{averageRating}</div>
                <div className="flex justify-center mb-2">
                  {renderStars(Math.round(parseFloat(averageRating)))}
                </div>
                <p className="text-sm text-gray-600">Average Rating</p>
              </div>

              {/* Rating Distribution */}
              <div className="space-y-2">
                {ratingDistribution.map(({ star, count, percentage }) => (
                  <div key={star} className="flex items-center space-x-2 text-sm">
                    <span className="w-8">{star}★</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-400 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="w-8 text-gray-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600 mb-4">No reviews yet for this model</p>
              <Button onClick={() => setShowReviewForm(true)} size="sm">
                Be the first to review
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Form */}
      {showReviewForm && (
        <Card>
          <CardHeader>
            <CardTitle>Write a Review</CardTitle>
            <CardDescription>Share your experience with {modelName}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitReview} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rating">Rating</Label>
                  <Select value={newReview.rating.toString()} onValueChange={(value) => setNewReview(prev => ({ ...prev, rating: parseInt(value) }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 Stars - Excellent</SelectItem>
                      <SelectItem value="4">4 Stars - Very Good</SelectItem>
                      <SelectItem value="3">3 Stars - Good</SelectItem>
                      <SelectItem value="2">2 Stars - Fair</SelectItem>
                      <SelectItem value="1">1 Star - Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={newReview.category} onValueChange={(value) => setNewReview(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General Review</SelectItem>
                      <SelectItem value="performance">Performance Analysis</SelectItem>
                      <SelectItem value="comparison">Model Comparison</SelectItem>
                      <SelectItem value="implementation">Implementation Tips</SelectItem>
                      <SelectItem value="recommendation">Recommendation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="title">Review Title *</Label>
                <Input
                  id="title"
                  value={newReview.title}
                  onChange={(e) => setNewReview(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Summarize your experience"
                  required
                />
              </div>

              <div>
                <Label htmlFor="content">Review Content *</Label>
                <Textarea
                  id="content"
                  value={newReview.content}
                  onChange={(e) => setNewReview(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Share your detailed experience with this model..."
                  className="min-h-24"
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-800">{success}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowReviewForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Reviews List */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((review) => (
              <Card key={review.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Avatar>
                        <AvatarFallback>
                          {review.userName?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-gray-900">{review.userName}</p>
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary" className="text-xs">
                        {review.category}
                      </Badge>
                      <div className="flex items-center space-x-1">
                        {renderStars(review.rating)}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <h4 className="font-medium text-gray-900 mb-1">{review.title}</h4>
                    <p className="text-gray-700 text-sm leading-relaxed">{review.content}</p>
                  </div>

                  <Separator className="my-3" />

                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => likeReview(review.id)}
                      className="text-gray-600 hover:text-indigo-600"
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      {review.likes || 0}
                    </Button>
                    <span className="text-xs text-gray-500">
                      Review #{review.id.slice(-8)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  )
}