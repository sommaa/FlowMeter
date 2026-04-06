import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { dataApi, visualizationApi, templateApi, exportApi, reconciliationApi, aiApi } from '@/services/api';

// Mock axios
vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      response: { use: vi.fn() },
      request: { use: vi.fn() },
    },
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
    // Re-export so named imports work
    AxiosError: class AxiosError extends Error {},
  };
});

// Get the mocked axios instance that api.ts will use
const mockAxiosInstance = axios.create() as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ============= Data API =============

describe('dataApi', () => {
  describe('upload', () => {
    it('uploads a file and returns dataset info', async () => {
      const datasetInfo = { id: 'ds1', name: 'test.xlsx', rows: 100, columns: 5 };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: datasetInfo },
      });

      const file = new File(['content'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const result = await dataApi.upload(file);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/data/upload',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
      );
      expect(result).toEqual(datasetInfo);
    });

    it('includes cleaning config when provided', async () => {
      const datasetInfo = { id: 'ds1', name: 'test.xlsx' };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: datasetInfo },
      });

      const file = new File(['content'], 'test.xlsx');
      const cleaningConfig = { header_row: 0, nan_strategy: 'drop' as const };
      await dataApi.upload(file, cleaningConfig as any);

      const formData = mockAxiosInstance.post.mock.calls[0][1] as FormData;
      expect(formData.get('cleaning_config')).toBe(JSON.stringify(cleaningConfig));
    });

    it('throws when upload response indicates failure', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: false, message: 'Invalid file format' },
      });

      const file = new File(['content'], 'test.txt');
      await expect(dataApi.upload(file)).rejects.toThrow('Invalid file format');
    });
  });

  describe('listDatasets', () => {
    it('returns a list of datasets', async () => {
      const datasets = [{ id: 'ds1' }, { id: 'ds2' }];
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: datasets },
      });

      const result = await dataApi.listDatasets();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/data/datasets');
      expect(result).toEqual(datasets);
    });

    it('returns empty array when data is null', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: null },
      });

      const result = await dataApi.listDatasets();
      expect(result).toEqual([]);
    });
  });

  describe('getDataset', () => {
    it('returns dataset info by id', async () => {
      const dataset = { id: 'ds1', name: 'test.xlsx' };
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: dataset },
      });

      const result = await dataApi.getDataset('ds1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/data/datasets/ds1');
      expect(result).toEqual(dataset);
    });

    it('throws when dataset is not found', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: null },
      });

      await expect(dataApi.getDataset('missing')).rejects.toThrow('Dataset not found');
    });
  });

  describe('deleteDataset', () => {
    it('calls delete endpoint', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: {} });

      await dataApi.deleteDataset('ds1');
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/data/datasets/ds1');
    });
  });

  describe('getStatistics', () => {
    it('fetches statistics without column filter', async () => {
      const stats = [{ column: 'a', count: 100, mean: 50 }];
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: stats },
      });

      const result = await dataApi.getStatistics('ds1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/data/datasets/ds1/statistics',
        { params: {} }
      );
      expect(result).toEqual(stats);
    });

    it('fetches statistics with column filter', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: [] },
      });

      await dataApi.getStatistics('ds1', ['col1', 'col2']);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/data/datasets/ds1/statistics',
        { params: { columns: 'col1,col2' } }
      );
    });
  });

  describe('getPreview', () => {
    it('fetches dataset preview with default rows', async () => {
      const preview = { columns: ['a', 'b'], rows: [{ a: 1, b: 2 }] };
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: preview },
      });

      const result = await dataApi.getPreview('ds1');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/data/datasets/ds1/preview',
        { params: { rows: 10 } }
      );
      expect(result).toEqual(preview);
    });

    it('fetches dataset preview with custom rows count', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: { columns: [], rows: [] } },
      });

      await dataApi.getPreview('ds1', 25);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/data/datasets/ds1/preview',
        { params: { rows: 25 } }
      );
    });

    it('returns default empty structure when data is null', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: null },
      });

      const result = await dataApi.getPreview('ds1');
      expect(result).toEqual({ columns: [], rows: [] });
    });
  });
});

// ============= Visualization API =============

