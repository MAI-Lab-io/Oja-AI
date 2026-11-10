// components/MonaiBratsImporter.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { 
  Brain, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Github, 
  ExternalLink,
  Package,
  Database,
  Stethoscope,
  Activity,
  Info,
  Loader2,
  RefreshCw,
  Check,
  XCircle
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface MonaiBratsImporterProps {
  user: User
}

// ─── Backend model schema (matches /imports/monai/datasets response) ──────
interface BackendModel {
  id: string
  name: string
  description: string
  task: string
  modality: string
  anatomy: string
  framework: string
  version: string
  license: string
  source: string
  url: string
  metrics: Record<string, number>
  input_shape: number[]
  output_classes: Record<string, string>
}

interface UserModel {
  id: string
  name: string
  description?: string
  task_type?: string
  model_format?: string
  is_public?: boolean
}

export function MonaiBratsImporter({ user }: MonaiBratsImporterProps) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  
  const [availableModels, setAvailableModels] = useState<BackendModel[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<BackendModel | null>(null)
  const [customName, setCustomName] = useState('')
  const [makePublic, setMakePublic] = useState(true)
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  
  // ─── State for existing models (duplicate check) ──────────────────────────
  const [userModels, setUserModels] = useState<UserModel[]>([])
  const [loadingUserModels, setLoadingUserModels] = useState(false)
  const [existingModelNames, setExistingModelNames] = useState<Set<string>>(new Set())

  // ─── Fetch available models from backend ────────────────────────────────────

  const fetchModels = async () => {
    setLoading(true)
    try {
      // ✅ UPDATED: use /imports instead of /import
      const response = await fetch(`${apiUrl}/imports/monai/datasets`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setAvailableModels(data)
      if (data.length > 0 && !selectedModelId) {
        setSelectedModelId(data[0].id)
        setSelectedModel(data[0])
        setCustomName(data[0].name)
      }
    } catch (err: any) {
      setError(`Failed to load models: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ─── Fetch user's existing models (for duplicate check) ────────────────────

  const fetchUserModels = async () => {
    setLoadingUserModels(true)
    try {
      const userId = user?.clerk_id || user?.id || 'local_user_1'
      const response = await fetch(`${apiUrl}/models/mine`, {
        headers: { 'user-id': userId }
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setUserModels(data)
      const names = new Set(data.map((m: any) => m.name))
      setExistingModelNames(names)
    } catch (err: any) {
      console.error('Failed to fetch user models:', err)
    } finally {
      setLoadingUserModels(false)
    }
  }

  useEffect(() => {
    Promise.all([fetchModels(), fetchUserModels()])
  }, [])

  // ─── Handle model selection ──────────────────────────────────────────────────

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId)
    const model = availableModels.find(m => m.id === modelId)
    if (model) {
      setSelectedModel(model)
      setCustomName(model.name)
      setError('')
      setSuccess('')
    }
  }

  // ─── Check if a model is already imported ──────────────────────────────────

  const isModelAlreadyImported = (modelName: string): boolean => {
    const lowerName = modelName.toLowerCase()
    return userModels.some(m => m.name.toLowerCase() === lowerName)
  }

  // ─── Import the selected model ──────────────────────────────────────────────

  const handleImport = async () => {
    if (!selectedModel) {
      setError('Please select a model')
      return
    }

    if (!customName.trim()) {
      setError('Model name is required')
      return
    }

    // ─── Check duplicate locally ──────────────────────────────────────────────
    if (isModelAlreadyImported(customName.trim())) {
      setError(`⚠️ A model named "${customName.trim()}" already exists in your account. Please rename or choose a different model.`)
      return
    }

    setImporting(true)
    setError('')
    setSuccess('')

    try {
      const userId = user?.clerk_id || user?.id || 'local_user_1'

      const payload = {
        model_id: selectedModel.id,
        target_name: customName.trim(),
        make_public: makePublic
      }

      // ✅ UPDATED: use /imports instead of /import
      const response = await fetch(`${apiUrl}/imports/monai/model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-id': userId
        },
        body: JSON.stringify(payload)
      })

      // ─── Handle 409 Conflict (duplicate) ──────────────────────────────────
      if (response.status === 409) {
        const errorData = await response.json()
        setError(`⚠️ ${errorData.detail}`)
        // Refresh user models to update the list
        fetchUserModels()
        return
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const result = await response.json()
      setSuccess(`✅ Successfully imported "${customName}"! (ID: ${result.model_id})`)
      
      // Refresh user models to update the list
      fetchUserModels()
      
      // Reset selection after a moment
      setTimeout(() => {
        setSelectedModelId('')
        setSelectedModel(null)
        setCustomName('')
        setSuccess('')
      }, 3000)

    } catch (err: any) {
      setError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // ─── Helper to format bytes ─────────────────────────────────────────────────

  const getMetricsSummary = (metrics: Record<string, number>) => {
    if (!metrics) return ''
    const entries = Object.entries(metrics)
    return entries.map(([k, v]) => `${k}: ${v}`).join(' • ')
  }

  const getModelTypeBadge = (source: string) => {
    if (source.toLowerCase().includes('monai')) {
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">MONAI</Badge>
    }
    if (source.toLowerCase().includes('brats')) {
      return <Badge className="bg-purple-100 text-purple-700 border-purple-200">BRATs</Badge>
    }
    return <Badge variant="outline">{source}</Badge>
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Package className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">MONAI & BRATs Model Importer</h2>
            <p className="text-gray-600">Import pre‑trained medical imaging models from the OJA AI catalog</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchModels(); fetchUserModels(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This imports a curated model from the Oja Models. The model file will be downloaded and added to your personal model collection.
          <br />
          <strong>Note:</strong> If a model with the same name already exists in your account, you'll be prompted to rename it.
        </AlertDescription>
      </Alert>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column – Model selection */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select a Model</CardTitle>
              <CardDescription>
                {loading ? 'Loading available models...' : `${availableModels.length} model(s) available for import`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : availableModels.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>No models available for import at the moment.</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div>
                    <Label htmlFor="model-select">Model</Label>
                    <Select value={selectedModelId} onValueChange={handleModelSelect}>
                      <SelectTrigger id="model-select">
                        <SelectValue placeholder="Choose a model..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((model) => {
                          const isImported = isModelAlreadyImported(model.name)
                          return (
                            <SelectItem key={model.id} value={model.id}>
                              <div className="flex items-center space-x-2">
                                {getModelTypeBadge(model.source)}
                                <span>{model.name}</span>
                                <span className="text-xs text-gray-400">v{model.version}</span>
                                {isImported && (
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                    <Check className="h-3 w-3 mr-1" />
                                    Imported
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {selectedModel && isModelAlreadyImported(selectedModel.name) && (
                      <p className="text-sm text-amber-600 mt-2 flex items-center">
                        <Info className="h-4 w-4 mr-1" />
                        This model already exists in your account. You can still import it with a different name.
                      </p>
                    )}
                  </div>

                  {selectedModel && (
                    <>
                      <Separator />

                      {/* Model Details */}
                      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getModelTypeBadge(selectedModel.source)}
                              <Badge variant="outline">{selectedModel.framework}</Badge>
                              <Badge variant="outline">{selectedModel.task}</Badge>
                            </div>
                            <h4 className="font-semibold">{selectedModel.name}</h4>
                            <p className="text-sm text-gray-600">{selectedModel.description}</p>
                          </div>
                          {selectedModel.metrics && (
                            <div className="text-right text-sm">
                              <span className="text-gray-600">Metrics</span>
                              <div className="font-medium">{getMetricsSummary(selectedModel.metrics)}</div>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-gray-600">Modality</span>
                            <p className="font-medium">{selectedModel.modality}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Anatomy</span>
                            <p className="font-medium">{selectedModel.anatomy}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">License</span>
                            <p className="font-medium">{selectedModel.license}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Version</span>
                            <p className="font-medium">{selectedModel.version}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Input Shape</span>
                            <p className="font-medium">{selectedModel.input_shape?.join('×') || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Source</span>
                            <p className="font-medium">{selectedModel.source}</p>
                          </div>
                        </div>

                        {selectedModel.url && (
                          <div>
                            <Button variant="outline" size="sm" asChild>
                              <a href={selectedModel.url} target="_blank" rel="noopener noreferrer">
                                <Github className="h-4 w-4 mr-1" />
                                Download URL
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Customization */}
                      <div className="space-y-4">
                        <h4 className="font-medium">Import Options</h4>

                        <div>
                          <Label htmlFor="custom-name">Custom Name (optional)</Label>
                          <Input
                            id="custom-name"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            placeholder="Rename the model (defaults to original name)"
                            className={isModelAlreadyImported(customName) ? 'border-amber-500' : ''}
                          />
                          {isModelAlreadyImported(customName) && (
                            <p className="text-xs text-amber-600 mt-1">
                              ⚠️ This name is already taken. Please choose a different name.
                            </p>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="make-public"
                            checked={makePublic}
                            onChange={(e) => setMakePublic(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor="make-public" className="text-sm">
                            Make this model public in the Oja Models
                          </Label>
                        </div>
                      </div>

                      <Button
                        onClick={handleImport}
                        disabled={
                          importing ||
                          !selectedModel ||
                          !customName.trim() ||
                          isModelAlreadyImported(customName.trim())
                        }
                        className="w-full"
                      >
                        {importing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Import to My Models
                          </>
                        )}
                      </Button>
                      {isModelAlreadyImported(customName.trim()) && (
                        <p className="text-xs text-amber-600 text-center">Please choose a unique name to import.</p>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column – Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>About This Importer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                The Oja Models includes carefully selected pre‑trained models from public repositories.
                Each model comes with its own configuration and is ready for evaluation on your datasets.
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                <li>Verified model files</li>
                <li>Pre‑configured metadata</li>
                <li>Automatic feature configuration</li>
                <li>Ready for OJA evaluation</li>
              </ul>
              <p className="text-xs text-gray-400 mt-2">
                Models are imported into your personal collection. You can then evaluate them or contribute them to the community.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold">{availableModels.length}</p>
                  <p className="text-xs text-gray-500">Available Models</p>
                </div>
                <div className="bg-gray-50 rounded p-3 text-center">
                  <p className="text-2xl font-bold">{userModels.length}</p>
                  <p className="text-xs text-gray-500">Your Models</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}