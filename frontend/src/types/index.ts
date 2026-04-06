/**
 * Core Domain Types
 * Defines the shapes of configuration objects used across the application for
 * features like data cleaning and reconciliation.
 */
export * from './api';

export interface ReconciliationConfig {
    equations: string[];
    sigma_mode: 'fixed_all' | 'from_config';
    fixed_sigma: number;
    sigma_values: Record<string, number>;
    non_negative: boolean;
}

export interface ReconciliationResult {
    variable: string;
    mean_error: number;
    mae: number;
    rel_error_pct: number;
    std_error: number;
    avg_abs_change: number;
    max_abs_change: number;
    count: number;
}

export interface ReconciliationResponse {
    reconciled_file_url: string;
    file_name: string;
    report: ReconciliationResult[];
}

export const createDefaultReconciliationConfig = (): ReconciliationConfig => ({
    equations: [],
    sigma_mode: 'fixed_all',
    fixed_sigma: 1.0,
    sigma_values: {},
    non_negative: true,
});


export interface FilterRule {
    column: string;
    operator: '<' | '<=' | '>' | '>=' | '==' | '!=' | 'contains' | 'not_contains';
    value: string;
    action: 'keep' | 'remove';
}

export interface CleaningConfig {
    header_row: number;
    nan_strategy: 'drop' | 'fill_zero' | 'interpolate' | 'fill_forward' | 'fill_backward' | 'none';
    custom_nan_value: string | null; // Value to treat as NaN (e.g. -999)
    replacements: Array<{ target: string; value: string }>; // For substitution requirements
    filters: FilterRule[];
    resample_frequency?: string;
    aggregation_method?: 'mean' | 'sum' | 'min' | 'max' | 'first' | 'last' | 'median';
}

export const createDefaultCleaningConfig = (): CleaningConfig => ({
    header_row: 0,
    nan_strategy: 'none',
    custom_nan_value: null,
    replacements: [],
    filters: [],
    resample_frequency: '',
    aggregation_method: 'mean',
});