describe('visualizationApi', () => {
  describe('getPlotData', () => {
    it('posts config and returns plot data', async () => {
      const plotData = { data: [{ x: [1], y: [2] }] };
      mockAxiosInstance.post.mockResolvedValue({ data: plotData });

      const config = { type: 'universal', title: 'Test' } as any;
      const result = await visualizationApi.getPlotData('ds1', config);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/visualizations/plot-data',
        expect.objectContaining({
          dataset_id: 'ds1',
          config,
          global_variables: [],
          date_range: null,
          use_reconciled: false,
          reconciliation_results: null,
        })
      );
      expect(result).toEqual(plotData);
    });

    it('passes optional parameters', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: {} });

      const config = { type: 'universal' } as any;
      const vars = [{ name: 'total', formula: 'a+b' }];
      const dateRange = { start: '2024-01-01', end: '2024-12-31' };

      await visualizationApi.getPlotData('ds1', config, vars as any, dateRange, true, null);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/visualizations/plot-data',
        expect.objectContaining({
          global_variables: vars,
          date_range: dateRange,
          use_reconciled: true,
        })
      );
    });
  });

  describe('validateConfig', () => {
    it('validates config and returns result', async () => {
      const validationResult = { valid: true, errors: [], warnings: [] };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: validationResult },
      });

      const config = { type: 'universal' } as any;
      const result = await visualizationApi.validateConfig(config);
      expect(result).toEqual(validationResult);
    });

    it('returns default invalid response when data is null', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: null },
      });

      const result = await visualizationApi.validateConfig({} as any);
      expect(result).toEqual({ valid: false, errors: ['Validation failed'], warnings: [] });
    });
  });

  describe('getTypes', () => {
    it('returns available visualization types', async () => {
      const types = [{ type: 'universal', name: 'Universal' }];
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: types },
      });

      const result = await visualizationApi.getTypes();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/visualizations/types');
      expect(result).toEqual(types);
    });
  });

  describe('getColors', () => {
    it('returns color palette', async () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff'];
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: colors },
      });

      const result = await visualizationApi.getColors();
      expect(result).toEqual(colors);
    });
  });
});

// ============= Template API =============

describe('templateApi', () => {
  describe('save', () => {
    it('posts template data', async () => {
      const templateData = { visualizations: [], plantName: 'Plant' };
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await templateApi.save(templateData as any);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/templates/save', templateData);
    });
  });

  describe('load', () => {
    it('uploads template file and returns config', async () => {
      const templateConfig = { visualizations: [], plantName: 'Loaded Plant' };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: templateConfig },
      });

      const file = new File(['{}'], 'template.json', { type: 'application/json' });
      const result = await templateApi.load(file);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/templates/load',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
      );
      expect(result).toEqual(templateConfig);
    });

    it('throws when data is null', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: null },
      });

      const file = new File(['{}'], 'template.json');
      await expect(templateApi.load(file)).rejects.toThrow('Failed to load template');
    });
  });

  describe('listSaved', () => {
    it('returns list of saved templates', async () => {
      const templates = [{ name: 'Template 1' }];
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: templates },
      });

      const result = await templateApi.listSaved();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/templates/list');
      expect(result).toEqual(templates);
    });
  });

  describe('savePersistent', () => {
    it('saves template with name and config', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      const config = { visualizations: [] } as any;
      await templateApi.savePersistent('My Template', config, false);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/templates/save-persistent', {
        name: 'My Template',
        config,
        overwrite: false,
      });
    });
  });

  describe('loadSaved', () => {
    it('loads a saved template by name', async () => {
      const config = { visualizations: [] };
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: config },
      });

      const result = await templateApi.loadSaved('My Template');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/templates/load-persistent/My Template');
      expect(result).toEqual(config);
    });

    it('throws when data is null', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: null },
      });

      await expect(templateApi.loadSaved('Missing')).rejects.toThrow('Failed to load template');
    });
  });

  describe('deleteSaved', () => {
    it('deletes a saved template by name', async () => {
      mockAxiosInstance.delete.mockResolvedValue({ data: { success: true } });

      await templateApi.deleteSaved('Old Template');
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/templates/delete/Old Template');
    });
  });

  describe('renameSaved', () => {
    it('renames a saved template', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      await templateApi.renameSaved('Old Name', 'New Name');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/templates/rename', {
        old_name: 'Old Name',
        new_name: 'New Name',
      });
    });
  });

  describe('validate', () => {
    it('validates a template config', async () => {
      const validationResult = { valid: true, errors: [], warnings: [], visualization_count: 3 };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: validationResult },
      });

      const result = await templateApi.validate({} as any);
      expect(result).toEqual(validationResult);
    });

    it('returns default invalid result when data is null', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: null },
      });

      const result = await templateApi.validate({} as any);
      expect(result).toEqual({ valid: false, errors: [], warnings: [], visualization_count: 0 });
    });
  });
});

