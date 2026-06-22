/**
 * API Client - Backend Communication Layer
 *
 * Centralized axios-based API client for all backend HTTP requests.
 * Provides typed interfaces for each API endpoint with automatic
 * error handling and response unwrapping.
 *
 * **API Categories:**
 * - dataApi: Dataset upload, metadata, statistics, preview
 * - visualizationApi: Chart data generation and validation
 * - templateApi: Dashboard template persistence
 * - reconciliationApi: Data reconciliation operations
 * - exportApi: HTML report generation
 * - modelApi: Regression model management
 * - aiApi: AI-powered suggestions and formula generation
 *
 * **Error Handling:**
 * All requests throw Error with backend error messages on failure.
 * Errors should be caught and displayed in the UI.
 *
 * **Base URL:**
 * Configured to use `/api/v1` prefix. In development, Vite proxy
 * forwards to localhost:8000. In production, served from same origin.
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  APIResponse,
  DatasetInfo,
  DataStatistics,
  DataPreview,
  VisualizationConfig,
  PlotDataResponse,
  TemplateConfig,
  VisualizationTypeInfo,
  GlobalVariable,
} from '@/types';

// Create axios instance with base configuration
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Error handler
const handleError = (error: AxiosError): never => {
  if (error.response) {
    const data = error.response.data as {
      detail?: string | { error_class?: string; message?: string; [k: string]: unknown };
      error?: string;
    };
    // FastAPI may return `detail` as either a string or a structured object.
    // For AI endpoints the object carries an `error_class` discriminator; we
    // surface the human message on the Error and stash the raw payload so
    // aiApi wrappers can re-throw a typed AIError.
    let message = 'Request failed';
    if (typeof data.detail === 'string') {
      message = data.detail;
    } else if (data.detail && typeof data.detail === 'object') {
      message = (data.detail.message as string) || data.error || message;
    } else if (data.error) {
      message = data.error;
    }
    const err = new Error(message) as Error & {
      __aiDetail?: unknown;
      __status?: number;
    };
    if (data.detail && typeof data.detail === 'object' && 'error_class' in data.detail) {
      err.__aiDetail = data.detail;
      err.__status = error.response.status;
    }
    throw err;
  }
  throw new Error(error.message || 'Network error');
};

// ============= Data API =============

export const dataApi = {
  /**
   * Upload an Excel file
   */
  upload: async (file: File, cleaningConfig?: import('@/types').CleaningConfig): Promise<DatasetInfo> => {
    const formData = new FormData();
    formData.append('file', file);
    if (cleaningConfig) {
      formData.append('cleaning_config', JSON.stringify(cleaningConfig));
    }

    const response = await api.post<APIResponse<DatasetInfo>>('/data/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.data.success || !response.data.data) {
      console.error('Upload response error:', response.data);
      throw new Error(response.data.message || 'Upload failed');
    }

    return response.data.data;
  },

  /**
   * List all datasets
   */
  listDatasets: async (): Promise<DatasetInfo[]> => {
    const response = await api.get<APIResponse<DatasetInfo[]>>('/data/datasets');
    return response.data.data || [];
  },

  /**
   * Get dataset info
   */
  getDataset: async (datasetId: string): Promise<DatasetInfo> => {
    const response = await api.get<APIResponse<DatasetInfo>>(`/data/datasets/${datasetId}`);
    if (!response.data.data) {
      throw new Error('Dataset not found');
    }
    return response.data.data;
  },

  /**
   * Delete a dataset
   */
  deleteDataset: async (datasetId: string): Promise<void> => {
    await api.delete(`/data/datasets/${datasetId}`);
  },

  /**
   * Get statistics for a dataset
   */
  getStatistics: async (datasetId: string, columns?: string[]): Promise<DataStatistics[]> => {
    const params = columns ? { columns: columns.join(',') } : {};
    const response = await api.get<APIResponse<DataStatistics[]>>(
      `/data/datasets/${datasetId}/statistics`,
      { params }
    );
    return response.data.data || [];
  },

  /**
   * Get preview of dataset
   */
  getPreview: async (datasetId: string, rows: number = 10): Promise<DataPreview> => {
    const response = await api.get<APIResponse<DataPreview>>(
      `/data/datasets/${datasetId}/preview`,
      { params: { rows } }
    );
    return response.data.data || { columns: [], rows: [] };
  },
};

// ============= Visualization API =============

