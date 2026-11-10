// components/AdvancedMetricsVisualization.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Alert, AlertDescription } from './ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from './ui/command'
import { Progress } from './ui/progress'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell, ComposedChart,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts'
import { 
  TrendingUp, BarChart3, Activity, Zap, 
  Target, Eye, RefreshCw, AlertTriangle, Loader2,
  Box, Code2, Github, Trash2, XCircle, CheckCircle, ChevronDown,
  Layers, GitCompare, Brain, Clock, AlertCircle, Database
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface EnhancedEvaluation {
  id: string
  modelName: string
  datasetName: string
  modelType?: string
  evaluationType?: string
  is_segmentation?: boolean
  task_type?: string
  mean_dice?: number
  mean_iou?: number
  dice_per_class?: Record<string, number>   // keys will be class names after mapping
  iou_per_class?: Record<string, number>
  num_classes?: number
  num_samples?: number
  modality?: string
  label_map?: Record<number, string>        // For class name mapping
  metrics: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
    rocAuc?: number
    confusionMatrix?: number[][]
    evaluationTime: number
    num_samples?: number
  }
  completedAt: string
  modelTask?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      icon: <Github className="h-3 w-3" />
    },
    unknown: { 
      label: 'Unknown', 
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <AlertTriangle className="h-3 w-3" />
    },
  }
  return types[modelType || 'unknown'] || types.unknown
}

function generateROCData(auc: number | undefined) {
  if (!auc || auc === 0) {
    return Array.from({length: 50}, (_, i) => ({
      fpr: i / 49,
      tpr: i / 49
    }))
  }
  return Array.from({length: 50}, (_, i) => {
    const fpr = i / 49
    const tpr = Math.min(1, Math.pow(fpr, 1 / (auc * 1.5 + 0.1)) * (1 - (1 - auc) * 0.5))
    return { fpr, tpr }
  })
}