// ============= Export API =============

describe('exportApi', () => {
  describe('exportDashboard', () => {
    it('posts export data with blob response type', async () => {
      const blob = new Blob(['<html></html>'], { type: 'text/html' });
      mockAxiosInstance.post.mockResolvedValue({ data: blob });

      const data = {
        dataset_id: 'ds1',
        visualizations: [],
        plant_name: 'Test Plant',
      };

      const result = await exportApi.exportDashboard(data as any);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/export/dashboard',
        data,
        { responseType: 'blob' }
      );
      expect(result).toEqual(blob);
    });
  });
});

// ============= Reconciliation API =============

describe('reconciliationApi', () => {
  describe('reconcile', () => {
    it('posts reconciliation config and returns response', async () => {
      const response = {
        reconciled_file_url: '/files/reconciled.csv',
        file_name: 'reconciled.csv',
        report: [],
      };
      mockAxiosInstance.post.mockResolvedValue({ data: response });

      const config = { equations: ['a + b = c'], sigma_mode: 'fixed_all', fixed_sigma: 1.0 } as any;
      const result = await reconciliationApi.reconcile('ds1', config);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/reconcile', {
        dataset_id: 'ds1',
        config,
      });
      expect(result).toEqual(response);
    });
  });
});

// ============= AI API =============

describe('aiApi', () => {
  describe('getProviders', () => {
    it('returns available AI providers', async () => {
      const providers = [{ id: 'gemini', name: 'Google Gemini' }];
      mockAxiosInstance.get.mockResolvedValue({
        data: { success: true, data: providers },
      });

      const result = await aiApi.getProviders();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ai/providers');
      expect(result).toEqual(providers);
    });
  });

  describe('suggest', () => {
    it('posts suggestion request and returns response', async () => {
      const suggestResponse = { suggestions: [{ title: 'Time Series' }] };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: suggestResponse },
      });

      const request = { provider: 'gemini', api_key: 'key', dataset_id: 'ds1' } as any;
      const result = await aiApi.suggest(request);
      expect(result).toEqual(suggestResponse);
    });

    it('throws when data is null', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: null },
      });

      await expect(aiApi.suggest({} as any)).rejects.toThrow('Failed to get AI suggestions');
    });
  });

  describe('applySuggestions', () => {
    it('posts suggestions and returns applied configs', async () => {
      const applyResponse = { configs: [{ type: 'universal' }] };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: applyResponse },
      });

      const suggestions = [{ title: 'Test', type: 'universal' }] as any;
      const result = await aiApi.applySuggestions(suggestions);
      expect(result).toEqual(applyResponse);
    });

    it('throws when data is null', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: null },
      });

      await expect(aiApi.applySuggestions([])).rejects.toThrow('Failed to apply suggestions');
    });
  });

  describe('generateFormula', () => {
    it('posts formula request and returns result', async () => {
      const formulaResult = { formula: 'a + b', provider: 'gemini' };
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: formulaResult },
      });

      const request = {
        provider: 'gemini',
        api_key: 'key',
        columns: [],
        description: 'sum of a and b',
      };
      const result = await aiApi.generateFormula(request);
      expect(result).toEqual(formulaResult);
    });

    it('throws when data is null', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, data: null },
      });

      await expect(
        aiApi.generateFormula({ provider: 'gemini', api_key: 'k', columns: [], description: 'x' })
      ).rejects.toThrow('Failed to generate formula');
    });
  });
});
