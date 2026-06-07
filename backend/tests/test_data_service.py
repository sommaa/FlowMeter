"""Tests for backend/app/services/data_service.py."""

import pytest
import os
import sys
import pandas as pd
import numpy as np
from io import BytesIO

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.data_service import DataService


@pytest.fixture
def service():
    return DataService()


@pytest.fixture
def csv_bytes():
    """Create a simple CSV as bytes."""
    csv_content = "x,y,z\n1,2,3\n4,5,6\n7,8,9\n"
    return csv_content.encode("utf-8")


@pytest.fixture
def csv_with_dates():
    """Create a CSV with a date column."""
    csv_content = "Date,Value\n2023-01-01,10\n2023-01-02,20\n2023-01-03,30\n"
    return csv_content.encode("utf-8")


@pytest.fixture
def parquet_bytes():
    """Create a simple Parquet file as bytes."""
    df = pd.DataFrame({"x": [1, 4, 7], "y": [2, 5, 8], "z": [3, 6, 9]})
    buffer = BytesIO()
    df.to_parquet(buffer)
    return buffer.getvalue()


@pytest.fixture
def parquet_with_dates():
    """Create a Parquet file with a datetime-typed column."""
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2023-01-01", "2023-01-02", "2023-01-03"]),
        "Value": [10, 20, 30],
    })
    buffer = BytesIO()
    df.to_parquet(buffer)
    return buffer.getvalue()


class TestLoadExcel:
    """Tests for loading datasets."""

    def test_load_csv(self, service, csv_bytes):
        info = service.load_excel(csv_bytes, "test.csv")
        assert info.name == "test.csv"
        assert info.rows == 3
        assert info.columns == 3
        assert "x" in info.column_names
        assert "y" in info.column_names
        assert "z" in info.column_names
        assert len(info.numeric_columns) == 3

    def test_load_csv_with_dates(self, service, csv_with_dates):
        info = service.load_excel(csv_with_dates, "dates.csv")
        assert info.rows == 3
        assert len(info.datetime_columns) > 0

    def test_load_parquet(self, service, parquet_bytes):
        info = service.load_excel(parquet_bytes, "test.parquet")
        assert info.name == "test.parquet"
        assert info.rows == 3
        assert info.columns == 3
        assert "x" in info.column_names
        assert "y" in info.column_names
        assert "z" in info.column_names
        assert len(info.numeric_columns) == 3

    def test_load_parquet_pqt_extension(self, service, parquet_bytes):
        info = service.load_excel(parquet_bytes, "test.pqt")
        assert info.name == "test.pqt"
        assert info.rows == 3
        assert info.columns == 3

    def test_load_parquet_with_dates(self, service, parquet_with_dates):
        info = service.load_excel(parquet_with_dates, "dates.parquet")
        assert info.rows == 3
        assert len(info.datetime_columns) > 0

    def test_generates_unique_id(self, service, csv_bytes):
        info = service.load_excel(csv_bytes, "test.csv")
        assert info.id is not None
        assert len(info.id) == 8

    def test_stores_dataset(self, service, csv_bytes):
        info = service.load_excel(csv_bytes, "test.csv")
        df = service.get_dataset(info.id)
        assert df is not None
        assert len(df) == 3


class TestGetDataset:
    """Tests for retrieving datasets."""

    def test_get_existing(self, service, csv_bytes):
        info = service.load_excel(csv_bytes, "test.csv")
        df = service.get_dataset(info.id)
        assert df is not None

    def test_get_nonexistent(self, service):
        df = service.get_dataset("nonexistent")
        assert df is None


class TestGetMetadata:
    """Tests for retrieving metadata."""

    def test_get_existing_metadata(self, service, csv_bytes):
        info = service.load_excel(csv_bytes, "test.csv")
        meta = service.get_metadata(info.id)
        assert meta is not None
        assert meta.name == "test.csv"

    def test_get_nonexistent_metadata(self, service):
        meta = service.get_metadata("nonexistent")
        assert meta is None


class TestListDatasets:
    """Tests for listing all datasets."""

    def test_empty_list(self, service):
        result = service.list_datasets()
        assert result == []

    def test_list_after_load(self, service, csv_bytes):
        service.load_excel(csv_bytes, "a.csv")
        service.load_excel(csv_bytes, "b.csv")
        result = service.list_datasets()
        assert len(result) == 2


class TestDeleteDataset:
    """Tests for deleting datasets."""

    def test_delete_existing(self, service, csv_bytes):
        info = service.load_excel(csv_bytes, "test.csv")
        result = service.delete_dataset(info.id)
        assert result is True
        assert service.get_dataset(info.id) is None
        assert service.get_metadata(info.id) is None

    def test_delete_nonexistent(self, service):
        result = service.delete_dataset("nonexistent")
        assert result is False


class TestParseDatetimeColumns:
    """Tests for datetime column detection."""

    def test_detects_date_keyword(self, service):
        # Use European format DD-MM-YYYY HH:MM which the parser tries first
        df = pd.DataFrame({
            "Date": ["01-01-2023 10:00", "02-01-2023 10:00", "03-01-2023 10:00"],
            "Value": [1, 2, 3],
        })
        result = service._parse_datetime_columns(df)
        assert isinstance(result.index, pd.DatetimeIndex)

    def test_detects_timestamp_keyword(self, service):
        df = pd.DataFrame({
            "Timestamp": ["01-01-2023 10:00", "02-01-2023 10:00"],
            "Value": [1, 2],
        })
        result = service._parse_datetime_columns(df)
        assert isinstance(result.index, pd.DatetimeIndex)

    def test_no_date_column(self, service):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        result = service._parse_datetime_columns(df)
        assert isinstance(result.index, pd.RangeIndex)
