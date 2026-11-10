// components/RealMLEvaluationDashboard.tsx
import React, { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { Alert, AlertDescription } from './ui/alert'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from './ui/accordion'
import {
  Upload, Database, Brain, CheckCircle, AlertCircle, Cpu,
  FileText, Target, X, Loader2, RefreshCw,
  BarChart3, Award, Play, ChevronRight, ArrowRight,
  Download, FileJson, FileSpreadsheet, ShieldCheck, ShieldAlert,
  Box, Code2, Github, History, Search, ChevronDown, Image,
  Bell,
} from 'lucide-react'
import { EvaluationResults } from './EvaluationResults'

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface RealMLEvaluationDashboardProps {
  user: User
  onEvaluationComplete?: (results?: any) => void
  onEvaluationStart?: () => void
  onNavigate?: (tab: string) => void
  refreshKey?: number
}

interface AssetFile {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: string
  hasFile: boolean
  taskType: string
  modelType?: string
  evaluationType?: string
  featureConfig?: any
}

type JobStatus = 'idle' | 'checking' | 'submitting' | 'running' | 'completed' | 'failed'

interface EvaluationJob {
  jobId: string
  status: JobStatus
  progress: number
  statusMessage: string
  result?: any
  error?: string
}

interface CompatibilityResult {
  compatible: boolean
  issues: string[]
  warnings: string[]
}

// ─── Notification type ──────────────────────────────────────────────────────

interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  timestamp: Date
  read: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return 'Unknown size'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function metricsToCsv(evaluation: any): string {
  const m = evaluation.metrics || {}
  const rows: string[] = ['metric,value']
  const flat: Record<string, any> = {
    accuracy: m.accuracy,
    precision: m.precision,
    recall: m.recall,
    f1_score: m.f1Score ?? m.f1_score,
    roc_auc: m.roc_auc ?? m.aucRoc,
    dice_score: m.dice_score,
    iou: m.iou,
    evaluation_time_seconds: m.evaluationTime,
  }
  for (const [key, value] of Object.entries(flat)) {
    if (value !== undefined && value !== null) rows.push(`${key},${value}`)
  }
  return rows.join('\n')
}

// ─── Badge Helpers ──────────────────────────────────────────────────────────

function getModelTypeBadge(modelType?: string): { label: string; color: string; icon: React.ReactNode } {
  const types: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    sklearn: {
      label: 'scikit-learn',
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <Box className="h-3 w-3" />,
    },
    tensorflow: {
      label: 'TensorFlow',
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      icon: <Code2 className="h-3 w-3" />,
    },
    pytorch: {
      label: 'PyTorch',
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <Github className="h-3 w-3" />,
    },
    unknown: {
      label: 'Unknown',
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  }
  return types[modelType || 'unknown'] || types.unknown
}

function getDatasetTypeBadge(dataset: AssetFile): { label: string; color: string; icon: React.ReactNode } {
  const type = dataset.taskType || dataset.type || 'unknown'
  const ext = dataset.name.split('.').pop()?.toLowerCase() || ''

  if (type === 'segmentation' || ext === 'nii' || ext === 'nii.gz' || ext === 'dcm') {
    return {
      label: 'Medical',
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      icon: <Database className="h-3 w-3" />,
    }
  }
  if (type === 'classification' || ext === 'csv') {
    return {
      label: 'CSV',
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: <FileText className="h-3 w-3" />,
    }
  }
  if (ext === 'zip' || ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    return {
      label: 'Images',
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: <Image className="h-3 w-3" />,
    }
  }
  return {
    label: 'Dataset',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: <Database className="h-3 w-3" />,
  }
}

// ─── Empty state prompt ───────────────────────────────────────────────────────

function EmptyUploadPrompt({
  icon, title, description, buttonLabel, onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  buttonLabel: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-4">
      <div className="p-4 bg-gray-100 rounded-full text-gray-400">{icon}</div>
      <div>
        <p className="font-medium text-gray-700">{title}</p>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        className="flex items-center gap-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400"
      >
        {buttonLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RealMLEvaluationDashboard({
  user,
  onEvaluationComplete,
  onEvaluationStart,
  onNavigate,
  refreshKey,
}: RealMLEvaluationDashboardProps) {
  const getUserId = () => {
    return user?.clerk_id || user?.id || 'user_3EZsvPiHEIur8Kol77tLBNCBDMo'
  }

  const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${API_BASE_URL}${endpoint}`
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

  // ─── State ───────────────────────────────────────────────────────────────────

  const [uploadedModels, setUploadedModels] = useState<AssetFile[]>([])
  const [uploadedDatasets, setUploadedDatasets] = useState<AssetFile[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AssetFile | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<AssetFile | null>(null)
  const [modelUploading, setModelUploading] = useState(false)
  const [datasetUploading, setDatasetUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const [compatibility, setCompatibility] = useState<CompatibilityResult | null>(null)
  const [checkingCompatibility, setCheckingCompatibility] = useState(false)

  const [job, setJob] = useState<EvaluationJob>({
    jobId: '', status: 'idle', progress: 0, statusMessage: '',
  })
  const [completedEvaluation, setCompletedEvaluation] = useState<any>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // ── Notification state ──────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)

  const addNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const newNotif: Notification = {
      id: Date.now().toString(),
      message,
      type,
      timestamp: new Date(),
      read: false,
    }
    setNotifications(prev => [newNotif, ...prev])
  }

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const clearNotifications = () => {
    setNotifications([])
  }

  const unreadCount = notifications.filter(n => !n.read).length

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Evaluation History state ──────────────────────────────────────────────

  interface EvaluationHistoryItem {
    id: string
    modelId: string
    modelName: string
    datasetName: string
    status: string
    completedAt: string
    is_segmentation?: boolean
    task_type?: string
    mean_dice?: number
    mean_iou?: number
    dice_per_class?: Record<string, number>
    iou_per_class?: Record<string, number>
    num_classes?: number
    num_samples?: number
    metrics: {
      accuracy: number
      precision: number
      recall: number
      f1Score: number
      evaluationTime: number
    }
  }

  const [history, setHistory] = useState<EvaluationHistoryItem[]>([])
  const [selectedHistoryEval, setSelectedHistoryEval] = useState<any | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Search & pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const itemsPerPage = 20

  // ── Collapsible history state ──────────────────────────────────────────────
  const [historyExpanded, setHistoryExpanded] = useState(false)

  // ── Refs ─────────────────────────────────────────────────────────────────────

  const modelFileRef = useRef<HTMLInputElement>(null)
  const datasetFileRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeEvaluationIdRef = useRef<string | null>(null)

  // ── Init & History loading ──────────────────────────────────────────────────

  useEffect(() => {
    loadUploadedFiles()
    loadEvaluationHistory()
  }, [])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      loadUploadedFiles()
      loadEvaluationHistory()
    }
  }, [refreshKey])

  useEffect(() => {
    return () => clearPolling()
  }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  useEffect(() => {
    if (selectedModel && selectedDataset) {
      runCompatibilityCheck()
    } else {
      setCompatibility(null)
    }
  }, [selectedModel?.id, selectedDataset?.id])

  const notify = (msg: string, type: 'success' | 'error' = 'success') =>
    setToast({ msg, type })

  // ─── Load evaluation history ──────────────────────────────────────────────

  const loadEvaluationHistory = async () => {
    setLoadingHistory(true)
    try {
      const data = await fetchWithAuth('/evaluations/')
      const list = Array.isArray(data) ? data : []

      const formatted: EvaluationHistoryItem[] = list
        .filter((e: any) => e.status === 'completed')
        .map((e: any) => {
          const result = e.results && e.results.length > 0 ? e.results[0] : {}
          const topMetrics = e.metrics || {}
          const fullMetrics = result.full_metrics || result.metrics || topMetrics

          const isSeg = fullMetrics.is_segmentation === true ||
                        e.is_segmentation === true ||
                        result.is_segmentation === true ||
                        result.task_type === 'segmentation' ||
                        fullMetrics.task_type === 'segmentation' ||
                        topMetrics.is_segmentation === true

          return {
            id: e.id,
            modelId: e.model_id,
            modelName: e.model_name || 'Unknown',
            datasetName: e.dataset_name || 'Unknown',
            status: e.status,
            completedAt: e.completed_at || e.created_at,
            is_segmentation: isSeg,
            task_type: isSeg ? 'segmentation' : 'classification',
            mean_dice: fullMetrics.mean_dice ?? topMetrics.mean_dice ?? e.mean_dice ?? null,
            mean_iou: fullMetrics.mean_iou ?? topMetrics.mean_iou ?? e.mean_iou ?? null,
            dice_per_class: fullMetrics.dice_per_class ?? topMetrics.dice_per_class ?? e.dice_per_class ?? null,
            iou_per_class: fullMetrics.iou_per_class ?? topMetrics.iou_per_class ?? e.iou_per_class ?? null,
            num_classes: fullMetrics.num_classes ?? topMetrics.num_classes ?? e.num_classes ?? null,
            num_samples: fullMetrics.num_samples ?? topMetrics.num_samples ?? e.num_samples ?? null,
            metrics: {
              accuracy: result.accuracy || 0,
              precision: result.precision || 0,
              recall: result.recall || 0,
              f1Score: result.f1_score || 0,
              evaluationTime: result.evaluation_time || 0,
            },
          }
        })
      formatted.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      setHistory(formatted)
      setPage(1)
    } catch (err) {
      console.error('Failed to load evaluation history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleViewHistoryItem = async (item: EvaluationHistoryItem) => {
    try {
      const full = await fetchWithAuth(`/evaluations/${item.id}`)
      const result = full.results?.[0] || {}
      const topMetrics = full.metrics || {}
      const fullMetrics = result.full_metrics || result.metrics || topMetrics

      const isSeg = fullMetrics.is_segmentation === true ||
                    full.is_segmentation === true ||
                    result.is_segmentation === true ||
                    result.task_type === 'segmentation' ||
                    fullMetrics.task_type === 'segmentation' ||
                    topMetrics.is_segmentation === true

      const detailed = {
        id: full.id,
        modelId: full.model_id,
        datasetId: full.dataset_id,
        modelName: full.model_name || item.modelName,
        datasetName: full.dataset_name || item.datasetName,
        status: full.status,
        completedAt: full.completed_at || full.created_at,
        is_segmentation: isSeg,
        task_type: isSeg ? 'segmentation' : 'classification',
        mean_dice: fullMetrics.mean_dice ?? topMetrics.mean_dice ?? full.mean_dice ?? null,
        mean_iou: fullMetrics.mean_iou ?? topMetrics.mean_iou ?? full.mean_iou ?? null,
        dice_per_class: fullMetrics.dice_per_class ?? topMetrics.dice_per_class ?? full.dice_per_class ?? null,
        iou_per_class: fullMetrics.iou_per_class ?? topMetrics.iou_per_class ?? full.iou_per_class ?? null,
        num_classes: fullMetrics.num_classes ?? topMetrics.num_classes ?? full.num_classes ?? null,
        num_samples: fullMetrics.num_samples ?? topMetrics.num_samples ?? full.num_samples ?? null,
        metrics: {
          accuracy: fullMetrics.accuracy ?? result.accuracy ?? 0,
          precision: fullMetrics.precision ?? result.precision ?? 0,
          recall: fullMetrics.recall ?? result.recall ?? 0,
          f1Score: fullMetrics.f1_score ?? result.f1_score ?? 0,
          roc_auc: fullMetrics.roc_auc ?? result.auc_roc ?? null,
          confusion_matrix: fullMetrics.confusion_matrix ?? result.confusion_matrix ?? null,
          evaluationTime: fullMetrics.evaluation_time ?? result.evaluation_time ?? 0,
        },
      }
      setSelectedHistoryEval(detailed)
    } catch (err) {
      console.error('Failed to fetch evaluation details:', err)
      notify('Could not load details for this evaluation', 'error')
    }
  }

  // ── Filtered and paginated history ─────────────────────────────────────────

  const filteredHistory = history.filter(item =>
    item.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.datasetName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage)
  const paginatedItems = filteredHistory.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  )

  // ── Load assets ─────────────────────────────────────────────────────────────

  const loadUploadedFiles = async () => {
    setLoadingAssets(true)
    try {
      const [models, datasets] = await Promise.all([
        fetchWithAuth('/models/mine').catch(() => []),
        fetchWithAuth('/datasets/mine').catch(() => []),
      ])

      setUploadedModels((models || []).map((m: any) => {
        const featureConfig = m.feature_config || {}
        return {
          id: m.id,
          name: m.name,
          size: m.model_file_size ?? 0,
          type: m.model_format || 'model',
          uploadedAt: m.created_at || new Date().toISOString(),
          hasFile: !!m.model_file_path,
          taskType: m.task_type,
          modelType: featureConfig.model_type || 'unknown',
          evaluationType: featureConfig.evaluation_type || 'real_unknown',
          featureConfig: featureConfig,
        }
      }))

      setUploadedDatasets((datasets || [])
        .filter((d: any) => d.status === 'ready')
        .map((d: any) => ({
          id: d.id,
          name: d.name,
          size: d.file_size ?? 0,
          type: d.task_type || 'dataset',
          uploadedAt: d.created_at || new Date().toISOString(),
          hasFile: !!d.file_path,
          taskType: d.task_type,
        })))
    } catch (err) {
      console.error('Failed to load files:', err)
    } finally {
      setLoadingAssets(false)
    }
  }

  // ── Upload helper ───────────────────────────────────────────────────────────

  const uploadFileWithProgress = async (
    url: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    const userId = getUserId()

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) onProgress((ev.loaded / ev.total) * 100)
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(`Upload failed: ${xhr.status}`))
      })
      xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
      xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')))
      xhr.open('POST', url)
      xhr.setRequestHeader('user-id', userId)
      xhr.timeout = 600000
      xhr.send(formData)
    })
  }

  // ── Model upload ─────────────────────────────────────────────────────────────

  const createModel = async (data: any) => {
    return fetchWithAuth('/models/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setModelUploading(true)
    setUploadProgress(0)

    try {
      const model = await createModel({
        name: file.name.replace(/\.(h5|keras|pt|pth|onnx|pkl)$/i, ''),
        task_type: 'other',
        is_public: false,
        version: '1.0.0',
        tags: [],
      })

      setUploadProgress(5)
      await uploadFileWithProgress(`${API_BASE_URL}/models/${model.id}/upload`, file, (pct) =>
        setUploadProgress(5 + pct * 0.95)
      )

      notify(`Model "${file.name}" uploaded!`)
      if (modelFileRef.current) modelFileRef.current.value = ''
      await loadUploadedFiles()
    } catch (err: any) {
      notify(err.message || 'Model upload failed', 'error')
    } finally {
      setModelUploading(false)
      setUploadProgress(0)
    }
  }

  // ── Compatibility check ──────────────────────────────────────────────────────

  const runCompatibilityCheck = async () => {
    if (!selectedModel || !selectedDataset) return

    setCheckingCompatibility(true)
    setCompatibility(null)

    try {
      const issues: string[] = []
      const warnings: string[] = []

      if (!selectedModel.hasFile) {
        issues.push('Selected model has no uploaded file yet.')
      }
      if (!selectedDataset.hasFile) {
        issues.push('Selected dataset has no uploaded file yet.')
      }

      if (selectedModel.modelType === 'sklearn' && selectedDataset.type !== 'csv') {
        warnings.push('scikit-learn models typically work best with CSV datasets.')
      }

      if (selectedModel.modelType === 'unknown' && selectedModel.type === 'pkl') {
        warnings.push('Model type is unknown but appears to be a pickle file. It will be evaluated as scikit-learn.')
      }

      if (selectedModel.size > 500 * 1024 * 1024) {
        warnings.push('Model file is larger than 500MB — evaluation may take longer.')
      }
      if (selectedDataset.size > 1024 * 1024 * 1024) {
        warnings.push('Dataset is larger than 1GB — preprocessing may take longer.')
      }

      setCompatibility({
        compatible: issues.length === 0,
        issues,
        warnings,
      })
    } catch (err) {
      console.error('Compatibility check failed:', err)
    } finally {
      setCheckingCompatibility(false)
    }
  }

  // ── Evaluation job ───────────────────────────────────────────────────────────

  const evaluateModel = async (modelId: string, datasetId: string, config: any) => {
    return fetchWithAuth('/evaluations/', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId, dataset_id: datasetId, config }),
    })
  }

  const getEvaluationStatus = async (evaluationId: string) => {
    return fetchWithAuth(`/evaluations/${evaluationId}`)
  }

  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    activeEvaluationIdRef.current = null
  }

  const startPolling = (evaluationId: string) => {
    clearPolling()
    activeEvaluationIdRef.current = evaluationId

    pollIntervalRef.current = setInterval(async () => {
      if (activeEvaluationIdRef.current !== evaluationId) return

      try {
        const data = await getEvaluationStatus(evaluationId)

        if (data.status === 'completed') {
          clearPolling()
          handleJobCompleted(data, evaluationId)
          return
        }
        if (data.status === 'failed') {
          clearPolling()
          handleJobFailed(data.error || 'Evaluation failed.')
          return
        }

        setJob(prev => ({
          ...prev,
          status: 'running',
          progress: Math.min(prev.progress + 5, 90),
          statusMessage: `Evaluating... (${Math.min(prev.progress + 5, 90)}%)`,
        }))
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 3000)
  }

  // ─── handleJobCompleted – now adds a notification ──────────────────────────

  const handleJobCompleted = (data: any, evaluationId: string) => {
    const result = data.results?.[0] || {}
    const topMetrics = data.metrics || {}
    const fullMetrics = result.full_metrics || result.metrics || topMetrics

    const isSeg = fullMetrics.is_segmentation === true ||
                  data.is_segmentation === true ||
                  result.is_segmentation === true ||
                  result.task_type === 'segmentation' ||
                  fullMetrics.task_type === 'segmentation' ||
                  topMetrics.is_segmentation === true

    const dicePerClass = fullMetrics.dice_per_class || topMetrics.dice_per_class || result.dice_per_class || null
    const iouPerClass = fullMetrics.iou_per_class || topMetrics.iou_per_class || result.iou_per_class || null
    const meanDice = fullMetrics.mean_dice ?? topMetrics.mean_dice ?? result.mean_dice ?? null
    const meanIoU = fullMetrics.mean_iou ?? topMetrics.mean_iou ?? result.mean_iou ?? null
    const numClasses = fullMetrics.num_classes ?? topMetrics.num_classes ?? result.num_classes ?? null
    const numSamples = fullMetrics.num_samples ?? topMetrics.num_samples ?? result.num_samples ?? null

    const evaluation = {
      id: evaluationId,
      modelId: selectedModel?.id || data.model_id || result.model_id || '',
      datasetId: selectedDataset?.id || data.dataset_id || result.dataset_id || '',
      modelName: selectedModel?.name || data.model_name || result.model_name || 'Unknown Model',
      datasetName: selectedDataset?.name || data.dataset_name || result.dataset_name || 'Unknown Dataset',
      modelType: selectedModel?.modelType || data.model_type || result.model_type || 'unknown',
      evaluationType: selectedModel?.evaluationType || data.evaluation_type || result.evaluation_type || 'real_unknown',
      status: 'completed',
      completedAt: data.completed_at || result.completed_at || new Date().toISOString(),
      is_segmentation: isSeg,
      task_type: isSeg ? 'segmentation' : 'classification',
      mean_dice: meanDice,
      mean_iou: meanIoU,
      dice_per_class: dicePerClass,
      iou_per_class: iouPerClass,
      num_classes: numClasses,
      num_samples: numSamples,
      metrics: {
        accuracy: fullMetrics.accuracy ?? result.accuracy ?? 0,
        precision: fullMetrics.precision ?? result.precision ?? 0,
        recall: fullMetrics.recall ?? result.recall ?? 0,
        f1Score: fullMetrics.f1_score ?? result.f1_score ?? 0,
        roc_auc: fullMetrics.roc_auc ?? result.auc_roc ?? null,
        confusion_matrix: fullMetrics.confusion_matrix ?? result.confusion_matrix ?? null,
        evaluationTime: fullMetrics.evaluation_time ?? result.evaluation_time ?? 0,
        num_samples: numSamples,
      },
    }

    setJob(prev => ({
      ...prev,
      status: 'completed',
      progress: 100,
      statusMessage: 'Evaluation complete!',
      result: evaluation,
    }))
    setCompletedEvaluation(evaluation)
    notify('Evaluation completed successfully!')

    // ── Add a notification ──────────────────────────────────────────────
    const accuracy = evaluation.metrics?.accuracy
      ? (evaluation.metrics.accuracy * 100).toFixed(1)
      : 'N/A'
    addNotification(
      `✅ Evaluation completed for "${evaluation.modelName}" – Accuracy: ${accuracy}%`,
      'success'
    )
    // ────────────────────────────────────────────────────────────────────

    onEvaluationComplete?.(evaluation)
    loadEvaluationHistory()
  }

  const handleJobFailed = (errorMsg: string) => {
    setJob(prev => ({ ...prev, status: 'failed', progress: 0, statusMessage: '', error: errorMsg }))
    notify(errorMsg, 'error')
    addNotification(`❌ Evaluation failed: ${errorMsg}`, 'error')
  }

  const handleEvaluate = async () => {
    if (!selectedModel || !selectedDataset) {
      notify('Please select both a model and a dataset', 'error')
      return
    }

    if (compatibility && !compatibility.compatible) {
      notify('Resolve compatibility issues before running an evaluation', 'error')
      return
    }

    setJob({
      jobId: '', status: 'submitting', progress: 5, statusMessage: 'Submitting evaluation job...',
    })
    setCompletedEvaluation(null)
    onEvaluationStart?.()

    try {
      const evaluation = await evaluateModel(selectedModel.id, selectedDataset.id, {
        test_split: 0.2,
        batch_size: 32,
      })

      const evaluationId = evaluation.id
      if (!evaluationId) throw new Error('No evaluation ID returned from server')

      setJob(prev => ({
        ...prev,
        jobId: evaluationId,
        status: 'running',
        progress: 10,
        statusMessage: 'Evaluation started...',
      }))

      startPolling(evaluationId)
    } catch (err: any) {
      console.error('Evaluation submission error:', err)
      handleJobFailed(err.message || 'Failed to start evaluation.')
    }
  }

  const handleReset = () => {
    clearPolling()
    setJob({ jobId: '', status: 'idle', progress: 0, statusMessage: '' })
    setCompletedEvaluation(null)
    setSelectedModel(null)
    setSelectedDataset(null)
    setCompatibility(null)
    setSelectedHistoryEval(null)
  }

  // ── Downloadable results ─────────────────────────────────────────────────────

  const handleDownloadJson = () => {
    const target = selectedHistoryEval || completedEvaluation
    if (!target) return
    downloadBlob(
      JSON.stringify(target, null, 2),
      `evaluation-${target.id}.json`,
      'application/json'
    )
  }

  const handleDownloadCsv = () => {
    const target = selectedHistoryEval || completedEvaluation
    if (!target) return
    downloadBlob(
      metricsToCsv(target),
      `evaluation-${target.id}.csv`,
      'text/csv'
    )
  }

  const handleDownloadPdf = async () => {
    const target = selectedHistoryEval || completedEvaluation
    if (!target) return
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      const m = target.metrics || {}

      let y = 20
      doc.setFontSize(18)
      doc.text('ỌJÀ AI — Evaluation Report', 14, y)
      y += 10

      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y)
      y += 8
      doc.text(`Evaluation ID: ${target.id}`, 14, y)
      y += 8
      doc.text(`Model: ${target.modelName}`, 14, y)
      y += 8
      doc.text(`Model Type: ${target.modelType || 'unknown'}`, 14, y)
      y += 8
      doc.text(`Dataset: ${target.datasetName}`, 14, y)
      y += 8
      if (target.is_segmentation) {
        doc.text(`Task: Segmentation`, 14, y)
        y += 8
        doc.text(`Mean Dice: ${(target.mean_dice * 100).toFixed(1)}%`, 14, y)
        y += 8
        doc.text(`Mean IoU: ${(target.mean_iou * 100).toFixed(1)}%`, 14, y)
        y += 8
      } else {
        doc.text(`Task: Classification`, 14, y)
        y += 8
      }
      doc.text(`Completed: ${new Date(target.completedAt).toLocaleString()}`, 14, y)
      y += 14

      doc.setFontSize(14)
      doc.text('Metrics', 14, y)
      y += 8
      doc.setFontSize(11)

      const metricRows: [string, any][] = [
        ['Accuracy', m.accuracy],
        ['Precision', m.precision],
        ['Recall', m.recall],
        ['F1 Score', m.f1Score],
        ['ROC AUC', m.roc_auc],
        ['Dice Score', m.dice_score],
        ['IoU', m.iou],
        ['Evaluation Time (s)', m.evaluationTime],
      ]

      for (const [label, value] of metricRows) {
        if (value === undefined || value === null) continue
        const display = typeof value === 'number'
          ? (value <= 1 && value >= 0 ? `${(value * 100).toFixed(2)}%` : value.toFixed(4))
          : String(value)
        doc.text(`${label}: ${display}`, 14, y)
        y += 7
      }

      if (m.confusion_matrix) {
        y += 6
        doc.setFontSize(14)
        doc.text('Confusion Matrix', 14, y)
        y += 8
        doc.setFontSize(10)
        for (const row of m.confusion_matrix as number[][]) {
          doc.text(row.join('   '), 14, y)
          y += 6
        }
      }

      doc.save(`evaluation-${target.id}.pdf`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      notify('PDF generation failed — is jspdf installed?', 'error')
    }
  }

  const isRunning = job.status === 'submitting' || job.status === 'running'
  const canEvaluate =
    !!selectedModel &&
    !!selectedDataset &&
    selectedModel.hasFile &&
    selectedDataset.hasFile &&
    !isRunning &&
    (!compatibility || compatibility.compatible)

  // ── Determine which evaluation to display ──────────────────────────────────

  const activeEvaluation = selectedHistoryEval || completedEvaluation

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center space-x-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {toast.type === 'error'
            ? <AlertCircle className="h-4 w-4 flex-shrink-0" />
            : <CheckCircle className="h-4 w-4 flex-shrink-0" />}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)}><X className="h-4 w-4 ml-1" /></button>
        </div>
      )}

      {/* How it works */}
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">How Model Evaluation Works</CardTitle>
              <CardDescription>Simple 3-step process to evaluate your ML models</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { n: 1, title: 'Upload / Select Model', desc: 'Choose your trained model file (.h5, .keras, .pt, .pkl, .onnx)' },
              { n: 2, title: 'Upload / Select Dataset', desc: 'Provide test data (CSV, Images, Medical imaging)' },
              { n: 3, title: 'Run & Get Metrics', desc: 'Receive comprehensive evaluation metrics — view, download as PDF, JSON, or CSV' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex items-start space-x-3 p-4 bg-white rounded-lg border border-gray-100">
                <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">{n}</div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
                  <p className="text-sm text-gray-600">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
            <h4 className="font-semibold mb-3 flex items-center">
              <Award className="h-4 w-4 mr-2 text-indigo-600" />
              What You'll Get
            </h4>
            <div className="flex flex-wrap gap-2">
              {['Accuracy', 'Precision', 'Recall', 'F1 Score', 'ROC AUC', 'Confusion Matrix'].map((label) => (
                <Badge key={label} variant="secondary" className="flex items-center">{label}</Badge>
              ))}
            </div>
          </div>

          <Accordion type="single" collapsible className="bg-white rounded-lg border border-gray-200">
            <AccordionItem value="formats">
              <AccordionTrigger className="px-4">
                <span className="flex items-center"><FileText className="h-4 w-4 mr-2" />Supported Formats</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h5 className="font-semibold text-sm mb-2">Models</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• .h5 (Keras)</li><li>• .keras (TensorFlow)</li>
                      <li>• .pt, .pth (PyTorch)</li><li>• .onnx (ONNX)</li><li>• .pkl (scikit-learn)</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold text-sm mb-2">Datasets</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• .csv (Tabular)</li><li>• .zip (Image collections)</li>
                      <li>• .jpg, .png (Images)</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-semibold text-sm mb-2">Medical Imaging</h5>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• .nii (NIfTI)</li><li>• .nii.gz (Compressed)</li>
                      <li>• .dcm (DICOM)</li><li>• .zip (Collections)</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Status bar with notification bell */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-3">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-medium">
                  {loadingAssets
                    ? 'Refreshing...'
                    : `${uploadedModels.length} model${uploadedModels.length !== 1 ? 's' : ''} · ${uploadedDatasets.length} dataset${uploadedDatasets.length !== 1 ? 's' : ''} loaded`}
                </p>
                <p className="text-xs text-gray-500">Local server · Clerk auth</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadUploadedFiles} disabled={loadingAssets}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingAssets ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              {/* Notification Bell */}
              <div ref={notificationRef} className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <Bell className="h-5 w-5 text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    <div className="p-3 border-b border-gray-200 flex justify-between items-center">
                      <span className="font-semibold text-sm">Notifications</span>
                      <div className="flex gap-2">
                        {unreadCount > 0 && (
                          <button onClick={markAllAsRead} className="text-xs text-indigo-600 hover:underline">
                            Mark all read
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button onClick={clearNotifications} className="text-xs text-red-500 hover:underline">
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500 text-center">No notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`p-3 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-2 ${
                            !n.read ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex-1">
                            <p className="text-sm text-gray-800">{n.message}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {n.timestamp.toLocaleTimeString()} · {n.timestamp.toLocaleDateString()}
                            </p>
                          </div>
                          {!n.read && (
                            <button
                              onClick={() => markAsRead(n.id)}
                              className="text-xs text-indigo-500 hover:underline flex-shrink-0"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main 3-panel layout (unchanged) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Model panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-base">
              <Brain className="h-5 w-5 text-indigo-600" />
              <span>Select Model</span>
            </CardTitle>
            <CardDescription>
              {uploadedModels.length > 0
                ? `${uploadedModels.length} model${uploadedModels.length !== 1 ? 's' : ''} available`
                : 'No models uploaded yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadedModels.length === 0 ? (
              <EmptyUploadPrompt
                icon={<Brain className="h-8 w-8" />}
                title="No models uploaded yet"
                description="Head to the Upload Model page to add your first trained model."
                buttonLabel="Go to Upload Model"
                onClick={() => onNavigate?.('upload-model')}
              />
            ) : (
              <>
                <div>
                  <input ref={modelFileRef} type="file" accept=".h5,.keras,.pt,.pth,.onnx,.pkl" onChange={handleModelUpload} className="hidden" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={modelUploading || isRunning}
                    onClick={() => onNavigate?.('upload-model')}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Another Model
                  </Button>
                  {modelUploading && (
                    <div className="mt-2">
                      <Progress value={uploadProgress} className="h-1.5" />
                      <p className="text-xs text-gray-400 mt-1 text-right">{Math.round(uploadProgress)}%</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {uploadedModels.map(model => {
                    const typeInfo = getModelTypeBadge(model.modelType)
                    return (
                      <button
                        key={model.id}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setSelectedModel(model)}
                        className={`w-full text-left p-3 border-2 rounded-lg transition-all text-sm ${
                          selectedModel?.id === model.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{model.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`text-xs px-1.5 py-0 ${typeInfo.color}`}>
                                <span className="flex items-center gap-1">
                                  {typeInfo.icon}
                                  {typeInfo.label}
                                </span>
                              </Badge>
                              <span className="text-xs text-gray-400">{formatFileSize(model.size)}</span>
                            </div>
                            {!model.hasFile && (
                              <p className="text-xs text-amber-600 mt-0.5">No file uploaded</p>
                            )}
                          </div>
                          {selectedModel?.id === model.id && (
                            <CheckCircle className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Dataset panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-base">
              <Database className="h-5 w-5 text-blue-600" />
              <span>Select Dataset</span>
            </CardTitle>
            <CardDescription>
              {uploadedDatasets.length > 0
                ? `${uploadedDatasets.length} dataset${uploadedDatasets.length !== 1 ? 's' : ''} available`
                : 'No datasets uploaded yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadedDatasets.length === 0 ? (
              <EmptyUploadPrompt
                icon={<Database className="h-8 w-8" />}
                title="No datasets uploaded yet"
                description="Head to the Upload Data page to add your first test dataset."
                buttonLabel="Go to Upload Data"
                onClick={() => onNavigate?.('upload-data')}
              />
            ) : (
              <>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={datasetUploading || isRunning}
                    onClick={() => onNavigate?.('upload-data')}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Another Dataset
                  </Button>
                  {datasetUploading && (
                    <div className="mt-2">
                      <Progress value={uploadProgress} className="h-1.5" />
                      <p className="text-xs text-gray-400 mt-1 text-right">{Math.round(uploadProgress)}%</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {uploadedDatasets.map(dataset => {
                    const typeInfo = getDatasetTypeBadge(dataset)
                    return (
                      <button
                        key={dataset.id}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setSelectedDataset(dataset)}
                        className={`w-full text-left p-3 border-2 rounded-lg transition-all text-sm ${
                          selectedDataset?.id === dataset.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{dataset.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`text-xs px-1.5 py-0 ${typeInfo.color}`}>
                                <span className="flex items-center gap-1">
                                  {typeInfo.icon}
                                  {typeInfo.label}
                                </span>
                              </Badge>
                              <span className="text-xs text-gray-400">{formatFileSize(dataset.size)}</span>
                            </div>
                            {!dataset.hasFile && (
                              <p className="text-xs text-amber-600 mt-0.5">No file uploaded</p>
                            )}
                          </div>
                          {selectedDataset?.id === dataset.id && (
                            <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Run panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-base">
              <Cpu className="h-5 w-5 text-green-600" />
              <span>Run Evaluation</span>
            </CardTitle>
            <CardDescription>Review selection and launch</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className={`flex items-center space-x-2 p-3 rounded-lg text-sm ${selectedModel ? 'bg-indigo-50 text-indigo-800' : 'bg-gray-50 text-gray-400'}`}>
                <Brain className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{selectedModel ? selectedModel.name : 'No model selected'}</span>
                {selectedModel?.modelType && (
                  <Badge className={`text-xs ml-auto ${getModelTypeBadge(selectedModel.modelType).color}`}>
                    {getModelTypeBadge(selectedModel.modelType).label}
                  </Badge>
                )}
              </div>
              <div className="flex justify-center">
                <ChevronRight className="h-4 w-4 text-gray-400 rotate-90" />
              </div>
              <div className={`flex items-center space-x-2 p-3 rounded-lg text-sm ${selectedDataset ? 'bg-blue-50 text-blue-800' : 'bg-gray-50 text-gray-400'}`}>
                <Database className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{selectedDataset ? selectedDataset.name : 'No dataset selected'}</span>
              </div>
            </div>

            {selectedModel?.modelType && selectedModel.modelType !== 'unknown' && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <span>Model detected as: <strong>{getModelTypeBadge(selectedModel.modelType).label}</strong></span>
                </div>
                <p className="text-xs text-green-600 mt-1">
                  Evaluation will use {selectedModel.evaluationType || 'real_unknown'}
                </p>
              </div>
            )}

            {selectedModel?.modelType === 'unknown' && selectedModel?.type === 'pkl' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  <span>Model type unknown, but will be evaluated as scikit-learn</span>
                </div>
              </div>
            )}

            {(checkingCompatibility || compatibility) && (
              <div className={`rounded-lg border p-3 text-sm space-y-2 ${
                checkingCompatibility
                  ? 'border-gray-200 bg-gray-50'
                  : compatibility?.compatible
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
              }`}>
                {checkingCompatibility ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Checking compatibility...</span>
                  </div>
                ) : (
                  <>
                    <div className={`flex items-center gap-2 font-medium ${
                      compatibility?.compatible ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {compatibility?.compatible
                        ? <ShieldCheck className="h-4 w-4" />
                        : <ShieldAlert className="h-4 w-4" />}
                      <span>{compatibility?.compatible ? 'Compatible' : 'Compatibility issues found'}</span>
                    </div>
                    {compatibility?.issues.map((issue, i) => (
                      <p key={`issue-${i}`} className="text-red-600 text-xs flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{issue}</span>
                      </p>
                    ))}
                    {compatibility?.warnings.map((warning, i) => (
                      <p key={`warn-${i}`} className="text-amber-600 text-xs flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span>{warning}</span>
                      </p>
                    ))}
                  </>
                )}
              </div>
            )}

            {isRunning && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{job.statusMessage}</span>
                  <span>{job.progress}%</span>
                </div>
                <Progress value={job.progress} className="h-2" />
                {job.jobId && (
                  <p className="text-xs text-gray-400 text-center">
                    Job ID: {job.jobId.substring(0, 12)}...
                  </p>
                )}
              </div>
            )}

            {job.status === 'failed' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{job.error}</AlertDescription>
              </Alert>
            )}

            {job.status === 'completed' && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 text-xs">Evaluation completed!</AlertDescription>
              </Alert>
            )}

            {(job.status === 'idle' || job.status === 'failed') && (
              <Button className="w-full" onClick={handleEvaluate} disabled={!canEvaluate}>
                <Play className="h-4 w-4 mr-2" />Run Evaluation
              </Button>
            )}
            {isRunning && (
              <Button className="w-full" variant="outline" onClick={() => {}}>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />Evaluating...
              </Button>
            )}
            {job.status === 'completed' && (
              <Button className="w-full" variant="outline" onClick={handleReset}>
                <RefreshCw className="h-4 w-4 mr-2" />Run Another
              </Button>
            )}

            {job.status === 'idle' && uploadedModels.length === 0 && (
              <button onClick={() => onNavigate?.('upload-model')} className="w-full text-xs text-indigo-500 hover:text-indigo-700 flex items-center justify-center gap-1">
                Upload a model first <ArrowRight className="h-3 w-3" />
              </button>
            )}
            {job.status === 'idle' && uploadedDatasets.length === 0 && (
              <button onClick={() => onNavigate?.('upload-data')} className="w-full text-xs text-blue-500 hover:text-blue-700 flex items-center justify-center gap-1">
                Upload a dataset first <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {activeEvaluation && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-green-600" />
              <span>Evaluation Results</span>
              {activeEvaluation.modelType && (
                <Badge className={getModelTypeBadge(activeEvaluation.modelType).color}>
                  {getModelTypeBadge(activeEvaluation.modelType).label}
                </Badge>
              )}
              {activeEvaluation.is_segmentation && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  Segmentation
                </Badge>
              )}
              {selectedHistoryEval && (
                <Badge variant="outline" className="text-xs bg-gray-100">
                  History view
                </Badge>
              )}
            </h3>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleDownloadJson}>
                <FileJson className="h-4 w-4 mr-1" />JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadCsv}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4 mr-1" />PDF Report
              </Button>
              {selectedHistoryEval && (
                <Button variant="outline" size="sm" onClick={() => setSelectedHistoryEval(null)}>
                  <X className="h-4 w-4 mr-1" />Close History
                </Button>
              )}
              {!selectedHistoryEval && job.status === 'completed' && (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RefreshCw className="h-4 w-4 mr-1" />New Evaluation
                </Button>
              )}
            </div>
          </div>
          <EvaluationResults evaluation={activeEvaluation} />
        </div>
      )}

      {/* ─── COLLAPSIBLE EVALUATION HISTORY ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <History className="h-5 w-5 text-indigo-600" />
              <CardTitle>Evaluation History</CardTitle>
              <Badge variant="secondary">{history.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              {historyExpanded && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search by model or dataset..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 w-48 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={loadEvaluationHistory} disabled={loadingHistory}>
                    <RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryExpanded(prev => !prev)}
                className="flex items-center gap-1"
              >
                {historyExpanded ? (
                  <>Collapse <ChevronDown className="h-4 w-4" /></>
                ) : (
                  <>Expand <ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
          {!historyExpanded && (
            <CardDescription>
              {history.length} completed evaluations. Click "Expand" to view the full list.
            </CardDescription>
          )}
          {historyExpanded && (
            <CardDescription>Click any row to view detailed results</CardDescription>
          )}
        </CardHeader>
        {historyExpanded && (
          <CardContent>
            {loadingHistory ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                {searchQuery ? 'No evaluations match your search.' : 'No completed evaluations yet. Run your first evaluation using the panel above.'}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200">
                      <tr className="text-left text-gray-500">
                        <th className="py-2 px-3 font-medium">Model</th>
                        <th className="py-2 px-3 font-medium">Dataset</th>
                        <th className="py-2 px-3 font-medium">Accuracy</th>
                        <th className="py-2 px-3 font-medium">F1</th>
                        <th className="py-2 px-3 font-medium">Samples</th>
                        <th className="py-2 px-3 font-medium">Type</th>
                        <th className="py-2 px-3 font-medium">Date</th>
                        <th className="py-2 px-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item) => {
                        const isSelected = selectedHistoryEval?.id === item.id
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                              isSelected ? 'bg-indigo-50' : ''
                            }`}
                            onClick={() => handleViewHistoryItem(item)}
                          >
                            <td className="py-2 px-3 font-medium text-gray-800">{item.modelName}</td>
                            <td className="py-2 px-3 text-gray-600">{item.datasetName}</td>
                            <td className="py-2 px-3">{(item.metrics.accuracy * 100).toFixed(1)}%</td>
                            <td className="py-2 px-3">{(item.metrics.f1Score * 100).toFixed(1)}%</td>
                            <td className="py-2 px-3 text-xs text-gray-500">{item.num_samples ?? 'N/A'}</td>
                            <td className="py-2 px-3">
                              <Badge variant={item.is_segmentation ? 'default' : 'secondary'} className={item.is_segmentation ? 'bg-purple-100 text-purple-700 border-purple-200' : ''}>
                                {item.is_segmentation ? 'Seg' : 'Cls'}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-gray-500 text-xs">{formatDate(item.completedAt)}</td>
                            <td className="py-2 px-3">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                View
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-gray-500">
                      Showing {(page - 1) * itemsPerPage + 1} – {Math.min(page * itemsPerPage, filteredHistory.length)} of {filteredHistory.length}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}