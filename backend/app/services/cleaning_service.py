"""
Data cleaning and preprocessing service for FlowMeter.

This module provides the CleaningService class with static methods for
applying various data cleaning operations to pandas DataFrames during
file upload and dataset management.

Cleaning capabilities:
    - Custom string/value replacements with regex
    - Row filtering based on column values
    - Custom NaN value definitions
    - Missing value strategies (drop, fill, interpolate)
    - Time-series resampling and aggregation
    - Automatic type inference after string operations

The service is designed to be stateless with all methods being static,
allowing it to be called without instantiation from DataService and
other components.
"""
import pandas as pd
import numpy as np
import re
from typing import Optional
import logging
from app.models.schemas import CleaningConfig

logger = logging.getLogger(__name__)

class CleaningService:
    """Stateless service for applying data cleaning operations to DataFrames.

    Provides a suite of cleaning methods that can be applied during file
    upload or dataset updates. Separated from DataService to maintain
    single responsibility and testability.

    All methods are static as the service maintains no state. Configuration
    is passed explicitly to each method call.

    Cleaning pipeline:
        1. Custom string replacements (e.g., "1,5" -> "1.5")
        2. Type re-inference after replacements
        3. Row filtering based on conditions
        4. Custom NaN value replacement
        5. Missing value strategy application
    """

    @staticmethod
    def apply_cleaning(df: pd.DataFrame, config: CleaningConfig) -> pd.DataFrame:
        """Apply all configured cleaning operations to a DataFrame.

        Main entry point that orchestrates the full cleaning pipeline.
        Returns the original DataFrame if config is None or empty.

        Args:
            df: Input DataFrame to clean.
            config: CleaningConfig with all cleaning rules and strategies.

        Returns:
            Cleaned DataFrame with all transformations applied.

        Note:
            Type inference is performed after replacements to convert
            strings like "1,5" to numeric 1.5 after comma replacement.
        """
        if not config:
            return df
            
        return CleaningService._apply_steps(df, config)
    
    @staticmethod
    def _apply_steps(df: pd.DataFrame, config: CleaningConfig) -> pd.DataFrame:
        """Execute the cleaning pipeline in the correct order.

        Internal method that applies cleaning steps sequentially:
        1. Custom replacements, 2. Type inference, 3. Filters,
        4. Custom NaN values, 5. Missing value strategy.

        Args:
            df: DataFrame to clean.
            config: Cleaning configuration.

        Returns:
            Cleaned DataFrame.
        """
        # 1. Custom Replacements
        for replacement in config.replacements:
            target = replacement.get('target')
            value = replacement.get('value')
            if target:
                # Use regex=True with escaped target to perform substring replacement
                safe_target = re.escape(target)
                df = df.replace(safe_target, value, regex=True)
        
        # Force re-inference of types after string manipulations
        df = CleaningService._infer_types(df)
        
        # 2. Apply row filters
        if config.filters:
            df = CleaningService._apply_filters(df, config.filters)
        
        # 3. Custom NaN Values
        if config.custom_nan_value:
            df = df.replace(config.custom_nan_value, np.nan)
            
        # 4. Missing Value Strategy
        df = CleaningService._apply_nan_strategy(df, config)
        
        return df


    @staticmethod
    def _apply_filters(df: pd.DataFrame, filters: list) -> pd.DataFrame:
        """Apply row filters to keep or remove rows matching specified conditions.

        Supports numeric comparisons (<, <=, >, >=, ==, !=) and string
        operations (contains, not_contains). Each filter has an action:
        'keep' (retain only matching rows) or 'remove' (discard matching rows).
        Multiple filters are applied sequentially.

        Args:
            df: Input DataFrame to filter.
            filters: List of filter rule dicts/objects with keys:
                - column: Column name to filter on
                - operator: Comparison operator or string operation
                - value: Value to compare against
                - action: 'keep' or 'remove' (default: 'remove')

        Returns:
            Filtered DataFrame with filters applied.

        Supported operators:
            - Numeric: <, <=, >, >=, ==, !=
            - String: contains, not_contains (case-insensitive)

        Example:
            >>> filters = [
            ...     {"column": "temp", "operator": ">", "value": "100", "action": "remove"},
            ...     {"column": "status", "operator": "contains", "value": "running", "action": "keep"}
            ... ]
            >>> # Removes rows where temp > 100, then keeps only rows where status contains "running"
        """
        if not filters:
            return df

        for filter_rule in filters:
            column = filter_rule.column if hasattr(filter_rule, 'column') else filter_rule.get('column')
            operator = filter_rule.operator if hasattr(filter_rule, 'operator') else filter_rule.get('operator')
            value_str = filter_rule.value if hasattr(filter_rule, 'value') else filter_rule.get('value')
            action = filter_rule.action if hasattr(filter_rule, 'action') else filter_rule.get('action', 'remove')

            if not column or not operator or value_str is None:
                continue

            # Check if column exists
            if column not in df.columns:
                logger.warning(f"Column '{column}' not found in dataset, skipping filter")
                continue

            col_data = df[column]

            try:
                # Handle numeric comparisons
                if operator in ['<', '<=', '>', '>=', '==', '!=']:
                    # Try to convert value to numeric
                    try:
                        value = pd.to_numeric(value_str)
                    except (ValueError, TypeError):
                        logger.warning(f"Cannot convert '{value_str}' to numeric for operator '{operator}'")
                        continue

                    # Apply comparison
                    if operator == '<':
                        condition_mask = col_data < value
                    elif operator == '<=':
                        condition_mask = col_data <= value
                    elif operator == '>':
                        condition_mask = col_data > value
                    elif operator == '>=':
                        condition_mask = col_data >= value
                    elif operator == '==':
                        condition_mask = col_data == value
                    elif operator == '!=':
                        condition_mask = col_data != value

                # Handle string operations
                elif operator in ['contains', 'not_contains']:
                    # Convert column to string for string operations
                    col_str = col_data.astype(str)

                    if operator == 'contains':
                        condition_mask = col_str.str.contains(str(value_str), case=False, na=False)
                    elif operator == 'not_contains':
                        condition_mask = ~col_str.str.contains(str(value_str), case=False, na=False)
                else:
                    logger.warning(f"Unknown operator '{operator}', skipping filter")
                    continue

                # Apply based on action: 'keep' retains matching rows, 'remove' discards them
                rows_before = len(df)
                if action == 'keep':
                    df = df[condition_mask].copy()
                    logger.info(f"Filter keep ({column} {operator} {value_str}): kept {len(df)} of {rows_before} rows")
                else:
                    df = df[~condition_mask].copy()
                    logger.info(f"Filter remove ({column} {operator} {value_str}): removed {rows_before - len(df)} rows, kept {len(df)}")

                # Update col_data reference for next iteration
                if column in df.columns:
                    col_data = df[column]

            except Exception as e:
                logger.warning(f"Error applying filter on column '{column}': {str(e)}")
                continue

        return df
    
    @staticmethod
    def _infer_types(df: pd.DataFrame) -> pd.DataFrame:
        """Re-infer column types after string manipulations.

        Attempts to convert object-dtype columns to numeric where possible.
        Critical for handling European number formats after comma-to-period
        replacements (e.g., "1,5" -> "1.5" -> 1.5).

        Args:
            df: DataFrame with potentially convertible string columns.

        Returns:
            DataFrame with numeric types inferred where applicable.

        Note:
            Uses pd.to_numeric with errors='coerce', so invalid conversions
            become NaN. Only applies conversion if at least one value
            successfully converts to avoid losing valid string data.
        """
        for col in df.select_dtypes(include=['object']).columns:
            try:
                # Attempt to convert to numeric, coercing errors to NaN
                converted = pd.to_numeric(df[col], errors='coerce')
                
                # Use the converted column if it's not all NaNs (unless it was already empty)
                # or if the original had values and now has some valid numbers
                if converted.notna().any() or df[col].isna().all():
                    df[col] = converted
            except Exception:
                pass
        return df

    @staticmethod
    def _apply_nan_strategy(df: pd.DataFrame, config: CleaningConfig) -> pd.DataFrame:
        """Apply the configured strategy for handling missing values.

        Supports multiple strategies for NaN/missing value treatment:
            - drop: Remove rows with any NaN values
            - fill_zero: Replace NaN with 0
            - interpolate: Linear interpolation (numeric only) with extrapolation
            - fill_forward: Forward fill (propagate last valid value)
            - fill_backward: Backward fill (propagate next valid value)

        Args:
            df: DataFrame with potential missing values.
            config: CleaningConfig with nan_strategy field.

        Returns:
            DataFrame with NaN values handled according to strategy.

        Note:
            Interpolation uses linear method with bidirectional limit,
            then forward/backward fill for edge cases.
        """
        strategy = config.nan_strategy
        
        if strategy == 'drop':
            return df.dropna()
        elif strategy == 'fill_zero':
            return df.fillna(0)
        elif strategy == 'interpolate':
            # Linear interpolation (only for numeric columns)
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            df[numeric_cols] = df[numeric_cols].interpolate(method='linear', limit_direction='both')
            # Extrapolation: copy external values to fill edges
            df[numeric_cols] = df[numeric_cols].ffill().bfill()
            return df
        elif strategy == 'fill_forward':
            return df.ffill()
        elif strategy == 'fill_backward':
            return df.bfill()
            
        return df

    @staticmethod
    def apply_aggregation(df: pd.DataFrame, config: CleaningConfig) -> pd.DataFrame:
        """Apply time-series resampling and aggregation to reduce data granularity.

        Downsamples time-series data by grouping into time buckets and
        aggregating with the specified method. Only operates on numeric
        columns to avoid type conflicts.

        Supported aggregation methods:
            - mean: Average value in each bucket
            - sum: Total value in each bucket
            - min/max: Minimum/maximum value
            - first/last: First/last value in bucket
            - median: Median value

        Args:
            df: DataFrame with DatetimeIndex to resample.
            config: CleaningConfig with resample_frequency (e.g., "1H", "1D")
                and aggregation_method.

        Returns:
            Resampled DataFrame if DatetimeIndex exists and config specified,
            otherwise returns original DataFrame unchanged.

        Note:
            Non-numeric columns are dropped during aggregation. If no
            resample_frequency is configured or index is not DatetimeIndex,
            returns input unchanged.

        Example:
            >>> # config.resample_frequency = "1H", aggregation_method = "mean"
            >>> # Converts minute-level data to hourly averages
        """
        if not config.resample_frequency:
            return df
            
        if not isinstance(df.index, pd.DatetimeIndex):
            logger.warning("Cannot apply aggregation - no DatetimeIndex found")
            return df
            
        try:
            rule = config.resample_frequency
            method = config.aggregation_method.lower()
            
            # Select only numeric columns for aggregation to avoid errors
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            
            # Resample
            resampler = df[numeric_cols].resample(rule)
            
            if method == 'mean':
                aggregated = resampler.mean()
            elif method == 'sum':
                aggregated = resampler.sum()
            elif method == 'min':
                aggregated = resampler.min()
            elif method == 'max':
                aggregated = resampler.max()
            elif method == 'first':
                aggregated = resampler.first()
            elif method == 'last':
                aggregated = resampler.last()
            elif method == 'median':
                aggregated = resampler.median()
            else:
                aggregated = resampler.mean() # Default
            
            # For non-numeric columns, we usually take 'first' or drop them
            # Let's try to keep them by taking 'first' if they align with the buckets
            # But usually aggregation is for numeric analysis. 
            # Let's keep it simple and just return numeric aggregated data for now, 
            # as mixing types in resample can be tricky without specific instructions per column.
            
            return aggregated
            
        except Exception as e:
            logger.error(f"Error applying aggregation: {str(e)}")
            return df
