import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Separator } from './ui/separator'
import { Alert, AlertDescription } from './ui/alert'
import { Star, MessageSquare, ThumbsUp, Filter, Search, Calendar, User } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
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

interface CommunityProps {
  user: User
}

export function Community({ user }: CommunityProps) {
  const { fetchWithAuth, fetchPublic } = useWorker()
  
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [newReview, setNewReview] = useState({
    modelName: '',
    modelType: '',
    rating: 5,
    title: '',
    content: '',
    category: 'general'
  })
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterRating, setFilterRating] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadReviews()
  }, [])

  const loadReviews = async () => {
    try {
      // Using fetchPublic because reviews are publicly readable
      const data = await fetchPublic('/reviews')
      setReviews(data.reviews || [])
    } catch (error) {
      console.error('Error loading reviews:', error)
    } finally {
      setLoading(false)
    }
  }

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReview.modelName.trim() || !newReview.title.trim() || !newReview.content.trim()) {
      setError('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const review = {
        id: `review_${Date.now()}_${user.id}`,
        userId: user.id,
        userName: user.name || user.email.split('@')[0],
        userEmail: user.email,
        modelName: newReview.modelName.trim(),
        modelType: newReview.modelType || 'Unknown',
        rating: newReview.rating,
        title: newReview.title.trim(),
        content: newReview.content.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        category: newReview.category
      }

      await fetchWithAuth('/reviews', {
        method: 'POST',
        body: JSON.stringify(review)
      })

      setSuccess('Review submitted successfully!')
      setNewReview({
        modelName: '',
        modelType: '',
        rating: 5,
        title: '',
        content: '',
        category: 'general'
      })
      setShowReviewForm(false)
      loadReviews()
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
      loadReviews()
    } catch (error) {
      console.error('Error liking review:', error)
    }
  }

  const filteredAndSortedReviews = reviews
    .filter(review => {
      const matchesSearch = review.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           review.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           review.modelName?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = filterCategory === 'all' || review.category === filterCategory
      const matchesRating = filterRating === 'all' || review.rating.toString() === filterRating
      return matchesSearch && matchesCategory && matchesRating
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'rating-high':
          return b.rating - a.rating
        case 'rating-low':
          return a.rating - b.rating
        case 'most-liked':
          return (b.likes || 0) - (a.likes || 0)
        default: // newest
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 animate-pulse text-indigo-600" />
          <p className="text-gray-600">Loading community reviews...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">Community Reviews</h2>
          <p className="text-gray-600 mt-1">Share and discover insights about ML models</p>
        </div>
        <Button onClick={() => setShowReviewForm(!showReviewForm)}>
          <MessageSquare className="h-4 w-4 mr-2" />
          Write Review
        </Button>
      </div>

      {/* Review Form */}
      {showReviewForm && (
        <Card>
          <CardHeader>
            <CardTitle>Share Your Model Experience</CardTitle>
            <CardDescription>Help the community by sharing your insights about a model</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitReview} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modelName">Model Name *</Label>
                  <Input
                    id="modelName"
                    value={newReview.modelName}
                    onChange={(e) => setNewReview(prev => ({ ...prev, modelName: e.target.value }))}
                    placeholder="e.g., ResNet50, BERT-base"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="modelType">Model Type</Label>
                  <Input
                    id="modelType"
                    value={newReview.modelType}
                    onChange={(e) => setNewReview(prev => ({ ...prev, modelType: e.target.value }))}
                    placeholder="e.g., Image Classification, NLP"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  placeholder="Share your detailed experience, performance observations, tips, or recommendations..."
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

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search reviews..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="performance">Performance</SelectItem>
                <SelectItem value="comparison">Comparison</SelectItem>
                <SelectItem value="implementation">Implementation</SelectItem>
                <SelectItem value="recommendation">Recommendation</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRating} onValueChange={setFilterRating}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                <SelectItem value="5">5 Stars</SelectItem>
                <SelectItem value="4">4 Stars</SelectItem>
                <SelectItem value="3">3 Stars</SelectItem>
                <SelectItem value="2">2 Stars</SelectItem>
                <SelectItem value="1">1 Star</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="rating-high">Highest Rated</SelectItem>
                <SelectItem value="rating-low">Lowest Rated</SelectItem>
                <SelectItem value="most-liked">Most Liked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredAndSortedReviews.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Reviews Found</h3>
              <p className="text-gray-600 mb-4">
                {reviews.length === 0 
                  ? "Be the first to share a model review with the community!"
                  : "Try adjusting your search or filter criteria."
                }
              </p>
              {reviews.length === 0 && (
                <Button onClick={() => setShowReviewForm(true)}>
                  Write First Review
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedReviews.map((review) => (
            <Card key={review.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
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

                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-1">{review.title}</h3>
                  <p className="text-sm text-indigo-600 mb-2">
                    Model: {review.modelName} {review.modelType && `(${review.modelType})`}
                  </p>
                  <p className="text-gray-700 leading-relaxed">{review.content}</p>
                </div>

                <Separator className="my-4" />

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
          ))
        )}
      </div>

      {/* Stats */}
      {reviews.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-indigo-600">{reviews.length}</p>
                <p className="text-sm text-gray-600">Total Reviews</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-indigo-600">
                  {(reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)}
                </p>
                <p className="text-sm text-gray-600">Avg Rating</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-indigo-600">
                  {new Set(reviews.map(r => r.modelName)).size}
                </p>
                <p className="text-sm text-gray-600">Models Reviewed</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-indigo-600">
                  {new Set(reviews.map(r => r.userId)).size}
                </p>
                <p className="text-sm text-gray-600">Contributors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}