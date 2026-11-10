// components/ModelDocumentation.tsx
import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import {
  Database,
  Brain,
  Code2,
  FileText,
  CheckCircle,
  Cpu,
  Layers,
  ExternalLink
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Checkbox } from './ui/checkbox'

interface ModelDocumentationProps {
  isOpen: boolean
  onClose: () => void
  model: {
    id: string
    name: string
    description: string
    documentation?: string
    input_shape?: any
    output_classes?: any
    supported_modalities?: string[]
    recommended_dataset_types?: string[]
    usage_example?: string
    framework?: string
    version?: string
    license?: string
    author?: string
    modality?: string
    anatomy?: string
    task?: string
    is_community_contribution?: boolean
  }
  onEvaluate?: () => void
}

function generateFallbackDocumentation(model: ModelDocumentationProps['model']): string {
  const lines = []
  lines.push(`# ${model.name}\n`)
  if (model.description) lines.push(`${model.description}\n`)

  lines.push("## Task & Modality\n")
  lines.push(`- **Task:** ${model.task || 'Not specified'}`)
  lines.push(`- **Modality:** ${model.modality || 'Not specified'}`)
  lines.push(`- **Anatomy:** ${model.anatomy || 'Not specified'}\n`)

  lines.push("## Technical Specifications\n")
  lines.push(`- **Framework:** ${model.framework || 'Not specified'}`)
  lines.push(`- **Version:** ${model.version || 'Not specified'}`)

  if (model.input_shape) {
    let shapeStr = ''
    if (Array.isArray(model.input_shape)) {
      shapeStr = model.input_shape.join(' × ')
    } else if (typeof model.input_shape === 'object') {
      shapeStr = Object.values(model.input_shape).join(' × ')
    } else {
      shapeStr = String(model.input_shape)
    }
    lines.push(`- **Input Shape:** \`${shapeStr}\``)
  } else {
    lines.push("- **Input Shape:** Not specified")
  }

  if (model.output_classes) {
    lines.push("- **Output Classes:**")
    if (typeof model.output_classes === 'object') {
      for (const [k, v] of Object.entries(model.output_classes)) {
        lines.push(`  - \`${k}\` → ${v}`)
      }
    } else {
      lines.push(`  - ${model.output_classes}`)
    }
  } else {
    lines.push("- **Output Classes:** Not specified")
  }
  lines.push("")

  if (model.license) {
    lines.push("## License\n")
    lines.push(`- ${model.license}\n`)
  }

  lines.push("## Usage\n")
  lines.push("This model is ready for evaluation using the OJA AI evaluation pipeline. ")
  lines.push("Ensure your dataset matches the expected input shape and modality. ")
  lines.push("The OJA AI platform will automatically apply the required preprocessing during evaluation.\n")

  return lines.join('\n')
}

function renderMarkdown(text: string) {
  if (!text) return null
  
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    
    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      const [fullMatch, linkText, linkUrl] = linkMatch
      const parts = line.split(fullMatch)
      elements.push(
        <p key={i} className="mb-1 text-sm">
          {parts[0]}
          <a 
            href={linkUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
          >
            {linkText}
            <ExternalLink className="h-3 w-3" />
          </a>
          {parts[1]}
        </p>
      )
      i++
      continue
    }
    
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1
      const content = line.replace(/^#+\s*/, '')
      const className = level === 1 ? 'text-lg font-bold mt-2 mb-1' : 'text-base font-semibold mt-2 mb-1'
      elements.push(<div key={i} className={className}>{content}</div>)
      i++
      continue
    }
    
    if (line.startsWith('- ')) {
      elements.push(<li key={i} className="ml-4 list-disc text-sm">{line.slice(2)}</li>)
      i++
      continue
    }
    
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++
      elements.push(
        <pre key={i} className="bg-gray-100 p-2 rounded-md text-xs overflow-x-auto">
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }
    
    if (line.trim() === '') {
      elements.push(<br key={i} />)
      i++
      continue
    }
    
    elements.push(<p key={i} className="mb-1 text-sm">{line}</p>)
    i++
  }
  
  return elements
}

