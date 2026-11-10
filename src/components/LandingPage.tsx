import React, { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { apiRequest } from '../lib/api'
import { 
  Brain, 
  Upload, 
  BarChart3, 
  Users, 
  Shield, 
  Zap, 
  ArrowRight, 
  CheckCircle,
  Stethoscope,
  Database,
  Store,
  TrendingUp,
  Award,
  Globe,
  LogIn,
  User,
  Sparkles,
  Heart,
  Activity,
  Clock,
  Star,
  MessageCircle,
  Github,
  Twitter,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  ChevronRight,
  Play,
  Layers,
  Cpu,
  FileText,
  Home,
  Info,
  BookOpen
} from 'lucide-react'
import { HomeMarketPreview } from './HomeMarketPreview'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface LandingPageProps {
  onLoginClick: () => void
  onGetStarted?: () => void
  user?: User | null
  isSignedIn?: boolean
}

// ─── CountUp Hook ───────────────────────────────────────────────
function useCountUp(target: number, duration: number = 2000, inView: boolean) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!inView) return

    let start = 0
    const increment = target / (duration / 16)
    const timer = setInterval(() => {
      start += increment
      if (start >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)

    return () => clearInterval(timer)
  }, [inView, target, duration])

  return count
}

// ─── StatItem Component ─────────────────────────────────────────
function StatItem({ value, label }: { value: number | null; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const count = useCountUp(value ?? 0, 2000, inView)

  return (
    <div ref={ref}>
      <div className="text-3xl md:text-4xl font-bold text-white mb-2">
        {value === null ? '—' : count.toLocaleString()}
      </div>
      <div className="text-indigo-200">{label}</div>
    </div>
  )
}

export function LandingPage({ onLoginClick, onGetStarted = onLoginClick, user, isSignedIn }: LandingPageProps) {
  const [statistics, setStatistics] = useState<{ models: number; datasets: number; published_versions: number; contributors: number } | null>(null)
  const [statisticsError, setStatisticsError] = useState(false)
  useEffect(() => {
    let active = true
    apiRequest('/api/v1/statistics/').then(data => { if (active) setStatistics(data) })
      .catch(() => { if (active) setStatisticsError(true) })
    return () => { active = false }
  }, [])
  // Get user's name
  const userName = user?.name || user?.email?.split('@')[0] || 'Guest'

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Brain className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900"><a href="/" aria-label="ỌJÀ AI home">ỌJÀ AI</a></h1>
              </div>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#home" className="text-gray-700 hover:text-indigo-600 transition-colors">
                Home
              </a>
              <a href="#services" className="text-gray-700 hover:text-indigo-600 transition-colors">
                Services
              </a>
              <a href="#blog" className="text-gray-700 hover:text-indigo-600 transition-colors">
                Blog
              </a>
              <a href="#contact" className="text-gray-700 hover:text-indigo-600 transition-colors">
                Contact
              </a>
              
              {/* ─── Show User Info or Login Button ───────────────────────────── */}
              {isSignedIn && user ? (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-700">
                      {userName}
                    </span>
                  </div>
                  <Button 
                    onClick={onLoginClick} 
                    variant="outline" 
                    size="sm"
                    className="text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                  >
                    Dashboard
                  </Button>
                </div>
              ) : (
                <Button onClick={onLoginClick} className="bg-indigo-600 hover:bg-indigo-700">
                  <LogIn className="h-4 w-4 mr-2" />
                  Login
                </Button>
              )}
            </nav>
            
            {/* Mobile menu button */}
            <div className="md:hidden flex items-center space-x-2">
              {isSignedIn && user && (
                <span className="text-sm font-medium text-gray-700">{userName}</span>
              )}
              <Button onClick={onLoginClick} size="sm">
                {isSignedIn ? 'Dashboard' : 'Login'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="home" className="py-20 bg-gradient-to-br from-indigo-50 to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Badge variant="secondary" className="mb-4">
              <Store className="h-3 w-3 mr-1" />
              AI Models & Datasets Marketplace
            </Badge>
            
            {/* ─── Platform introduction ───────────────────────────────── */}
              <>
                <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
                  Welcome to <span className="text-indigo-600">ỌJÀ AI</span>
                </h1>
                <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                  The premier marketplace for AI models and datasets. Upload, evaluate, and discover 
                  cutting-edge machine learning models and datasets across domains.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button onClick={onGetStarted} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                    Browse market <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="lg">
                    Learn More
                  </Button>
                </div>
              </>
          </div>
        </div>
      </section>

      <HomeMarketPreview />

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              What is ỌJÀ AI?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              ỌJÀ AI is a comprehensive platform that bridges the gap between AI research and real-world applications. 
              "Ọjà" means "marketplace" in Yoruba, reflecting our mission to create a vibrant ecosystem for AI models and datasets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <Card className="home-feature-card text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="mx-auto mb-4 p-3 bg-green-100 rounded-full w-fit">
                  <Store className="h-8 w-8 text-green-600" />
                </div>
                <CardTitle>AI Model Marketplace</CardTitle>
                <CardDescription>
                  Discover and download pre-trained AI models from researchers and developers worldwide.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="home-feature-card text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-fit">
                  <Upload className="h-8 w-8 text-blue-600" />
                </div>
                <CardTitle>Model Evaluation</CardTitle>
                <CardDescription>
                  Upload your AI models and evaluate their performance with comprehensive metrics and visualizations.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="home-feature-card text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="mx-auto mb-4 p-3 bg-purple-100 rounded-full w-fit">
                  <Stethoscope className="h-8 w-8 text-purple-600" />
                </div>
                <CardTitle>Flexible Data Support</CardTitle>
                <CardDescription>
                  Support for text, images, CSV files, and specialist formats such as NIfTI and DICOM for comprehensive analysis.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Our Services
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive tools and services for AI development and deployment
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Performance Analytics</h3>
                  <p className="text-gray-600">
                    Get detailed insights into your model's performance with accuracy, precision, recall, F1-score, and custom metrics.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Database className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Dataset Management</h3>
                  <p className="text-gray-600">
                    Secure upload and management of datasets with support for multiple formats, versioning, and provenance.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Collaborative Research</h3>
                  <p className="text-gray-600">
                    Connect with researchers worldwide, share models and datasets, and collaborate on AI projects.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Security & Access Control</h3>
                  <p className="text-gray-600">
                    Account verification and access controls to help protect your datasets and AI models.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Zap className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Fast Processing</h3>
                  <p className="text-gray-600">
                    High-performance computing infrastructure for rapid model evaluation and analysis.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Award className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Quality Assurance</h3>
                  <p className="text-gray-600">
                    File validation and integrity checks to help maintain reliable model and dataset releases.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats — animated count-up */}
      <section className="py-20 bg-indigo-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <StatItem value={statistics?.models ?? null} label="Public AI models" />
            <StatItem value={statistics?.datasets ?? null} label="Public datasets" />
            <StatItem value={statistics?.published_versions ?? null} label="Published versions" />
            <StatItem value={statistics?.contributors ?? null} label="Contributors" />
          </div>
          {!statistics && <p className="home-statistics-note" role="status">{statisticsError ? 'Platform statistics are temporarily unavailable.' : 'Loading platform statistics…'}</p>}
        </div>
      </section>

      {/* CTA Section */}
      <section aria-label="Get started with Oja AI" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Ready to evaluate your models?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Your AI journey continues. Explore your models and datasets, run evaluations, and get insights today.
          </p>
          {isSignedIn && user ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button onClick={onLoginClick} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                  Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" size="lg" onClick={onGetStarted}>
                  View Oja Models
                </Button>
              </div>
          ) : (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button onClick={onGetStarted} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                  Start Your Journey <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" size="lg">
                  Schedule Demo
                </Button>
              </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-indigo-600 rounded-lg">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-semibold">ỌJÀ AI</span>
              </div>
              <p className="text-gray-400">
                Advancing AI through shared models, datasets, collaborative innovation, and accessible technology.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="/models" className="hover:text-white transition-colors">Oja Models</a></li>
                <li><a href="/datasets" className="hover:text-white transition-colors">Oja Datasets</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Evaluation Tools</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Analytics</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Access</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Tutorials</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Research Papers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>© 2025 MAILAB. All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
