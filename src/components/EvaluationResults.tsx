// components/EvaluationResults.tsx
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import {
  CheckCircle, Clock, Calendar, AlertCircle, TrendingUp, Target,
  Box, Code2, Github, Layers, Activity, Database
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { ExportResults } from './ExportResults'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Evaluation {
  id: string
  modelId: string
  datasetId: string
  modelName: string
  datasetName: string
  status: string
  modelType?: string
  evaluationType?: string
  modality?: string           // NEW: imaging modality
  label_schema?: any          // NEW: label mapping
  metrics?: {
    accuracy?: number
    precision?: number
    recall?: number
    f1Score?: number
    f1_score?: number
    roc_auc?: number
    confusion_matrix?: number[][]
    evaluationTime?: number
    evaluation_type?: string
    framework?: string
    num_samples?: number
    is_segmentation?: boolean
    task_type?: string
    mean_dice?: number
    mean_iou?: number
    dice_per_class?: Record<string, number> | Array<{ class?: string; class_name?: string; name?: string; label?: string; dice?: number; value?: number; score?: number }>
    iou_per_class?: Record<string, number> | Array<{ class?: string; class_name?: string; name?: string; label?: string; iou?: number; value?: number; score?: number }>
    num_classes?: number
    overall_quality?: string
    quality_color?: string
    quality_description?: string
    test_samples?: number
    [key: string]: any
  }
  is_segmentation?: boolean
  task_type?: string
  mean_dice?: number
  mean_iou?: number
  dice_per_class?: Record<string, number> | Array<{ class?: string; class_name?: string; name?: string; label?: string; dice?: number; value?: number; score?: number }>
  iou_per_class?: Record<string, number> | Array<{ class?: string; class_name?: string; name?: string; label?: string; iou?: number; value?: number; score?: number }>
  num_classes?: number
  overall_quality?: string
  quality_color?: string
  quality_description?: string
  results?: any[]
  completedAt: string
  job_id?: string
  full_metrics?: any
}

interface EvaluationResultsProps {
  evaluation: Evaluation
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
      icon: <Github className="h-3 w-3" />
    },
    unknown: {
      label: 'Unknown',
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <AlertCircle className="h-3 w-3" />
    },
  }
  return types[modelType || 'unknown'] || types.unknown
}

// ─── Helpers for color coding metrics ──────────────────────────────────────

function getMetricColor(value: number): string {
  if (value >= 0.9) return 'text-green-600'
  if (value >= 0.8) return 'text-blue-600'
  if (value >= 0.7) return 'text-yellow-600'
  return 'text-red-600'
}

