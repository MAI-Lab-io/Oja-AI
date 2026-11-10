// components/EvaluationProgress.tsx
import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { CheckCircle, XCircle, Loader2, Clock, Brain } from 'lucide-react'

interface EvaluationProgressProps {
  isOpen: boolean
  modelName: string
  datasetName: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  error?: string
  onClose: () => void
  onViewResults?: () => void
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  running: { label: 'Running', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
}

export function EvaluationProgress({
  isOpen,
  modelName,
  datasetName,
  status,
  progress,
  message,
  error,
  onClose,
  onViewResults,
}: EvaluationProgressProps) {
  const StatusIcon = statusConfig[status].icon
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'
  const isRunning = status === 'running' || status === 'pending'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-600" />
            Evaluation in Progress
          </DialogTitle>
          <DialogDescription>
            {modelName} on {datasetName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
              <span className="font-medium">{statusConfig[status].label}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {progress}%
            </Badge>
          </div>

          {/* Progress Bar */}
          <Progress value={progress} className="h-2" />

          {/* Step Message */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
            {message}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-medium">Error:</p>
              <p>{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            {isCompleted && (
              <>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
                {onViewResults && (
                  <Button size="sm" onClick={onViewResults} className="bg-indigo-600 hover:bg-indigo-700">
                    View Results
                  </Button>
                )}
              </>
            )}
            {isFailed && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
            {isRunning && (
              <Button variant="outline" size="sm" onClick={onClose} disabled>
                Evaluating...
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}