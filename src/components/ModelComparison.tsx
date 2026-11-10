// components/ModelComparison.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar, 
  Legend
} from 'recharts'
import { 
  TrendingUp, 
  Award, 
  Clock, 
  Database, 
  GitCompare, 
  Star,
  Package,
  Store,
  Brain,
  CheckCircle,
  AlertCircle,
  Info,
  Box,
  Code2,
  Cpu,
  Upload,
  Users
} from 'lucide-react'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface Evaluation {
  id: string
  modelId: string
  modelName: string
  datasetName: string
  modelType?: string
  evaluationType?: string
  metrics: {
    accuracy: number
    precision: number
    recall: number
    f1Score: number
    evaluationTime: number
    rocAuc?: number
    dice?: number      // 👈 NEW
    iou?: number
    meanDice?: number
    is_segmentation?: boolean
  }
  completedAt: string
  status: string
}

interface ModelComparisonProps {
  user: User
  evaluations: Evaluation[]
}

interface ComparisonGroup {
  datasetName: string
  evaluations: Evaluation[]
}

// ─── Model Type Badge Helper (extended) ─────────────────────────────────────

function getModelTypeBadge(
  modelType?: string,
  evaluationType?: string,
  modelId?: string
): { label: string; color: string; icon: React.ReactNode } {
  // Check if it's an imported model
  if (evaluationType?.includes('imported') || modelType === 'imported') {
    return { 
      label: 'Imported', 
      color: 'bg-teal-100 text-teal-700 border-teal-200',
      icon: <Upload className="h-3 w-3" />
    }
  }
  // Check if it's a community model
  if (evaluationType?.includes('community') || modelType === 'community') {
    return { 
      label: 'Community', 
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      icon: <Users className="h-3 w-3" />
    }
  }
  // Check if it's a user's own model (from uploaded models)
  if (modelId?.startsWith('user_') || modelType === 'user') {
    return { 
      label: 'Your Model', 
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: <Package className="h-3 w-3" />
    }
  }
  // Framework-specific badges
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
    }
  }
  return types[modelType || 'unknown'] || types.unknown
}