function getBgColorByScore(value: number): string {
  if (value >= 0.9) return 'bg-green-50 border-green-200'
  if (value >= 0.8) return 'bg-blue-50 border-blue-200'
  if (value >= 0.7) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

// ─── Helper to robustly extract segmentation metrics ────────────────────────

function extractSegmentationMetrics(evaluation: Evaluation) {
  const metrics = evaluation.metrics || {}
  const firstResult = evaluation.results?.[0] || {}
  const fullMetrics = evaluation.full_metrics || {}

  const meanDice =
    evaluation.mean_dice ??
    metrics.mean_dice ??
    firstResult.mean_dice ??
    fullMetrics.mean_dice ??
    null

  const meanIoU =
    evaluation.mean_iou ??
    metrics.mean_iou ??
    firstResult.mean_iou ??
    fullMetrics.mean_iou ??
    null

  let dicePerClass: Record<string, number> | null = null
  let iouPerClass: Record<string, number> | null = null

  const possibleDice = [
    evaluation.dice_per_class,
    metrics.dice_per_class,
    firstResult.dice_per_class,
    fullMetrics.dice_per_class,
  ]
  const possibleIou = [
    evaluation.iou_per_class,
    metrics.iou_per_class,
    firstResult.iou_per_class,
    fullMetrics.iou_per_class,
  ]

  for (const src of possibleDice) {
    if (src && typeof src === 'object') {
      if (Array.isArray(src)) {
        const obj: Record<string, number> = {}
        src.forEach((item: any) => {
          const key = item.class_name || item.class || item.name || item.label || 'Unknown'
          const val = item.dice ?? item.value ?? item.score ?? 0
          obj[key] = val
        })
        dicePerClass = obj
      } else {
        dicePerClass = src as Record<string, number>
      }
      break
    }
  }

  for (const src of possibleIou) {
    if (src && typeof src === 'object') {
      if (Array.isArray(src)) {
        const obj: Record<string, number> = {}
        src.forEach((item: any) => {
          const key = item.class_name || item.class || item.name || item.label || 'Unknown'
          const val = item.iou ?? item.value ?? item.score ?? 0
          obj[key] = val
        })
        iouPerClass = obj
      } else {
        iouPerClass = src as Record<string, number>
      }
      break
    }
  }

  const numClasses =
    evaluation.num_classes ??
    metrics.num_classes ??
    (dicePerClass ? Object.keys(dicePerClass).length : 0)

  const overallQuality =
    evaluation.overall_quality ??
    metrics.overall_quality ??
    fullMetrics.overall_quality ??
    null

  const qualityColor =
    evaluation.quality_color ??
    metrics.quality_color ??
    fullMetrics.quality_color ??
    null

  const qualityDescription =
    evaluation.quality_description ??
    metrics.quality_description ??
    fullMetrics.quality_description ??
    null

  const testSamples =
    metrics.test_samples ??
    metrics.num_samples ??
    firstResult.test_samples ??
    firstResult.num_samples ??
    fullMetrics.test_samples ??
    fullMetrics.num_samples ??
    null

  // ─── Extract label_schema and modality ──────────────────────────────────
  const labelSchema = evaluation.label_schema || fullMetrics.label_schema || null
  const modality = evaluation.modality || fullMetrics.modality || null

  // Build a class name map (integer -> name)
  let classNames: Record<number, string> = {}
  if (labelSchema && typeof labelSchema === 'object') {
    const labelMap = labelSchema.label_map || labelSchema
    if (typeof labelMap === 'object') {
      for (const [key, value] of Object.entries(labelMap)) {
        classNames[parseInt(key)] = String(value)
      }
    }
  }

  return {
    meanDice,
    meanIoU,
    dicePerClass,
    iouPerClass,
    numClasses,
    overallQuality,
    qualityColor,
    qualityDescription,
    testSamples,
    classNames,
    modality,
  }
}

// ─── Helper to transform class names using the label map ────────────────────

function transformClassNames(metrics: Record<string, number>, classNames: Record<number, string>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(metrics)) {
    // If the key is numeric (or starts with "Class "), try to map it
    const numKey = parseInt(key)
    if (!isNaN(numKey) && classNames[numKey]) {
      result[classNames[numKey]] = value
    } else {
      // Look for "Class 0", "Class 1" etc.
      const match = key.match(/^Class\s+(\d+)$/)
      if (match && classNames[parseInt(match[1])]) {
        result[classNames[parseInt(match[1])]] = value
      } else {
        // Keep original if we can't map
        result[key] = value
      }
    }
  }
  return result
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function EvaluationResults({ evaluation }: EvaluationResultsProps) {
  const [confusionMatrix, setConfusionMatrix] = useState<number[][] | null>(null)

  const isSeg =
    evaluation.is_segmentation === true ||
    evaluation.task_type === 'segmentation' ||
    evaluation.metrics?.is_segmentation === true ||
    evaluation.metrics?.task_type === 'segmentation' ||
    false

  const metrics = evaluation.metrics || {}
  const firstResult = evaluation.results && evaluation.results.length > 0 ? evaluation.results[0] : null

  const accuracy = metrics.accuracy ?? firstResult?.accuracy ?? 0
  const precision = metrics.precision ?? firstResult?.precision ?? 0
  const recall = metrics.recall ?? firstResult?.recall ?? 0
  const f1Score = metrics.f1Score ?? metrics.f1_score ?? firstResult?.f1_score ?? 0
  const rocAuc = metrics.roc_auc ?? firstResult?.auc_roc ?? null
  const evaluationTime = metrics.evaluationTime ?? firstResult?.evaluation_time ?? 0
  const numSamples = metrics.test_samples ?? metrics.num_samples ?? firstResult?.num_samples ?? null
  const framework = metrics.framework ?? firstResult?.framework ?? null

  const segMetrics = extractSegmentationMetrics(evaluation)
  const {
    meanDice,
    meanIoU,
    dicePerClass,
    iouPerClass,
    numClasses,
    overallQuality: rawQuality,
    qualityColor: rawColor,
    qualityDescription: rawDesc,
    testSamples,
    classNames,
    modality,
  } = segMetrics

  // Transform class names if we have a label map
  const transformedDice = dicePerClass ? transformClassNames(dicePerClass, classNames) : null
  const transformedIou = iouPerClass ? transformClassNames(iouPerClass, classNames) : null

  // Fallback for overall quality based on mean Dice
  const getQualityFromDice = (dice: number | null) => {
    if (dice === null || dice === undefined) return 'N/A'
    if (dice >= 0.9) return 'Excellent'
    if (dice >= 0.8) return 'Good'
    if (dice >= 0.7) return 'Fair'
    return 'Poor'
  }

  const getColorFromDice = (dice: number | null) => {
    if (dice === null || dice === undefined) return '#6b7280'
    if (dice >= 0.9) return '#22c55e'  // green
    if (dice >= 0.8) return '#3b82f6'  // blue
    if (dice >= 0.7) return '#eab308'  // yellow
    return '#ef4444'                   // red
  }

  const getDescFromDice = (dice: number | null) => {
    if (dice === null || dice === undefined) return 'No quality metric available'
    if (dice >= 0.9) return 'Outstanding performance, very high overlap'
    if (dice >= 0.8) return 'Good performance, moderate overlap'
    if (dice >= 0.7) return 'Fair performance, acceptable overlap'
    return 'Poor performance, low overlap – needs improvement'
  }

  const overallQuality = rawQuality ?? getQualityFromDice(meanDice)
  const qualityColor = rawColor ?? getColorFromDice(meanDice)
  const qualityDescription = rawDesc ?? getDescFromDice(meanDice)

  // ─── Extract confusion matrix ───────────────────────────────────────────────
  useEffect(() => {
    let matrix = null
    if (metrics.confusion_matrix && metrics.confusion_matrix.length > 0) {
      matrix = metrics.confusion_matrix
    } else if (firstResult?.confusion_matrix && firstResult.confusion_matrix.length > 0) {
      matrix = firstResult.confusion_matrix
    } else if (firstResult?.full_metrics?.confusion_matrix && firstResult.full_metrics.confusion_matrix.length > 0) {
      matrix = firstResult.full_metrics.confusion_matrix
    } else if (evaluation.full_metrics?.confusion_matrix && evaluation.full_metrics.confusion_matrix.length > 0) {
      matrix = evaluation.full_metrics.confusion_matrix
    }
    if (matrix) {
      setConfusionMatrix(matrix)
    }
  }, [evaluation, metrics, firstResult])

  const modelType = evaluation.modelType || metrics.model_type || 'unknown'
  const evaluationType = evaluation.evaluationType || metrics.evaluation_type || 'real_unknown'
  const modelTypeInfo = getModelTypeBadge(modelType)

  // ─── Prepare data for export ────────────────────────────────────────────────
  const exportData = {
    job_id: evaluation.job_id || evaluation.id,
    model_name: evaluation.modelName,
    dataset_name: evaluation.datasetName,
    model_type: modelType,
    evaluation_type: evaluationType,
    framework: framework,
    evaluation_time: evaluationTime,
    num_samples: numSamples,
    is_segmentation: isSeg,
    modality: modality,
    metrics: isSeg ? {
      mean_dice: meanDice,
      mean_iou: meanIoU,
      dice_per_class: transformedDice,
      iou_per_class: transformedIou,
      num_classes: numClasses,
      overall_quality: overallQuality,
      quality_color: qualityColor,
      quality_description: qualityDescription,
    } : {
      accuracy: accuracy,
      precision: precision,
      recall: recall,
      f1_score: f1Score,
      roc_auc: rocAuc,
      confusion_matrix: confusionMatrix,
    },
    completed_at: evaluation.completedAt
  }

  // ─── Shared Header ──────────────────────────────────────────────────────────
  const renderHeader = () => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2 flex-wrap gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{evaluation.modelName}</h2>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Completed
              </Badge>
              <Badge className={modelTypeInfo.color}>
                <span className="flex items-center space-x-1">
                  {modelTypeInfo.icon}
                  <span>{modelTypeInfo.label}</span>
                </span>
              </Badge>
              {evaluationType && (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  {evaluationType.replace('_', ' ').toUpperCase()}
                </Badge>
              )}
              {isSeg && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  <Layers className="h-3 w-3 mr-1" />
                  Segmentation
                </Badge>
              )}
              {modality && (
                <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200">
                  <Database className="h-3 w-3 mr-1" />
                  {modality}
                </Badge>
              )}
            </div>
            <p className="text-gray-600">Dataset: {evaluation.datasetName}</p>
          </div>
          <ExportResults results={exportData} evaluationId={evaluation.job_id || evaluation.id} />
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            {new Date(evaluation.completedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
          {evaluationTime > 0 && (
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              {evaluationTime.toFixed(2)}s
            </div>
          )}
          <div className="flex items-center">
            <Target className="h-4 w-4 mr-2" />
            ID: {(evaluation.job_id || evaluation.id).slice(-8)}
          </div>
          {framework && (
            <div className="flex items-center">
              <span className="font-medium mr-1">Framework:</span>
              {framework}
            </div>
          )}
          {numSamples !== null && numSamples !== undefined && (
            <div className="flex items-center">
              <span className="font-medium mr-1">Test Samples:</span>
              {numSamples}
            </div>
          )}
          {!isSeg && rocAuc && (
            <div className="flex items-center">
              <span className="font-medium mr-1">ROC AUC:</span>
              <span className="text-indigo-600 font-semibold">{(rocAuc * 100).toFixed(1)}%</span>
            </div>
          )}
          {isSeg && numClasses && (
            <div className="flex items-center">
              <span className="font-medium mr-1">Classes:</span>
              {numClasses}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  // ─── Classification Renderer ────────────────────────────────────────────────
  const renderClassification = () => {
    const formatMetric = (value: number) => (value * 100).toFixed(1) + '%'

    const metricsData = [
      { name: 'Accuracy', value: accuracy * 100 },
      { name: 'Precision', value: precision * 100 },
      { name: 'Recall', value: recall * 100 },
      { name: 'F1-Score', value: f1Score * 100 }
    ]
    const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Accuracy</p>
                <p className={`text-3xl font-semibold mb-3 ${getMetricColor(accuracy)}`}>
                  {formatMetric(accuracy)}
                </p>
                <Progress value={accuracy * 100} className="h-3" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Precision</p>
                <p className={`text-3xl font-semibold mb-3 ${getMetricColor(precision)}`}>
                  {formatMetric(precision)}
                </p>
                <Progress value={precision * 100} className="h-3" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Recall</p>
                <p className={`text-3xl font-semibold mb-3 ${getMetricColor(recall)}`}>
                  {formatMetric(recall)}
                </p>
                <Progress value={recall * 100} className="h-3" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">F1-Score</p>
                <p className={`text-3xl font-semibold mb-3 ${getMetricColor(f1Score)}`}>
                  {formatMetric(f1Score)}
                </p>
                <Progress value={f1Score * 100} className="h-3" />
              </div>
            </CardContent>
          </Card>
        </div>

        {rocAuc && (
          <Card>
            <CardHeader>
              <CardTitle>ROC-AUC Score</CardTitle>
              <CardDescription>Area Under the ROC Curve - Model's ability to distinguish classes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-indigo-50">
                  <div className="text-center">
                    <p className={`text-3xl font-bold ${getMetricColor(rocAuc)}`}>
                      {formatMetric(rocAuc)}
                    </p>
                    <p className="text-xs text-gray-500">ROC-AUC</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics Overview</CardTitle>
            <CardDescription>Visual comparison of model performance across all key metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metricsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                  <Legend />
                  <Bar dataKey="value" name="Score (%)" radius={[8, 8, 0, 0]}>
                    {metricsData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detailed Metrics Breakdown</CardTitle>
            <CardDescription>Comprehensive analysis of model performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { label: 'Accuracy', value: accuracy, color: 'bg-green-500', desc: 'Overall correctness of the model\'s predictions' },
                { label: 'Precision', value: precision, color: 'bg-blue-500', desc: 'Proportion of positive predictions that were correct' },
                { label: 'Recall', value: recall, color: 'bg-yellow-500', desc: 'Proportion of actual positives that were correctly identified' },
                { label: 'F1-Score', value: f1Score, color: 'bg-purple-500', desc: 'Harmonic mean of precision and recall, balanced performance metric' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 ${item.color} rounded-full`}></div>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className={`font-semibold ${getMetricColor(item.value)}`}>
                      {formatMetric(item.value)}
                    </span>
                  </div>
                  <Progress value={item.value * 100} className="h-2" />
                  <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Confusion Matrix</CardTitle>
            <CardDescription>Detailed prediction breakdown - Diagonal shows correct predictions</CardDescription>
          </CardHeader>
          <CardContent>
            {confusionMatrix && confusionMatrix.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border rounded-lg">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual \ Predicted</th>
                      {confusionMatrix[0].map((_, idx) => (
                        <th key={idx} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Class {idx}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {confusionMatrix.map((row, rowIdx) => {
                      const maxVal = Math.max(...confusionMatrix.flat())
                      return (
                        <tr key={rowIdx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 bg-gray-50">Class {rowIdx}</td>
                          {row.map((value, colIdx) => {
                            const intensity = maxVal > 0 ? (value / maxVal) * 100 : 0
                            const isCorrect = rowIdx === colIdx
                            const bgColor = isCorrect
                              ? `rgba(34, 197, 94, ${Math.max(0.1, intensity / 100)})`
                              : `rgba(239, 68, 68, ${Math.max(0.1, intensity / 100)})`
                            return (
                              <td key={colIdx} className="px-6 py-4 text-center text-sm" style={{ backgroundColor: bgColor }}>
                                <span className={`font-medium ${value > maxVal * 0.3 ? 'text-white' : 'text-gray-700'}`}>
                                  {value}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>No confusion matrix data available</p>
                <p className="text-sm mt-2">Run an evaluation with a classification model to see this</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span>Performance Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Overall Rating</p>
                <p className="text-2xl font-semibold text-green-600">
                  {(() => {
                    const avg = (accuracy + precision + recall + f1Score) / 4
                    if (avg >= 0.9) return 'Excellent'
                    if (avg >= 0.8) return 'Good'
                    if (avg >= 0.7) return 'Fair'
                    return 'Needs Improvement'
                  })()}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Best Metric</p>
                <p className="text-2xl font-semibold text-blue-600">
                  {(() => {
                    const metricsObj = { Accuracy: accuracy, Precision: precision, Recall: recall, 'F1-Score': f1Score }
                    return Object.entries(metricsObj).reduce((a, b) => a[1] > b[1] ? a : b)[0]
                  })()}
                </p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Average Score</p>
                <p className="text-2xl font-semibold text-purple-600">
                  {formatMetric((accuracy + precision + recall + f1Score) / 4)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  // ─── Segmentation Renderer ──────────────────────────────────────────────────
  const renderSegmentation = () => {
    const meanDiceDisplay = meanDice !== null ? (meanDice * 100).toFixed(1) : 'N/A'
    const meanIoUDisplay = meanIoU !== null ? (meanIoU * 100).toFixed(1) : 'N/A'

    // Use transformed data if available, else fallback to original
    const finalDice = transformedDice || dicePerClass || {}
    const finalIou = transformedIou || iouPerClass || {}

    const diceData = Object.entries(finalDice).map(([name, value]) => ({
      name: name,
      Dice: value * 100
    }))

    const iouData = Object.entries(finalIou).map(([name, value]) => ({
      name: name,
      IoU: value * 100
    }))

    const colors = ['#4ade80', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`text-center p-4 border rounded-lg ${getBgColorByScore(meanDice || 0)}`}>
            <Target className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-sm text-gray-600">Mean Dice (foreground)</p>
            <p className={`text-2xl font-semibold ${getMetricColor(meanDice || 0)}`}>
              {meanDiceDisplay}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Excludes background</p>
          </div>
          <div className={`text-center p-4 border rounded-lg ${getBgColorByScore(meanIoU || 0)}`}>
            <Layers className="h-6 w-6 mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-600">Mean IoU (foreground)</p>
            <p className={`text-2xl font-semibold ${getMetricColor(meanIoU || 0)}`}>
              {meanIoUDisplay}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Excludes background</p>
          </div>
          <div className="text-center p-4 border rounded-lg bg-purple-50 border-purple-200">
            <Box className="h-6 w-6 mx-auto mb-2 text-purple-600" />
            <p className="text-sm text-gray-600">Number of Classes</p>
            <p className="text-2xl font-semibold text-purple-600">{numClasses}</p>
          </div>
          <div className="text-center p-4 border rounded-lg bg-indigo-50 border-indigo-200">
            <Activity className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
            <p className="text-sm text-gray-600">Test Samples</p>
            <p className="text-2xl font-semibold text-indigo-600">
              {testSamples !== null && testSamples !== undefined ? testSamples : 'N/A'}
            </p>
          </div>
        </div>

        {diceData.length > 0 ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Dice Score per Class</CardTitle>
                <CardDescription>Higher is better – measures overlap between predicted and ground truth masks. Background excluded from the mean.</CardDescription>
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

            {iouData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>IoU per Class</CardTitle>
                  <CardDescription>Intersection over Union – measures how much the predicted mask overlaps with the ground truth.</CardDescription>
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

            <Card>
              <CardHeader>
                <CardTitle>Detailed Per‑Class Metrics</CardTitle>
                <CardDescription>Dice and IoU for each class in the segmentation task</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200">
                      <tr className="text-left text-gray-500">
                        <th className="py-2 px-3 font-medium">Class</th>
                        <th className="py-2 px-3 font-medium">Dice</th>
                        <th className="py-2 px-3 font-medium">IoU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diceData.map((item, index) => {
                        const color = colors[index % colors.length];
                        const iouItem = iouData.find(d => d.name === item.name);
                        return (
                          <tr key={item.name} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium flex items-center space-x-2">
                              <span
                                className="inline-block w-3 h-3 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              <span>{item.name}</span>
                            </td>
                            <td className="py-2 px-3">{item.Dice.toFixed(1)}%</td>
                            <td className="py-2 px-3">
                              {iouItem ? `${iouItem.IoU.toFixed(1)}%` : 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>No per-class metrics available</p>
            </CardContent>
          </Card>
        )}

        <Card
          className="border-2 overflow-hidden"
          style={{
            borderColor: qualityColor || '#d1d5db',
            background: qualityColor
              ? `linear-gradient(135deg, ${qualityColor}15 0%, ${qualityColor}30 100%)`
              : '#f3f4f6',
          }}
        >
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-600 mb-1">Overall Quality (foreground)</p>
            <p
              className="text-3xl font-bold"
              style={{ color: qualityColor || '#6b7280' }}
            >
              {overallQuality}
            </p>
            {qualityDescription && (
              <p className="text-sm text-gray-500 mt-2">{qualityDescription}</p>
            )}
          </CardContent>
        </Card>
      </>
    )
  }

  // ─── Main Render ────────────────────────────────────────────────────────────

  if (!evaluation) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Evaluation Data</h3>
          <p className="text-gray-600">The evaluation results are not available or incomplete.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {renderHeader()}
      {isSeg ? renderSegmentation() : renderClassification()}
    </div>
  )
}