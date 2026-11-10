// components/ModelComparisonDashboard.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Alert, AlertDescription } from './ui/alert'
import { Separator } from './ui/separator'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { 
  TrendingUp, TrendingDown, Equal, Crown, Target, Zap, Clock, 
  Brain, Database, GitCompare, Filter, Download, RefreshCw,
  AlertCircle, Box, Code2, Cpu, BookOpen, Upload
} from 'lucide-react'
import { ModelDocumentation } from './ModelDocumentation'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface Evaluation {
  id: string
  modelId: string
  datasetId: string
  modelName: string
  datasetName: string
  status: string
  metrics: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
    rocAuc?: number
    evaluationTime: number
    confusionMatrix?: number[][]
    dice?: number      // 👈 NEW: segmentation metrics
    iou?: number
    meanDice?: number
  }
  completedAt: string
  evaluationType?: string
  modelType?: string
  is_segmentation?: boolean
}

interface ComparisonMetrics {
  metric: string
  model1: number
  model2: number
  winner: string
  difference: number
  percentageDiff: number
}

interface ModelData {
  id: string
  name: string
  evaluations: Evaluation[]
  modelType?: string
  is_imported?: boolean
  is_community_contribution?: boolean
}

const METRIC_COLORS = {
  accuracy: '#8884d8',
  precision: '#82ca9d',
  recall: '#ffc658',
  f1Score: '#ff7300',
  rocAuc: '#00ff00',
  dice: '#1a1a3e',
  iou: '#008080'
}

// ─── Model Type Badge Helper ─────────────────────────────────────────────────

function getModelTypeBadge(modelType?: string, isImported?: boolean, isCommunity?: boolean): { label: string; color: string; icon: React.ReactNode } {
  if (isImported) {
    return { 
      label: 'Imported', 
      color: 'bg-teal-100 text-teal-700 border-teal-200',
      icon: <Upload className="h-3 w-3" />
    }
  }
  if (isCommunity) {
    return { 
      label: 'Community', 
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      icon: <Users className="h-3 w-3" />
    }
  }
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
    unknown: { 
      label: 'Unknown', 
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <AlertCircle className="h-3 w-3" />
    },
  }
  return types[modelType || 'unknown'] || types.unknown
}