export const visualizationApi = {
  /**
   * Generate plot data
   */
  getPlotData: async (
    datasetId: string,
    config: VisualizationConfig,
    globalVariables: GlobalVariable[] = [],
    dateRange: { start: string; end: string } | null = null,
    useReconciled: boolean = false,
    reconciliationResults: import('@/types').ReconciliationResponse | null = null
  ): Promise<PlotDataResponse> => {
    const response = await api.post<PlotDataResponse>('/visualizations/plot-data', {
      dataset_id: datasetId,
      config,
      global_variables: globalVariables,
      date_range: dateRange,
      use_reconciled: useReconciled,
      reconciliation_results: reconciliationResults
    });
    return response.data;
  },

  /**
   * Validate visualization config
   */
  validateConfig: async (config: VisualizationConfig): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> => {
    const response = await api.post<APIResponse<{
      valid: boolean;
      errors: string[];
      warnings: string[];
    }>>('/visualizations/validate-config', config);
    return response.data.data || { valid: false, errors: ['Validation failed'], warnings: [] };
  },

  /**
   * Get available visualization types
   */
  getTypes: async (): Promise<VisualizationTypeInfo[]> => {
    const response = await api.get<APIResponse<VisualizationTypeInfo[]>>('/visualizations/types');
    return response.data.data || [];
  },

  /**
   * Get color palette
   */
  getColors: async (): Promise<string[]> => {
    const response = await api.get<APIResponse<string[]>>('/visualizations/colors');
    return response.data.data || [];
  },
};

// ============= Template API =============

export const templateApi = {
  /**
   * Save template (returns template JSON)
   */

  save: async (data: TemplateConfig) => {
    // data includes reconciliationConfig now
    const response = await api.post('/templates/save', data);
    return response.data;
  },

  /**
   * Load template from file
   */
  load: async (file: File): Promise<TemplateConfig> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<APIResponse<TemplateConfig>>('/templates/load', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.data.data) {
      throw new Error('Failed to load template');
    }

    return response.data.data;
  },

  /**
   * List saved templates
   */
  listSaved: async (): Promise<import('@/types').SavedTemplate[]> => {
    const response = await api.get<APIResponse<import('@/types').SavedTemplate[]>>('/templates/list');
    return response.data.data || [];
  },

  /**
   * Save template persistently
   */
  savePersistent: async (name: string, config: TemplateConfig, overwrite: boolean = false) => {
    const response = await api.post('/templates/save-persistent', {
      name,
      config,
      overwrite
    });
    return response.data;
  },

  /**
   * Load saved template
   */
  loadSaved: async (name: string): Promise<TemplateConfig> => {
    const response = await api.get<APIResponse<TemplateConfig>>(`/templates/load-persistent/${name}`);
    if (!response.data.data) {
      throw new Error('Failed to load template');
    }
    return response.data.data;
  },

  /**
   * Delete saved template
   */
  deleteSaved: async (name: string) => {
    const response = await api.delete(`/templates/delete/${name}`);
    return response.data;
  },

  /**
   * Rename saved template
   */
  renameSaved: async (oldName: string, newName: string) => {
    const response = await api.post('/templates/rename', {
      old_name: oldName,
      new_name: newName
    });
    return response.data;
  },

  /**
   * Validate template
   */
  validate: async (template: TemplateConfig): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    visualization_count: number;
  }> => {
    const response = await api.post<APIResponse<{
      valid: boolean;
      errors: string[];
      warnings: string[];
      visualization_count: number;
    }>>('/templates/validate', template);
    return response.data.data || { valid: false, errors: [], warnings: [], visualization_count: 0 };
  },
};


// ============= Settings API =============

export const settingsApi = {
  /**
   * Read current security settings (formula-sandbox opt-out state).
   */
  getSecurity: async (): Promise<{ allow_unsafe_formulas: boolean }> => {
    const response = await api.get<APIResponse<{ allow_unsafe_formulas: boolean }>>(
      '/settings/security'
    );
    return response.data.data || { allow_unsafe_formulas: false };
  },

  /**
   * Enable/disable the formula sandbox at runtime.
   */
  setSecurity: async (allow: boolean): Promise<{ allow_unsafe_formulas: boolean }> => {
    const response = await api.put<APIResponse<{ allow_unsafe_formulas: boolean }>>(
      '/settings/security',
      { allow_unsafe_formulas: allow }
    );
    return response.data.data || { allow_unsafe_formulas: allow };
  },
};


// ============= Export API =============

