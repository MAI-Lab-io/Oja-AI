// src/components/ExportResults.tsx
import React from 'react'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Download, FileText, FileSpreadsheet, FileJson, Printer, Box, Code2, Github } from 'lucide-react'

interface ExportResultsProps {
  results: {
    metrics: any
    model_name?: string
    dataset_name?: string
    evaluation_type?: string
    model_type?: string  // Add model type
    evaluation_time?: number
    num_samples?: number
    [key: string]: any
  }
  evaluationId?: string
}

// ─── Model Type Helper ────────────────────────────────────────────────────────

function getModelTypeLabel(modelType?: string): string {
  const types: Record<string, string> = {
    sklearn: 'scikit-learn',
    tensorflow: 'TensorFlow',
    pytorch: 'PyTorch',
    onnx: 'ONNX',
    unknown: 'Unknown'
  }
  return types[modelType || 'unknown'] || 'Unknown'
}

export function ExportResults({ results, evaluationId }: ExportResultsProps) {
  
  const exportAsCSV = () => {
    // Flatten metrics object
    const flatMetrics: Record<string, any> = {}
    
    const flattenObject = (obj: any, prefix = '') => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          flattenObject(obj[key], `${prefix}${key}_`)
        } else if (Array.isArray(obj[key])) {
          flatMetrics[`${prefix}${key}`] = JSON.stringify(obj[key])
        } else {
          flatMetrics[`${prefix}${key}`] = obj[key]
        }
      }
    }
    
    flattenObject(results.metrics || results)
    
    // Add metadata with model type
    const metadata = {
      evaluation_id: evaluationId || 'N/A',
      export_date: new Date().toISOString(),
      model_name: results.model_name || results.metrics?.model_name || 'Unknown',
      model_type: results.model_type || results.metrics?.model_type || 'Unknown',
      dataset_name: results.dataset_name || results.metrics?.dataset_name || 'Unknown',
      evaluation_type: results.evaluation_type || results.metrics?.evaluation_type || 'Unknown',
      evaluation_time_seconds: results.evaluation_time || results.metrics?.evaluation_time || 'N/A',
      num_samples: results.num_samples || results.metrics?.num_samples || 'N/A'
    }
    
    const allData = { ...metadata, ...flatMetrics }
    
    // Convert to CSV
    const headers = Object.keys(allData)
    const csvRows = [headers.join(',')]
    const values = headers.map(header => {
      const value = allData[header]
      // Handle strings with commas
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`
      }
      return value ?? ''
    })
    csvRows.push(values.join(','))
    
    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluation_${evaluationId || Date.now()}_results.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  const exportAsJSON = () => {
    const exportData = {
      export_date: new Date().toISOString(),
      evaluation_id: evaluationId || 'N/A',
      results: results.metrics || results,
      metadata: {
        model_name: results.model_name || results.metrics?.model_name || 'Unknown',
        model_type: results.model_type || results.metrics?.model_type || 'Unknown',
        dataset_name: results.dataset_name || results.metrics?.dataset_name || 'Unknown',
        evaluation_type: results.evaluation_type || results.metrics?.evaluation_type || 'Unknown',
        evaluation_time: results.evaluation_time || results.metrics?.evaluation_time || 'N/A',
        num_samples: results.num_samples || results.metrics?.num_samples || 'N/A'
      }
    }
    
    const jsonContent = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluation_${evaluationId || Date.now()}_results.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  
  const exportAsPDF = async () => {
    // Dynamic import for html2pdf
    const html2pdf = (await import('html2pdf.js')).default
    
    // Create a temporary div for PDF content
    const printContent = document.createElement('div')
    printContent.style.padding = '20px'
    printContent.style.fontFamily = 'Arial, sans-serif'
    
    // Build PDF content
    const metrics = results.metrics || results
    const modelType = results.model_type || metrics.model_type || 'Unknown'
    
    printContent.innerHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4f46e5;">ỌJÀ AI Evaluation Report</h1>
        <p style="color: #666;">Generated on ${new Date().toLocaleString()}</p>
      </div>
      
      <div style="margin-bottom: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
        <h2 style="margin-top: 0;">Evaluation Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 5px;"><strong>Evaluation ID:</strong></td><td>${evaluationId || 'N/A'}</td></tr>
          <tr><td style="padding: 5px;"><strong>Model:</strong></td><td>${results.model_name || metrics.model_name || 'Unknown'}</td></tr>
          <tr><td style="padding: 5px;"><strong>Model Type:</strong></td><td>${getModelTypeLabel(modelType)}</td></tr>
          <tr><td style="padding: 5px;"><strong>Dataset:</strong></td><td>${results.dataset_name || metrics.dataset_name || 'Unknown'}</td></tr>
          <tr><td style="padding: 5px;"><strong>Evaluation Type:</strong></td><td>${results.evaluation_type || metrics.evaluation_type || 'Unknown'}</td></tr>
          <tr><td style="padding: 5px;"><strong>Evaluation Time:</strong></td><td>${results.evaluation_time || metrics.evaluation_time || 'N/A'} seconds</td></tr>
          <tr><td style="padding: 5px;"><strong>Samples:</strong></td><td>${results.num_samples || metrics.num_samples || 'N/A'}</td></tr>
        </table>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h2>Performance Metrics</h2>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
          <tr style="background: #4f46e5; color: white;">
            <th style="padding: 10px; text-align: left;">Metric</th>
            <th style="padding: 10px; text-align: left;">Value</th>
          </tr>
          ${Object.entries(metrics)
            .filter(([key]) => !['confusion_matrix', 'classification_report', 'model_name', 'dataset_name', 'model_type', 'evaluation_type'].includes(key))
            .map(([key, value]) => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;"><strong>${key.replace(/_/g, ' ').toUpperCase()}</strong></td>
                <td style="padding: 8px;">${typeof value === 'number' ? value.toFixed(4) : value}</td>
              </tr>
            `).join('')}
        </table>
      </div>
      
      ${metrics.confusion_matrix ? `
        <div style="margin-bottom: 20px;">
          <h2>Confusion Matrix</h2>
          <table style="width: auto; border-collapse: collapse; border: 1px solid #ddd;">
            ${metrics.confusion_matrix.map((row: number[], i: number) => `
              <tr>
                ${row.map((cell: number, j: number) => `
                  <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${cell}</td>
                `).join('')}
              </tr>
            `).join('')}
          </table>
        </div>
      ` : ''}
      
      ${metrics.roc_auc ? `
        <div style="margin-bottom: 20px;">
          <h2>Additional Metrics</h2>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background: #4f46e5; color: white;">
              <th style="padding: 10px; text-align: left;">Metric</th>
              <th style="padding: 10px; text-align: left;">Value</th>
            </tr>
            <tr>
              <td style="padding: 8px;"><strong>ROC-AUC</strong></td>
              <td style="padding: 8px;">${metrics.roc_auc.toFixed(4)}</td>
            </tr>
          </table>
        </div>
      ` : ''}
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
        <p>ỌJÀ AI - Medical AI Marketplace & Real ML Evaluation Platform</p>
        <p>${new Date().getFullYear()} MAILAB. All rights reserved.</p>
      </div>
    `
    
    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: `evaluation_${evaluationId || Date.now()}_report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, logging: false },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }
    
    html2pdf().set(opt).from(printContent).save()
  }
  
  const printResults = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    
    const metrics = results.metrics || results
    const modelType = results.model_type || metrics.model_type || 'Unknown'
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ỌJÀ AI Evaluation Results</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #4f46e5; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #4f46e5; color: white; }
          .header { text-align: center; margin-bottom: 30px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
          .badge { 
            display: inline-block; 
            padding: 2px 10px; 
            border-radius: 12px; 
            font-size: 12px; 
            font-weight: 600;
          }
          .badge-sklearn { background: #dbeafe; color: #1d4ed8; }
          .badge-tensorflow { background: #ffedd5; color: #c2410c; }
          .badge-pytorch { background: #fee2e2; color: #b91c1c; }
          .badge-unknown { background: #f3f4f6; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ỌJÀ AI Evaluation Results</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <h2>Evaluation Details</h2>
        <table>
          <tr><td><strong>Evaluation ID:</strong></td><td>${evaluationId || 'N/A'}</td></tr>
          <tr><td><strong>Model:</strong></td><td>${results.model_name || metrics.model_name || 'Unknown'}</td></tr>
          <tr><td><strong>Model Type:</strong></td><td><span class="badge badge-${modelType}">${getModelTypeLabel(modelType)}</span></td></tr>
          <tr><td><strong>Dataset:</strong></td><td>${results.dataset_name || metrics.dataset_name || 'Unknown'}</td></tr>
          <tr><td><strong>Evaluation Type:</strong></td><td>${results.evaluation_type || metrics.evaluation_type || 'Unknown'}</td></tr>
          <tr><td><strong>Samples:</strong></td><td>${results.num_samples || metrics.num_samples || 'N/A'}</td></tr>
        </table>
        
        <h2>Performance Metrics</h2>
        <table>
          <tr><th>Metric</th><th>Value</th></tr>
          ${Object.entries(metrics)
            .filter(([key]) => !['confusion_matrix', 'classification_report', 'model_name', 'dataset_name', 'model_type', 'evaluation_type', 'num_samples'].includes(key))
            .map(([key, value]) => `<tr><td><strong>${key.replace(/_/g, ' ').toUpperCase()}</strong></td><td>${typeof value === 'number' ? value.toFixed(4) : value}</td></tr>`)
            .join('')}
        </table>
        
        ${metrics.confusion_matrix ? `
          <h2>Confusion Matrix</h2>
          <table>
            ${metrics.confusion_matrix.map((row: number[], i: number) => `
              <tr>
                ${row.map((cell: number, j: number) => `
                  <td style="text-align: center; ${i === j ? 'background: #dcfce7;' : ''}">${cell}</td>
                `).join('')}
              </tr>
            `).join('')}
          </table>
        ` : ''}
        
        <div class="footer">
          <p>ỌJÀ AI - Medical AI Marketplace & Real ML Evaluation Platform</p>
          <p>© ${new Date().getFullYear()} MAILAB. All rights reserved.</p>
        </div>
      </body>
      </html>
    `)
    
    printWindow.document.close()
    printWindow.print()
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Results
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsCSV} className="cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsJSON} className="cursor-pointer">
          <FileJson className="h-4 w-4 mr-2" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsPDF} className="cursor-pointer">
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={printResults} className="cursor-pointer">
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}