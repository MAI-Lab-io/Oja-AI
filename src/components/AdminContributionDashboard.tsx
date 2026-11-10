// components/AdminContributionDashboard.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Alert, AlertDescription } from './ui/alert'
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  Database,
  Mail,
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Users,
  Calendar,
  HardDrive,
  Sparkles,
  Award,
  Shield,
  Brain,
  TrendingUp,
  BarChart3,
  User,
  Github,
  ExternalLink
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Textarea } from './ui/textarea'

interface AdminContributionDashboardProps {
  user?: any
}

export function AdminContributionDashboard({ user }: AdminContributionDashboardProps) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  
  const [pending, setPending] = useState<any[]>([])
  const [approved, setApproved] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [viewingDetails, setViewingDetails] = useState<any | null>(null)

  // ─── API Helpers ─────────────────────────────────────────────────────────────

  const getUserId = (): string => {
    return user?.clerk_id || user?.id || 'local_user_1'
  }

  const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${apiUrl}${endpoint}`
    const userId = getUserId()
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'user-id': userId,
        ...options.headers,
      },
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    return response.json()
  }

  const fetchPublic = async (endpoint: string) => {
    const url = `${apiUrl}${endpoint}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }
    return response.json()
  }

  // ─── Fetch data ─────────────────────────────────────────────────────────────

  const fetchPending = async () => {
    try {
      const data = await fetchWithAuth('/models/contributions/pending')
      setPending(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err.message || 'Failed to load pending contributions')
      setPending([])
    }
  }

  const fetchApproved = async () => {
    try {
      const data = await fetchPublic('/models/?public_only=true')
      const all = Array.isArray(data) ? data : []
      const approvedModels = all.filter((m: any) => m.is_community_contribution && m.contribution_status === 'approved')
      setApproved(approvedModels)
    } catch (err: any) {
      console.error('Failed to load approved:', err)
      setApproved([])
    }
  }

  const loadAllData = async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([fetchPending(), fetchApproved()])
    } catch (err) {
      setError('Failed to load data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const handleApprove = async (modelId: string) => {
    try {
      await fetchWithAuth(`/models/contributions/${modelId}/approve`, {
        method: 'PUT',
      })
      setSuccess('Model approved successfully!')
      loadAllData()
    } catch (err: any) {
      setError(err.message || 'Approval failed')
    }
  }

  const handleReject = async () => {
    if (!selectedModelId || !rejectReason.trim()) return
    try {
      await fetchWithAuth(`/models/contributions/${selectedModelId}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ rejection_reason: rejectReason.trim() }),
      })
      setSuccess('Model rejected successfully.')
      setShowRejectDialog(false)
      setRejectReason('')
      setSelectedModelId(null)
      loadAllData()
    } catch (err: any) {
      setError(err.message || 'Rejection failed')
    }
  }

  // ─── Format helpers ─────────────────────────────────────────────────────────

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffHours < 48) return 'Yesterday'
    return `${Math.floor(diffHours / 24)} days ago`
  }

  const filterItems = (items: any[]) => {
    if (!searchQuery) return items
    const q = searchQuery.toLowerCase()
    return items.filter(item =>
      item.name?.toLowerCase().includes(q) ||
      item.contribution_author_name?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.task_type?.toLowerCase().includes(q)
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-4 w-64 bg-gray-200 rounded mt-2"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse"></div>
      </div>
    )
  }

  const filteredPending = filterItems(pending)
  const filteredApproved = filterItems(approved)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-600" />
            Contribution Dashboard
          </h2>
          <p className="text-gray-600">Review and manage community model contributions</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAllData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold">{pending.length}</p>
            </div>
            <Clock className="h-8 w-8 text-amber-500" />
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold">{approved.length}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Rejected</p>
              <p className="text-2xl font-bold">0</p>
            </div>
            <XCircle className="h-8 w-8 text-red-500" />
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by model name, contributor, or task..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Pending
            {pending.length > 0 && <Badge variant="secondary" className="ml-1">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            Approved
            {approved.length > 0 && <Badge variant="secondary" className="ml-1">{approved.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Pending */}
        <TabsContent value="pending">
          {filteredPending.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                <p className="text-gray-500">No pending contributions to review.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredPending.map((model) => (
                <div key={model.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{model.name}</h3>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{model.description}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {model.contribution_author_name || 'Unknown'}
                        </span>
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          Submitted: {getTimeAgo(model.contribution_submitted_at)}
                        </span>
                        {model.contribution_demo_type && (
                          <Badge variant="outline">{model.contribution_demo_type}</Badge>
                        )}
                        {model.contribution_demo_url && (
                          <a href={model.contribution_demo_url} target="_blank" rel="noopener noreferrer" className="flex items-center text-blue-600 hover:underline">
                            Demo <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        )}
                      </div>
                      {model.contribution_metrics && (
                        <div className="mt-2 flex gap-3 text-xs">
                          {Object.entries(model.contribution_metrics).map(([key, val]) => (
                            <span key={key} className="bg-gray-100 px-2 py-0.5 rounded">
                              {key}: {val}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApprove(model.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedModelId(model.id)
                          setShowRejectDialog(true)
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Approved */}
        <TabsContent value="approved">
          {filteredApproved.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No approved contributions yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredApproved.map((model) => (
                <div key={model.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{model.name}</h3>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{model.description}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span className="flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {model.contribution_author_name || 'Unknown'}
                        </span>
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatDate(model.contribution_submitted_at)}
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setViewingDetails(model)}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Contribution</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this model. This will be sent to the contributor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Why is this model being rejected? (e.g., missing documentation, low quality, duplicate, etc.)"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim()}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!viewingDetails} onOpenChange={() => setViewingDetails(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewingDetails?.name}</DialogTitle>
            <DialogDescription>
              {viewingDetails?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><strong>Author:</strong> {viewingDetails?.contribution_author_name || 'Unknown'}</div>
              <div><strong>Task:</strong> {viewingDetails?.task_type || 'N/A'}</div>
              <div><strong>Modality:</strong> {viewingDetails?.modality || 'N/A'}</div>
              <div><strong>License:</strong> {viewingDetails?.license || 'N/A'}</div>
              <div><strong>Framework:</strong> {viewingDetails?.model_format || 'N/A'}</div>
              <div><strong>Submitted:</strong> {viewingDetails?.contribution_submitted_at ? formatDate(viewingDetails.contribution_submitted_at) : 'N/A'}</div>
            </div>
            {viewingDetails?.contribution_readme && (
              <div>
                <h4 className="font-medium mb-1">README</h4>
                <div className="bg-gray-50 p-3 rounded text-sm max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {viewingDetails.contribution_readme}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingDetails(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}