export const exportApi = {
  /**
   * Export dashboard to HTML
   */
  exportDashboard: async (data: {
    dataset_id: string;
    visualizations: VisualizationConfig[];
    plant_name: string;
    comments?: string;
    date_range?: { start: string; end: string } | null;
    global_variables?: GlobalVariable[];
    settings?: {
      author_name: string;
      job_title: string;
      location: string;
      primary_color: string;
      secondary_color: string;
      logo_base64?: string;
    };
    storyline_events?: import('@/types').StorylineEvent[];
    report_sections?: {
      comments: boolean;
      storyline: boolean;
      statistics: boolean;
      visualizations: boolean;
    };
  }) => {
    const response = await api.post('/export/dashboard', data, {
      responseType: 'blob', // Important for file download
    });
    return response.data;
  },

  /**
   * Export raw data to Excel
   */
  exportData: async (data: {
    dataset_id: string;
    date_range?: { start: string; end: string } | null;
    global_variables?: GlobalVariable[];
    formula_visualizations?: VisualizationConfig[];
    sections?: {
      original_data: boolean;
      reconciled_variables: boolean;
      global_variables: boolean;
      formula_results: boolean;
    };
  }) => {
    const response = await api.post('/export/data', data, {
      responseType: 'blob',
    });
    return response.data;
  },
};

// ============= Reconciliation API =============

export const reconciliationApi = {
  reconcile: async (datasetId: string, config: import('@/types').ReconciliationConfig) => {
    // Note: This endpoint returns data directly, not wrapped in APIResponse
    const response = await api.post<import('@/types').ReconciliationResponse>('/reconcile', { dataset_id: datasetId, config });
    return response.data;
  }
};

// ============= AI API =============

import type {
  AIProvider,
  AIModelInfo,
  AIProviderInfo,
  AISuggestRequest,
  AISuggestResponse,
  AISuggestion,
  AIApplyResponse,
  AIErrorClass,
  AIErrorDetail,
} from '@/types';

/**
 * Typed error raised by `aiApi.suggest` and `aiApi.generateFormula` when the
 * backend returns a structured `detail` payload (see `AIErrorDetail`).
 * UI components branch on `error_class` rather than parsing `message`.
 */
export class AIError extends Error {
  error_class: AIErrorClass;
  provider?: string | null;
  retry_advised: boolean;
  retry_after_s?: number | null;
  status?: number;

  constructor(detail: AIErrorDetail, status?: number) {
    super(detail.message || 'AI request failed');
    this.name = 'AIError';
    this.error_class = detail.error_class;
    this.provider = detail.provider;
    this.retry_advised = Boolean(detail.retry_advised);
    this.retry_after_s = detail.retry_after_s;
    this.status = status;
  }
}

// Allowed `AIErrorClass` values. Mirrors backend `AIErrorClass` enum.
// Used to validate the discriminator before indexing into UI copy maps
// (e.g. `_ERROR_COPY[errorClass]`), since a future/unknown class value
// would otherwise crash the panel with an undefined-deref.
const _AI_ERROR_CLASS_VALUES: ReadonlySet<AIErrorClass> = new Set<AIErrorClass>([
  'invalid_key',
  'rate_limit',
  'quota_exceeded',
  'timeout',
  'provider_unavailable',
  'invalid_output',
  'unknown',
]);

/**
 * Inspect an error thrown from an `aiApi` call (already wrapped by the axios
 * interceptor into a plain `Error`). If the original response carried an
 * `AIErrorDetail`, rethrow it as an `AIError`; otherwise leave untouched.
 *
 * Used only inside the suggest/generateFormula wrappers so that consumers
 * receive a typed error without needing to know about axios internals.
 */
function _rethrowAsAIError(err: unknown): never {
  // The `handleError` interceptor at the top of this file turns response
  // errors into plain Error and stashes the structured AI payload on
  // `__aiDetail` / `__status`. We read those off here and rethrow as a
  // typed AIError so call sites don't need to know about axios internals.
  const maybeAI = (err as { __aiDetail?: AIErrorDetail; __status?: number });
  if (maybeAI.__aiDetail && maybeAI.__aiDetail.error_class) {
    // Defensive: if the backend ships a new `error_class` value before the
    // frontend learns about it, coerce to `'unknown'` so consumer code
    // (which indexes `_ERROR_COPY[errorClass]`) never blows up.
    const detail = maybeAI.__aiDetail;
    if (!_AI_ERROR_CLASS_VALUES.has(detail.error_class)) {
      console.warn(
        '[AI] Unknown error_class %o received from backend; falling back to "unknown".',
        detail.error_class,
      );
      throw new AIError({ ...detail, error_class: 'unknown' }, maybeAI.__status);
    }
    throw new AIError(detail, maybeAI.__status);
  }
  throw err as Error;
}

