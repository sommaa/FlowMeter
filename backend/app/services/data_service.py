"""
Dataset management service for FlowMeter.

This module provides the DataService class, which handles all dataset
lifecycle operations including loading, storage, retrieval, and statistics
computation. Acts as the central data repository for the application.

Key responsibilities:
    - File upload processing (Excel, CSV)
    - Automatic datetime column detection and parsing
    - Data cleaning and preprocessing via CleaningService
    - In-memory dataset storage with metadata tracking
    - Column type inference and statistics computation
    - Dataset CRUD operations

Storage:
    Uses in-memory dictionaries for MVP simplicity. Can be extended to
    Redis, PostgreSQL, or other persistent storage for production use.

Singleton pattern:
    Access via get_data_service() to ensure shared state across the app.
"""
import pandas as pd
import numpy as np
from io import BytesIO
from typing import Optional
from datetime import datetime
import uuid
import math

import re
from app.models.schemas import DatasetInfo, DataStatistics, CleaningConfig
from app.services.cleaning_service import CleaningService
from app.core.profiler import profile_performance


class DataService:
    """In-memory dataset repository with upload and management capabilities.

    Manages the complete lifecycle of datasets from file upload through
    storage, retrieval, updates, and deletion. Provides metadata tracking
    and statistics computation for loaded datasets.

    Attributes:
        _datasets: Dictionary mapping dataset IDs to pandas DataFrames.
        _metadata: Dictionary mapping dataset IDs to DatasetInfo objects.

    Storage design:
        In-memory dictionaries provide fast access suitable for MVP and
        single-server deployments. For production with multiple workers,
        consider Redis or a database backend.

    Example:
        >>> service = get_data_service()
        >>> info = service.load_excel(file_bytes, "data.xlsx")
        >>> df = service.get_dataset(info.id)
        >>> stats = service.get_statistics(info.id)
    """

    def __init__(self):
        """Initialize the service with empty dataset and metadata stores."""
        self._datasets: dict[str, pd.DataFrame] = {}
        self._metadata: dict[str, DatasetInfo] = {}

    @profile_performance
    def load_excel(self, file_content: bytes, filename: str, config: Optional[CleaningConfig] = None) -> DatasetInfo:
        """Load an Excel or CSV file into memory with automatic preprocessing.

        Reads the uploaded file, applies optional cleaning configuration,
        attempts to detect and parse datetime columns, and generates
        comprehensive metadata about the dataset.

        Processing pipeline:
            1. Read file (Excel or CSV) with configurable header row
            2. Apply cleaning rules (CleaningService)
            3. Parse datetime columns and set as index if found
            4. Apply resampling/aggregation if configured
            5. Infer column types (numeric, datetime)
            6. Calculate date range if applicable
            7. Generate and store metadata

        Args:
            file_content: Raw bytes of the uploaded Excel/CSV file.
            filename: Original filename (used for type detection and metadata).
            config: Optional CleaningConfig for preprocessing (header row,
                column removal, resampling, etc.).

        Returns:
            DatasetInfo object containing dataset metadata including ID,
            column names, types, date range, and memory usage.

        Note:
            Generates a unique 8-character UUID for the dataset ID.
            Datetime detection uses keywords (date, time, timestamp) and
            format heuristics.
        """
        # Generate unique ID
        dataset_id = str(uuid.uuid4())[:8]
        
        # Load DataFrame
        buffer = BytesIO(file_content)
        
        header_row = config.header_row if config else 0
        
        # Read with specified header row
        if filename.endswith('.csv'):
            df = pd.read_csv(buffer, header=header_row)
        else:
            df = pd.read_excel(buffer, header=header_row)
            
        # Apply Cleaning Logic if config exists
        if config:
            df = CleaningService.apply_cleaning(df, config)
        
        # Try to identify and parse datetime columns
        df = self._parse_datetime_columns(df)

        # Apply aggregation/resampling if configured (must be done after date parsing)
        if config and config.resample_frequency:
            df = CleaningService.apply_aggregation(df, config)
        
        # Get column information
        numeric_cols = list(df.select_dtypes(include=[np.number]).columns)
        datetime_cols = list(df.select_dtypes(include=['datetime64']).columns)
        
        # Build column names list including index if it's meaningful (not just a RangeIndex)
        all_column_names = list(df.columns)
        index_name = None
        if not isinstance(df.index, pd.RangeIndex):
            index_name = df.index.name or 'Index'
            # Add index to the beginning of column names so users can select it
            if index_name not in all_column_names:
                all_column_names.insert(0, index_name)
        
        # If the index is a DatetimeIndex, include it in datetime columns
        if isinstance(df.index, pd.DatetimeIndex):
            if index_name and index_name not in datetime_cols:
                datetime_cols.insert(0, index_name)
        
        # Calculate date range if datetime index or columns exist
        date_range = None
        if isinstance(df.index, pd.DatetimeIndex):
            date_range = {
                "start": df.index.min().isoformat(),
                "end": df.index.max().isoformat()
            }
        elif datetime_cols:
            first_dt_col = datetime_cols[0]
            if first_dt_col in df.columns:
                date_range = {
                    "start": df[first_dt_col].min().isoformat(),
                    "end": df[first_dt_col].max().isoformat()
                }
        
        # Create metadata
        info = DatasetInfo(
            id=dataset_id,
            name=filename,
            rows=len(df),
            columns=len(df.columns),
            column_names=all_column_names,
            numeric_columns=numeric_cols,
            datetime_columns=datetime_cols,
            memory_usage_kb=df.memory_usage(deep=True).sum() / 1024,
            date_range=date_range
        )
        
        # Store
        self._datasets[dataset_id] = df
        self._metadata[dataset_id] = info
        
        return info
    
    def _parse_datetime_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Detect and parse datetime columns, setting as index if found.

        Uses multiple heuristics to identify date columns:
            1. Column name contains keywords (date, time, timestamp, etc.)
            2. First column contains date-like strings (contains /, -, :)
            3. First column already has datetime dtype

        Parsing attempts:
            1. European format (DD-MM-YYYY HH:MM) with explicit format
            2. Flexible parsing with dayfirst=True for European dates

        Args:
            df: Input DataFrame to process.

        Returns:
            DataFrame with parsed datetime column set as index if successful,
            otherwise returns unchanged DataFrame.

        Note:
            Keywords include English and Spanish terms: date, time, timestamp,
            datetime, hora, fecha.
        """
        date_keywords = ['date', 'time', 'timestamp', 'datetime', 'hora', 'fecha']
        
        # Look for date columns by name
        potential_date_cols = [
            col for col in df.columns 
            if any(keyword in str(col).lower() for keyword in date_keywords)
        ]
        
        date_column = None
        
        if potential_date_cols:
            date_column = potential_date_cols[0]
        else:
            # Check first column
            first_col = df.columns[0]
            first_val = df[first_col].iloc[0] if len(df) > 0 else None
            
            if pd.api.types.is_datetime64_any_dtype(df[first_col]):
                date_column = first_col
            elif isinstance(first_val, str) and any(sep in str(first_val) for sep in ['/', '-', ':']):
                date_column = first_col
        
        # Try to parse the identified column
        if date_column:
            try:
                # Try European format first (DD-MM-YYYY)
                df[date_column] = pd.to_datetime(
                    df[date_column], 
                    format='%d-%m-%Y %H:%M',
                    errors='coerce'
                )
                
                # If that failed, try dayfirst=True
                if df[date_column].isna().all():
                    df[date_column] = pd.to_datetime(
                        df[date_column], 
                        dayfirst=True,
                        errors='coerce'
                    )
                
                # Set as index if successful
                if not df[date_column].isna().all():
                    df = df.set_index(date_column)
            except Exception:
                pass
        
        return df
    
    def get_dataset(self, dataset_id: str) -> Optional[pd.DataFrame]:
        """Retrieve a dataset DataFrame by ID.

        Args:
            dataset_id: Unique identifier of the dataset.

        Returns:
            The pandas DataFrame if found, None otherwise.
        """
        return self._datasets.get(dataset_id)

    def get_metadata(self, dataset_id: str) -> Optional[DatasetInfo]:
        """Retrieve dataset metadata by ID.

        Args:
            dataset_id: Unique identifier of the dataset.

        Returns:
            DatasetInfo object if found, None otherwise.
        """
        return self._metadata.get(dataset_id)

    def list_datasets(self) -> list[DatasetInfo]:
        """Get metadata for all loaded datasets.

        Returns:
            List of DatasetInfo objects for all datasets in storage.
        """
        return list(self._metadata.values())

    def delete_dataset(self, dataset_id: str) -> bool:
        """Remove a dataset from storage.

        Deletes both the DataFrame and its associated metadata.

        Args:
            dataset_id: Unique identifier of the dataset to delete.

        Returns:
            True if the dataset was found and deleted, False if not found.
        """
        if dataset_id in self._datasets:
            del self._datasets[dataset_id]
            del self._metadata[dataset_id]
            return True
        return False

    def update_dataset(self, dataset_id: str, new_df: pd.DataFrame) -> Optional[DatasetInfo]:
        """Replace an existing dataset with a new DataFrame and regenerate metadata.

        Used when the dataset is modified (e.g., after reconciliation or
        adding computed columns). Preserves the original dataset ID and
        upload timestamp while recalculating all other metadata.

        Args:
            dataset_id: Unique identifier of the dataset to update.
            new_df: The new DataFrame to replace the existing one.

        Returns:
            Updated DatasetInfo object if the dataset exists, None if not found.

        Note:
            The original filename and upload timestamp are preserved.
            All column metadata is recalculated from the new DataFrame.
        """
        if dataset_id not in self._datasets:
            return None
            
        old_info = self._metadata[dataset_id]
        
        # Calculate new metadata
        numeric_cols = list(new_df.select_dtypes(include=[np.number]).columns)
        datetime_cols = list(new_df.select_dtypes(include=['datetime64']).columns)
        
        # Build column names list including index if it's meaningful (not just a RangeIndex)
        all_column_names = list(new_df.columns)
        index_name = None
        if not isinstance(new_df.index, pd.RangeIndex):
            index_name = new_df.index.name or 'Index'
            # Add index to the beginning of column names so users can select it
            if index_name not in all_column_names:
                all_column_names.insert(0, index_name)
        
        # If the index is a DatetimeIndex, include it in datetime columns
        if isinstance(new_df.index, pd.DatetimeIndex):
            if index_name and index_name not in datetime_cols:
                datetime_cols.insert(0, index_name)
        
        # Calculate date range
        date_range = old_info.date_range # Default to old range
        if isinstance(new_df.index, pd.DatetimeIndex):
            date_range = {
                "start": new_df.index.min().isoformat(),
                "end": new_df.index.max().isoformat()
            }
        elif datetime_cols:
            first_dt_col = datetime_cols[0]
            if first_dt_col in new_df.columns:
                date_range = {
                    "start": new_df[first_dt_col].min().isoformat(),
                    "end": new_df[first_dt_col].max().isoformat()
                }
            
        new_info = DatasetInfo(
            id=dataset_id,
            name=old_info.name,
            rows=len(new_df),
            columns=len(new_df.columns),
            column_names=all_column_names,
            numeric_columns=numeric_cols,
            datetime_columns=datetime_cols,
            memory_usage_kb=new_df.memory_usage(deep=True).sum() / 1024,
            date_range=date_range,
            uploaded_at=old_info.uploaded_at
        )
        
        self._datasets[dataset_id] = new_df
        self._metadata[dataset_id] = new_info
        
        return new_info
    
    def get_statistics(self, dataset_id: str, columns: Optional[list[str]] = None) -> list[DataStatistics]:
        """Compute descriptive statistics for numeric columns in a dataset.

        Calculates count, mean, standard deviation, min, max, median,
        and quartiles for each numeric column (or specified subset).

        Args:
            dataset_id: Unique identifier of the dataset.
            columns: Optional list of specific columns to analyze.
                If None, analyzes all numeric columns.
                Non-numeric columns in the list are silently skipped.

        Returns:
            List of DataStatistics objects, one per analyzed column.
            Returns empty list if dataset not found or no numeric columns.

        Note:
            NaN values are excluded from calculations via dropna().
            Statistics are None for empty columns after dropping NaN.
        """
        df = self.get_dataset(dataset_id)
        if df is None:
            return []
        
        # Filter to numeric columns
        numeric_df = df.select_dtypes(include=[np.number])
        
        if columns:
            columns = [c for c in columns if c in numeric_df.columns]
            numeric_df = numeric_df[columns] if columns else numeric_df
        
        stats = []
        for col in numeric_df.columns:
            col_data = numeric_df[col].dropna()
            
            stats.append(DataStatistics(
                column=col,
                count=len(col_data),
                mean=float(col_data.mean()) if len(col_data) > 0 else None,
                std=float(col_data.std()) if len(col_data) > 0 else None,
                min=float(col_data.min()) if len(col_data) > 0 else None,
                max=float(col_data.max()) if len(col_data) > 0 else None,
                median=float(col_data.median()) if len(col_data) > 0 else None,
                q25=float(col_data.quantile(0.25)) if len(col_data) > 0 else None,
                q75=float(col_data.quantile(0.75)) if len(col_data) > 0 else None
            ))
        
        return stats
    
    def get_column_data(
        self,
        dataset_id: str,
        column: str,
        as_list: bool = True
    ) -> Optional[list | pd.Series]:
        """Extract data from a specific column in a dataset.

        Args:
            dataset_id: Unique identifier of the dataset.
            column: Name of the column to extract.
            as_list: If True, returns data as a Python list.
                If False, returns the raw pandas Series.

        Returns:
            Column data as list or Series if found, None if dataset
            or column doesn't exist.

        Example:
            >>> values = service.get_column_data("abc123", "temperature")
            >>> type(values)
            <class 'list'>
        """
        df = self.get_dataset(dataset_id)
        if df is None or column not in df.columns:
            return None
        
        series = df[column]
        return series.tolist() if as_list else series


# Global service instance (singleton pattern)
_data_service: Optional[DataService] = None


def get_data_service() -> DataService:
    """Get the global singleton DataService instance.

    Creates the service on first call and returns the same instance for
    subsequent calls. This ensures all parts of the application share
    the same in-memory dataset storage.

    Returns:
        The shared DataService instance.
    """
    global _data_service
    if _data_service is None:
        _data_service = DataService()
    return _data_service
