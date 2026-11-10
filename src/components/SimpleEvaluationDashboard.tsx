// components/SimpleEvaluationDashboard.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { Separator } from './ui/separator'
import { Alert, AlertDescription } from './ui/alert'
import { 
  BarChart3, 
  Brain, 
  Database, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  TrendingUp,
  MessageSquare,
  Star,
  Eye,
  Download,
  Calendar
} from 'lucide-react'
import { useWorker } from '../hooks/useWorker'
import { ModelReviews } from './ModelReviews'

interface User {
  id: string
  email: string
  name?: string
}

interface Model {
  id: string
  name: string
  type: string
  framework: string
  size: string
  uploadedAt: string
}

interface Dataset {
  id: string
  name: string
  type: string
  size: string
  uploadedAt: string
}

interface Evaluation {
  id: string
  modelId: string
  datasetId: string
  modelName: string
  datasetName: string
  status: string
  metrics?: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
    confusion_matrix?: number[][]
    evaluationTime?: number
  }
  completedAt: string
}

interface SimpleEvaluationDashboardProps {
  user: User
  showOnlyResults?: boolean
  hideResults?: boolean
  evaluationInProgress?: boolean
  onEvaluationComplete?: (results?: any) => void
  onEvaluationStart?: () => void
}

export function SimpleEvaluationDashboard({ 
  user, 
  showOnlyResults = false, 
  hideResults = false, 
  evaluationInProgress = false, 
  onEvaluationComplete, 
  onEvaluationStart 
}: SimpleEvaluationDashboardProps) {
  const { fetchWithAuth } = useWorker()
  
  const [models, setModels] = useState<Model[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null)
  const [showModelReviews, setShowModelReviews] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [user])

  useEffect(() => {
    if (evaluationInProgress) {
      const pollInterval = setInterval(() => {
        loadDashboardData()
      }, 2000)

      return () => clearInterval(pollInterval)
    }
  }, [evaluationInProgress])

  useEffect(() => {
    if (evaluationInProgress && evaluations.length > 0 && onEvaluationComplete) {
      const latestEvaluation = evaluations[0]
      if (latestEvaluation && latestEvaluation.completedAt) {
        setTimeout(() => {
          onEvaluationComplete(latestEvaluation)
        }, 1000)
      }
    }
  }, [evaluations, evaluationInProgress, onEvaluationComplete])

  const loadDashboardData = async () => {
    try {
      const [modelsData, datasetsData, evaluationsData] = await Promise.all([
        fetchWithAuth('/models').catch(() => ({ models: [] })),
        fetchWithAuth('/datasets').catch(() => ({ datasets: [] })),
        fetchWithAuth('/evaluations/my').catch(() => ({ evaluations: [] }))
      ])

      setModels(modelsData.models || [])
      setDatasets(datasetsData.datasets || [])
      
      const evaluationsArray = evaluationsData.evaluations || []
      console.log('Loaded evaluations:', evaluationsArray)
      const sanitizedEvaluations = evaluationsArray.map((evaluation: any) => ({
        ...evaluation,
        metrics: evaluation.metrics || null
      }))
      setEvaluations(sanitizedEvaluations)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const runEvaluation = async () => {
    if (!selectedModel || !selectedDataset) {
      setError('Please select both a model and dataset')
      return
    }

    setEvaluating(true)
    setError('')

    if (onEvaluationStart) {
      onEvaluationStart()
    }

    try {
      const data = await fetchWithAuth('/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          modelId: selectedModel.id,
          datasetId: selectedDataset.id,
          config: { testSplit: 0.2, batchSize: 32 }
        })
      })

      if (data.evaluation) {
        setEvaluations(prev => [data.evaluation, ...prev])
        setSelectedEvaluation(data.evaluation)
        setSelectedModel(null)
        setSelectedDataset(null)
      } else if (data.evaluationId) {
        // Start polling for results
        const pollInterval = setInterval(async () => {
          try {
            const statusData = await fetchWithAuth(`/status/${data.evaluationId}`)
            if (statusData.status === 'completed') {
              clearInterval(pollInterval)
              const completedEval = {
                id: statusData.id,
                modelId: selectedModel.id,
                datasetId: selectedDataset.id,
                modelName: selectedModel.name,
                datasetName: selectedDataset.name,
                status: 'completed',
                metrics: statusData.metrics,
                completedAt: statusData.completed_at || new Date().toISOString()
              }
              setEvaluations(prev => [completedEval, ...prev])
              setSelectedEvaluation(completedEval)
              setSelectedModel(null)
              setSelectedDataset(null)
              if (onEvaluationComplete) onEvaluationComplete(completedEval)
            }
          } catch (err) {
            console.error('Polling error:', err)
          }
        }, 2000)
        
        // Stop polling after 2 minutes
        setTimeout(() => clearInterval(pollInterval), 120000)
      }
    } catch (error) {
      console.error('Error running evaluation:', error)
      setError('Failed to run evaluation. Please try again.')
    } finally {
      setEvaluating(false)
    }
  }

  const formatMetric = (value: number) => {
    return (value * 100).toFixed(1) + '%'
  }

  const getMetricColor = (value: number) => {
    if (value >= 0.9) return 'text-green-600'
    if (value >= 0.8) return 'text-blue-600'
    if (value >= 0.7) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Brain className="h-12 w-12 mx-auto mb-4 animate-pulse text-indigo-600" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const safeEvaluations = evaluations?.filter(e => e && typeof e === 'object') || []

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Models</p>
                <p className="text-2xl font-semibold text-indigo-600">{models.length}</p>
              </div>
              <Brain className="h-8 w-8 text-indigo-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Datasets</p>
                <p className="text-2xl font-semibold text-blue-600">{datasets.length}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Evaluations</p>
                <p className="text-2xl font-semibold text-green-600">{safeEvaluations.length}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Accuracy</p>
                <p className="text-2xl font-semibold text-purple-600">
                  {(() => {
                    const validEvaluations = safeEvaluations.filter(e => e.metrics && typeof e.metrics.accuracy === 'number')
                    return validEvaluations.length > 0
                      ? formatMetric(validEvaluations.reduce((sum, e) => sum + e.metrics.accuracy, 0) / validEvaluations.length)
                      : '0.0%'
                  })()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evaluation Progress Indicator */}
      {evaluationInProgress && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-blue-700">
              <Clock className="h-5 w-5 animate-pulse" />
              <span>Evaluation in Progress</span>
            </CardTitle>
            <CardDescription className="text-blue-600">
              Your model evaluation is being processed. Results will appear below shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Progress value={75} className="h-2" />
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <CheckCircle className="h-4 w-4" />
                <span>Model and dataset validated</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <CheckCircle className="h-4 w-4" />
                <span>Evaluation pipeline initialized</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <Clock className="h-4 w-4 animate-pulse" />
                <span>Computing performance metrics...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showOnlyResults && (
        <>
          {/* Quick Evaluation */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Evaluation</CardTitle>
              <CardDescription>Select a model and dataset to run evaluation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Select Model</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {models.length === 0 ? (
                      <p className="text-sm text-gray-500">No models uploaded yet</p>
                    ) : (
                      models.map((model) => (
                        <div
                          key={model.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedModel?.id === model.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setSelectedModel(model)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{model.name}</p>
                              <p className="text-sm text-gray-600">{model.type} • {model.framework}</p>
                            </div>
                            <Badge variant="secondary">{model.size}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Select Dataset</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {datasets.length === 0 ? (
                      <p className="text-sm text-gray-500">No datasets uploaded yet</p>
                    ) : (
                      datasets.map((dataset) => (
                        <div
                          key={dataset.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedDataset?.id === dataset.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setSelectedDataset(dataset)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{dataset.name}</p>
                              <p className="text-sm text-gray-600">{dataset.type}</p>
                            </div>
                            <Badge variant="secondary">{dataset.size}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={runEvaluation}
                  disabled={!selectedModel || !selectedDataset || evaluating}
                  className="min-w-32"
                >
                  {evaluating ? (
                    <>
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Run Evaluation
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Recent Evaluations */}
      {!hideResults && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Evaluations</CardTitle>
            <CardDescription>View your model evaluation results and performance metrics</CardDescription>
            {safeEvaluations.length > 0 && (
              <Alert className="border-blue-200 bg-blue-50 mt-2">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800 text-sm">
                  <strong>Note:</strong> Results use enhanced simulation based on your actual model and dataset characteristics. 
                  See the "About" tab for technical details and future real evaluation plans.
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            {safeEvaluations.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-4">No evaluations completed yet</p>
                {!showOnlyResults && (
                  <p className="text-sm text-gray-500">Run your first evaluation using the form above</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {safeEvaluations
                  .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                  .map((evaluation) => (
                    <div key={evaluation.id}>
                      <Card className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="font-semibold text-lg">{evaluation.modelName}</h3>
                              <p className="text-sm text-gray-600">Dataset: {evaluation.datasetName}</p>
                              <div className="flex items-center mt-2 text-sm text-gray-500">
                                <Calendar className="h-4 w-4 mr-1" />
                                {new Date(evaluation.completedAt).toLocaleDateString()}
                                {evaluation.metrics && evaluation.metrics.evaluationTime && (
                                  <>
                                    <span className="mx-2">•</span>
                                    <Clock className="h-4 w-4 mr-1" />
                                    {evaluation.metrics.evaluationTime}s
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge 
                                variant="secondary" 
                                className="bg-blue-100 text-blue-800"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Enhanced Simulation
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowModelReviews(showModelReviews === evaluation.modelName ? null : evaluation.modelName)}
                              >
                                <MessageSquare className="h-4 w-4 mr-1" />
                                Reviews
                              </Button>
                            </div>
                          </div>

                          {evaluation.metrics ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="text-center">
                                <p className="text-sm text-gray-600">Accuracy</p>
                                <p className={`text-xl font-semibold ${getMetricColor(evaluation.metrics.accuracy)}`}>
                                  {formatMetric(evaluation.metrics.accuracy)}
                                </p>
                                <Progress 
                                  value={evaluation.metrics.accuracy * 100} 
                                  className="mt-2 h-2"
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-sm text-gray-600">Precision</p>
                                <p className={`text-xl font-semibold ${getMetricColor(evaluation.metrics.precision)}`}>
                                  {formatMetric(evaluation.metrics.precision)}
                                </p>
                                <Progress 
                                  value={evaluation.metrics.precision * 100} 
                                  className="mt-2 h-2"
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-sm text-gray-600">Recall</p>
                                <p className={`text-xl font-semibold ${getMetricColor(evaluation.metrics.recall)}`}>
                                  {formatMetric(evaluation.metrics.recall)}
                                </p>
                                <Progress 
                                  value={evaluation.metrics.recall * 100} 
                                  className="mt-2 h-2"
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-sm text-gray-600">F1-Score</p>
                                <p className={`text-xl font-semibold ${getMetricColor(evaluation.metrics.f1Score)}`}>
                                  {formatMetric(evaluation.metrics.f1Score)}
                                </p>
                                <Progress 
                                  value={evaluation.metrics.f1Score * 100} 
                                  className="mt-2 h-2"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-gray-500">
                              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                              <p>Evaluation metrics not available</p>
                            </div>
                          )}

                          <div className="flex justify-between items-center text-sm text-gray-500">
                            <div className="flex flex-col space-y-1">
                              <span>Evaluation ID: {evaluation.id.slice(-8)}</span>
                            </div>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              View Details
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Model Reviews Section */}
                      {showModelReviews === evaluation.modelName && (
                        <div className="mt-4 ml-4">
                          <ModelReviews 
                            user={user} 
                            modelName={evaluation.modelName}
                            modelType={evaluation.modelName}
                            onReviewAdded={() => {}}
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Model Performance Summary */}
      {!hideResults && safeEvaluations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
            <CardDescription>Overall statistics across all evaluations</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const evaluationsWithMetrics = safeEvaluations.filter(e => e.metrics && e.metrics.accuracy !== undefined)
              if (evaluationsWithMetrics.length === 0) {
                return (
                  <div className="text-center py-4 text-gray-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>No evaluation metrics available for summary</p>
                  </div>
                )
              }
              
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Best Accuracy</p>
                    <p className="text-2xl font-semibold text-green-600">
                      {formatMetric(Math.max(...evaluationsWithMetrics.map(e => e.metrics.accuracy)))}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Avg F1-Score</p>
                    <p className="text-2xl font-semibold text-blue-600">
                      {formatMetric(evaluationsWithMetrics.reduce((sum, e) => sum + e.metrics.f1Score, 0) / evaluationsWithMetrics.length)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Total Eval Time</p>
                    <p className="text-2xl font-semibold text-purple-600">
                      {Math.round(evaluationsWithMetrics.reduce((sum, e) => sum + (e.metrics.evaluationTime || 0), 0))}s
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Success Rate</p>
                    <p className="text-2xl font-semibold text-indigo-600">
                      {Math.round((evaluationsWithMetrics.length / safeEvaluations.length) * 100)}%
                    </p>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  )
}