export const aiApi = {
  /**
   * Get available AI providers.
   *
   * Validates the response shape — any item missing the required
   * ``id``/``name`` fields is dropped with a console warning rather than
   * crashing downstream consumers that assume a well-formed list.
   */
  getProviders: async (): Promise<AIProviderInfo[]> => {
    const response = await api.get<APIResponse<AIProviderInfo[]>>('/ai/providers');
    const raw = response.data.data || [];
    const valid: AIProviderInfo[] = [];
    for (const item of raw) {
      if (
        item
        && typeof item === 'object'
        && typeof (item as AIProviderInfo).id === 'string'
        && typeof (item as AIProviderInfo).name === 'string'
      ) {
        valid.push(item as AIProviderInfo);
      } else {
        console.warn('[AI] Dropping malformed provider entry from /ai/providers:', item);
      }
    }
    return valid;
  },

  /**
   * Fetch available models from a provider's API using the user's API key.
   * Falls back to the static model list on failure.
   */
  fetchProviderModels: async (provider: AIProvider, apiKey: string): Promise<AIModelInfo[]> => {
    const response = await api.post<APIResponse<{ models: AIModelInfo[]; fetched: boolean; error: string | null }>>(
      `/ai/providers/${provider}/models`,
      { api_key: apiKey }
    );
    const result = response.data.data;
    if (result?.error) {
      console.warn(`[AI] Failed to fetch ${provider} models dynamically:`, result.error);
    }
    return result?.models || [];
  },

  /**
   * Generate AI visualization suggestions.
   *
   * Pass an AbortSignal to cancel an in-flight request (e.g. when the
   * wizard modal closes or the user regenerates mid-call). Each returned
   * suggestion is given a client-side stable id so parent components can
   * track apply/expand state without depending on array index.
   */
  suggest: async (
    request: AISuggestRequest,
    signal?: AbortSignal,
  ): Promise<AISuggestResponse> => {
    let response;
    try {
      response = await api.post<APIResponse<AISuggestResponse>>(
        '/ai/suggest',
        request,
        { signal },
      );
    } catch (err) {
      _rethrowAsAIError(err);
    }
    if (!response.data.data) {
      throw new Error('Failed to get AI suggestions');
    }
    const data = response.data.data;
    const withIds: AISuggestResponse = {
      ...data,
      suggestions: data.suggestions.map((s) => ({
        ...s,
        id: s.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
      })),
    };
    return withIds;
  },

  /**
   * Apply AI suggestions - convert to VisualizationConfig objects
   */
  applySuggestions: async (
    suggestions: AISuggestion[],
    signal?: AbortSignal,
  ): Promise<AIApplyResponse> => {
    // Strip client-side id before sending to the backend — it only exists
    // for UI bookkeeping and is not part of the server schema.
    const payload = suggestions.map(({ id: _id, ...rest }) => rest);
    const response = await api.post<APIResponse<AIApplyResponse>>(
      '/ai/apply-suggestions',
      { suggestions: payload },
      { signal },
    );
    if (!response.data.data) {
      throw new Error('Failed to apply suggestions');
    }
    return response.data.data;
  },

  /**
   * Generate a formula using AI
   */
  generateFormula: async (request: {
    provider: string;
    api_key: string;
    model?: string;
    effort?: 'low' | 'medium' | 'high';
    columns: Array<{
      name: string;
      description: string;
      data_type: string;
      stats?: Record<string, number>;
    }>;
    description: string;
    /** Loaded dataset id — required when ``dataset_access`` is true. */
    dataset_id?: string;
    /**
     * If true, the AI may issue read-only tool calls against the loaded
     * dataset to inspect data before generating the formula. Default false.
     */
    dataset_access?: boolean;
  }): Promise<{ formula: string; provider: string }> => {
    let response;
    try {
      response = await api.post<APIResponse<{ formula: string; provider: string }>>('/ai/generate-formula', request);
    } catch (err) {
      _rethrowAsAIError(err);
    }
    if (!response.data.data) {
      throw new Error('Failed to generate formula');
    }
    return response.data.data;
  },
};

// Add error interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    console.error('API Error:', error);
    return Promise.reject(handleError(error));
  }
);

export default api;
