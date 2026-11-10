// src/components/RealEvaluationPlan.tsx
import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { 
  CheckCircle, 
  XCircle, 
  Clock,
  FileText,
  Database, 
  Cpu, 
  Cloud, 
  Settings, 
  Zap, 
  Rocket, 
  Terminal, 
  Server,
  Brain,
  BarChart3,
  Shield,
  Users,
  Award,
  Activity,
  Lock,
  TrendingUp,
  FileJson,
  Image as ImageIcon,
  Stethoscope,
  ArrowRight
} from 'lucide-react'

// Upload icon component
function Upload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}

// ============================================
// Progress Item Interface
// ============================================
interface ProgressItem {
  name: string
  status: 'complete' | 'partial' | 'not-started' | 'not-available'
}

// ============================================
// Main Component
// ============================================
export function RealEvaluationPlan() {
  // File Handling (4/4)
  const fileHandling: ProgressItem[] = [
    { name: "Model file upload validation (.h5, .pt, .onnx)", status: "complete" },
    { name: "Dataset file upload validation", status: "complete" },
    { name: "File metadata storage (D1)", status: "complete" },
    { name: "Actual file storage in Tigris", status: "complete" }
  ]

  // ML Infrastructure (4/5)
  const mlInfrastructure: ProgressItem[] = [
    { name: "FastAPI ML service integration", status: "complete" },
    { name: "Clerk authentication for secure API access", status: "complete" },
    { name: "Model loading from Tigris storage", status: "complete" },
    { name: "Dataset preprocessing pipeline", status: "complete" },
    { name: "GPU acceleration support", status: "partial" }
  ]

  // Evaluation Engine (5/5)
  const evaluationEngine: ProgressItem[] = [
    { name: "Presigned URL generation for secure access", status: "complete" },
    { name: "Async evaluation with status polling", status: "complete" },
    { name: "Real metrics calculation from predictions", status: "complete" },
    { name: "Confusion matrix generation", status: "complete" },
    { name: "Multi-class classification support", status: "complete" }
  ]

  // Data Processing (4/4)
  const dataProcessing: ProgressItem[] = [
    { name: "Basic dataset type detection", status: "complete" },
    { name: "Image preprocessing (resize, normalize)", status: "complete" },
    { name: "Medical imaging format support (NIfTI, DICOM)", status: "complete" },
    { name: "CSV/tabular data preprocessing", status: "complete" }
  ]

  // Security & Auth (3/4)
  const securityAuth: ProgressItem[] = [
    { name: "Clerk JWT token verification", status: "complete" },
    { name: "Admin role management", status: "complete" },
    { name: "API key protection for ML service", status: "complete" },
    { name: "Rate limiting", status: "not-started" }
  ]

  // API & Endpoints (7/7)
  const apiEndpoints: ProgressItem[] = [
    { name: "Model upload/download API", status: "complete" },
    { name: "Dataset upload/download API", status: "complete" },
    { name: "Evaluation trigger API", status: "complete" },
    { name: "Compatibility check API", status: "complete" },
    { name: "Results retrieval API", status: "complete" },
    { name: "Health check endpoints", status: "complete" },
    { name: "Admin endpoints", status: "complete" }
  ]

  // Admin & Community (5/6)
  const adminCommunity: ProgressItem[] = [
    { name: "Contribution review system", status: "complete" },
    { name: "Admin dashboard", status: "complete" },
    { name: "Quality scoring (1-5 stars)", status: "complete" },
    { name: "Community Oja Models", status: "complete" },
    { name: "User comments and reviews", status: "complete" },
    { name: "Email notifications", status: "not-started" }
  ]

  // Deployment & Monitoring (5/6)
  const deployment: ProgressItem[] = [
    { name: "Docker containerization", status: "complete" },
    { name: "Environment variable configuration", status: "complete" },
    { name: "Structured logging", status: "complete" },
    { name: "Error handling", status: "complete" },
    { name: "Health monitoring", status: "complete" },
    { name: "Horizontal scaling", status: "not-started" }
  ]

  const categories = [
    { title: "File Handling", icon: FileText, items: fileHandling },
    { title: "ML Infrastructure", icon: Cpu, items: mlInfrastructure },
    { title: "Evaluation Engine", icon: BarChart3, items: evaluationEngine },
    { title: "Data Processing", icon: Database, items: dataProcessing },
    { title: "Security & Auth", icon: Shield, items: securityAuth },
    { title: "API & Endpoints", icon: Settings, items: apiEndpoints },
    { title: "Admin & Community", icon: Users, items: adminCommunity },
    { title: "Deployment & Monitoring", icon: Rocket, items: deployment }
  ]

  // Calculate totals
  let totalItems = 0
  let completedItems = 0
  categories.forEach(cat => {
    cat.items.forEach(item => {
      totalItems++
      if (item.status === 'complete') completedItems++
    })
  })
  const overallProgress = (completedItems / totalItems) * 100

  return (
    <div className="space-y-6">
      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <span>Current Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700">
            The platform now performs <strong className="font-semibold text-green-600">real model evaluation</strong> using TensorFlow, PyTorch, and ONNX Runtime. 
            Models are actually loaded and executed on your datasets - <strong className="font-semibold text-green-600">no simulation fallback!</strong>
          </p>
        </CardContent>
      </Card>

      {/* Real Evaluation Implementation Progress Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-indigo-500" />
            <span>Real Evaluation Implementation Progress</span>
          </CardTitle>
          <CardDescription>
            Current status of real model evaluation capabilities (Cloudflare Worker + Clerk + Tigris + FastAPI)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Overall Implementation */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-900">Overall Implementation</span>
              <span className="text-sm font-medium text-gray-600">{completedItems} of {totalItems} features</span>
            </div>
            <Progress value={overallProgress} className="h-3 bg-gray-100" />
            <p className="text-sm text-gray-500 mt-2">
              {Math.round(overallProgress)}% of features implemented for real evaluation
            </p>
          </div>

          {/* Feature Categories Grid */}
          <div className="space-y-4">
            {categories.map((category) => {
              const completed = category.items.filter(i => i.status === 'complete').length
              const categoryProgress = (completed / category.items.length) * 100
              
              return (
                <div key={category.title} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <category.icon className="h-4 w-4 text-indigo-500" />
                      <h4 className="font-medium text-gray-900">{category.title}</h4>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {completed}/{category.items.length}
                    </Badge>
                  </div>
                  <Progress value={categoryProgress} className="h-1.5 bg-gray-100 mb-3" />
                  <div className="space-y-2">
                    {category.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {item.status === 'complete' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                          {item.status === 'partial' && <Clock className="h-3.5 w-3.5 text-yellow-500" />}
                          {item.status === 'not-started' && <XCircle className="h-3.5 w-3.5 text-gray-400" />}
                          {item.status === 'not-available' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                          <span className={`text-xs ${
                            item.status === 'complete' ? 'text-gray-700' : 
                            item.status === 'partial' ? 'text-yellow-700' : 'text-gray-500'
                          }`}>
                            {item.name}
                          </span>
                        </div>
                        <Badge className={`text-xs px-2 py-0.5 ${
                          item.status === 'complete' ? 'bg-green-100 text-green-700' : 
                          item.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 
                          item.status === 'not-started' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.status === 'complete' ? 'Complete' : 
                           item.status === 'partial' ? 'Partial' : 
                           item.status === 'not-started' ? 'Not Started' : 'Not Available'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      
      {/* Supported Features Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            <span>Supported Features Summary</span>
          </CardTitle>
          <CardDescription>Complete real ML evaluation pipeline with multi-framework support</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2"><Brain className="h-4 w-4 text-indigo-600" /> Model Formats</h4>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">.h5 / .keras (TensorFlow)</span></div>
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">.pt / .pth (PyTorch)</span></div>
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">.onnx (ONNX Runtime)</span></div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2"><Database className="h-4 w-4 text-indigo-600" /> Dataset Types</h4>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">CSV / Tabular Data</span></div>
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">Images (JPG, PNG, BMP)</span></div>
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">Medical (NIfTI, DICOM)</span></div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" /> Metrics Generated</h4>
              <div className="space-y-1">
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">Accuracy, Precision, Recall, F1</span></div>
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">ROC-AUC, Confusion Matrix</span></div>
                <div className="flex items-center gap-2"><CheckCircle className="h-6 w-3.5 text-green-500" /><span className="text-sm">MSE, MAE, RMSE, R² Score</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Features Section */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Shield className="h-5 w-5 text-purple-600" /></div>
            <div>
              <CardTitle>Admin & Moderation Features</CardTitle>
              <CardDescription>Tools for managing the community model marketplace</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3 p-3 bg-white rounded-lg">
              <Shield className="h-5 w-5 text-purple-500 mt-0.5" />
              <div><h4 className="font-medium text-gray-900">Contribution Review System</h4><p className="text-sm text-gray-500">Review and approve community model submissions</p></div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-white rounded-lg">
              <Award className="h-5 w-5 text-purple-500 mt-0.5" />
              <div><h4 className="font-medium text-gray-900">Quality Scoring (1-5 stars)</h4><p className="text-sm text-gray-500">Rate model quality before publication</p></div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-white rounded-lg">
              <Users className="h-5 w-5 text-purple-500 mt-0.5" />
              <div><h4 className="font-medium text-gray-900">Pending Contributions Dashboard</h4><p className="text-sm text-gray-500">Manage and moderate community contributions</p></div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-white rounded-lg">
              <TrendingUp className="h-5 w-5 text-purple-500 mt-0.5" />
              <div><h4 className="font-medium text-gray-900">Platform Analytics</h4><p className="text-sm text-gray-500">Track usage, models, and evaluations</p></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Integrations */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3"><div className="p-2 bg-green-100 rounded-lg"><Cloud className="h-5 w-5 text-green-600" /></div><CardTitle>Platform Integrations</CardTitle></div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Lock className="h-4 w-4 text-gray-500" /><span className="text-sm">Clerk Authentication</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Cloud className="h-4 w-4 text-gray-500" /><span className="text-sm">Tigris Storage</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Database className="h-4 w-4 text-gray-500" /><span className="text-sm">D1 Database</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Activity className="h-4 w-4 text-gray-500" /><span className="text-sm">Cloudflare Worker</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Server className="h-4 w-4 text-gray-500" /><span className="text-sm">FastAPI ML Service</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Brain className="h-4 w-4 text-gray-500" /><span className="text-sm">TensorFlow Runtime</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Brain className="h-4 w-4 text-gray-500" /><span className="text-sm">PyTorch Runtime</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
            <div className="flex items-center justify-between p-2 border rounded-lg"><div className="flex items-center space-x-2"><Settings className="h-4 w-4 text-gray-500" /><span className="text-sm">ONNX Runtime</span></div><Badge className="bg-green-500 text-white text-xs">Active</Badge></div>
          </div>
        </CardContent>
      </Card>

      {/* Architecture Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2"><Server className="h-5 w-5" /><span>System Architecture</span></CardTitle>
          <CardDescription>How real ML evaluation works in ỌJÀ AI</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-center flex-1 min-w-[60px]"><div className="w-10 h-10 mx-auto bg-indigo-100 rounded-full flex items-center justify-center"><Upload className="h-5 w-5 text-indigo-600" /></div><p className="text-xs mt-1">Upload</p></div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className="text-center flex-1 min-w-[60px]"><div className="w-10 h-10 mx-auto bg-indigo-100 rounded-full flex items-center justify-center"><Database className="h-5 w-5 text-indigo-600" /></div><p className="text-xs mt-1">Store</p></div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className="text-center flex-1 min-w-[60px]"><div className="w-10 h-10 mx-auto bg-indigo-100 rounded-full flex items-center justify-center"><Cloud className="h-5 w-5 text-indigo-600" /></div><p className="text-xs mt-1">Tigris</p></div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className="text-center flex-1 min-w-[60px]"><div className="w-10 h-10 mx-auto bg-indigo-100 rounded-full flex items-center justify-center"><Server className="h-5 w-5 text-indigo-600" /></div><p className="text-xs mt-1">FastAPI</p></div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className="text-center flex-1 min-w-[60px]"><div className="w-10 h-10 mx-auto bg-green-100 rounded-full flex items-center justify-center"><BarChart3 className="h-5 w-5 text-green-600" /></div><p className="text-xs mt-1">Results</p></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-sm">
            <div className="p-2 bg-blue-50 rounded-lg text-center"><strong className="text-blue-800 text-xs">📥 Step 1:</strong><p className="text-blue-700 text-xs">Worker generates presigned URLs</p></div>
            <div className="p-2 bg-purple-50 rounded-lg text-center"><strong className="text-purple-800 text-xs">🧠 Step 2:</strong><p className="text-purple-700 text-xs">FastAPI runs real inference</p></div>
            <div className="p-2 bg-green-50 rounded-lg text-center"><strong className="text-green-800 text-xs">📊 Step 3:</strong><p className="text-green-700 text-xs">Results stored in D1</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 py-4 border-t">
        <p>© 2025 MAILAB. ỌJÀ AI - Medical AI Marketplace &amp; Real ML Evaluation Platform</p>
        <p className="mt-1">"Ọjà" means "marketplace" in Yoruba — connecting medical AI researchers worldwide</p>
      </div>
    </div>
  )
}