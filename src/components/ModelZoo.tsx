// components/ModelZoo.tsx
import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner' // 👈 NEW
import { Button } from './ui/button'
import { CatalogColumns, MODEL_COLUMNS, useCatalogColumns } from './CatalogColumns'
import { compareCatalogItems } from '../lib/catalogSort'
import { formatArtifactSize } from '../lib/catalogFormat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Progress } from './ui/progress'
import { Separator } from './ui/separator'
import { Alert, AlertDescription } from './ui/alert'
import { Checkbox } from './ui/checkbox'
import { 
  Download,
  Search, 
  Star, 
  Eye, 
  Filter, 
  Brain, 
  Activity, 
  Stethoscope, 
  Camera,
  TrendingUp,
  User,
  CheckCircle,
  AlertCircle,
  Info,
  Store,
  Play,
  GitCompare,
  Database,
  Plus,
  Check,
  Clock,
  Heart,
  Zap,
  MessageSquare,
  Upload,
  Package,
  Github,
  ExternalLink,
  Users,
  Shield,
  Clock as ClockIcon,
  XCircle,
  Box,
  Code2,
  Cpu,
  Sparkles,
  ArrowRight,
  Columns,
  BookOpen,
  Loader2
} from 'lucide-react'
import { ModelComparison } from './ModelComparison'
import { ModelComments } from './ModelComments'
import { MonaiBratsImporter } from './MonaiBratsImporter'
import { ContributeModel } from './ContributeModel'
import { ContributionGuidelines } from './ContributionGuidelines'
import { ModelDocumentation } from './ModelDocumentation'
import { EvaluationProgress } from './EvaluationProgress'
import { RepositoryWorkspace } from './RepositoryWorkspace'
import { CatalogViewSwitch, type CatalogView } from './CatalogViewSwitch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

export interface Model {
  id: string
  releaseId?: string
  repositorySlug?: string
  fileCount?: number
  totalSize?: number
  name: string
  description: string
  category: string
  modality: string
  task: string
  anatomy: string
  author: string
  version: string
  accuracy: number
  downloads: number
  stars: number
  rating: number
  framework: string
  createdAt: string
  updatedAt: string
  isVerified: boolean
  license: string
  isUserModel?: boolean
  isPretrained?: boolean
  isCommunityModel?: boolean
  contributionStatus?: 'pending' | 'approved' | 'rejected'
  userId?: string
  rejectionReason?: string
  modelType?: string
  evaluationType?: string
  is_community_contribution?: boolean
  // ─── Documentation fields ──────────────────────────────────────────────────
  documentation?: string
  input_shape?: any
  output_classes?: any
  supported_modalities?: string[]
  recommended_dataset_types?: string[]
  usage_example?: string
}

interface UserModel {
  id: string
  name: string
  description: string
  framework: string
  task: string
  modelType: string
  uploadedAt: string
  userId: string
  githubRepo?: string
  collaborationNotes?: string
  feature_config?: any
}

interface Dataset {
  id: string
  name: string
  type: string
  size: string
}

interface Evaluation {
  id: string
  modelId: string
  modelName: string
  datasetName: string
  metrics: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
    evaluationTime: number
  }
  completedAt: string
  status: string
}

interface ModelZooProps {
  user: User | null
  catalog?: {
    models: Model[]
    loading: boolean
    error: string
    onReview: (id: string) => void
    onRefresh?: () => void
    onSortChange?: (value: string) => void
  }
  onEvaluationStarted?: () => void
  onNavigate?: (tab: string) => void
  addNotification?: (title: string, message: string, type?: 'success' | 'error' | 'info' | 'warning', link?: string) => void
}

// ─── Model Type Badge Helper ─────────────────────────────────────────────────

function getModelTypeBadge(modelType?: string): { label: string; color: string; icon: React.ReactNode } {
  const types: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    sklearn: { 
      label: 'scikit-learn', 
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <Box className="h-3 w-3" />
    },
    tensorflow: { 
      label: 'TensorFlow', 
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      icon: <Code2 className="h-3 w-3" />
    },
    pytorch: { 
      label: 'PyTorch', 
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <Cpu className="h-3 w-3" />
    },
    onnx: { 
      label: 'ONNX', 
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      icon: <Cpu className="h-3 w-3" />
    },
    unknown: { 
      label: 'Unknown', 
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <AlertCircle className="h-3 w-3" />
    },
  }
  return types[modelType || 'unknown'] || types.unknown
}

