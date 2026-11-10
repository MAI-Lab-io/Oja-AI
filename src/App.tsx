// src/App.tsx - Integrated with Notification System & Toasts
import React, { useState, useEffect } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthForm } from './components/AuthForm'
import { Toaster } from 'sonner' // 👈 NEW
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { Badge } from './components/ui/badge'
import { 
  Brain, CheckCircle, Info, Users, BarChart3, Shield, Sparkles, Zap, Store, Bell, Loader2, Crown
} from 'lucide-react'
import { EvaluationResults } from './components/EvaluationResults'
import { PublicModelZoo } from './components/PublicModelZoo'
import { LandingPage } from './components/LandingPage'
import { Community } from './components/Community'
import { UserProfile } from './components/UserProfile'
import { RealEvaluationPlan } from './components/RealEvaluationPlan'
import { AdvancedMetricsVisualization } from './components/AdvancedMetricsVisualization'
import { UnifiedOjaAIDashboard } from './components/UnifiedOjaAIDashboard'
import { AdminContributionDashboard } from './components/AdminContributionDashboard'
import { AdminRoute } from './components/AdminRoute'
import { NotificationBell, Notification } from './components/NotificationBell'

// ============================================
// Types
// ============================================
interface UserType {
  id: string
  email: string
  name?: string
}

// ============================================
// Helper Functions
// ============================================
const getFirstName = (nameOrEmail: string): string => {
  if (!nameOrEmail) return 'User'
  if (nameOrEmail.includes('@')) {
    return nameOrEmail.split('@')[0].split('.')[0]
  }
  return nameOrEmail.split(' ')[0]
}

