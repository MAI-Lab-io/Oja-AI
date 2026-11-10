// src/hooks/useWorker.ts
import { sessionFetch } from '../lib/api'

// Local marketplace API (oja-backend, port 8000) — replaces Cloudflare Worker
const API_URL = ''

export function useWorker() {

  const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {

    const response = await sessionFetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }))
      throw new Error(error.detail || error.error || `HTTP ${response.status}`)
    }

    // 204 No Content (e.g. DELETE) has no JSON body
    if (response.status === 204) return null

    return response.json()
  }

  const fetchPublic = async (endpoint: string, options: RequestInit = {}) => {
    const response = await sessionFetch(`${API_URL}${endpoint}`, options)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }))
      throw new Error(error.detail || error.error || `HTTP ${response.status}`)
    }

    if (response.status === 204) return null

    return response.json()
  }

  // ── File uploads (local disk, multipart) ───────────────────
  // Replaces the old presigned-URL flow. Files go straight to
  // oja-backend, which saves them under ./upload/{models|datasets}/

  const uploadModelFile = async (modelId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await sessionFetch(`${API_URL}/models/${modelId}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  const uploadDatasetFile = async (datasetId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await sessionFetch(`${API_URL}/datasets/${datasetId}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // ── Models ───────────────────────────────────────────────────

  // Create a model listing (metadata only — call uploadModelFile after)
  const createModel = async (data: {
    name: string
    description?: string
    version?: string
    task_type?: string
    modality?: string
    anatomy?: string
    is_public?: boolean
    tags?: string[]
  }) => {
    return fetchWithAuth('/models/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  const getUserModels = async () => {
    return fetchWithAuth('/models/mine')
  }

  const getModel = async (modelId: string) => {
    return fetchPublic(`/models/${modelId}`)
  }

  const updateModel = async (modelId: string, data: Record<string, unknown>) => {
    return fetchWithAuth(`/models/${modelId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  const deleteModel = async (modelId: string) => {
    return fetchWithAuth(`/models/${modelId}`, { method: 'DELETE' })
  }

  // Public marketplace listing — replaces getCommunityModels
  const getCommunityModels = async () => {
    return fetchPublic('/models/?public_only=true')
  }

  // ── Datasets ─────────────────────────────────────────────────

  const createDataset = async (data: {
    name: string
    description?: string
    task_type?: string
    modality?: string
    anatomy?: string
    num_samples?: number
    label_schema?: Record<string, unknown>
    is_public?: boolean
  }) => {
    return fetchWithAuth('/datasets/', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  const getUserDatasets = async () => {
    return fetchWithAuth('/datasets/mine')
  }

  const getDataset = async (datasetId: string) => {
    return fetchPublic(`/datasets/${datasetId}`)
  }

  const deleteDataset = async (datasetId: string) => {
    return fetchWithAuth(`/datasets/${datasetId}`, { method: 'DELETE' })
  }

  // ── User profile ─────────────────────────────────────────────

  // Calls /users/me — auto-creates the user row on first login
  const getCurrentUser = async () => {
    return fetchWithAuth('/api/v1/accounts/me/')
  }

  const updateProfile = async (data: Record<string, unknown>) => {
    return fetchWithAuth('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  // ── Evaluations ──────────────────────────────────────────────

  // Creates the evaluation record AND dispatches it to the ML engine (port 8001)
  const evaluateModel = async (modelId: string, datasetId: string, config?: Record<string, unknown>) => {
    return fetchWithAuth('/evaluations/', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId, dataset_id: datasetId, config: config || {} }),
    })
  }

  // Poll this — returns status + results once completed
  const getEvaluationStatus = async (jobId: string) => {
    return fetchWithAuth(`/evaluations/${jobId}`)
  }

  // Live progress (0-100%) while the ML engine is running
  const getEvaluationProgress = async (jobId: string) => {
    return fetchWithAuth(`/evaluations/${jobId}/engine-status`)
  }

  const cancelEvaluation = async (jobId: string) => {
    return fetchWithAuth(`/evaluations/${jobId}/cancel`, { method: 'POST' })
  }

  const getMyEvaluations = async () => {
    return fetchWithAuth('/evaluations/')
  }

  const getModelEvaluations = async (modelId: string) => {
    return fetchPublic(`/evaluations/model/${modelId}`)
  }

  return {
    fetchWithAuth,
    fetchPublic,

    // file uploads
    uploadModelFile,
    uploadDatasetFile,

    // models
    createModel,
    getUserModels,
    getModel,
    updateModel,
    deleteModel,
    getCommunityModels,

    // datasets
    createDataset,
    getUserDatasets,
    getDataset,
    deleteDataset,

    // user
    getCurrentUser,
    updateProfile,

    // evaluations
    evaluateModel,
    getEvaluationStatus,
    getEvaluationProgress,
    cancelEvaluation,
    getMyEvaluations,
    getModelEvaluations,

    apiUrl: API_URL,
  }
}