function renderConfusionMatrix(matrix: number[][] | undefined) {
  if (!matrix || matrix.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>No confusion matrix data available</p>
        <p className="text-sm mt-2">Run an evaluation with a classification model to see this</p>
      </div>
    )
  }

  const maxVal = Math.max(...matrix.flat())
  
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 border rounded-lg">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actual \ Predicted
            </th>
            {matrix[0].map((_, idx) => (
              <th key={idx} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Class {idx}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {matrix.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 bg-gray-50">
                Class {rowIdx}
              </td>
              {row.map((value, colIdx) => {
                const intensity = maxVal > 0 ? (value / maxVal) * 100 : 0
                const isCorrect = rowIdx === colIdx
                const bgColor = isCorrect 
                  ? `rgba(34, 197, 94, ${Math.max(0.1, intensity / 100)})`
                  : `rgba(239, 68, 68, ${Math.max(0.1, intensity / 100)})`
                return (
                  <td 
                    key={colIdx} 
                    className="px-6 py-4 whitespace-nowrap text-center text-sm"
                    style={{ backgroundColor: bgColor }}
                  >
                    <span className={`font-medium ${value > maxVal * 0.3 ? 'text-white' : 'text-gray-700'}`}>
                      {value}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Confirmation Modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  modelName 
}: { 
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  modelName: string
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Evaluation?</h3>
          <p className="text-sm text-gray-500 mb-6">
            Are you sure you want to delete the evaluation for "<strong>{modelName}</strong>"? 
            This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdvancedMetricsVisualization({ user }: { user: User }) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const [evaluations, setEvaluations] = useState<EnhancedEvaluation[]>([])
  const [selectedEvaluation, setSelectedEvaluation] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [evaluationToDelete, setEvaluationToDelete] = useState<EnhancedEvaluation | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const getUserId = (): string => {
    return user?.clerk_id || user?.id || 'user_3EZsvPiHEIur8Kol77tLBNCBDMo'
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

  useEffect(() => {
    if (user?.id) {
      loadEvaluations()
    }
  }, [user])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Helper to transform class names using label_map
  const transformClassNames = (
    metrics: Record<string, number> | null | undefined,
    labelMap: Record<number, string> | null | undefined
  ): Record<string, number> => {
    if (!metrics) return {}
    const result: Record<string, number> = {}
    for (const [key, value] of Object.entries(metrics)) {
      // Try to parse key as integer
      const numKey = parseInt(key)
      if (!isNaN(numKey) && labelMap && labelMap[numKey]) {
        result[labelMap[numKey]] = value
      } else {
        // Check if key matches "Class X"
        const match = key.match(/^Class\s+(\d+)$/)
        if (match && labelMap && labelMap[parseInt(match[1])]) {
          result[labelMap[parseInt(match[1])]] = value
        } else {
          // Keep as is
          result[key] = value
        }
      }
    }
    return result
  }

  const loadEvaluations = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data = await fetchWithAuth('/evaluations/')
      const evaluationsList = Array.isArray(data) ? data : (data.evaluations || [])
      
      console.log('📊 Found evaluations for Analytics:', evaluationsList.length)
      
      const enhancedEvals = evaluationsList
        .filter((e: any) => e.status === 'completed')
        .map((evaluation: any) => {
          const result = evaluation.results?.[0] || {}
          const fullMetrics = result.full_metrics || result.metrics || evaluation.metrics || {}
          
          // Extract label_schema and modality
          const labelSchema = fullMetrics.label_schema || evaluation.label_schema || null
          let labelMap: Record<number, string> | null = null
          if (labelSchema && typeof labelSchema === 'object') {
            const map = labelSchema.label_map || labelSchema
            if (typeof map === 'object') {
              labelMap = {}
              for (const [k, v] of Object.entries(map)) {
                labelMap[parseInt(k)] = String(v)
              }
            }
          }
          const modality = fullMetrics.modality || evaluation.modality || null

          const isSeg = 
            fullMetrics.is_segmentation === true ||
            evaluation.is_segmentation === true ||
            result.is_segmentation === true ||
            result.task_type === 'segmentation' ||
            fullMetrics.task_type === 'segmentation' ||
            (fullMetrics.dice_per_class && Object.keys(fullMetrics.dice_per_class).length > 0)

          // Extract raw dice and iou, then transform using labelMap
          let rawDice = fullMetrics.dice_per_class ?? evaluation.dice_per_class ?? result.dice_per_class ?? null
          let rawIou = fullMetrics.iou_per_class ?? evaluation.iou_per_class ?? result.iou_per_class ?? null

          // Transform class names if we have a labelMap
          let dicePerClass = null
          let iouPerClass = null
          if (rawDice && typeof rawDice === 'object') {
            dicePerClass = transformClassNames(rawDice as Record<string, number>, labelMap)
          }
          if (rawIou && typeof rawIou === 'object') {
            iouPerClass = transformClassNames(rawIou as Record<string, number>, labelMap)
          }

          const meanDice = fullMetrics.mean_dice ?? evaluation.mean_dice ?? result.mean_dice ?? null
          const meanIoU = fullMetrics.mean_iou ?? evaluation.mean_iou ?? result.mean_iou ?? null
          const numClasses = fullMetrics.num_classes ?? evaluation.num_classes ?? result.num_classes ?? null
          const numSamples = fullMetrics.num_samples ?? evaluation.num_samples ?? result.num_samples ?? null

          return {
            id: evaluation.id,
            modelName: evaluation.model_name || evaluation.model?.name || 'Unknown Model',
            datasetName: evaluation.dataset_name || evaluation.dataset?.name || 'Unknown Dataset',
            modelType: evaluation.model_type || evaluation.model?.feature_config?.model_type || 'unknown',
            evaluationType: evaluation.evaluation_type || evaluation.model?.feature_config?.evaluation_type || 'real_unknown',
            is_segmentation: isSeg,
            task_type: isSeg ? 'segmentation' : 'classification',
            mean_dice: meanDice,
            mean_iou: meanIoU,
            dice_per_class: dicePerClass,
            iou_per_class: iouPerClass,
            num_classes: numClasses,
            num_samples: numSamples,
            modality: modality,
            label_map: labelMap,
            metrics: {
              accuracy: fullMetrics.accuracy ?? result.accuracy ?? 0,
              precision: fullMetrics.precision ?? result.precision ?? 0,
              recall: fullMetrics.recall ?? result.recall ?? 0,
              f1Score: fullMetrics.f1_score ?? result.f1_score ?? 0,
              rocAuc: fullMetrics.roc_auc ?? result.auc_roc ?? null,
              confusionMatrix: fullMetrics.confusion_matrix ?? result.confusion_matrix ?? null,
              evaluationTime: fullMetrics.evaluation_time ?? result.evaluation_time ?? 0,
              num_samples: numSamples,
            },
            completedAt: evaluation.completed_at || evaluation.created_at || new Date().toISOString(),
            modelTask: evaluation.model?.task_type || 'classification'
          }
        })
      
      setEvaluations(enhancedEvals)
      
      if (enhancedEvals.length > 0 && !selectedEvaluation) {
        setSelectedEvaluation(enhancedEvals[0].id)
      }
      
      if (enhancedEvals.length === 0) {
        setError('No completed evaluations found. Run some evaluations first!')
      }
      
    } catch (error: any) {
      console.error('Error loading evaluations:', error)
      setError(error.message || 'Failed to load evaluations')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEvaluation = async () => {
    if (!evaluationToDelete) return
    
    setDeleting(true)
    setShowDeleteModal(false)
    
    try {
      await fetchWithAuth(`/evaluations/${evaluationToDelete.id}`, {
        method: 'DELETE',
      })
      
      setToast({
        message: `Evaluation "${evaluationToDelete.modelName}" deleted successfully`,
        type: 'success'
      })
      
      setEvaluations(prev => prev.filter(e => e.id !== evaluationToDelete.id))
      
      if (selectedEvaluation === evaluationToDelete.id) {
        const remaining = evaluations.filter(e => e.id !== evaluationToDelete.id)
        setSelectedEvaluation(remaining.length > 0 ? remaining[0].id : '')
      }
      
      setEvaluationToDelete(null)
    } catch (error: any) {
      setToast({
        message: error.message || 'Failed to delete evaluation',
        type: 'error'
      })
    } finally {
      setDeleting(false)
    }
  }

  const filteredEvaluations = evaluations.filter(e =>
    e.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.datasetName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const currentEvaluation = evaluations.find(e => e.id === selectedEvaluation)

  const selectedDisplay = currentEvaluation ? (
    <div className="flex items-center justify-between w-full">
      <div className="flex flex-col">
        <span className="font-medium">{currentEvaluation.modelName}</span>
        <span className="text-xs text-gray-500">{currentEvaluation.datasetName}</span>
      </div>
      <div className="flex items-center gap-2">
        {currentEvaluation.modality && (
          <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-xs">
            <Database className="h-3 w-3 mr-1" />
            {currentEvaluation.modality}
          </Badge>
        )}
        <Badge className={currentEvaluation.is_segmentation ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
          {currentEvaluation.is_segmentation ? 'Seg' : 'Cls'}
        </Badge>
      </div>
    </div>
  ) : (
    <span className="text-gray-400">Choose an evaluation...</span>
  )

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Advanced Metrics</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-indigo-600" />
              <p className="text-gray-600">Loading evaluation results...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || evaluations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Advanced Metrics</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error || 'No evaluations found. Run some model evaluations first to see advanced metrics.'}
            </AlertDescription>
          </Alert>
          <Button 
            className="mt-4 w-full" 
            onClick={() => window.location.href = '/evaluate'}
          >
            Go to Evaluation
          </Button>
        </CardContent>
      </Card>
    )
  }

  const modelTypeInfo = currentEvaluation?.modelType 
    ? getModelTypeBadge(currentEvaluation.modelType) 
    : getModelTypeBadge('unknown')
  const isSeg = currentEvaluation?.is_segmentation || false

  // ─── Segmentation Metrics ──────────────────────────────────────────────────
  const renderSegmentationMetrics = () => {
    if (!currentEvaluation) return null
    const diceData = currentEvaluation.dice_per_class
      ? Object.entries(currentEvaluation.dice_per_class).map(([name, value]) => ({
          name: name,
          Dice: value * 100
        }))
      : []
    const iouData = currentEvaluation.iou_per_class
      ? Object.entries(currentEvaluation.iou_per_class).map(([name, value]) => ({
          name: name,
          IoU: value * 100
        }))
      : []
    const meanDice = currentEvaluation.mean_dice !== undefined ? (currentEvaluation.mean_dice * 100) : 0
    const meanIoU = currentEvaluation.mean_iou !== undefined ? (currentEvaluation.mean_iou * 100) : 0
    const numClasses = currentEvaluation.num_classes || Object.keys(currentEvaluation.dice_per_class || {}).length
    const numSamples = currentEvaluation.num_samples ?? currentEvaluation.metrics?.num_samples ?? 'N/A'
    const modality = currentEvaluation.modality || null

    // ── Performance distribution ──────────────────────────────────────────────
    const diceValues = Object.values(currentEvaluation.dice_per_class || {}).map(v => v * 100)
    const excellent = diceValues.filter(v => v >= 80).length
    const good = diceValues.filter(v => v >= 60 && v < 80).length
    const fair = diceValues.filter(v => v >= 40 && v < 60).length
    const poor = diceValues.filter(v => v < 40).length

    const distData = [
      { name: 'Excellent (≥80%)', value: excellent, color: '#4ade80' },
      { name: 'Good (60-79%)', value: good, color: '#facc15' },
      { name: 'Fair (40-59%)', value: fair, color: '#f97316' },
      { name: 'Poor (<40%)', value: poor, color: '#ef4444' },
    ]

    const colors = ['#4ade80', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

    return (
      <div className="space-y-6">
        {/* Modality badge if present */}
        {modality && (
          <div className="flex justify-end">
            <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-sm">
              <Database className="h-4 w-4 mr-1" />
              {modality}
            </Badge>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 border rounded-lg bg-green-50 border-green-200">
            <Target className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-sm text-gray-600">Mean Dice (foreground)</p>
            <p className="text-2xl font-semibold text-green-600">{meanDice.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">Excludes background</p>
          </div>
          <div className="text-center p-4 border rounded-lg bg-blue-50 border-blue-200">
            <Layers className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-600">Mean IoU (foreground)</p>
            <p className="text-2xl font-semibold text-blue-600">{meanIoU.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">Excludes background</p>
          </div>
          <div className="text-center p-4 border rounded-lg bg-purple-50 border-purple-200">
            <Box className="h-6 w-6 mx-auto mb-2 text-purple-600" />
            <p className="text-sm text-gray-600">Number of Classes</p>
            <p className="text-2xl font-semibold text-purple-600">{numClasses}</p>
          </div>
          <div className="text-center p-4 border rounded-lg bg-indigo-50 border-indigo-200">
            <Activity className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
            <p className="text-sm text-gray-600">Test Samples</p>
            <p className="text-2xl font-semibold text-indigo-600">{numSamples === 'N/A' ? 'N/A' : numSamples}</p>
          </div>
        </div>

        {/* If sample size is small, show a warning */}
        {numSamples !== 'N/A' && numSamples < 5 && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 text-sm">
              ⚠️ Only {numSamples} test sample(s). Metrics may be unreliable. Consider using a larger test set.
            </AlertDescription>
          </Alert>
        )}

        {/* Gauge-style progress for Mean Dice and Mean IoU */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Mean Dice (foreground)</span>
              <span className="text-sm font-semibold text-green-600">{meanDice.toFixed(1)}%</span>
            </div>
            <Progress value={meanDice} className="h-4" indicatorClassName="bg-green-500" />
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Mean IoU (foreground)</span>
              <span className="text-sm font-semibold text-blue-600">{meanIoU.toFixed(1)}%</span>
            </div>
            <Progress value={meanIoU} className="h-4" indicatorClassName="bg-blue-500" />
          </div>
        </div>

        {/* Dice per class chart */}
        {diceData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Dice Score per Class</CardTitle>
              <CardDescription>Higher is better – measures overlap between predicted and ground truth masks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={diceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
                    <Bar dataKey="Dice" fill="#4ade80" radius={[8, 8, 0, 0]}>
                      {diceData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* IoU per class chart */}
        {iouData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>IoU per Class</CardTitle>
              <CardDescription>Intersection over Union – measures how much the predicted mask overlaps with the ground truth</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={iouData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
                    <Bar dataKey="IoU" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                      {iouData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={colors[(index + 3) % colors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performance Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Distribution</CardTitle>
            <CardDescription>How many classes fall into each performance tier (based on Dice)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {distData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Time‑series trend if multiple evaluations */}
        {evaluations.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                <span>Performance Trend Over Time</span>
              </CardTitle>
              <CardDescription>How Mean Dice and Mean IoU have evolved across evaluations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evaluations
                    .filter(e => e.mean_dice !== null || e.mean_iou !== null)
                    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
                    .map(e => ({
                      name: e.modelName.length > 15 ? e.modelName.slice(0, 15) + '...' : e.modelName,
                      'Mean Dice': e.mean_dice ? e.mean_dice * 100 : 0,
                      'Mean IoU': e.mean_iou ? e.mean_iou * 100 : 0,
                      date: new Date(e.completedAt).toLocaleDateString()
                    }))
                  }>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip labelFormatter={(label) => `${label}`} />
                    <Legend />
                    <Line type="monotone" dataKey="Mean Dice" stroke="#4ade80" strokeWidth={2} />
                    <Line type="monotone" dataKey="Mean IoU" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ─── Classification Metrics ──────────────────────────────────────────────────
  const renderClassificationMetrics = () => {
    if (!currentEvaluation) return null
    const acc = (currentEvaluation.metrics.accuracy || 0) * 100
    const prec = (currentEvaluation.metrics.precision || 0) * 100
    const rec = (currentEvaluation.metrics.recall || 0) * 100
    const f1 = (currentEvaluation.metrics.f1Score || 0) * 100
    const roc = currentEvaluation.metrics.rocAuc ? (currentEvaluation.metrics.rocAuc * 100).toFixed(1) : 'N/A'
    const numSamples = currentEvaluation.num_samples ?? currentEvaluation.metrics?.num_samples ?? 'N/A'
    const modality = currentEvaluation.modality || null

    const radarData = [
      { subject: 'Accuracy', value: acc },
      { subject: 'Precision', value: prec },
      { subject: 'Recall', value: rec },
      { subject: 'F1-Score', value: f1 },
    ]

    // ── Gauge progress bars for classification metrics ──────────────────────
    const metricGauges = [
      { label: 'Accuracy', value: acc, color: 'bg-blue-500' },
      { label: 'Precision', value: prec, color: 'bg-green-500' },
      { label: 'Recall', value: rec, color: 'bg-yellow-500' },
      { label: 'F1-Score', value: f1, color: 'bg-purple-500' },
    ]

    return (
      <div className="space-y-6">
        {/* Modality badge if present */}
        {modality && (
          <div className="flex justify-end">
            <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-sm">
              <Database className="h-4 w-4 mr-1" />
              {modality}
            </Badge>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-4 border rounded-lg">
            <Target className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-600">Accuracy</p>
            <p className="text-xl font-semibold text-blue-600">{acc.toFixed(1)}%</p>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Zap className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-sm text-gray-600">Precision</p>
            <p className="text-xl font-semibold text-green-600">{prec.toFixed(1)}%</p>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Activity className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
            <p className="text-sm text-gray-600">Recall</p>
            <p className="text-xl font-semibold text-yellow-600">{rec.toFixed(1)}%</p>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <TrendingUp className="h-6 w-6 mx-auto mb-2 text-purple-600" />
            <p className="text-sm text-gray-600">F1‑Score</p>
            <p className="text-xl font-semibold text-purple-600">{f1.toFixed(1)}%</p>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Eye className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
            <p className="text-sm text-gray-600">ROC AUC</p>
            <p className="text-xl font-semibold text-indigo-600">{roc === 'N/A' ? 'N/A' : roc + '%'}</p>
          </div>
        </div>

        {/* Display test samples */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg bg-indigo-50 border-indigo-200">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              <span className="text-sm font-medium text-gray-700">Test Samples</span>
            </div>
            <p className="text-2xl font-semibold text-indigo-600 mt-1">{numSamples === 'N/A' ? 'N/A' : numSamples}</p>
          </div>
          <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Evaluation Time</span>
            </div>
            <p className="text-2xl font-semibold text-blue-600 mt-1">{currentEvaluation.metrics.evaluationTime.toFixed(2)}s</p>
          </div>
        </div>

        {/* Gauge progress bars for classification */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metricGauges.map((gauge) => (
            <div key={gauge.label} className="p-4 border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">{gauge.label}</span>
                <span className="text-sm font-semibold">{gauge.value.toFixed(1)}%</span>
              </div>
              <Progress value={gauge.value} className="h-4" indicatorClassName={gauge.color} />
            </div>
          ))}
        </div>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Radar</CardTitle>
            <CardDescription>Multi‑metric performance overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis domain={[0, 100]} />
                  <Radar name="Score" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Confusion Matrix */}
        {currentEvaluation.metrics.confusionMatrix && currentEvaluation.metrics.confusionMatrix.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Confusion Matrix</CardTitle>
              <CardDescription>Actual vs Predicted class breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {renderConfusionMatrix(currentEvaluation.metrics.confusionMatrix)}
            </CardContent>
          </Card>
        )}

        {/* ROC Curve */}
        {currentEvaluation.metrics.rocAuc && (
          <Card>
            <CardHeader>
              <CardTitle>ROC Curve</CardTitle>
              <CardDescription>Receiver Operating Characteristic curve</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={generateROCData(currentEvaluation.metrics.rocAuc)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fpr" label={{ value: 'False Positive Rate', position: 'bottom' }} domain={[0, 1]} />
                    <YAxis label={{ value: 'True Positive Rate', angle: -90, position: 'left' }} domain={[0, 1]} />
                    <Tooltip formatter={(value: any) => value.toFixed(3)} />
                    <Legend />
                    <Line type="monotone" dataKey="tpr" stroke="#8884d8" strokeWidth={2} name="ROC Curve" dot={false} />
                    <Line data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]} dataKey="tpr" stroke="#ccc" strokeDasharray="5 5" name="Random Classifier" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Time‑series trend if multiple evaluations */}
        {evaluations.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                <span>Performance Trend Over Time</span>
              </CardTitle>
              <CardDescription>How Accuracy and F1-Score have evolved across evaluations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evaluations
                    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
                    .map(e => ({
                      name: e.modelName.length > 15 ? e.modelName.slice(0, 15) + '...' : e.modelName,
                      Accuracy: e.metrics.accuracy * 100,
                      'F1-Score': e.metrics.f1Score * 100,
                      date: new Date(e.completedAt).toLocaleDateString()
                    }))
                  }>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip labelFormatter={(label) => `${label}`} />
                    <Legend />
                    <Line type="monotone" dataKey="Accuracy" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="F1-Score" stroke="#8b5cf6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // ─── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } animate-in slide-in-from-right duration-300`}>
          {toast.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Delete Modal */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setEvaluationToDelete(null)
        }}
        onConfirm={handleDeleteEvaluation}
        modelName={evaluationToDelete?.modelName || ''}
      />

      {/* Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Advanced Metrics Visualization</span>
          </CardTitle>
          <CardDescription>
            Comprehensive analysis of model performance with detailed charts and insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 w-full">
              <label className="text-sm font-medium mb-2 block">Select Evaluation</label>
              <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-left font-normal">
                    {selectedDisplay}
                    <ChevronDown className="h-4 w-4 ml-2 opacity-50 flex-shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[400px] max-w-[90vw]">
                  <Command>
                    <CommandInput placeholder="Search by model or dataset..." value={searchQuery} onValueChange={setSearchQuery} />
                    <CommandList>
                      <CommandEmpty>No evaluations found.</CommandEmpty>
                      {filteredEvaluations.map(evaluation => (
                        <CommandItem
                          key={evaluation.id}
                          onSelect={() => {
                            setSelectedEvaluation(evaluation.id)
                            setDropdownOpen(false)
                            setSearchQuery('')
                          }}
                          className="flex items-center justify-between"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{evaluation.modelName}</span>
                            <span className="text-xs text-gray-500">{evaluation.datasetName}</span>
                            <span className="text-xs text-gray-400">Samples: {evaluation.num_samples ?? 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {evaluation.modality && (
                              <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-xs">
                                <Database className="h-3 w-3 mr-1" />
                                {evaluation.modality}
                              </Badge>
                            )}
                            <Badge className={evaluation.is_segmentation ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                              {evaluation.is_segmentation ? 'Seg' : 'Cls'}
                            </Badge>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadEvaluations} className="flex-shrink-0">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {currentEvaluation && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    setEvaluationToDelete(currentEvaluation)
                    setShowDeleteModal(true)
                  }}
                  disabled={deleting}
                  className="flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Main Content ───────────────────────────────────────────────────── */}

      {currentEvaluation && (
        <>
          {/* Performance Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Performance Summary</CardTitle>
                  <CardDescription>
                    {currentEvaluation.modelName} on {currentEvaluation.datasetName}
                    <span className="ml-2">
                      <Badge className={currentEvaluation.is_segmentation ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                        {currentEvaluation.is_segmentation ? 'Segmentation' : 'Classification'}
                      </Badge>
                    </span>
                    {currentEvaluation.modality && (
                      <span className="ml-2">
                        <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200">
                          <Database className="h-3 w-3 mr-1" />
                          {currentEvaluation.modality}
                        </Badge>
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={modelTypeInfo.color}>
                    <span className="flex items-center space-x-1">
                      {modelTypeInfo.icon}
                      <span>{modelTypeInfo.label}</span>
                    </span>
                  </Badge>
                  {currentEvaluation.evaluationType && (
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                      {currentEvaluation.evaluationType.replace('_', ' ').toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isSeg ? renderSegmentationMetrics() : renderClassificationMetrics()}
              
              <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span><span className="font-medium">Evaluation ID:</span> {currentEvaluation.id.slice(0, 8)}...</span>
                <span><span className="font-medium">Completed:</span> {new Date(currentEvaluation.completedAt).toLocaleString()}</span>
                <span><span className="font-medium">Evaluation Time:</span> {currentEvaluation.metrics.evaluationTime.toFixed(2)}s</span>
                <span><span className="font-medium">Test Samples:</span> {currentEvaluation.num_samples ?? 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for deeper analysis */}
          <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="overview">
            <div className="overflow-x-auto">
              <TabsList className="flex w-full min-w-max">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {!isSeg && <TabsTrigger value="roc">ROC Curve</TabsTrigger>}
                {!isSeg && <TabsTrigger value="confusion">Confusion Matrix</TabsTrigger>}
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                    <CardDescription>Visual comparison of all key metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isSeg ? (
                      <div className="text-center py-8 text-gray-500">
                        <Layers className="h-8 w-8 mx-auto mb-2" />
                        <p>Segmentation metrics are shown in the summary above</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[
                          { metric: 'Accuracy', value: currentEvaluation.metrics.accuracy * 100 },
                          { metric: 'Precision', value: currentEvaluation.metrics.precision * 100 },
                          { metric: 'Recall', value: currentEvaluation.metrics.recall * 100 },
                          { metric: 'F1-Score', value: currentEvaluation.metrics.f1Score * 100 }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="metric" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
                          <Bar dataKey="value" fill="#8884d8" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Model Information</CardTitle>
                    <CardDescription>Details about this evaluation</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-gray-500 text-xs">Model</p>
                        <p className="font-medium truncate">{currentEvaluation.modelName}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-gray-500 text-xs">Dataset</p>
                        <p className="font-medium truncate">{currentEvaluation.datasetName}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-gray-500 text-xs">Model Type</p>
                        <p className="font-medium">{modelTypeInfo.label}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-gray-500 text-xs">Evaluation Type</p>
                        <p className="font-medium">{currentEvaluation.evaluationType || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg col-span-2">
                        <p className="text-gray-500 text-xs">Task</p>
                        <p className="font-medium">{isSeg ? 'Segmentation' : 'Classification'}</p>
                      </div>
                      {currentEvaluation.modality && (
                        <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200 col-span-2">
                          <p className="text-sm text-cyan-700">
                            <strong>Modality:</strong> {currentEvaluation.modality}
                          </p>
                        </div>
                      )}
                    </div>
                    {!isSeg && currentEvaluation.metrics.rocAuc && (
                      <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                        <p className="text-sm text-indigo-700">
                          <strong>ROC AUC Score:</strong> {(currentEvaluation.metrics.rocAuc * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {isSeg && currentEvaluation.mean_dice !== undefined && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm text-green-700">
                          <strong>Mean Dice (foreground):</strong> {(currentEvaluation.mean_dice * 100).toFixed(1)}% &nbsp;|&nbsp;
                          <strong>Mean IoU (foreground):</strong> {(currentEvaluation.mean_iou * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                      <p className="text-sm text-indigo-700">
                        <strong>Test Samples:</strong> {currentEvaluation.num_samples ?? 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {!isSeg && (
              <TabsContent value="roc">
                <Card>
                  <CardHeader>
                    <CardTitle>ROC Curve Analysis</CardTitle>
                    <CardDescription>
                      Receiver Operating Characteristic curve showing model's diagnostic ability
                      {currentEvaluation.metrics.rocAuc && (
                        <span className="ml-2 font-semibold text-indigo-600">
                          AUC: {(currentEvaluation.metrics.rocAuc * 100).toFixed(1)}%
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={generateROCData(currentEvaluation.metrics.rocAuc || undefined)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="fpr" label={{ value: 'False Positive Rate', position: 'bottom', offset: 0 }} domain={[0, 1]} />
                        <YAxis label={{ value: 'True Positive Rate', angle: -90, position: 'left' }} domain={[0, 1]} />
                        <Tooltip formatter={(value: any) => value.toFixed(3)} labelFormatter={(label: any) => `FPR: ${label.toFixed(3)}`} />
                        <Legend />
                        <Line type="monotone" dataKey="tpr" stroke="#8884d8" strokeWidth={2} name="ROC Curve" dot={false} />
                        <Line data={[{ fpr: 0, tpr: 0 }, { fpr: 1, tpr: 1 }]} dataKey="tpr" stroke="#ccc" strokeDasharray="5 5" name="Random Classifier" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    {!currentEvaluation.metrics.rocAuc && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-700">
                          💡 ROC AUC not available for this evaluation. Try running an evaluation with a model that supports probability predictions.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {!isSeg && (
              <TabsContent value="confusion">
                <Card>
                  <CardHeader>
                    <CardTitle>Confusion Matrix</CardTitle>
                    <CardDescription>Detailed prediction breakdown - Diagonal shows correct predictions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderConfusionMatrix(currentEvaluation.metrics.confusionMatrix)}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="details">
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Metrics</CardTitle>
                  <CardDescription>Comprehensive breakdown of all metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  {isSeg ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Mean Dice (foreground)</p>
                        <p className="text-2xl font-bold text-green-600">
                          {currentEvaluation.mean_dice !== undefined ? (currentEvaluation.mean_dice * 100).toFixed(2) + '%' : 'N/A'}
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Mean IoU (foreground)</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {currentEvaluation.mean_iou !== undefined ? (currentEvaluation.mean_iou * 100).toFixed(2) + '%' : 'N/A'}
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Number of Classes</p>
                        <p className="text-2xl font-bold text-purple-600">{currentEvaluation.num_classes || 0}</p>
                      </div>
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Test Samples</p>
                        <p className="text-2xl font-bold text-indigo-600">{currentEvaluation.num_samples ?? 'N/A'}</p>
                      </div>
                      {currentEvaluation.modality && (
                        <div className="p-4 border rounded-lg text-center col-span-2 bg-cyan-50 border-cyan-200">
                          <p className="text-sm text-gray-500">Modality</p>
                          <p className="text-2xl font-bold text-cyan-700">{currentEvaluation.modality}</p>
                        </div>
                      )}
                      <div className="p-4 border rounded-lg text-center col-span-2">
                        <p className="text-sm text-gray-500">Task Type</p>
                        <p className="text-2xl font-bold text-gray-800">Segmentation</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Accuracy</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {(currentEvaluation.metrics.accuracy * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Precision</p>
                        <p className="text-2xl font-bold text-green-600">
                          {(currentEvaluation.metrics.precision * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">Recall</p>
                        <p className="text-2xl font-bold text-yellow-600">
                          {(currentEvaluation.metrics.recall * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg text-center">
                        <p className="text-sm text-gray-500">F1-Score</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {(currentEvaluation.metrics.f1Score * 100).toFixed(2)}%
                        </p>
                      </div>
                      {currentEvaluation.modality && (
                        <div className="p-4 border rounded-lg text-center col-span-4 bg-cyan-50 border-cyan-200">
                          <p className="text-sm text-gray-500">Modality</p>
                          <p className="text-2xl font-bold text-cyan-700">{currentEvaluation.modality}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Evaluation Information</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      <div><span className="font-medium">Model:</span> {currentEvaluation.modelName}</div>
                      <div><span className="font-medium">Dataset:</span> {currentEvaluation.datasetName}</div>
                      <div><span className="font-medium">Type:</span> {modelTypeInfo.label}</div>
                      <div><span className="font-medium">Evaluation:</span> {currentEvaluation.evaluationType || 'N/A'}</div>
                      <div><span className="font-medium">Time:</span> {currentEvaluation.metrics.evaluationTime.toFixed(2)}s</div>
                      <div><span className="font-medium">Task:</span> {isSeg ? 'Segmentation' : 'Classification'}</div>
                      {!isSeg && currentEvaluation.metrics.rocAuc && (
                        <div><span className="font-medium">ROC AUC:</span> {(currentEvaluation.metrics.rocAuc * 100).toFixed(1)}%</div>
                      )}
                      {isSeg && currentEvaluation.mean_dice !== undefined && (
                        <div><span className="font-medium">Mean Dice (foreground):</span> {(currentEvaluation.mean_dice * 100).toFixed(1)}%</div>
                      )}
                      {isSeg && currentEvaluation.mean_iou !== undefined && (
                        <div><span className="font-medium">Mean IoU (foreground):</span> {(currentEvaluation.mean_iou * 100).toFixed(1)}%</div>
                      )}
                      <div><span className="font-medium">Test Samples:</span> {currentEvaluation.num_samples ?? 'N/A'}</div>
                      {currentEvaluation.modality && (
                        <div><span className="font-medium">Modality:</span> {currentEvaluation.modality}</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}