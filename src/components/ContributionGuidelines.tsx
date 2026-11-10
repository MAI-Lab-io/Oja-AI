// components/ContributionGuidelines.tsx
import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { 
  FileCheck, 
  Shield, 
  Github, 
  Mail, 
  Clock, 
  Star, 
  Package,
  Upload,
  BookOpen,
  CheckCircle,
  Box,
  Code2,
  Cpu,
  Award,
  Brain,
  Database,
  Sparkles
} from 'lucide-react'
import { Badge } from './ui/badge'

interface User {
  id: string
  email: string
  name?: string
  clerk_id?: string
}

interface ContributionGuidelinesProps {
  user: User
  onStartContributing?: () => void
  onNavigate?: (tab: string) => void // 👈 NEW
}

export function ContributionGuidelines({ user, onStartContributing, onNavigate }: ContributionGuidelinesProps) {
  const handleStartContributing = () => {
    if (onStartContributing) {
      onStartContributing()
    } else if (onNavigate) {
      onNavigate('contribute')
    } else {
      // Fallback: try to find and click the contribute tab
      const contributeTab = document.querySelector('[value="contribute"]') as HTMLButtonElement
      if (contributeTab) {
        contributeTab.click()
      }
    }
  }

  const supportedFormats = [
    { ext: '.pkl', label: 'scikit-learn', icon: <Box className="h-4 w-4" />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { ext: '.h5, .keras', label: 'TensorFlow/Keras', icon: <Code2 className="h-4 w-4" />, color: 'bg-orange-100 text-orange-700 border-orange-200' },
    { ext: '.pt, .pth', label: 'PyTorch', icon: <Cpu className="h-4 w-4" />, color: 'bg-red-100 text-red-700 border-red-200' },
    { ext: '.onnx', label: 'ONNX', icon: <Cpu className="h-4 w-4" />, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  ]

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-indigo-600" />
                Contribution Guidelines
              </h2>
              <p className="text-gray-600 max-w-2xl">
                Share your models with the ỌJÀ AI community. Follow these guidelines to ensure 
                your submission meets our quality standards.
              </p>
            </div>
            <Upload className="h-12 w-12 text-indigo-600 opacity-50" />
          </div>
        </CardContent>
      </Card>

      {/* Supported Formats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5 text-indigo-600" />
            <span>Supported Model Formats</span>
          </CardTitle>
          <CardDescription>Your model will be automatically detected based on file extension</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {supportedFormats.map((format) => (
              <Badge key={format.ext} className={`text-sm px-4 py-2 ${format.color}`}>
                <span className="flex items-center space-x-2">
                  {format.icon}
                  <span>{format.ext}</span>
                  <span className="text-xs opacity-75">→ {format.label}</span>
                </span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Requirements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 border-green-100 bg-gradient-to-br from-green-50 to-white">
          <CardHeader>
            <FileCheck className="h-8 w-8 text-green-600 mb-2" />
            <CardTitle>Model Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>✓ Model must be uploaded to your account first</p>
            <p>✓ Supported formats: .h5, .pt, .onnx, .pth, .keras, .pkl</p>
            <p>✓ Maximum size: 500 MB</p>
            <p>✓ Valid license (MIT, Apache-2.0, GPL-3.0, CC-BY-NC, CC-BY-SA)</p>
            <p>✓ README with usage examples and requirements</p>
            <p>✓ Clear description of architecture and task</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-white">
          <CardHeader>
            <Shield className="h-8 w-8 text-blue-600 mb-2" />
            <CardTitle>Platinum Tier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>⭐ MONAI Bundle format (configs + weights + docs)</p>
            <p>⭐ Docker container with inference endpoint</p>
            <p>⭐ Training code repository link</p>
            <p>⭐ Performance metrics on standard benchmarks</p>
            <p>⭐ Live Colab demo notebook</p>
            <p>⭐ Gets "Platinum" badge in Oja Models</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-100 bg-gradient-to-br from-amber-50 to-white">
          <CardHeader>
            <Clock className="h-8 w-8 text-amber-600 mb-2" />
            <CardTitle>Review Process</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>1. Automated validation (format, size, fields)</p>
            <p>2. Manual review by OJA AI team</p>
            <p>3. Timeline: 2-3 business days</p>
            <p>4. Approval notification via email</p>
            <p>5. Model appears with "Community" badge</p>
            <p>6. Platinum models featured prominently</p>
          </CardContent>
        </Card>
      </div>

      {/* Submission Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span>Submission Checklist</span>
          </CardTitle>
          <CardDescription>Before submitting, ensure you have:</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Model uploaded to your account</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Tested model loads and runs inference</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Included input/output specifications</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Documented hardware requirements</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Chosen appropriate license</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Have rights to share this model</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>Model type detected correctly</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>README with usage examples</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Start Guide */}
      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            <span>Quick Start Guide</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">1</div>
              <div>
                <h4 className="font-medium">Upload Your Model</h4>
                <p className="text-sm text-gray-600">First, upload your model file to your OJA AI account via the <strong>"Upload Data"</strong> page.</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">2</div>
              <div>
                <h4 className="font-medium">Select Model for Contribution</h4>
                <p className="text-sm text-gray-600">In the <strong>"Contribute"</strong> tab, choose the model you want to share from your account.</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">3</div>
              <div>
                <h4 className="font-medium">Add Documentation & Metadata</h4>
                <p className="text-sm text-gray-600">Provide author details, a README, demo links, and optional performance metrics.</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">4</div>
              <div>
                <h4 className="font-medium">Submit for Review</h4>
                <p className="text-sm text-gray-600">Our team will review your submission within 2-3 business days. You'll be notified via email.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="flex flex-wrap justify-center gap-4 pt-4">
        <Button onClick={handleStartContributing} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Upload className="h-4 w-4 mr-2" />
          Start Contributing
        </Button>
        <Button variant="outline" onClick={() => window.open('https://github.com/oja-ai/model-zoo-examples', '_blank')}>
          <Github className="h-4 w-4 mr-2" />
          View Examples
        </Button>
        <Button variant="outline" onClick={() => window.open('mailto:community@oja.ai', '_blank')}>
          <Mail className="h-4 w-4 mr-2" />
          Contact Support
        </Button>
      </div>
    </div>
  )
}