// ============================================
// Main App Component
// ============================================
function App() {
  const { isSignedIn, signOut, isLoaded: isAuthLoaded, user: account, error: accountError, refresh } = useAuth()
  
  const [showLoginPage, setShowLoginPage] = useState(false)
  const [activeTab, setActiveTab] = useState('oja')
  const [showProfile, setShowProfile] = useState(false)
  const [evaluationResults, setEvaluationResults] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [displayName, setDisplayName] = useState('User')
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // ─── Notification State ──────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState<Notification[]>([])

  const addNotification = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info',
    link?: string
  ) => {
    const newNotif: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      title,
      message,
      type,
      timestamp: new Date(),
      read: false,
      link,
    }
    setNotifications(prev => [newNotif, ...prev])
  }

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const clearAll = () => {
    setNotifications([])
  }

  // ─── Admin Check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setIsAdmin(account?.is_staff === true)
    setDisplayName(account?.name || account?.username || 'User')
  }, [account])

  // Contribution statistics will be connected when the Django repository API exists.
  const fetchPendingCount = async () => { setPendingCount(0) }

  // ============================================
  // Event Handlers
  // ============================================
  const handleEvaluationComplete = (results?: any) => {
    if (!results) return

    let evalData = results.result || results
    if (!evalData) evalData = results

    console.log('📊 Full evaluation data received:', evalData)

    if (!evalData.metrics) evalData.metrics = {}

    const cleanEvaluation = {
      ...evalData,
      metrics: {
        accuracy: evalData.metrics?.accuracy ?? 0,
        precision: evalData.metrics?.precision ?? 0,
        recall: evalData.metrics?.recall ?? 0,
        f1Score: evalData.metrics?.f1Score ?? evalData.metrics?.f1_score ?? 0,
        roc_auc: evalData.metrics?.roc_auc ?? null,
        confusion_matrix: evalData.metrics?.confusion_matrix ?? null,
        evaluationTime: evalData.metrics?.evaluationTime ?? evalData.metrics?.evaluation_time ?? 0,
        framework: evalData.metrics?.framework ?? null,
        num_samples: evalData.metrics?.num_samples ?? null,
        evaluation_type: evalData.metrics?.evaluation_type ?? evalData.evaluationType ?? 'real_unknown',
        model_type: evalData.metrics?.model_type ?? evalData.modelType ?? 'unknown',
        is_segmentation: evalData.metrics?.is_segmentation ?? evalData.is_segmentation,
        task_type: evalData.metrics?.task_type ?? evalData.task_type,
        mean_dice: evalData.metrics?.mean_dice ?? evalData.mean_dice,
        mean_iou: evalData.metrics?.mean_iou ?? evalData.mean_iou,
        dice_per_class: evalData.metrics?.dice_per_class ?? evalData.dice_per_class,
        iou_per_class: evalData.metrics?.iou_per_class ?? evalData.iou_per_class,
        num_classes: evalData.metrics?.num_classes ?? evalData.num_classes,
      }
    }

    console.log('📊 Clean evaluation data for Results:', cleanEvaluation)
    setEvaluationResults(cleanEvaluation)
    setActiveTab('results')
  }

  const handleSignOut = async () => {
    await signOut()
    setShowLoginPage(false)
    setActiveTab('oja')
    setShowAdminPanel(false)
    setEvaluationResults(null)
    setIsAdmin(false)
  }

  const handleAdminClick = () => {
    setShowAdminPanel(true)
    setActiveTab('admin')
  }

  const handleBackFromAdmin = () => {
    setShowAdminPanel(false)
    setActiveTab('oja')
    if (isAdmin) fetchPendingCount()
  }

  // User object for child components
  const userObj: UserType = {
    id: account?.id || '',
    email: account?.email || '',
    name: account?.name || account?.username || 'User',
  }

  // ============================================
  // Loading State
  // ============================================
  if (!isAuthLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-indigo-600" />
          <p className="text-gray-600">Loading ỌJÀ AI...</p>
        </div>
      </div>
    )
  }

  // ============================================
  // Not Signed In - Show Landing Page with User Info
  // ============================================
  if (window.location.pathname.startsWith('/auth/') || (!isSignedIn && showLoginPage)) {
    return <AuthForm onBack={() => { setShowLoginPage(false); void refresh() }} />
  }
  if (accountError) {
    return <div role="alert" className="p-8 text-center space-y-4">
      <p>{accountError}</p><Button onClick={() => void refresh()}>Retry connection</Button>
    </div>
  }
  if (!isSignedIn) {
    return <LandingPage onLoginClick={() => setShowLoginPage(true)} onGetStarted={() => window.location.assign('/models')} user={null} isSignedIn={false} />
  }

  // ============================================
  // Admin Panel Full Page View
  // ============================================
  if (showAdminPanel) {
    return (
      <AdminRoute>
        <div className="min-h-screen bg-gray-50">
          <AdminContributionDashboard user={userObj} />
          <button
            onClick={handleBackFromAdmin}
            className="fixed bottom-6 right-6 bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 transition-all z-50"
          >
            <Brain className="h-5 w-5" />
          </button>
        </div>
      </AdminRoute>
    )
  }

  // ============================================
  // Profile View
  // ============================================
  if (showProfile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="page-container page-header">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Brain className="h-5 w-5 text-indigo-600" />
              </div>
              <h1 className="text-lg font-semibold"><a href="/" aria-label="ỌJÀ AI home">ỌJÀ AI</a></h1>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowProfile(false)}>← Back</Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>Sign Out</Button>
            </div>
          </div>
        </header>
        <main className="page-container page-content">
          <UserProfile user={userObj} onUserUpdate={() => {}} />
        </main>
        <footer className="text-center text-sm text-gray-500 py-4">
          © 2025 MAILAB. All rights reserved
        </footer>
      </div>
    )
  }

  // ============================================
  // Main Dashboard View
  // ============================================
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ─── Toaster ────────────────────────────────────────────────────── */}
      <Toaster position="top-right" richColors closeButton />

      {/* Header */}
      <header className="dashboard-header bg-white border-b shadow-md sticky top-0 z-10">
        <div className="page-container page-header">
          <div className="page-actions">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Brain className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold"><a href="/" aria-label="ỌJÀ AI home">ỌJÀ AI</a></h1>
              <p className="text-sm text-gray-500 sm:block">Model evaluation and community insights</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <NotificationBell
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onClearAll={clearAll}
              onNotificationClick={(notif) => {
                if (notif.link) {
                  if (notif.link.includes('/evaluations/')) {
                    setActiveTab('results')
                  }
                }
              }}
            />

            {isAdmin && pendingCount > 0 && (
              <button onClick={handleAdminClick} className="relative p-1 rounded-full hover:bg-gray-100">
                <Bell className="h-5 w-5 text-gray-500" />
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              </button>
            )}
            
            {isAdmin && (
              <button 
                onClick={handleAdminClick} 
                className="sm:flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-purple-100 to-indigo-100 rounded-full hover:from-purple-200 hover:to-indigo-200 transition-colors"
              >
                <Crown className="h-3.5 w-3.5 text-purple-600" />
                <span className="text-xs font-medium text-purple-700">Admin</span>
              </button>
            )}
            
            <span className="text-sm md:inline">Welcome, <strong>{displayName}</strong></span>
            <Button variant="outline" size="sm" onClick={() => { void handleSignOut().catch(() => window.alert("Sign out failed. Please try again.")) }}>Sign out</Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.assign("/auth/change-password")}>Change password</Button>
            <Button variant="ghost" size="sm" onClick={() => window.location.assign("/auth/connections")}>Linked sign-in accounts</Button>
          </div>
        </div>
      </header>

      {/* Admin Banner */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4" />
              <span className="text-sm">
                Admin Access | {pendingCount} pending {pendingCount === 1 ? 'review' : 'reviews'}
              </span>
            </div>
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-white hover:bg-gray/20"
              onClick={handleAdminClick}
            >
              Go to Admin Panel →
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="page-container page-content flex-1">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="flex flex-nowrap gap-2 bg-gray-100 p-1 rounded-lg min-w-max">
              <TabsTrigger value="oja" className="flex items-center">
                <Sparkles className="h-4 w-4 mr-2" />ỌJÀ AI
              </TabsTrigger>
              <TabsTrigger value="community" className="flex items-center">
                <Users className="h-4 w-4 mr-2" />Community
              </TabsTrigger>

              {evaluationResults && (
                <TabsTrigger value="results" className="flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />Results
                </TabsTrigger>
              )}
              <TabsTrigger value="analytics" className="flex items-center">
                <BarChart3 className="h-4 w-4 mr-2" />Analytics
              </TabsTrigger>
              <TabsTrigger value="about" className="flex items-center">
                <Info className="h-4 w-4 mr-2" />About
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="admin" className="flex items-center">
                  <Shield className="h-4 w-4 mr-2 text-purple-600" />
                  Admin
                  {pendingCount > 0 && (
                    <Badge className="ml-1 bg-red-500 text-white">{pendingCount}</Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="oja">
            <UnifiedOjaAIDashboard 
              user={userObj} 
              onEvaluationComplete={handleEvaluationComplete} 
              onEvaluationStart={() => {}}
              addNotification={addNotification}
            />
          </TabsContent>

          <TabsContent value="community">
            <Community user={userObj} />
          </TabsContent>

          <TabsContent value="model-zoo">
            <PublicModelZoo embedded />
          </TabsContent>

          <TabsContent value="results">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">Evaluation Results</h2>
                <p className="text-gray-600">Detailed metrics from your latest evaluation</p>
              </div>
              <Button variant="outline" onClick={() => setActiveTab('oja')}>
                <Zap className="h-4 w-4 mr-2" />Run New Evaluation
              </Button>
            </div>
            {evaluationResults ? (
              <EvaluationResults evaluation={evaluationResults} />
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500">No results yet. Run an evaluation to see metrics.</p>
                  <Button className="mt-4" onClick={() => setActiveTab('oja')}>
                    Go to ỌJÀ AI
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <AdvancedMetricsVisualization user={userObj} />
          </TabsContent>

          <TabsContent value="about">
            <RealEvaluationPlan />
          </TabsContent>
          
          {isAdmin && (
            <TabsContent value="admin">
              <AdminContributionDashboard user={userObj} />
            </TabsContent>
          )}
        </Tabs>
      </main>
      
      <footer className="bg-white border-t py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          © 2025 MAILAB. All rights reserved
        </div>
      </footer>
    </div>
  )
}

export default App