export function ModelComparison({ user, evaluations }: ModelComparisonProps) {
  const [selectedDataset, setSelectedDataset] = useState<string>('')
  const [comparisonData, setComparisonData] = useState<any[]>([])
  const [radarData, setRadarData] = useState<any[]>([])
  const [modelTypeMap, setModelTypeMap] = useState<Record<string, string>>({})
  const [isSegmentationComparison, setIsSegmentationComparison] = useState(false)

  // Group evaluations by dataset
  const groupedEvaluations = evaluations.reduce((groups: ComparisonGroup[], evaluation) => {
    const existingGroup = groups.find(group => group.datasetName === evaluation.datasetName)
    if (existingGroup) {
      existingGroup.evaluations.push(evaluation)
    } else {
      groups.push({
        datasetName: evaluation.datasetName,
        evaluations: [evaluation]
      })
    }
    return groups
  }, [])

  // Filter groups to only show those with multiple evaluations
  const comparableGroups = groupedEvaluations.filter(group => group.evaluations.length > 1)

  useEffect(() => {
    if (selectedDataset) {
      const group = comparableGroups.find(g => g.datasetName === selectedDataset)
      if (group) {
        generateComparisonData(group.evaluations)
      }
    } else if (comparableGroups.length > 0) {
      setSelectedDataset(comparableGroups[0].datasetName)
      generateComparisonData(comparableGroups[0].evaluations)
    }
  }, [selectedDataset, evaluations])

  const generateComparisonData = (evals: Evaluation[]) => {
    // Build model type map
    const typeMap: Record<string, string> = {}
    evals.forEach((evaluation) => {
      const isUserModel = evaluation.modelId.startsWith('user_') || evaluation.modelType === 'user'
      typeMap[evaluation.modelId] = isUserModel ? 'user' : (evaluation.modelType || 'marketplace')
    })
    setModelTypeMap(typeMap)

    // Check if any evaluation is segmentation
    const hasSegmentation = evals.some(e => e.metrics.is_segmentation === true || e.metrics.dice !== undefined)
    setIsSegmentationComparison(hasSegmentation)

    // Bar chart data with unique keys
    const barData = evals.map((evaluation, index) => {
      const base = {
        name: getModelDisplayName(evaluation),
        uniqueKey: getUniqueModelKey(evaluation, index),
        modelId: evaluation.modelId,
        modelType: evaluation.modelType || 'marketplace',
        evaluationTime: evaluation.metrics.evaluationTime
      }
      
      if (hasSegmentation) {
        return {
          ...base,
          dice: Math.round((evaluation.metrics.dice || evaluation.metrics.meanDice || 0) * 100) / 100,
          iou: Math.round((evaluation.metrics.iou || 0) * 100) / 100,
        }
      } else {
        return {
          ...base,
          accuracy: Math.round(evaluation.metrics.accuracy * 100) / 100,
          precision: Math.round(evaluation.metrics.precision * 100) / 100,
          recall: Math.round(evaluation.metrics.recall * 100) / 100,
          f1Score: Math.round(evaluation.metrics.f1Score * 100) / 100,
        }
      }
    })

    setComparisonData(barData)

    // Radar chart data - normalize metrics to 0-100 scale with unique keys
    const metricKeys = hasSegmentation ? ['dice', 'iou'] : ['accuracy', 'precision', 'recall', 'f1Score']
    const radarData = metricKeys.map(metric => {
      const dataPoint: any = { 
        metric: metric.charAt(0).toUpperCase() + metric.slice(1),
        metricKey: metric
      }
      
      evals.forEach((evaluation, index) => {
        const uniqueKey = getUniqueModelKey(evaluation, index)
        const value = metric === 'dice' 
          ? (evaluation.metrics.dice || evaluation.metrics.meanDice || 0)
          : metric === 'iou'
            ? (evaluation.metrics.iou || 0)
            : evaluation.metrics[metric as keyof typeof evaluation.metrics]
        dataPoint[uniqueKey] = Math.round((value || 0) * 100)
        if (!dataPoint._displayNames) dataPoint._displayNames = {}
        dataPoint._displayNames[uniqueKey] = getModelDisplayName(evaluation)
      })
      
      return dataPoint
    })

    setRadarData(radarData)
  }

  const getModelDisplayName = (evaluation: Evaluation) => {
    const maxLength = 15
    if (evaluation.modelName.length <= maxLength) {
      return evaluation.modelName
    }
    return evaluation.modelName.substring(0, maxLength) + '...'
  }

  const getUniqueModelKey = (evaluation: Evaluation, index: number) => {
    return `${evaluation.modelId}_${index}`
  }

  const getModelTypeIcon = (evaluation: Evaluation) => {
    if (evaluation.modelId?.startsWith('user_') || evaluation.modelType === 'user') return Package
    if (evaluation.evaluationType?.includes('imported')) return Upload
    if (evaluation.evaluationType?.includes('community')) return Users
    return Store
  }

  const getModelTypeLabel = (evaluation: Evaluation) => {
    if (evaluation.modelId?.startsWith('user_') || evaluation.modelType === 'user') return 'Your Model'
    if (evaluation.evaluationType?.includes('imported')) return 'Imported'
    if (evaluation.evaluationType?.includes('community')) return 'Community'
    return 'Marketplace'
  }

  const getBestPerformer = (metric: string) => {
    if (comparisonData.length === 0) return null
    
    return comparisonData.reduce((best, current) => {
      const currentValue = current[metric as keyof typeof current]
      const bestValue = best[metric as keyof typeof best]
      
      if (metric === 'evaluationTime') {
        return currentValue < bestValue ? current : best
      } else {
        return currentValue > bestValue ? current : best
      }
    })
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const formatMetric = (value: number) => (value * 100).toFixed(1) + '%'

  // ─── Render Empty State ─────────────────────────────────────────────────────

  if (comparableGroups.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Model Comparison</h2>
          <p className="text-gray-600 mb-6">Compare performance between models</p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No model comparisons available yet. To compare models:
            <br />• Select multiple models in the Browse tab
            <br />• Choose a dataset and run batch evaluation
            <br />• Results will appear here for side-by-side comparison
          </AlertDescription>
        </Alert>

        <Card className="text-center py-12">
          <CardContent>
            <GitCompare className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Start Your First Comparison</h3>
            <p className="text-gray-500 mb-6">
              Evaluate multiple models on the same dataset to see detailed performance comparisons
            </p>
            <div className="flex justify-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Store className="h-4 w-4" />
                <span>Marketplace Models</span>
              </div>
              <div className="text-gray-400">+</div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Package className="h-4 w-4" />
                <span>Your Models</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const selectedGroup = comparableGroups.find(g => g.datasetName === selectedDataset)
  const currentEvaluations = selectedGroup?.evaluations || []

  // ─── Render Comparison ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Model Comparison</h2>
          <p className="text-gray-600">
            {isSegmentationComparison 
              ? 'Segmentation metrics (Dice and IoU) are shown'
              : 'Performance analysis across models'
            }
          </p>
        </div>
        <Badge variant="secondary" className="flex items-center space-x-1">
          <GitCompare className="h-3 w-3" />
          <span>{comparableGroups.length} comparison{comparableGroups.length === 1 ? '' : 's'}</span>
        </Badge>
      </div>

      {/* Dataset Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Select Dataset for Comparison</span>
          </CardTitle>
          <CardDescription>
            Choose a dataset to view model performance comparisons
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {comparableGroups.map((group) => (
              <button
                key={group.datasetName}
                onClick={() => setSelectedDataset(group.datasetName)}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  selectedDataset === group.datasetName
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{group.datasetName}</h4>
                  <Badge variant="outline">{group.evaluations.length} models</Badge>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <Store className="h-3 w-3" />
                    <span>{group.evaluations.filter(e => !e.modelId.startsWith('user_') && e.modelType !== 'user' && !e.evaluationType?.includes('imported') && !e.evaluationType?.includes('community')).length}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Package className="h-3 w-3" />
                    <span>{group.evaluations.filter(e => e.modelId.startsWith('user_') || e.modelType === 'user').length}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {selectedDataset && currentEvaluations.length > 0 && (
        <>
          {/* Performance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {isSegmentationComparison ? (
              // Segmentation metrics
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Mean Dice</h4>
                      <Award className="h-4 w-4 text-yellow-500" />
                    </div>
                    {(() => {
                      const best = comparisonData.reduce((a, b) => a.dice > b.dice ? a : b)
                      return (
                        <>
                          <p className="text-2xl font-bold">{(best.dice * 100).toFixed(1)}%</p>
                          <div className="flex items-center space-x-1 mt-1">
                            <Brain className="h-3 w-3 text-gray-500" />
                            <p className="text-xs text-gray-600 truncate">{best.name}</p>
                          </div>
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Mean IoU</h4>
                      <Award className="h-4 w-4 text-yellow-500" />
                    </div>
                    {(() => {
                      const best = comparisonData.reduce((a, b) => a.iou > b.iou ? a : b)
                      return (
                        <>
                          <p className="text-2xl font-bold">{(best.iou * 100).toFixed(1)}%</p>
                          <div className="flex items-center space-x-1 mt-1">
                            <Brain className="h-3 w-3 text-gray-500" />
                            <p className="text-xs text-gray-600 truncate">{best.name}</p>
                          </div>
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Fastest</h4>
                      <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    {(() => {
                      const best = comparisonData.reduce((a, b) => a.evaluationTime < b.evaluationTime ? a : b)
                      return (
                        <>
                          <p className="text-2xl font-bold">{formatTime(best.evaluationTime)}</p>
                          <div className="flex items-center space-x-1 mt-1">
                            <Zap className="h-3 w-3 text-gray-500" />
                            <p className="text-xs text-gray-600 truncate">{best.name}</p>
                          </div>
                        </>
                      )
                    })()}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Models</h4>
                    </div>
                    <p className="text-2xl font-bold">{currentEvaluations.length}</p>
                    <p className="text-xs text-gray-500 mt-1">Compared on {selectedDataset}</p>
                  </CardContent>
                </Card>
              </>
            ) : (
              // Classification metrics
              ['accuracy', 'precision', 'recall', 'f1Score'].map((metric) => {
                const best = getBestPerformer(metric)
                const isUserModel = best && (best.modelType === 'user' || best.modelId?.startsWith('user_'))
                const Icon = isUserModel ? Package : Store
                
                return (
                  <Card key={metric}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium capitalize">{metric.replace(/([A-Z])/g, ' $1')}</h4>
                        <Award className="h-4 w-4 text-yellow-500" />
                      </div>
                      {best && (
                        <>
                          <p className="text-2xl font-bold">{(best[metric] * 100).toFixed(1)}%</p>
                          <div className="flex items-center space-x-1 mt-1">
                            <Icon className="h-3 w-3 text-gray-500" />
                            <p className="text-xs text-gray-600 truncate">{best.name}</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          {/* Model Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Performance Metrics</CardTitle>
              <CardDescription>
                Comprehensive comparison of all evaluated models on {selectedDataset}
                {isSegmentationComparison && ' (Dice and IoU shown for segmentation)'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Model</th>
                      <th className="text-left py-2">Type</th>
                      {isSegmentationComparison ? (
                        <>
                          <th className="text-center py-2">Dice</th>
                          <th className="text-center py-2">IoU</th>
                        </>
                      ) : (
                        <>
                          <th className="text-center py-2">Accuracy</th>
                          <th className="text-center py-2">Precision</th>
                          <th className="text-center py-2">Recall</th>
                          <th className="text-center py-2">F1-Score</th>
                        </>
                      )}
                      <th className="text-center py-2">Eval Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentEvaluations
                      .sort((a, b) => {
                        const aVal = isSegmentationComparison 
                          ? (a.metrics.dice || a.metrics.meanDice || 0)
                          : a.metrics.accuracy
                        const bVal = isSegmentationComparison
                          ? (b.metrics.dice || b.metrics.meanDice || 0)
                          : b.metrics.accuracy
                        return bVal - aVal
                      })
                      .map((evaluation, index) => {
                        const isUserModel = evaluation.modelId.startsWith('user_') || evaluation.modelType === 'user'
                        const typeInfo = getModelTypeBadge(
                          evaluation.modelType,
                          evaluation.evaluationType,
                          evaluation.modelId
                        )
                        const Icon = getModelTypeIcon(evaluation)
                        
                        return (
                          <tr key={evaluation.id} className="border-b hover:bg-gray-50">
                            <td className="py-3">
                              <div className="flex items-center space-x-2">
                                {index === 0 && <Star className="h-4 w-4 text-yellow-500" />}
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <p className="font-medium">{evaluation.modelName}</p>
                                    <Badge className={`text-xs ${typeInfo.color}`}>
                                      <span className="flex items-center space-x-1">
                                        {typeInfo.icon}
                                        <span>{typeInfo.label}</span>
                                      </span>
                                    </Badge>
                                    {evaluation.metrics.is_segmentation && (
                                      <Badge variant="outline" className="text-xs bg-purple-50">Seg</Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    Evaluated {new Date(evaluation.completedAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3">
                              <Badge 
                                variant={isUserModel ? "default" : "secondary"}
                                className="flex items-center space-x-1 w-fit"
                              >
                                <Icon className="h-3 w-3" />
                                <span>{getModelTypeLabel(evaluation)}</span>
                              </Badge>
                            </td>
                            {isSegmentationComparison ? (
                              <>
                                <td className="text-center py-3 font-medium">
                                  {formatMetric(evaluation.metrics.dice || evaluation.metrics.meanDice || 0)}
                                </td>
                                <td className="text-center py-3">
                                  {formatMetric(evaluation.metrics.iou || 0)}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="text-center py-3 font-medium">
                                  {formatMetric(evaluation.metrics.accuracy)}
                                </td>
                                <td className="text-center py-3">
                                  {formatMetric(evaluation.metrics.precision)}
                                </td>
                                <td className="text-center py-3">
                                  {formatMetric(evaluation.metrics.recall)}
                                </td>
                                <td className="text-center py-3">
                                  {formatMetric(evaluation.metrics.f1Score)}
                                </td>
                              </>
                            )}
                            <td className="text-center py-3">
                              {formatTime(evaluation.metrics.evaluationTime)}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {isSegmentationComparison ? 'Dice & IoU Comparison' : 'Performance Metrics Comparison'}
                </CardTitle>
                <CardDescription>
                  {isSegmentationComparison 
                    ? 'Bar chart showing Dice and IoU for each model'
                    : 'Bar chart showing key performance indicators'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                    <Tooltip 
                      formatter={(value: any, name: string) => [
                        `${(value * 100).toFixed(1)}%`, 
                        name.charAt(0).toUpperCase() + name.slice(1)
                      ]}
                      labelFormatter={(label) => `Model: ${label}`}
                    />
                    <Legend />
                    {isSegmentationComparison ? (
                      <>
                        <Bar dataKey="dice" fill="#8884d8" name="Dice" />
                        <Bar dataKey="iou" fill="#82ca9d" name="IoU" />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="accuracy" fill="#3b82f6" name="Accuracy" />
                        <Bar dataKey="precision" fill="#10b981" name="Precision" />
                        <Bar dataKey="recall" fill="#f59e0b" name="Recall" />
                        <Bar dataKey="f1Score" fill="#8b5cf6" name="F1-Score" />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Radar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Radar</CardTitle>
                <CardDescription>Multi-dimensional performance comparison</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis 
                      angle={90} 
                      domain={[0, 100]} 
                      tickFormatter={(value) => `${value}%`}
                    />
                    {comparisonData.map((model, index) => {
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
                      return (
                        <Radar
                          key={model.uniqueKey}
                          name={model.name}
                          dataKey={model.uniqueKey}
                          stroke={colors[index % colors.length]}
                          fill={colors[index % colors.length]}
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                      )
                    })}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5" />
                <span>Performance Insights</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Best Overall Performance:</strong><br/>
                    {(() => {
                      const best = currentEvaluations.reduce((best, current) => {
                        const bestVal = isSegmentationComparison
                          ? (best.metrics.dice || best.metrics.meanDice || 0)
                          : best.metrics.accuracy
                        const curVal = isSegmentationComparison
                          ? (current.metrics.dice || current.metrics.meanDice || 0)
                          : current.metrics.accuracy
                        return curVal > bestVal ? current : best
                      })
                      const label = isSegmentationComparison
                        ? `${formatMetric(best.metrics.dice || best.metrics.meanDice || 0)} Dice`
                        : `${formatMetric(best.metrics.accuracy)} accuracy`
                      return `${best.modelName} with ${label}`
                    })()}
                  </AlertDescription>
                </Alert>
                
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Fastest Evaluation:</strong><br/>
                    {(() => {
                      const fastest = currentEvaluations.reduce((fastest, current) => 
                        current.metrics.evaluationTime < fastest.metrics.evaluationTime ? current : fastest
                      )
                      return `${fastest.modelName} in ${formatTime(fastest.metrics.evaluationTime)}`
                    })()}
                  </AlertDescription>
                </Alert>
              </div>
              
              <div className="text-sm text-gray-600">
                <p><strong>Dataset:</strong> {selectedDataset}</p>
                <p><strong>Models Compared:</strong> {currentEvaluations.length} total</p>
                <p><strong>Last Updated:</strong> {new Date(Math.max(...currentEvaluations.map(e => new Date(e.completedAt).getTime()))).toLocaleString()}</p>
                {isSegmentationComparison && (
                  <p className="text-xs text-purple-600 mt-2">
                    🧠 Segmentation metrics (Dice and IoU) are shown. Higher is better.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}