export function ModelZoo({ user, catalog, onEvaluationStarted, onNavigate, addNotification }: ModelZooProps) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortBy, setSortBy] = useState(catalog ? 'newest' : 'popular')
  const [catalogView, setCatalogView] = useState<CatalogView>('cards')
  const columns = useCatalogColumns('model', MODEL_COLUMNS)
  const [models, setModels] = useState<Model[]>([])
  const [userModels, setUserModels] = useState<UserModel[]>([])
  const [pretrainedModels, setPretrainedModels] = useState<any[]>([])
  const [communityModels, setCommunityModels] = useState<Model[]>([])
  const [allModels, setAllModels] = useState<Model[]>([])
  const [comparisonModels, setComparisonModels] = useState<Model[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [evaluatingModels, setEvaluatingModels] = useState<Set<string>>(new Set())
  // ─── Inline dataset selector ──────────────────────────────────────────────
  const [datasetSelectorModelId, setDatasetSelectorModelId] = useState<string | null>(null)
  // ─── Loading state for dataset selection ──────────────────────────────────
  const [selectingDatasetForModel, setSelectingDatasetForModel] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('browse')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [showModelTypes, setShowModelTypes] = useState({
    marketplace: true,
    pretrained: true,
    community: true
  })
  const [showComparison, setShowComparison] = useState(false)
  
  const [showComments, setShowComments] = useState(false)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  // ─── Documentation Modal State ──────────────────────────────────────────────
  const [showDocumentation, setShowDocumentation] = useState(false)
  const [documentedModel, setDocumentedModel] = useState<Model | null>(null)

  // ─── Evaluation Progress State ──────────────────────────────────────────────
  const [evalProgress, setEvalProgress] = useState({
    isOpen: false,
    modelName: '',
    datasetName: '',
    jobId: null as string | null,
    status: 'pending' as 'pending' | 'running' | 'completed' | 'failed',
    progress: 0,
    message: 'Initializing...',
    error: undefined as string | undefined,
  })

  // ─── API Helpers ─────────────────────────────────────────────────────────────

  const getUserId = (): string => {
    const userId = user?.clerk_id || user?.id
    if (userId && userId !== 'local_user_1') {
      return userId
    }
    throw new Error('Sign in before accessing account features.')
  }

  const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
    const url = apiUrl + endpoint
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
    const url = apiUrl + endpoint
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

  // ─── UUID Validation Helper ──────────────────────────────────────────────────

  const isValidUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(id)
  }

  // ─── Category definitions ──────────────────────────────────────────────────
  const categoryDefs = [
    { id: 'all', name: 'All Models', icon: Brain },
    { id: 'segmentation', name: 'Segmentation', icon: Activity },
    { id: 'classification', name: 'Classification', icon: Camera },
    { id: 'detection', name: 'Detection', icon: Eye },
    { id: 'regression', name: 'Regression', icon: TrendingUp },
    { id: 'other', name: 'Other', icon: AlertCircle }
  ]

  // ─── Compute category counts dynamically from allModels ──────────────────
  const categories = useMemo(() => {
    return categoryDefs.map(cat => {
      let count = 0
      if (cat.id === 'all') {
        count = allModels.length
      } else {
        count = allModels.filter(m => m.category === cat.id).length
      }
      return { ...cat, count }
    })
  }, [allModels])

  const modalityColors: Record<string, string> = {
    'MRI': 'bg-blue-100 text-blue-800',
    'CT': 'bg-green-100 text-green-800',
    'X-Ray': 'bg-purple-100 text-purple-800',
    'Ultrasound': 'bg-orange-100 text-orange-800',
    'Mammography': 'bg-pink-100 text-pink-800',
    'Fundus': 'bg-amber-100 text-amber-800',
    'Echocardiogram': 'bg-teal-100 text-teal-800',
    'Custom': 'bg-gray-100 text-gray-800'
  }

  const taskColors: Record<string, string> = {
    'segmentation': 'bg-indigo-100 text-indigo-800',
    'classification': 'bg-emerald-100 text-emerald-800',
    'detection': 'bg-red-100 text-red-800',
    'regression': 'bg-yellow-100 text-yellow-800',
    'other': 'bg-gray-100 text-gray-800'
  }

  // ─── Load Functions ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!catalog) loadAllData()
  }, [])

  useEffect(() => {
    if (!catalog) return
    setModels(catalog.models.filter(model => !model.isCommunityModel && !model.isPretrained))
    setCommunityModels(catalog.models.filter(model => model.isCommunityModel))
    setPretrainedModels(catalog.models.filter(model => model.isPretrained))
    setLoading(catalog.loading)
    setError(catalog.error)
  }, [catalog?.models, catalog?.loading, catalog?.error])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadPublicModels(),
        loadUserModels(),
        loadPretrainedModels(),
        loadDatasets(),
        loadEvaluations(),
        loadCommentCounts()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
      setError('Failed to load models. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  // ── Load Public Models (Marketplace + Community) ──────────────────────────

  const loadPublicModels = async () => {
    try {
      const data = await fetchPublic('/models/?public_only=true')
      const publicModels = Array.isArray(data) ? data : []

      // Separate marketplace and community
      const marketplace: Model[] = []
      const community: Model[] = []

      publicModels.forEach((m: any) => {
        const formatted: Model = {
          id: m.id,
          name: m.name,
          description: m.description || '',
          category: m.task_type || 'other',
          modality: m.modality || 'Custom',
          task: m.task_type || 'Other',
          anatomy: m.anatomy || 'Various',
          author: m.owner?.display_name || m.owner?.email || 'Unknown',
          version: m.version || '1.0.0',
          accuracy: m.metrics?.accuracy || 0,
          downloads: m.downloads || 0,
          stars: m.stars || 0,
          rating: m.rating || 0,
          framework: m.model_format || 'unknown',
          createdAt: m.created_at || new Date().toISOString(),
          updatedAt: m.updated_at || new Date().toISOString(),
          isVerified: m.is_verified || false,
          license: m.license || 'MIT',
          isUserModel: false,
          isPretrained: false,
          isCommunityModel: m.is_community_contribution || false,
          contributionStatus: m.contribution_status || undefined,
          userId: m.owner_clerk_id,
          modelType: m.feature_config?.model_type || m.model_format || 'unknown',
          evaluationType: m.feature_config?.evaluation_type || 'real_unknown',
          is_community_contribution: m.is_community_contribution || false,
          // ─── Documentation fields ──────────────────────────────────────────
          documentation: m.documentation,
          input_shape: m.input_shape,
          output_classes: m.output_classes,
          supported_modalities: m.supported_modalities,
          recommended_dataset_types: m.recommended_dataset_types,
          usage_example: m.usage_example
        }

        if (m.is_community_contribution && m.contribution_status === 'approved') {
          community.push(formatted)
        } else if (!m.is_community_contribution) {
          marketplace.push(formatted)
        }
      })

      setModels(marketplace)
      setCommunityModels(community)
    } catch (error) {
      console.error('Error loading public models:', error)
      setModels([])
      setCommunityModels([])
    }
  }

  // ── Load User Models ──────────────────────────────────────────────────────

  const loadUserModels = async () => {
    try {
      const data = await fetchWithAuth('/models/mine')
      const models = Array.isArray(data) ? data : []
      
      const formattedModels: UserModel[] = models.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description || '',
        framework: m.model_format || 'unknown',
        task: m.task_type || 'other',
        modelType: m.feature_config?.model_type || 'unknown',
        uploadedAt: m.created_at || new Date().toISOString(),
        userId: m.owner_clerk_id || '',
        githubRepo: m.github_repo,
        collaborationNotes: m.collaboration_notes,
        feature_config: m.feature_config
      }))
      
      setUserModels(formattedModels)
    } catch (error) {
      console.error('Error loading user models:', error)
      setUserModels([])
    }
  }

  // ── Load Pretrained Models ───────────────────────────────────────────────

  const loadPretrainedModels = async () => {
    setPretrainedModels([])
  }

  // ── Load Datasets ─────────────────────────────────────────────────────────

  const loadDatasets = async () => {
    try {
      const data = await fetchWithAuth('/datasets/mine')
      const datasetsList = Array.isArray(data) ? data : []
      
      const formattedDatasets: Dataset[] = datasetsList.map((d: any) => ({
        id: d.id,
        name: d.name,
        type: d.file_format || 'csv',
        size: d.file_size ? `${(d.file_size / 1024 / 1024).toFixed(1)} MB` : 'Unknown'
      }))
      
      setDatasets(formattedDatasets)
    } catch (error) {
      console.error('Error loading datasets:', error)
      setDatasets([])
    }
  }

  // ── Load Evaluations ──────────────────────────────────────────────────────

  const loadEvaluations = async () => {
    try {
      const data = await fetchWithAuth('/evaluations/')
      const evaluationsList = Array.isArray(data) ? data : []
      
      const formattedEvaluations: Evaluation[] = evaluationsList
        .filter((e: any) => e.status === 'completed')
        .map((e: any) => {
          const result = e.results && e.results.length > 0 ? e.results[0] : {}
          return {
            id: e.id,
            modelId: e.model_id,
            modelName: e.model_name || 'Unknown',
            datasetName: e.dataset_name || 'Unknown',
            metrics: {
              accuracy: result.accuracy || 0,
              precision: result.precision || 0,
              recall: result.recall || 0,
              f1Score: result.f1_score || 0,
              evaluationTime: result.evaluation_time || 0
            },
            completedAt: e.completed_at || e.created_at,
            status: e.status
          }
        })
      
      setEvaluations(formattedEvaluations)
    } catch (error) {
      console.error('Error loading evaluations:', error)
      setEvaluations([])
    }
  }

  // ── Load Comment Counts ──────────────────────────────────────────────────

  const loadCommentCounts = async () => {
    try {
      const allPublic = [...models, ...communityModels]
      const counts: Record<string, number> = {}
      for (const model of allPublic) {
        if (isValidUUID(model.id)) {
          try {
            const data = await fetchPublic(`/comments/count/${model.id}`)
            counts[model.id] = data.count || 0
          } catch {
            counts[model.id] = 0
          }
        }
      }
      setCommentCounts(counts)
    } catch (error) {
      console.error('Error loading comment counts:', error)
      setCommentCounts({})
    }
  }

  // ─── Update Combined Models ──────────────────────────────────────────────────

  useEffect(() => {
    updateAllModels(models, pretrainedModels, communityModels)
  }, [models, pretrainedModels, communityModels, showModelTypes])

  const updateAllModels = (
    marketplaceModels: Model[], 
    pretrainedModelList: any[], 
    communityModelList: Model[]
  ) => {
    let publicModels: Model[] = []
    
    if (showModelTypes.marketplace) {
      publicModels = [...publicModels, ...marketplaceModels]
    }
    
    if (showModelTypes.pretrained) {
      const formattedPretrainedModels: Model[] = pretrainedModelList.map((model: any) => ({
        id: model.id || `pretrained_${Math.random()}`,
        name: model.name || 'Pretrained Model',
        description: model.description || '',
        category: model.task?.toLowerCase() || 'segmentation',
        modality: model.modality || 'MRI',
        task: model.task || 'Segmentation',
        anatomy: model.anatomy || 'Brain',
        author: model.source || 'MONAI/BraTS',
        version: model.version || '1.0.0',
        accuracy: model.accuracy || 0,
        downloads: 0,
        stars: 0,
        rating: 0,
        framework: model.framework || 'PyTorch',
        createdAt: model.importedAt || new Date().toISOString(),
        updatedAt: model.importedAt || new Date().toISOString(),
        isVerified: model.isVerified || true,
        license: model.license || 'Unknown',
        isUserModel: false,
        isPretrained: true,
        modelType: 'unknown',
        is_community_contribution: false,
        documentation: model.documentation,
        input_shape: model.input_shape,
        output_classes: model.output_classes,
        supported_modalities: model.supported_modalities,
        recommended_dataset_types: model.recommended_dataset_types,
        usage_example: model.usage_example
      }))
      publicModels = [...publicModels, ...formattedPretrainedModels]
    }
    
    if (showModelTypes.community) {
      publicModels = [...publicModels, ...communityModelList]
    }
    
    // User models are only for comparison, not in public browse
    let comparisonModelsList: Model[] = [...publicModels]
    
    const formattedUserModels: Model[] = userModels.map((model: UserModel) => ({
      id: `user_${model.id}`,
      name: model.name,
      description: model.description || 'Uploaded model',
      category: model.task?.toLowerCase() || 'other',
      modality: 'Custom',
      task: model.task || 'Custom',
      anatomy: 'Various',
      author: user?.name || user?.email || 'You',
      version: '1.0.0',
      accuracy: 0,
      downloads: 0,
      stars: 0,
      rating: 0,
      framework: model.framework,
      createdAt: model.uploadedAt,
      updatedAt: model.uploadedAt,
      isVerified: false,
      license: 'Private',
      isUserModel: true,
      userId: model.userId,
      modelType: model.modelType,
      is_community_contribution: false,
      documentation: '',
      input_shape: null,
      output_classes: null,
      supported_modalities: [],
      recommended_dataset_types: [],
      usage_example: ''
    }))
    
    comparisonModelsList = [...comparisonModelsList, ...formattedUserModels]
    
    setAllModels(publicModels)
    setComparisonModels(comparisonModelsList)
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  const handleModelSelect = (modelId: string) => {
    setSelectedModels(prev => {
      const newSet = new Set(prev)
      if (newSet.has(modelId)) {
        newSet.delete(modelId)
      } else {
        newSet.add(modelId)
      }
      return newSet
    })
  }

  const handleShowComments = (model: Model) => {
    if (model.isUserModel || model.isCommunityModel) {
      return
    }
    setSelectedModel(model)
    setShowComments(true)
  }

  const handleCloseComments = () => {
    setShowComments(false)
    setSelectedModel(null)
  }

  // ─── Documentation Handlers ──────────────────────────────────────────────────
  const handleShowDocumentation = (model: Model) => {
    setDocumentedModel(model)
    setShowDocumentation(true)
  }

  const handleCloseDocumentation = () => {
    setShowDocumentation(false)
    setDocumentedModel(null)
  }

  // ─── Dataset selection inline ──────────────────────────────────────────────
  const handleSelectDatasetInline = (dataset: Dataset, modelId: string) => {
    setSelectedDataset(dataset)
    // Keep the selector open with the selected dataset
    // Do NOT start evaluation automatically
  }

  const handleCancelDatasetSelector = () => {
    setDatasetSelectorModelId(null)
  }

  // ─── getActualModelId - Extract valid UUID from model ──────────────────────

  const getActualModelId = (model: Model): string | null => {
    let actualId = model.id
    
    if (model.id.startsWith('user_')) {
      actualId = model.id.replace('user_', '')
    } else if (model.id.startsWith('community_')) {
      actualId = model.id.replace('community_', '')
    } else if (model.id.startsWith('pretrained_')) {
      actualId = model.id.replace('pretrained_', '')
    }
    
    if (model.isUserModel) {
      const userModel = userModels.find(um => `user_${um.id}` === model.id)
      if (userModel) {
        actualId = userModel.id
      } else {
        const userModelByName = userModels.find(um => um.name === model.name)
        if (userModelByName) {
          actualId = userModelByName.id
        }
      }
    }
    
    if (isValidUUID(actualId)) {
      return actualId
    }
    
    console.warn(`⚠️ Invalid UUID for model ${model.name}: ${actualId}`)
    return null
  }

  // ─── Evaluate Single Model ──────────────────────────────────────────────────

  const handleEvaluateModel = async (modelId: string) => {
    if (!selectedDataset) {
      setError('Please select a dataset first.')
      return
    }

    const model = comparisonModels.find(m => m.id === modelId)
    if (!model) {
      setError('Model not found')
      return
    }

    setEvaluatingModels(prev => new Set(prev).add(modelId))
    setError('')

    // ─── Open progress modal immediately ──────────────────────────────────────
    setEvalProgress({
      isOpen: true,
      modelName: model.name,
      datasetName: selectedDataset.name,
      jobId: null,
      status: 'pending',
      progress: 5,
      message: 'Submitting evaluation...',
      error: undefined,
    })

    // ─── Toast & Notification ─────────────────────────────────────────────────
    const submissionMsg = `Evaluation submitted for ${model.name} on ${selectedDataset.name}`
    toast.info(submissionMsg)
    addNotification?.('Evaluation Submitted', submissionMsg, 'info')

    try {
      const actualModelId = getActualModelId(model)
      if (!actualModelId) {
        throw new Error(`Invalid model ID for "${model.name}".`)
      }

      const evaluationData = {
        model_id: actualModelId,
        dataset_id: selectedDataset.id,
        config: {
          test_split: 0.2,
          batch_size: 32
        }
      }

      const result = await fetchWithAuth('/evaluations/', {
        method: 'POST',
        body: JSON.stringify(evaluationData)
      })

      // ─── Update with job ID and start polling ──────────────────────────────
      setEvalProgress(prev => ({
        ...prev,
        jobId: result.id,
        status: 'running',
        progress: 10,
        message: 'Evaluation started...',
      }))

      onEvaluationStarted?.()

      // Load evaluations later to update comparison panel
      setTimeout(() => loadEvaluations(), 5000)

    } catch (error: any) {
      console.error('Error starting evaluation:', error)
      setEvalProgress(prev => ({
        ...prev,
        status: 'failed',
        message: 'Evaluation failed to start.',
        error: error.message || 'Unknown error',
      }))
      setError(error.message || 'Failed to start evaluation')
      
      // ─── Toast & Notification: failure ──────────────────────────────────────
      const failMsg = `❌ ${model.name} evaluation failed: ${error.message || 'Unknown error'}`
      toast.error(failMsg)
      addNotification?.('Evaluation Failed', failMsg, 'error')
    } finally {
      setEvaluatingModels(prev => {
        const newSet = new Set(prev)
        newSet.delete(modelId)
        return newSet
      })
    }
  }

  // ─── Polling for evaluation progress ──────────────────────────────────────

  useEffect(() => {
    if (!evalProgress.jobId || evalProgress.status === 'completed' || evalProgress.status === 'failed') {
      return
    }

    const interval = setInterval(async () => {
      try {
        const data = await fetchWithAuth(`/evaluations/${evalProgress.jobId}`)
        setEvalProgress(prev => ({
          ...prev,
          status: data.status || 'running',
          progress: data.progress !== undefined ? data.progress : Math.min(prev.progress + 10, 95),
          message: data.message || prev.message,
          error: data.error,
        }))
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(interval)
          if (data.status === 'completed') {
            setSuccess(`✅ Evaluation completed for ${evalProgress.modelName}!`)
            // ─── Toast & Notification: completion ──────────────────────────────
            const successMsg = `✅ ${evalProgress.modelName} completed on ${evalProgress.datasetName}`
            toast.success(successMsg)
            addNotification?.('Evaluation Completed', successMsg, 'success', `/evaluations/${evalProgress.jobId}`)
          } else if (data.status === 'failed') {
            // ─── Toast & Notification: failure from polling ────────────────────
            const failMsg = `❌ ${evalProgress.modelName} evaluation failed: ${data.error || 'Unknown error'}`
            toast.error(failMsg)
            addNotification?.('Evaluation Failed', failMsg, 'error')
          }
          // Refresh evaluations list
          loadEvaluations()
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [evalProgress.jobId, evalProgress.status])

  // ─── Toggle Comparison ──────────────────────────────────────────────────────

  const handleCompareSelected = () => {
    if (selectedModels.size === 0) {
      setError('Please select at least one model to compare.')
      return
    }
    setShowComparison(prev => !prev)
  }

  // ─── Batch Evaluation ───────────────────────────────────────────────────────

  const handleBatchEvaluation = async () => {
    if (selectedModels.size === 0 || !selectedDataset) {
      setError('Please select a dataset and at least one model.')
      return
    }

    const selectedModelList = Array.from(selectedModels)
      .map(id => comparisonModels.find(m => m.id === id))
      .filter(Boolean) as Model[]
    
    if (selectedModelList.length === 0) {
      setError('No valid models selected')
      return
    }

    setEvaluatingModels(new Set(selectedModels))
    setError('')

    // ─── Open progress modal for batch ──────────────────────────────────────
    setEvalProgress({
      isOpen: true,
      modelName: `Batch (${selectedModels.size} models)`,
      datasetName: selectedDataset.name,
      jobId: null,
      status: 'pending',
      progress: 5,
      message: `Submitting ${selectedModels.size} evaluations...`,
      error: undefined,
    })

    // ─── Toast & Notification: batch start ──────────────────────────────────
    const batchMsg = `Batch evaluation started for ${selectedModels.size} models on ${selectedDataset.name}`
    toast.info(batchMsg)
    addNotification?.('Batch Evaluation Started', batchMsg, 'info')

    try {
      const evaluationPromises = selectedModelList.map(async (model) => {
        const actualModelId = getActualModelId(model)
        if (!actualModelId) {
          throw new Error(`Invalid model ID for "${model.name}"`)
        }

        const evaluationData = {
          model_id: actualModelId,
          dataset_id: selectedDataset!.id,
          config: {
            test_split: 0.2,
            batch_size: 32
          }
        }

        return fetchWithAuth('/evaluations/', {
          method: 'POST',
          body: JSON.stringify(evaluationData)
        })
      })

      const results = await Promise.all(evaluationPromises)
      
      // Update with the first job ID (or you can track all)
      if (results.length > 0) {
        setEvalProgress(prev => ({
          ...prev,
          jobId: results[0].id,
          status: 'running',
          progress: 10,
          message: `Batch evaluation started (${selectedModels.size} models)...`,
        }))
      }

      setSuccess(`Batch evaluation started for ${selectedModels.size} models!`)
      onEvaluationStarted?.()

      setTimeout(() => {
        loadEvaluations()
      }, 5000)
      
    } catch (error: any) {
      console.error('Error starting batch evaluation:', error)
      setEvalProgress(prev => ({
        ...prev,
        status: 'failed',
        message: 'Batch evaluation failed to start.',
        error: error.message || 'Unknown error',
      }))
      setError(error.message || 'Failed to start batch evaluation')
      
      // ─── Toast & Notification: batch failure ──────────────────────────────
      const failMsg = `❌ Batch evaluation failed for ${selectedModels.size} models on ${selectedDataset.name}: ${error.message || 'Unknown error'}`
      toast.error(failMsg)
      addNotification?.('Batch Evaluation Failed', failMsg, 'error')
    } finally {
      setEvaluatingModels(new Set())
      setSelectedModels(new Set())
    }
  }

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) {
      return '0'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
  }

  const getSelectedModelsSummary = () => {
    const selectedModelList = Array.from(selectedModels)
      .map(id => comparisonModels.find(m => m.id === id))
      .filter(Boolean) as Model[]
    
    const marketplaceCount = selectedModelList.filter(m => !m.isUserModel && !m.isCommunityModel && !m.isPretrained).length
    const userCount = selectedModelList.filter(m => m.isUserModel).length
    const communityCount = selectedModelList.filter(m => m.isCommunityModel).length
    const pretrainedCount = selectedModelList.filter(m => m.isPretrained).length
    
    const parts = []
    if (marketplaceCount > 0) parts.push(`${marketplaceCount} marketplace`)
    if (userCount > 0) parts.push(`${userCount} your models`)
    if (communityCount > 0) parts.push(`${communityCount} community`)
    if (pretrainedCount > 0) parts.push(`${pretrainedCount} MONAI/BraTS`)
    return parts.join(' + ') || 'No models selected'
  }

  const getCommunityStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 text-xs"><ClockIcon className="h-3 w-3 mr-1" />Pending Review</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 text-xs"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
      default:
        return null
    }
  }

  // ─── Filtered Models ─────────────────────────────────────────────────────────

  const filteredModels = allModels.filter(model => {
    const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.modality.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.anatomy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.author.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || model.category === selectedCategory
    
    return matchesSearch && matchesCategory
  }).sort((left, right) => {
    if (catalog) return compareCatalogItems({id:left.id,name:left.name,downloads:left.downloads,published:left.createdAt}, {id:right.id,name:right.name,downloads:right.downloads,published:right.createdAt}, sortBy)
    if (sortBy === 'name') return left.name.localeCompare(right.name)
    if (sortBy === 'popular') return right.downloads - left.downloads || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    if (sortBy === 'rating') return right.rating - left.rating || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    if (sortBy === 'accuracy') return right.accuracy - left.accuracy || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    return Date.parse(right.createdAt) - Date.parse(left.createdAt)
  })

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={catalog ? 'catalog-browser space-y-5' : 'space-y-6'}>
      {/* Header */}
      {(!catalog || success || error) && <div className="flex flex-col space-y-4">
        {!catalog && <div className="model-browser-titlebar">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Store className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">ỌJÀ ML</h2>
              <p className="text-gray-600">Medical AI model marketplace & comparison</p>
            </div>
          </div>
          <div className="page-actions">
            <Button 
              variant="outline" 
              onClick={() => setActiveTab('contribute')}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Contribute Model</span>
            </Button>
            {selectedModels.size > 0 && (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <Check className="h-3 w-3" />
                <span>{selectedModels.size} selected ({getSelectedModelsSummary()})</span>
              </Badge>
            )}
            <Badge variant="secondary" className="flex items-center space-x-1">
              <TrendingUp className="h-3 w-3" />
              <span>{allModels.length} models available</span>
            </Badge>
          </div>
        </div>

        }
        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {!catalog && <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {catalog ? 'Browse published public models and use the task and model-source filters. No login is required to review models or compare their metadata.' : <>
            Browse approved marketplace, community-contributed, and MONAI/BraTS imported models.
            Your uploaded models are only visible in your dashboard until they are submitted and approved as community contributions.
            You can still select and compare your models with zoo models.</>}

          </AlertDescription>
        </Alert>}
      </div>}

      {/* Selected Dataset Display */}
      {selectedDataset && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-green-600" />
                <span className="font-medium">Selected Dataset: {selectedDataset.name}</span>
                <Badge variant="outline">{selectedDataset.type}</Badge>
              </div>
              <div className="flex gap-2">
                {selectedModels.size > 1 && (
                  <Button onClick={handleBatchEvaluation} size="sm">
                    <GitCompare className="h-4 w-4 mr-1" />
                    Batch Evaluate {selectedModels.size} Models
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setSelectedDataset(null)}>
                  Change Dataset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="model-browser-tabs">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="browse">Browse & Compare Models</TabsTrigger>
          {!catalog && <TabsTrigger value="import" className="flex items-center space-x-1">
            <Package className="h-4 w-4" />
            <span>Import Models</span>
          </TabsTrigger>}
          <TabsTrigger value="contribute" className="flex items-center space-x-1">
            <Users className="h-4 w-4" />
            <span>Contribute</span>
          </TabsTrigger>
          <TabsTrigger value="guidelines" className="flex items-center space-x-1">
            <Info className="h-4 w-4" />
            <span>Guidelines</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-6">
          {/* Search and Filters */}
          {!catalog && <>
          <div className="model-browser-toolbar flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  aria-label="Search models"
                  placeholder="Search models, modalities, anatomy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="page-actions">
              <select 
                aria-label="Sort models"
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md bg-white"
              >
                <option value="popular">Most Popular</option>
                <option value="newest">Newest</option>
                <option value="rating">Highest Rated</option>
                <option value="accuracy">Best Accuracy</option>
              </select>
            </div>
          </div>

          </>}

          <div className={catalog ? 'data-zoo-layout' : 'model-browser-grid grid grid-cols-1 lg:grid-cols-4 gap-6'}>
            {/* Categories and Filters Sidebar */}
            <div className={catalog ? 'data-zoo-sidebar' : 'lg:col-span-1 space-y-4'}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Filter className="h-4 w-4" />
                    <span>Tasks</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {categories.map((category) => {
                    const Icon = category.icon
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                          selectedCategory === category.id 
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Icon className="h-4 w-4" />
                          <span className="text-sm">{category.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {category.count}
                        </Badge>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Model Type Filter */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Model Sources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="marketplace"
                      checked={showModelTypes.marketplace}
                      onCheckedChange={(checked) => 
                        setShowModelTypes(prev => ({ ...prev, marketplace: checked === true }))
                      }
                    />
                    <label htmlFor="marketplace" className="text-sm flex items-center space-x-2">
                      <Store className="h-3 w-3" />
                      <span>Marketplace ({models.length})</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pretrained"
                      checked={showModelTypes.pretrained}
                      onCheckedChange={(checked) => 
                        setShowModelTypes(prev => ({ ...prev, pretrained: checked === true }))
                      }
                    />
                    <label htmlFor="pretrained" className="text-sm flex items-center space-x-2">
                      <Package className="h-3 w-3" />
                      <span>MONAI/BraTS ({pretrainedModels.length})</span>
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="community"
                      checked={showModelTypes.community}
                      onCheckedChange={(checked) => 
                        setShowModelTypes(prev => ({ ...prev, community: checked === true }))
                      }
                    />
                    <label htmlFor="community" className="text-sm flex items-center space-x-2">
                      <Users className="h-3 w-3" />
                      <span>Community ({communityModels.length})</span>
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* Your Models Section */}
              <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader>
                  <CardTitle className="text-sm text-blue-700 flex items-center space-x-2">
                    <Package className="h-4 w-4" />
                    <span>Your Models</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {catalog ? <>
                    <p className="text-xs text-blue-600 mb-3">{user ? 'Manage your uploads and published versions from your dashboard.' : 'Sign in to upload models and manage your own repositories.'}</p>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" size="sm" asChild><a href={user ? '/dashboard' : '/auth/login'}>{user ? 'Manage Your Models' : 'Sign in to contribute'}</a></Button>
                  </> : <>
                  <p className="text-xs text-blue-600 mb-3">
                    You have <strong>{userModels.length}</strong> model{userModels.length !== 1 ? 's' : ''} in your dashboard.
                    They are not shown here but can be selected for comparison.
                    Want to share them with the community?
                  </p>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setActiveTab('contribute')}
                  >
                    <Sparkles className="h-3 w-3 mr-2" />
                    Submit as Community Contribution
                    <ArrowRight className="h-3 w-3 ml-2" />
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    Your models will appear here after admin approval
                  </p></>}

                </CardContent>
              </Card>

              {/* Bulk Actions */}
              {selectedModels.size > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Bulk Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button 
                      onClick={handleCompareSelected}
                      size="sm" 
                      className="w-full"
                      variant={showComparison ? 'default' : 'outline'}
                    >
                      <Columns className="h-4 w-4 mr-1" />
                      {showComparison ? 'Hide Comparison' : 'Compare Selected'}
                    </Button>
                    <Button 
                      onClick={() => selectedDataset ? handleBatchEvaluation() : null}
                      size="sm" 
                      className="w-full"
                      disabled={!selectedDataset}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Run Batch Evaluation
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => setSelectedModels(new Set())}
                    >
                      Clear Selection
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Models Grid */}
            <div className={catalog ? 'data-zoo-results space-y-5' : 'lg:col-span-3'}>
              {catalog && <><div className="data-zoo-toolbar">
                <CatalogViewSwitch kind="model" value={catalogView} onChange={setCatalogView} />
                {catalogView === 'table' && <CatalogColumns kind="model" columns={MODEL_COLUMNS} state={columns} />}
                <div className="data-zoo-search"><Search size={18} aria-hidden="true" /><Input aria-label="Search models" placeholder="Search models, authors, or tasks..." value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></div>
                <select aria-label="Sort models" value={sortBy} onChange={event => { setSortBy(event.target.value); catalog.onSortChange?.(event.target.value) }}><option value="newest">Newest release</option><option value="name">Name A-Z</option><option value="popular">Most downloaded</option></select><Button variant="outline" disabled={loading} onClick={catalog.onRefresh}>Refresh models</Button>
              </div><p className="text-sm text-gray-600" role="status">Showing {filteredModels.length} of {allModels.length} loaded models.</p></>}

              {loading ? (
                <div className={catalog ? 'data-zoo-grid' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                  {[...Array(6)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardHeader>
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-full"></div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          <div className="h-8 bg-gray-200 rounded"></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : catalog && catalogView === 'table' ? (
                <div className="catalog-results-table"><Table aria-label="Public models"><TableHeader><TableRow>
                  {columns.visible('select') && <TableHead>Select</TableHead>}<TableHead>Model</TableHead>{columns.visible('version') && <TableHead>Version</TableHead>}{columns.visible('task') && <TableHead>Task</TableHead>}{columns.visible('framework') && <TableHead>Framework</TableHead>}{columns.visible('license') && <TableHead>License</TableHead>}{columns.visible('files') && <TableHead>Files</TableHead>}{columns.visible('size') && <TableHead>Size</TableHead>}{columns.visible('downloads') && <TableHead>Downloads</TableHead>}<TableHead>Details</TableHead>
                </TableRow></TableHeader><TableBody>{filteredModels.map(model => <TableRow key={model.id}>
                  {columns.visible('select') && <TableCell><Checkbox aria-label={`Select ${model.name}`} checked={selectedModels.has(model.id)} onCheckedChange={() => handleModelSelect(model.id)} /></TableCell>}
                  <TableCell><strong>{model.name}</strong><span className="block text-sm text-gray-600">{model.author}/{model.repositorySlug}</span></TableCell>
                  {columns.visible('version') && <TableCell>{model.version}</TableCell>}{columns.visible('task') && <TableCell>{model.task}</TableCell>}{columns.visible('framework') && <TableCell>{model.framework}</TableCell>}{columns.visible('license') && <TableCell>{model.license}</TableCell>}
                  {columns.visible('files') && <TableCell>{model.fileCount || 0}</TableCell>}{columns.visible('size') && <TableCell>{formatArtifactSize(model.totalSize || 0)}</TableCell>}{columns.visible('downloads') && <TableCell><span className="catalog-download-count"><Download aria-hidden="true" />{model.downloads.toLocaleString()}</span></TableCell>}<TableCell><div className="page-actions"><Button variant="outline" size="sm" onClick={() => catalog.onReview(model.id)} aria-label={`View model ${model.name}`}>View Model</Button></div></TableCell>
                </TableRow>)}</TableBody></Table></div>
              ) : (
                <div className={catalog ? 'data-zoo-grid' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
                  {filteredModels.map((model) => {
                    const isEvaluating = evaluatingModels.has(model.id)
                    const isSelected = selectedModels.has(model.id)
                    const modelTypeInfo = getModelTypeBadge(model.modelType)
                    
                    if (catalog) return <Card key={model.id} className="data-zoo-dataset"><CardHeader>
                      <div className="data-zoo-title"><Brain className="text-indigo-600" aria-hidden="true" /><Badge variant="outline">v{model.version}</Badge></div>
                      <CardTitle>{model.name}</CardTitle><p className="text-sm text-gray-600">{model.author}/{model.repositorySlug}</p><p className="data-zoo-description">{model.description || 'No description provided.'}</p>
                    </CardHeader><CardContent className="space-y-4">
                      <div className="page-actions">{[model.task, model.framework, model.license].map((value, index) => <Badge key={index} variant="secondary">{value}</Badge>)}</div>
                      <dl className="data-zoo-facts"><div><dt>Files</dt><dd>{model.fileCount || 0}</dd></div><div><dt>Size</dt><dd>{formatArtifactSize(model.totalSize || 0)}</dd></div><div><dt>Downloads</dt><dd className="catalog-download-count" title="Streams completed by the server; disk saves cannot be verified"><Download aria-hidden="true" />{model.downloads.toLocaleString()}</dd></div><div><dt>Published</dt><dd>{new Date(model.createdAt).toLocaleDateString()}</dd></div></dl>
                      <label className="data-zoo-checkbox"><Checkbox aria-label={`Select ${model.name}`} checked={isSelected} onCheckedChange={() => handleModelSelect(model.id)} />Select for comparison</label>
                      <Button className="w-full" onClick={() => catalog.onReview(model.id)}>View Model</Button>
                    </CardContent></Card>
                    return (
                      <Card key={model.id} className={`hover:shadow-lg transition-all duration-200 ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isEvaluating ? 'opacity-75' : ''}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2 flex-wrap gap-1">
                                <CardTitle className="text-lg leading-tight">{model.name}</CardTitle>
                                {model.isCommunityModel && (
                                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                    <Users className="h-3 w-3 mr-1" />
                                    Community
                                  </Badge>
                                )}
                                {model.isPretrained && (
                                  <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
                                    <Package className="h-3 w-3 mr-1" />
                                    MONAI/BraTS
                                  </Badge>
                                )}
                                {getCommunityStatusBadge(model.contributionStatus)}
                                {model.modelType && model.modelType !== 'unknown' && (
                                  <Badge className={`text-xs ${modelTypeInfo.color}`}>
                                    <span className="flex items-center space-x-1">
                                      {modelTypeInfo.icon}
                                      <span>{modelTypeInfo.label}</span>
                                    </span>
                                  </Badge>
                                )}
                              </div>
                              <CardDescription className="text-sm text-gray-600 mb-3">
                                {model.description}
                              </CardDescription>
                              <div className="flex flex-wrap gap-2">
                                <Badge 
                                  className={`text-xs ${modalityColors[model.modality] || 'bg-gray-100 text-gray-800'}`}
                                >
                                  {model.modality}
                                </Badge>
                                <Badge 
                                  className={`text-xs ${taskColors[model.task] || 'bg-gray-100 text-gray-800'}`}
                                >
                                  {model.task}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {model.anatomy}
                                </Badge>
                              </div>
                            </div>
                            <div className="ml-2">
                              <Checkbox
                                aria-label={`Select ${model.name}`}
                                checked={isSelected}
                                onCheckedChange={() => handleModelSelect(model.id)}
                                className="mt-1"
                              />
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-0">
                          {catalog && <p className="text-sm text-gray-600 mb-3" title="File and ZIP streams completed by the server; disk saves cannot be verified">{model.downloads.toLocaleString()} downloads</p>}
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center space-x-1">
                                <User className="h-3 w-3" />
                                <span className="truncate max-w-20">{model.author?.split(' ')[0] || 'Unknown'}</span>
                              </div>
                              {!model.isCommunityModel && !model.isPretrained && (
                                <>
                                  <div className="flex items-center space-x-1">
                                    <Star className="h-3 w-3" />
                                    <span>{model.rating}</span>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <Activity className="h-3 w-3" />
                                    <span>{model.accuracy}%</span>
                                  </div>
                                </>
                              )}
                              {(model.isCommunityModel || model.isPretrained) && model.accuracy > 0 && (
                                <div className="flex items-center space-x-1">
                                  <Activity className="h-3 w-3" />
                                  <span>{model.accuracy}%</span>
                                </div>
                              )}
                            </div>
                            {model.isVerified && (
                              <Shield className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <Button 
                              onClick={() => catalog ? catalog.onReview(model.id) : handleShowDocumentation(model)}
                              className="w-full"
                              variant={selectedDataset ? 'default' : 'outline'}
                            >
                              <BookOpen className="h-4 w-4 mr-2" />
                              {catalog ? 'View Model' : 'Review & Evaluate'}
                            </Button>
                            

                            {!model.isUserModel && !model.isCommunityModel && !model.isPretrained && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleShowComments(model)}
                                className="w-full"
                              >
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Comments ({commentCounts[model.id] || 0})
                              </Button>
                            )}
                          </div>

                          {/* ─── Inline Dataset Selector ───────────────────── */}
                          {datasetSelectorModelId === model.id && (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                              {!selectedDataset ? (
                                <>
                                  <p className="text-sm font-medium text-blue-800">
                                    {datasets.length === 0 
                                      ? "You don't have any datasets yet." 
                                      : "Select a dataset to evaluate this model:"}
                                  </p>
                                  {datasets.length === 0 ? (
                                    <div className="flex flex-col gap-2">
                                      <p className="text-xs text-gray-600">
                                        Upload a dataset first to start evaluations.
                                      </p>
                                      <Button 
                                        size="sm" 
                                        onClick={() => {
                                          if (onNavigate) {
                                            onNavigate('upload-data')
                                          } else {
                                            // Fallback: redirect to /upload-data
                                            window.location.href = '/upload-data'
                                          }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700"
                                      >
                                        <Upload className="h-4 w-4 mr-1" />
                                        Upload Dataset
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                                      {datasets.map((dataset) => (
                                        <button
                                          key={dataset.id}
                                          onClick={() => handleSelectDatasetInline(dataset, model.id)}
                                          className="text-left p-2 bg-white rounded border border-gray-200 hover:border-blue-400 transition-colors text-sm"
                                        >
                                          <p className="font-medium">{dataset.name}</p>
                                          <p className="text-xs text-gray-500">{dataset.type} • {dataset.size}</p>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-medium text-green-700">
                                    Selected: {selectedDataset.name}
                                  </p>
                                  <div className="flex gap-2">
                                    <Button 
                                      size="sm" 
                                      onClick={() => handleEvaluateModel(model.id)} 
                                      className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                      Evaluate Model
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => setSelectedDataset(null)}
                                    >
                                      Change
                                    </Button>
                                  </div>
                                </>
                              )}
                              <Button variant="ghost" size="sm" onClick={handleCancelDatasetSelector} className="text-xs">
                                Cancel
                              </Button>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 mt-2 text-center">
                            {model.isPretrained ? (
                              `MONAI/BraTS • ${model.framework} • ${model.license}`
                            ) : model.isCommunityModel ? (
                              `${model.framework} • ${model.license} • Community Contributed`
                            ) : (
                              `${formatNumber(model.downloads)} uses • ${model.license}`
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
              
              {!loading && filteredModels.length === 0 && (
                <Card className="text-center py-12">
                  <CardContent>
                    <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3>No models found</h3>
                    <p className="text-gray-500">Try adjusting your search or filters</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setActiveTab('contribute')}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Contribute a Model
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* ─── COMPARISON PANEL ────────────────────────────────────────────── */}
          {showComparison && selectedModels.size > 0 && (
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 mt-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Columns className="h-5 w-5 text-indigo-600" />
                    <CardTitle>Model Comparison</CardTitle>
                    <Badge variant="secondary">{selectedModels.size} models selected</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowComparison(false)}>
                    <XCircle className="h-4 w-4 mr-1" /> Close
                  </Button>
                </div>
                <CardDescription>
                  Side‑by‑side comparison of selected models based on their latest evaluation results.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {catalog ? <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Selected model comparison"><thead><tr>{['Model', 'Task', 'Framework', 'Version', 'License'].map(label => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{comparisonModels.filter(model => selectedModels.has(model.id)).map(model => <tr key={model.id} className="border-t"><td className="p-3">{model.name}</td><td className="p-3">{model.task}</td><td className="p-3">{model.framework}</td><td className="p-3">{model.version}</td><td className="p-3">{model.license}</td></tr>)}</tbody></table></div> : user && <ModelComparison user={user} evaluations={evaluations} />}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          {!catalog && user && <MonaiBratsImporter user={user} />}
        </TabsContent>

        <TabsContent value="contribute" className="space-y-6">
          {catalog ? (user ? <RepositoryWorkspace kind="model" /> : <Card><CardContent className="p-6"><p className="mb-4">Sign in to contribute a model.</p><Button asChild><a href="/auth/login">Sign in</a></Button></CardContent></Card>) : user && <ContributeModel user={user} onSuccess={() => {
            setSuccess('Model submitted for review! It will appear after approval.')
            setTimeout(() => setActiveTab('browse'), 2000)
          }} />}
        </TabsContent>

        <TabsContent value="guidelines" className="space-y-6">
          {catalog ? <Card><CardHeader><CardTitle>Contribution Guidelines</CardTitle></CardHeader><CardContent className="space-y-3"><p>Create an account and verify your email before contributing.</p><p>Create a model repository, complete its model card, license and provenance, then upload and validate the files.</p><p>Publish a public version to make it available in the Oja Models. Private models and drafts remain visible only to their owners.</p></CardContent></Card> : user && <ContributionGuidelines user={user} />}
        </TabsContent>
      </Tabs>

      {/* Comments Modal */}
      {!catalog && user && <ModelComments
        isOpen={showComments}
        onClose={handleCloseComments}
        model={selectedModel}
        user={user}
      />}

      {/* ─── Documentation Modal ────────────────────────────────────────────── */}
      {showDocumentation && documentedModel && (
        <ModelDocumentation
          isOpen={showDocumentation}
          onClose={handleCloseDocumentation}
          model={{
            id: documentedModel.id,
            name: documentedModel.name,
            description: documentedModel.description,
            documentation: documentedModel.documentation,
            input_shape: documentedModel.input_shape,
            output_classes: documentedModel.output_classes,
            supported_modalities: documentedModel.supported_modalities,
            recommended_dataset_types: documentedModel.recommended_dataset_types,
            usage_example: documentedModel.usage_example,
            framework: documentedModel.framework,
            version: documentedModel.version,
            license: documentedModel.license,
            author: documentedModel.author,
            modality: documentedModel.modality,
            anatomy: documentedModel.anatomy,
            task: documentedModel.task,
            is_community_contribution: documentedModel.isCommunityModel
          }}
          onEvaluate={() => {
            handleCloseDocumentation()
            // ─── If no dataset selected, show inline selector ──────────────
            if (!selectedDataset) {
              setDatasetSelectorModelId(documentedModel.id)
              return
            }
            // Otherwise start evaluation
            handleEvaluateModel(documentedModel.id)
          }}
        />
      )}

      {/* ─── Evaluation Progress Modal ────────────────────────────────────── */}
      <EvaluationProgress
        isOpen={evalProgress.isOpen}
        modelName={evalProgress.modelName}
        datasetName={evalProgress.datasetName}
        status={evalProgress.status}
        progress={evalProgress.progress}
        message={evalProgress.message}
        error={evalProgress.error}
        onClose={() => setEvalProgress(prev => ({ ...prev, isOpen: false }))}
        onViewResults={() => {
          setEvalProgress(prev => ({ ...prev, isOpen: false }))
          setSuccess('Viewing results...')
        }}
      />
    </div>
  )
}