export function ModelDocumentation({
  isOpen,
  onClose,
  model,
  onEvaluate
}: ModelDocumentationProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [readConfirmed, setReadConfirmed] = useState(false)

  // Reset checkbox when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setReadConfirmed(false)
    }
  }, [isOpen])

  const documentationContent = model.documentation || generateFallbackDocumentation(model)

  const formatInputShape = (shape: any): string => {
    if (!shape) return 'N/A'
    if (Array.isArray(shape)) {
      return shape.join(' × ')
    }
    if (typeof shape === 'object') {
      return Object.values(shape).join(' × ')
    }
    return String(shape)
  }

  const formatOutputClasses = (classes: any): string => {
    if (!classes) return 'N/A'
    if (typeof classes === 'object') {
      return Object.entries(classes)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    }
    return String(classes)
  }

  const handleEvaluate = () => {
    if (readConfirmed) {
      onEvaluate?.()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-4 overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                {model.name}
                {model.is_community_contribution && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    Community
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm line-clamp-2">
                {model.description || 'No description available'}
              </DialogDescription>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {model.framework && <Badge variant="outline" className="text-xs">{model.framework}</Badge>}
              {model.version && <Badge variant="outline" className="text-xs">v{model.version}</Badge>}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 mb-2 flex-shrink-0">
          {model.modality && <Badge className="text-xs bg-blue-100 text-blue-700">{model.modality}</Badge>}
          {model.task && <Badge className="text-xs bg-green-100 text-green-700">{model.task}</Badge>}
          {model.anatomy && <Badge className="text-xs bg-amber-100 text-amber-700">{model.anatomy}</Badge>}
          {model.license && <Badge variant="outline" className="text-xs">{model.license}</Badge>}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 h-8 flex-shrink-0">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="specs" className="text-xs">Specs</TabsTrigger>
            <TabsTrigger value="usage" className="text-xs">Usage</TabsTrigger>
            <TabsTrigger value="compatibility" className="text-xs">Compatibility</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-2 overflow-y-auto pr-1" style={{ maxHeight: '350px' }}>
            <TabsContent value="overview" className="space-y-1 m-0">
              {documentationContent ? (
                <div className="prose prose-sm max-w-none text-sm">
                  {renderMarkdown(documentationContent)}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No documentation available.</p>
              )}
            </TabsContent>

            <TabsContent value="specs" className="space-y-2 m-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center">
                    <Layers className="h-3 w-3 mr-1" />
                    Input Shape
                  </h4>
                  <p className="font-mono text-sm">{formatInputShape(model.input_shape)}</p>
                  {model.input_shape && model.input_shape.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {model.input_shape.length === 4 ? '4D (3D + channels)' : 
                       model.input_shape.length === 3 ? '3D volume' : 
                       `${model.input_shape.length}D tensor`}
                    </p>
                  )}
                </div>

                <div className="p-2 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center">
                    <Cpu className="h-3 w-3 mr-1" />
                    Framework
                  </h4>
                  <p className="font-medium text-sm">{model.framework || 'Unknown'}</p>
                </div>

                <div className="col-span-2 p-2 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center">
                    <FileText className="h-3 w-3 mr-1" />
                    Output Classes
                  </h4>
                  <pre className="text-xs whitespace-pre-wrap font-mono bg-gray-100 p-1 rounded">
                    {formatOutputClasses(model.output_classes)}
                  </pre>
                </div>

                <div className="col-span-2 p-2 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center">
                    <FileText className="h-3 w-3 mr-1" />
                    License
                  </h4>
                  <p className="font-medium text-sm">{model.license || 'Unknown'}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="usage" className="m-0">
              {model.usage_example ? (
                <div className="bg-gray-900 text-gray-100 p-3 rounded-lg">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {model.usage_example}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <Code2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No usage example available.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="compatibility" className="space-y-2 m-0">
              <div>
                <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Supported Modalities
                </h4>
                {model.supported_modalities && model.supported_modalities.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {model.supported_modalities.map((modality, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{modality}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">None specified</p>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Recommended Dataset Types
                </h4>
                {model.recommended_dataset_types && model.recommended_dataset_types.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {model.recommended_dataset_types.map((type, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-green-50 text-green-700">
                        {type}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">None specified</p>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-xs text-gray-600 mb-0.5 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Preprocessing Requirements
                </h4>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs">
                  <p className="font-medium text-blue-800">This model expects:</p>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-blue-700">
                    <li>Input shape: {formatInputShape(model.input_shape)}</li>
                    <li>Modality: {model.modality || 'Not specified'}</li>
                    <li>Framework: {model.framework || 'Unknown'}</li>
                  </ul>
                  <p className="mt-1 text-xs text-blue-600">
                    Use OJA AI evaluation pipeline for preprocessing.
                  </p>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* ─── READ CONFIRMATION CHECKBOX ────────────────────────────────── */}
        <div className="flex items-start space-x-2 mt-3 pt-3 border-t flex-shrink-0">
          <Checkbox
            id="read-confirm"
            checked={readConfirmed}
            onCheckedChange={(checked) => setReadConfirmed(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="read-confirm" className="text-sm text-gray-600 cursor-pointer">
            I have read and understood this model's documentation, including input shape, output classes, and preprocessing requirements.
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleEvaluate}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={!readConfirmed}
          >
            <Brain className="h-3 w-3 mr-1" />
            Evaluate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}