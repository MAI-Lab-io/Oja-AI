// components/ContributeModel.tsx
import React, { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Progress } from './ui/progress'
import { Separator } from './ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Github, 
  Mail, 
  ArrowRight,
  ArrowLeft,
  Info,
  Loader2,
  Brain,
  Database,
  FileText,
  Sparkles,
  PlusCircle
} from 'lucide-react'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface ContributeModelProps {
  user: User
  onSuccess: () => void
  onCancel?: () => void
  onNavigate?: (tab: string) => void // 👈 NEW: for navigation
}

interface UserModel {
  id: string
  name: string
  description: string
  task_type: string
  modality: string
  anatomy: string
  model_format: string
  created_at: string
  is_public: boolean
}

export function ContributeModel({ user, onSuccess, onCancel, onNavigate }: ContributeModelProps) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  // ─── State ───────────────────────────────────────────────────────────────────

  const [userModels, setUserModels] = useState<UserModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<UserModel | null>(null)

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    author_name: user?.name || '',
    author_email: user?.email || '',
    author_github: '',
    readme: '',
    demo_type: 'static' as 'static' | 'interactive' | 'video',
    demo_url: '',
    metrics: '' // JSON string
  })

  // ─── Fetch user's models ────────────────────────────────────────────────────

  const fetchUserModels = async () => {
    setLoadingModels(true)
    try {
      const userId = user?.clerk_id || user?.id || 'local_user_1'
      const response = await fetch(`${apiUrl}/models/mine`, {
        headers: { 'user-id': userId }
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      // Filter out imported models (is_imported = true) because they cannot be contributed
      const filtered = data.filter((m: any) => !m.is_imported)
      setUserModels(filtered)
      if (filtered.length > 0 && !selectedModelId) {
        setSelectedModelId(filtered[0].id)
        setSelectedModel(filtered[0])
      }
    } catch (err: any) {
      setError('Failed to load your models: ' + err.message)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    fetchUserModels()
  }, [])

  // ─── Handle model selection ──────────────────────────────────────────────

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId)
    const model = userModels.find(m => m.id === modelId)
    setSelectedModel(model || null)
    setError('')
  }

  // ─── Handle form changes ──────────────────────────────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleDemoTypeChange = (value: 'static' | 'interactive' | 'video') => {
    setFormData(prev => ({ ...prev, demo_type: value }))
  }

  // ─── Submit contribution ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!selectedModelId) {
      setError('Please select a model to contribute')
      return
    }
    if (!formData.author_name.trim()) {
      setError('Author name is required')
      return
    }
    if (!formData.readme.trim()) {
      setError('Please provide a README description')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    setUploadProgress(10)

    try {
      const userId = user?.clerk_id || user?.id || 'local_user_1'

      let metrics = undefined
      if (formData.metrics.trim()) {
        try {
          metrics = JSON.parse(formData.metrics)
        } catch {
          throw new Error('Invalid JSON in Metrics field')
        }
      }

      const payload = {
        model_id: selectedModelId,
        author_name: formData.author_name.trim(),
        author_email: formData.author_email.trim() || undefined,
        author_github: formData.author_github.trim() || undefined,
        readme: formData.readme.trim(),
        demo_type: formData.demo_type,
        demo_url: formData.demo_url.trim() || undefined,
        metrics: metrics
      }

      setUploadProgress(30)

      const response = await fetch(`${apiUrl}/models/contribute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-id': userId
        },
        body: JSON.stringify(payload)
      })

      setUploadProgress(80)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const result = await response.json()
      setUploadProgress(100)
      setSuccess(`✅ "${selectedModel?.name}" submitted for community review!`)

      // Reset after 3 seconds
      setTimeout(() => {
        onSuccess()
      }, 2500)

    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return !!selectedModelId
      case 2:
        return !!formData.readme.trim()
      case 3:
        return !!formData.author_name.trim()
      default:
        return true
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2 text-2xl">
                <Sparkles className="h-6 w-6 text-indigo-600" />
                <span>Contribute a Model</span>
              </CardTitle>
              <CardDescription className="mt-1">
                Share one of your models with the ỌJÀ AI community. All submissions are reviewed before publication.
              </CardDescription>
            </div>
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                × Cancel
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex justify-between">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step >= s ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {step > s ? <CheckCircle className="h-5 w-5" /> : s}
                  </div>
                  <span className="text-xs mt-1 text-gray-500">
                    {s === 1 && 'Select'}
                    {s === 2 && 'Docs'}
                    {s === 3 && 'Author'}
                    {s === 4 && 'Submit'}
                  </span>
                </div>
              ))}
            </div>
            <Progress value={(step / 4) * 100} className="mt-4" />
          </div>

          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Select Model */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select a Model to Contribute *</label>
                {loadingModels ? (
                  <div className="flex items-center space-x-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading your models...</span>
                  </div>
                ) : userModels.length === 0 ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center space-y-3">
                    <Database className="h-10 w-10 text-blue-500 mx-auto" />
                    <p className="text-sm text-blue-700">
                      You don't have any uploadable models yet.
                    </p>
                    <p className="text-xs text-blue-600">
                      Upload a model first, then come back to contribute it to the community.
                    </p>
                    <Button 
                      size="sm" 
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('upload-model')
                        } else {
                          window.location.href = '/upload-model'
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Upload Model
                    </Button>
                  </div>
                ) : (
                  <Select value={selectedModelId} onValueChange={handleModelSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {userModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4" />
                            <span>{model.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {model.task_type || 'other'}
                            </Badge>
                            <span className="text-xs text-gray-400">
                              {model.model_format || 'unknown'}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedModel && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm">
                    <p className="font-medium">{selectedModel.name}</p>
                    <p className="text-gray-600">{selectedModel.description || 'No description'}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>Task: {selectedModel.task_type || 'N/A'}</span>
                      <span>Modality: {selectedModel.modality || 'N/A'}</span>
                      <span>Format: {selectedModel.model_format || 'N/A'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Documentation */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">README / Documentation *</label>
                <Textarea
                  name="readme"
                  value={formData.readme}
                  onChange={handleChange}
                  rows={8}
                  placeholder={`# Model Documentation

## Usage Example
\`\`\`python
import torch
model = torch.load('model.pt')
...
\`\`\`

## Requirements
- Python 3.8+
- PyTorch 1.9+

## Training Details
...`}
                  required
                  className="bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">Markdown supported. Include usage examples and requirements.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Demo Type</label>
                <Select
                  value={formData.demo_type}
                  onValueChange={handleDemoTypeChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="static">Static (Screenshots / Docs)</SelectItem>
                    <SelectItem value="interactive">Interactive (Web Demo / App)</SelectItem>
                    <SelectItem value="video">Video / Presentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Demo URL (optional)</label>
                <Input
                  name="demo_url"
                  value={formData.demo_url}
                  onChange={handleChange}
                  placeholder="https://your-demo-url.com"
                  className="bg-white"
                />
              </div>
            </div>
          )}

          {/* Step 3: Author & License */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Author Name *</label>
                <Input
                  name="author_name"
                  value={formData.author_name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  required
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Author Email (optional)</label>
                <Input
                  name="author_email"
                  type="email"
                  value={formData.author_email}
                  onChange={handleChange}
                  placeholder="your.email@example.com"
                  className="bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">GitHub Profile (optional)</label>
                <Input
                  name="author_github"
                  value={formData.author_github}
                  onChange={handleChange}
                  placeholder="https://github.com/yourusername"
                  className="bg-white"
                />
              </div>

              <Separator />

              <div>
                <label className="block text-sm font-medium mb-1">Additional Metrics (optional, JSON)</label>
                <Textarea
                  name="metrics"
                  value={formData.metrics}
                  onChange={handleChange}
                  placeholder='{"accuracy": 0.95, "f1_score": 0.92, "dice": 0.88}'
                  rows={3}
                  className="bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">Provide additional performance metrics in JSON format.</p>
              </div>
            </div>
          )}

          {/* Step 4: Review & Submit */}
          {step === 4 && (
            <div className="space-y-4">
              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Your model will be reviewed by the OJA AI team before appearing in the Oja Models.
                  You'll be notified via email once approved.
                </AlertDescription>
              </Alert>

              <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-2">
                <h4 className="font-medium">Submission Summary</h4>
                <div className="text-sm space-y-1 text-gray-600">
                  <p><strong>Model:</strong> {selectedModel?.name}</p>
                  <p><strong>Task:</strong> {selectedModel?.task_type || 'N/A'}</p>
                  <p><strong>Modality:</strong> {selectedModel?.modality || 'N/A'}</p>
                  <p><strong>Format:</strong> {selectedModel?.model_format || 'N/A'}</p>
                  <p><strong>Author:</strong> {formData.author_name}</p>
                  <p><strong>Demo Type:</strong> {formData.demo_type}</p>
                  {formData.demo_url && <p><strong>Demo URL:</strong> {formData.demo_url}</p>}
                </div>
              </div>

              {submitting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Submitting...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-4 border-t">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <div className="flex-1" />
            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Submit for Review
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}