import React, { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Upload, Store, Database, Brain, BarChart3 } from 'lucide-react'
import { RealMLEvaluationDashboard } from './RealMLEvaluationDashboard'
import { RepositoryWorkspace } from './RepositoryWorkspace'
import { PublicModelZoo } from './PublicModelZoo'
import { PublicDataZoo } from './PublicDataZoo'
import { ModelComparisonDashboard } from './ModelComparisonDashboard'

interface User {
  id: string
  email: string
  name?: string
}

interface UnifiedOjaAIDashboardProps {
  user: User
  onEvaluationComplete?: (results?: any) => void
  onEvaluationStart?: () => void
  addNotification?: (title: string, message: string, type?: 'success' | 'error' | 'info' | 'warning', link?: string) => void // 👈 NEW
}

export function UnifiedOjaAIDashboard({
  user,
  onEvaluationComplete,
  onEvaluationStart,
  addNotification, // 👈 NEW
}: UnifiedOjaAIDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') || ''
    return ['evaluate', 'model-zoo', 'dataset-library', 'upload-model', 'upload-data', 'compare'].includes(tab) ? tab : 'upload-model'
  })
  const [refreshKey, setRefreshKey] = useState(0)

  const handleTabChange = (value: string) => {
    if (value === 'evaluate' && activeSubTab !== 'evaluate') {
      setRefreshKey(prev => prev + 1)
    }
    setActiveSubTab(value)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', value)
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  }

  const handleNavigate = (tab: string) => {
    handleTabChange(tab)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">ỌJÀ AI Platform</h2>
        <p className="text-gray-600 mt-1">Complete ML model evaluation platform with Oja Models, Oja Datasets, evaluation, and analytics</p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleTabChange} className="platform-tabs">
        <TabsList className="flex w-full flex-wrap h-auto gap-2">
          <TabsTrigger value="evaluate" className="flex items-center space-x-2">
            <Brain className="h-4 w-4" />
            <span>Evaluate</span>
          </TabsTrigger>
          <TabsTrigger value="model-zoo" className="flex items-center space-x-2">
            <Store className="h-4 w-4" />
            <span>Oja Models</span>
          </TabsTrigger>
          <TabsTrigger value="dataset-library" className="flex items-center space-x-2">
            <Database className="h-4 w-4" /><span>Oja Datasets</span>
          </TabsTrigger>
          <TabsTrigger value="upload-model" className="flex items-center space-x-2">
            <Upload className="h-4 w-4" />
            <span>Upload Model</span>
          </TabsTrigger>
          <TabsTrigger value="upload-data" className="flex items-center space-x-2">
            <Database className="h-4 w-4" />
            <span>Upload Data</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Compare</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="evaluate" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Model Evaluation</h3>
            <p className="text-gray-600 mt-1">Run real ML evaluations with TensorFlow, PyTorch, and ONNX. Supports GPU acceleration.</p>
          </div>
          <RealMLEvaluationDashboard
            user={user}
            onEvaluationComplete={onEvaluationComplete}
            onEvaluationStart={onEvaluationStart}
            onNavigate={handleNavigate}
            refreshKey={refreshKey}
          />
        </TabsContent>

        <TabsContent value="model-zoo" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Oja Models</h3>
            <p className="text-gray-600 mt-1">Browse, download, contribute and share pre-trained models with the community</p>
          </div>
          <PublicModelZoo embedded />
        </TabsContent>

        <TabsContent value="upload-model" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upload Model</h3>
            <p className="text-gray-600 mt-1">Create model repositories with versioned weights, configuration, documentation, and source references.</p>
          </div>
          <RepositoryWorkspace kind="model" />
        </TabsContent>

        <TabsContent value="upload-data" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upload Dataset</h3>
            <p className="text-gray-600 mt-1">Create dataset repositories with versioned files, collection metadata, and provenance.</p>
          </div>
          <RepositoryWorkspace kind="dataset" />
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Model Comparison</h3>
            <p className="text-gray-600 mt-1">Compare performance between multiple models side-by-side</p>
          </div>
          <ModelComparisonDashboard user={user} />
        </TabsContent>
        <TabsContent value="dataset-library" className="space-y-4">
          <PublicDataZoo embedded />
        </TabsContent>
      </Tabs>
    </div>
  )
}