export function ModelComparisonDashboard({ user }: { user: User }) {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [selectedModel1, setSelectedModel1] = useState<string>('')
  const [selectedModel2, setSelectedModel2] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [comparisonResults, setComparisonResults] = useState<ComparisonMetrics[]>([])
  const [availableModels, setAvailableModels] = useState<ModelData[]>([])
  const [filterDataset, setFilterDataset] = useState<string>('all')
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showDocumentation, setShowDocumentation] = useState<string | null>(null)
  const [isSegmentationComparison, setIsSegmentationComparison] = useState(false)

  // ─── Persist selected models in localStorage ──────────────────────────────

  useEffect(() => {
    const saved = localStorage.getItem('comparison_selected_models')
    if (saved) {
      try {
        const { model1, model2 } = JSON.parse(saved)
        if (model1) setSelectedModel1(model1)
        if (model2) setSelectedModel2(model2)
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (selectedModel1 || selectedModel2) {
      localStorage.setItem('comparison_selected_models', JSON.stringify({
        model1: selectedModel1,
        model2: selectedModel2
      }))
    }
  }, [selectedModel1, selectedModel2])

  // ─── API Helpers ─────────────────────────────────────────────────────────────

  const getUserId = (): string => {
    const userId = user?.clerk_id || user?.id
    if (userId && userId !== 'local_user_1') {
      return userId
    }
    return 'user_3EZsvPiHEIur8Kol77tLBNCBDMo'
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

  useEffect(() => {
    loadEvaluations()
  }, [user])

  useEffect(() => {
    if (selectedModel1 && selectedModel2) {
      performComparison()
    }
  }, [selectedModel1, selectedModel2, filterDataset])

  // ─── Load Evaluations ────────────────────────────────────────────────────────

  const loadEvaluations = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data = await fetchWithAuth('/evaluations/')
      const evals = Array.isArray(data) ? data : []
      
      const processedEvals: Evaluation[] = evals
        .filter((e: any) => e.status === 'completed')
        .map((evaluation: any) => {
          const result = evaluation.results && evaluation.results.length > 0 
            ? evaluation.results[0] 
            : {}
          const fullMetrics = result.full_metrics || evaluation.metrics || {}
          
          const isSeg = fullMetrics.is_segmentation === true ||
                        evaluation.is_segmentation === true ||
                        result.is_segmentation === true ||
                        fullMetrics.task_type === 'segmentation'
          
          return {
            id: evaluation.id,
            modelId: evaluation.model_id,
            datasetId: evaluation.dataset_id,
            modelName: evaluation.model_name || 'Unknown Model',
            datasetName: evaluation.dataset_name || 'Unknown Dataset',
            status: evaluation.status,
            modelType: evaluation.model_type || 'unknown',
            evaluationType: evaluation.evaluation_type || 'real_unknown',
            is_segmentation: isSeg,
            metrics: {
              accuracy: result.accuracy || evaluation.metrics?.accuracy || 0,
              precision: result.precision || evaluation.metrics?.precision || 0,
              recall: result.recall || evaluation.metrics?.recall || 0,
              f1Score: result.f1_score || evaluation.metrics?.f1_score || 0,
              rocAuc: result.auc_roc || evaluation.metrics?.roc_auc || 0,
              evaluationTime: result.evaluation_time || evaluation.metrics?.evaluation_time || 0,
              confusionMatrix: result.confusion_matrix || evaluation.metrics?.confusion_matrix,
              dice: fullMetrics.dice_per_class?.mean_dice || fullMetrics.mean_dice || result.mean_dice || undefined,
              iou: fullMetrics.mean_iou || result.mean_iou || undefined,
              meanDice: fullMetrics.mean_dice_brats || fullMetrics.mean_dice || result.mean_dice || undefined
            },
            completedAt: evaluation.completed_at || evaluation.created_at
          }
        })
      
      setEvaluations(processedEvals)
      
      // Group evaluations by model
      const modelMap = new Map<string, ModelData>()
      processedEvals.forEach((evaluation: Evaluation) => {
        const key = `${evaluation.modelId}_${evaluation.modelName}`
        if (!modelMap.has(key)) {
          modelMap.set(key, {
            id: evaluation.modelId,
            name: evaluation.modelName,
            evaluations: [],
            modelType: evaluation.modelType,
            is_imported: evaluation.evaluationType?.includes('imported') || false,
            is_community_contribution: evaluation.evaluationType?.includes('community') || false
          })
        }
        modelMap.get(key)!.evaluations.push(evaluation)
      })
      
      const models = Array.from(modelMap.values())
      setAvailableModels(models)
      
      // Extract unique datasets
      const datasets = [...new Set(processedEvals.map((e: Evaluation) => e.datasetName))]
      setAvailableDatasets(datasets)
      
      // Auto-select first two models if available
      if (models.length >= 2) {
        if (!selectedModel1) setSelectedModel1(models[0].id)
        if (!selectedModel2) setSelectedModel2(models[1].id)
      }
      
    } catch (error: any) {
      console.error('Error loading evaluations:', error)
      setError(error.message || 'Failed to load evaluations')
    } finally {
      setLoading(false)
    }
  }

  // ─── Perform Comparison ──────────────────────────────────────────────────────

  const performComparison = async () => {
    if (!selectedModel1 || !selectedModel2) return
    
    setComparing(true)
    
    try {
      const model1Data = availableModels.find(m => m.id === selectedModel1)
      const model2Data = availableModels.find(m => m.id === selectedModel2)
      
      if (!model1Data || !model2Data) return
      
      let model1Evals = model1Data.evaluations
      let model2Evals = model2Data.evaluations
      
      if (filterDataset !== 'all') {
        model1Evals = model1Evals.filter(e => e.datasetName === filterDataset)
        model2Evals = model2Evals.filter(e => e.datasetName === filterDataset)
      }
      
      const model1Metrics = calculateAverageMetrics(model1Evals)
      const model2Metrics = calculateAverageMetrics(model2Evals)
      
      // Check if this is a segmentation comparison
      const isSeg = model1Evals.some(e => e.is_segmentation) || model2Evals.some(e => e.is_segmentation)
      setIsSegmentationComparison(isSeg)
      
      // Build comparison results dynamically
      const metricKeys = isSeg
        ? ['Mean Dice', 'Mean IoU']  // Segmentation metrics
        : ['Accuracy', 'Precision', 'Recall', 'F1-Score']
      
      const comparison: ComparisonMetrics[] = metricKeys.map(key => {
        const m1Key = isSeg ? (key === 'Mean Dice' ? 'meanDice' : 'iou') : key.toLowerCase()
        const val1 = key === 'Mean Dice' ? (model1Metrics.meanDice || 0) :
                     key === 'Mean IoU' ? (model1Metrics.iou || 0) :
                     model1Metrics[key.toLowerCase() as keyof typeof model1Metrics]
        const val2 = key === 'Mean Dice' ? (model2Metrics.meanDice || 0) :
                     key === 'Mean IoU' ? (model2Metrics.iou || 0) :
                     model2Metrics[key.toLowerCase() as keyof typeof model2Metrics]
        
        return {
          metric: key,
          model1: val1 || 0,
          model2: val2 || 0,
          winner: val1 > val2 ? model1Data.name : model2Data.name,
          difference: Math.abs(val1 - val2),
          percentageDiff: val1 > 0 ? Math.abs((val1 - val2) / val1 * 100) : 0
        }
      })
      
      setComparisonResults(comparison)
    } catch (error) {
      console.error('Error performing comparison:', error)
    } finally {
      setComparing(false)
    }
  }

  // ─── Helper Functions ────────────────────────────────────────────────────────

  const calculateAverageMetrics = (evals: Evaluation[]) => {
    if (evals.length === 0) {
      return { accuracy: 0, precision: 0, recall: 0, f1Score: 0, rocAuc: 0, evaluationTime: 0, meanDice: 0, iou: 0 }
    }
    
    const totals = evals.reduce((acc, evaluation) => ({
      accuracy: acc.accuracy + evaluation.metrics.accuracy,
      precision: acc.precision + evaluation.metrics.precision,
      recall: acc.recall + evaluation.metrics.recall,
      f1Score: acc.f1Score + evaluation.metrics.f1Score,
      rocAuc: acc.rocAuc + (evaluation.metrics.rocAuc || 0),
      evaluationTime: acc.evaluationTime + evaluation.metrics.evaluationTime,
      meanDice: acc.meanDice + (evaluation.metrics.meanDice || 0),
      iou: acc.iou + (evaluation.metrics.iou || 0)
    }), { accuracy: 0, precision: 0, recall: 0, f1Score: 0, rocAuc: 0, evaluationTime: 0, meanDice: 0, iou: 0 })
    
    const count = evals.length
    return {
      accuracy: totals.accuracy / count,
      precision: totals.precision / count,
      recall: totals.recall / count,
      f1Score: totals.f1Score / count,
      rocAuc: totals.rocAuc / count,
      evaluationTime: totals.evaluationTime / count,
      meanDice: totals.meanDice / count,
      iou: totals.iou / count
    }
  }

  const formatMetric = (value: number) => (value * 100).toFixed(1) + '%'

  const getComparisonIcon = (metric: ComparisonMetrics, modelName: string) => {
    if (metric.winner === modelName) return <Crown className="h-4 w-4 text-yellow-500" />
    if (metric.percentageDiff < 1) return <Equal className="h-4 w-4 text-gray-500" />
    return metric.model1 > metric.model2 ? 
      <TrendingUp className="h-4 w-4 text-green-500" /> : 
      <TrendingDown className="h-4 w-4 text-red-500" />
  }

  const generateRadarData = () => {
    if (comparisonResults.length === 0) return []
    
    const model1Name = availableModels.find(m => m.id === selectedModel1)?.name || 'Model 1'
    const model2Name = availableModels.find(m => m.id === selectedModel2)?.name || 'Model 2'
    
    return comparisonResults.map(metric => ({
      metric: metric.metric,
      [model1Name]: metric.model1 * 100,
      [model2Name]: metric.model2 * 100
    }))
  }

  // ─── Export Results ──────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (comparisonResults.length === 0) return
    let csv = 'Metric,Model 1,Model 2,Difference,Percentage Diff\n'
    comparisonResults.forEach(r => {
      csv += `${r.metric},${(r.model1*100).toFixed(1)}%,${(r.model2*100).toFixed(1)}%,${(r.difference*100).toFixed(1)}%,${r.percentageDiff.toFixed(1)}%\n`
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comparison_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <GitCompare className="h-5 w-5 text-indigo-600" />
            <span>Model Comparison</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-indigo-600" />
              <p className="text-gray-600">Loading evaluations...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <GitCompare className="h-5 w-5" />
            <span>Model Comparison</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={loadEvaluations}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (availableModels.length < 2) {
    return (
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-indigo-700">
            <GitCompare className="h-5 w-5" />
            <span>Model Comparison</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Database className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Models to Compare</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              You need at least 2 completed evaluations to compare models.
              <br />
              <span className="text-sm text-indigo-600">Run evaluations on different models in the Oja Models first.</span>
            </p>
            <Button 
              className="mt-6 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => window.location.href = '/models'}
            >
              Go to Oja Models
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <GitCompare className="h-5 w-5 text-indigo-600" />
            <span>Model Comparison</span>
          </CardTitle>
          <CardDescription>
            Compare performance metrics between different models
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">First Model</label>
              <Select value={selectedModel1} onValueChange={setSelectedModel1}>
                <SelectTrigger>
                  <SelectValue placeholder="Select first model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map(model => {
                    const typeInfo = getModelTypeBadge(model.modelType, model.is_imported, model.is_community_contribution)
                    return (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{model.name}</span>
                            <Badge className={typeInfo.color}>
                              <span className="flex items-center space-x-1">
                                {typeInfo.icon}
                                <span>{typeInfo.label}</span>
                              </span>
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">{model.evaluations.length} evaluations</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Second Model</label>
              <Select value={selectedModel2} onValueChange={setSelectedModel2}>
                <SelectTrigger>
                  <SelectValue placeholder="Select second model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.filter(m => m.id !== selectedModel1).map(model => {
                    const typeInfo = getModelTypeBadge(model.modelType, model.is_imported, model.is_community_contribution)
                    return (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{model.name}</span>
                            <Badge className={typeInfo.color}>
                              <span className="flex items-center space-x-1">
                                {typeInfo.icon}
                                <span>{typeInfo.label}</span>
                              </span>
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">{model.evaluations.length} evaluations</span>
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block flex items-center space-x-1">
                <Filter className="h-4 w-4" />
                <span>Filter by Dataset</span>
              </label>
              <Select value={filterDataset} onValueChange={setFilterDataset}>
                <SelectTrigger>
                  <SelectValue placeholder="All datasets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All datasets</SelectItem>
                  {availableDatasets.map(dataset => (
                    <SelectItem key={dataset} value={dataset}>{dataset}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Export Button */}
          {comparisonResults.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedModel1 && selectedModel2 && (
        <>
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="metrics">Detailed Metrics</TabsTrigger>
              <TabsTrigger value="radar">Radar Chart</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Comparison Summary</CardTitle>
                  {isSegmentationComparison && (
                    <CardDescription className="flex items-center gap-2">
                      <Badge className="bg-purple-100 text-purple-700">Segmentation Metrics</Badge>
                      <span className="text-sm">Mean Dice and IoU are shown</span>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {comparing ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 mr-2" />
                      <span>Analyzing models...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {comparisonResults.map((metric) => (
                        <div key={metric.metric} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            {getComparisonIcon(metric, availableModels.find(m => m.id === selectedModel1)?.name || '')}
                            <div>
                              <p className="font-medium">{metric.metric}</p>
                              <p className="text-sm text-gray-600">
                                {metric.percentageDiff.toFixed(1)}% difference
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-yellow-600 flex items-center">
                              <Crown className="h-4 w-4 mr-1" />
                              {metric.winner}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatMetric(Math.max(metric.model1, metric.model2))}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={comparisonResults}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric" />
                      <YAxis tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                      <Tooltip formatter={(value: any) => [`${(value * 100).toFixed(1)}%`, '']} />
                      <Legend />
                      <Bar 
                        dataKey="model1" 
                        name={availableModels.find(m => m.id === selectedModel1)?.name || 'Model 1'} 
                        fill="#8884d8" 
                      />
                      <Bar 
                        dataKey="model2" 
                        name={availableModels.find(m => m.id === selectedModel2)?.name || 'Model 2'} 
                        fill="#82ca9d" 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Metrics Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparisonResults.map((metric) => (
                      <div key={metric.metric} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium flex items-center space-x-2">
                            <Target className="h-4 w-4" />
                            <span>{metric.metric}</span>
                          </h4>
                          <Badge variant={metric.percentageDiff > 5 ? "destructive" : metric.percentageDiff > 1 ? "default" : "secondary"}>
                            {metric.percentageDiff.toFixed(1)}% diff
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`p-3 rounded-lg border-2 ${
                            metric.model1 > metric.model2 ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {availableModels.find(m => m.id === selectedModel1)?.name || 'Model 1'}
                              </span>
                              {metric.model1 > metric.model2 && <Crown className="h-4 w-4 text-yellow-500" />}
                            </div>
                            <p className="text-2xl font-bold mt-1">{formatMetric(metric.model1)}</p>
                          </div>
                          
                          <div className={`p-3 rounded-lg border-2 ${
                            metric.model2 > metric.model1 ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {availableModels.find(m => m.id === selectedModel2)?.name || 'Model 2'}
                              </span>
                              {metric.model2 > metric.model1 && <Crown className="h-4 w-4 text-yellow-500" />}
                            </div>
                            <p className="text-2xl font-bold mt-1">{formatMetric(metric.model2)}</p>
                          </div>
                        </div>
                        
                        <div className="mt-3 text-sm text-gray-600">
                          <p>Absolute difference: {formatMetric(metric.difference)}</p>
                          <p>Winner: <span className="font-medium text-yellow-600">{metric.winner}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="radar" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Radar Chart Comparison</CardTitle>
                  <CardDescription>
                    Visual representation of model performance across all metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <RadarChart data={generateRadarData()}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Radar 
                        name={availableModels.find(m => m.id === selectedModel1)?.name || 'Model 1'} 
                        dataKey={availableModels.find(m => m.id === selectedModel1)?.name || 'Model 1'} 
                        stroke="#8884d8" 
                        fill="#8884d8" 
                        fillOpacity={0.3} 
                      />
                      <Radar 
                        name={availableModels.find(m => m.id === selectedModel2)?.name || 'Model 2'} 
                        dataKey={availableModels.find(m => m.id === selectedModel2)?.name || 'Model 2'} 
                        stroke="#82ca9d" 
                        fill="#82ca9d" 
                        fillOpacity={0.3} 
                      />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Evaluation History</CardTitle>
                  <CardDescription>
                    Timeline of evaluations for both models
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[selectedModel1, selectedModel2].map((modelId) => {
                      const model = availableModels.find(m => m.id === modelId)
                      if (!model) return null
                      
                      const typeInfo = getModelTypeBadge(model.modelType, model.is_imported, model.is_community_contribution)
                      
                      return (
                        <div key={modelId} className="space-y-2">
                          <h4 className="font-medium flex items-center space-x-2">
                            <Brain className="h-4 w-4" />
                            <span>{model.name}</span>
                            <Badge className={typeInfo.color}>
                              <span className="flex items-center space-x-1">
                                {typeInfo.icon}
                                <span>{typeInfo.label}</span>
                              </span>
                            </Badge>
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {model.evaluations
                              .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                              .map((evaluation) => (
                              <div key={evaluation.id} className="p-3 border rounded-lg text-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium">{evaluation.datasetName}</span>
                                  <div className="flex items-center gap-2">
                                    {evaluation.is_segmentation && (
                                      <Badge variant="outline" className="text-xs bg-purple-50">Seg</Badge>
                                    )}
                                    <Badge variant="secondary">
                                      {evaluation.is_segmentation 
                                        ? formatMetric(evaluation.metrics.meanDice || 0)
                                        : formatMetric(evaluation.metrics.accuracy)}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                  {evaluation.is_segmentation ? (
                                    <>
                                      <span>Dice: {formatMetric(evaluation.metrics.meanDice || 0)}</span>
                                      <span>IoU: {formatMetric(evaluation.metrics.iou || 0)}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>Precision: {formatMetric(evaluation.metrics.precision)}</span>
                                      <span>Recall: {formatMetric(evaluation.metrics.recall)}</span>
                                      <span>F1: {formatMetric(evaluation.metrics.f1Score)}</span>
                                    </>
                                  )}
                                  <span className="flex items-center">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {evaluation.metrics.evaluationTime.toFixed(2)}s
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(evaluation.completedAt).toLocaleDateString()}
                                </p>
                              </div>
                            ))}
                          </div>
                          {model.evaluations.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">No evaluations found</p>
                          )}
                        </div>
                      )
                    })}
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