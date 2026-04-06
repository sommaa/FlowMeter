"""Tests for backend/app/services/analytics/causality.py."""

import pytest
import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services.analytics.causality import CausalityAnalyzer


class TestCausalityAnalyzerInit:
    """Tests for CausalityAnalyzer initialization."""

    def test_default_params(self):
        analyzer = CausalityAnalyzer()
        assert analyzer.max_lag == 40
        assert analyzer.top_n == 15
        assert analyzer.significance_threshold == 0.05
        assert analyzer.min_correlation == 0.1

    def test_custom_params(self):
        analyzer = CausalityAnalyzer(max_lag=10, top_n=5, significance_threshold=0.01)
        assert analyzer.max_lag == 10
        assert analyzer.top_n == 5
        assert analyzer.significance_threshold == 0.01


class TestCausalityAnalyzerAnalyze:
    """Tests for the analyze method."""

    @pytest.fixture
    def simple_df(self):
        """Create a simple numeric DataFrame for testing."""
        np.random.seed(42)
        n = 200
        x1 = np.cumsum(np.random.randn(n))
        x2 = np.cumsum(np.random.randn(n))
        # target is a function of x1 with some lag and noise
        target = np.roll(x1, 5) * 0.8 + np.random.randn(n) * 0.2
        return pd.DataFrame({
            "target": target,
            "x1": x1,
            "x2": x2,
            "constant": np.ones(n),  # zero variance - should be dropped
        })

    def test_basic_analysis(self, simple_df):
        analyzer = CausalityAnalyzer(top_n=5)
        result = analyzer.analyze(simple_df, "target", methods=["pearson"])
        assert "ranking" in result
        assert "target_stats" in result
        assert "methods_used" in result
        assert len(result["ranking"]) > 0

    def test_target_not_found(self, simple_df):
        analyzer = CausalityAnalyzer()
        with pytest.raises(ValueError, match="not found"):
            analyzer.analyze(simple_df, "nonexistent")

    def test_no_other_columns(self):
        df = pd.DataFrame({"target": [1, 2, 3, 4, 5]})
        analyzer = CausalityAnalyzer()
        with pytest.raises(ValueError, match="No other numeric"):
            analyzer.analyze(df, "target", methods=["pearson"])

    def test_pearson_method(self, simple_df):
        analyzer = CausalityAnalyzer()
        result = analyzer.analyze(simple_df, "target", methods=["pearson"])
        assert "pearson" in result["methods_used"]
        for r in result["ranking"]:
            assert "pearson" in r
            assert "pearson_abs" in r

    def test_cross_correlation_method(self, simple_df):
        analyzer = CausalityAnalyzer()
        result = analyzer.analyze(simple_df, "target", methods=["cross_corr"])
        for r in result["ranking"]:
            assert "xcorr" in r
            assert "lag_samples" in r
            assert "is_leader" in r

    def test_mutual_info_method(self, simple_df):
        analyzer = CausalityAnalyzer()
        result = analyzer.analyze(simple_df, "target", methods=["mutual_info"])
        for r in result["ranking"]:
            assert "mutual_info" in r

    def test_include_variables_filter(self, simple_df):
        analyzer = CausalityAnalyzer()
        result = analyzer.analyze(
            simple_df, "target",
            methods=["pearson"],
            include_variables=["x1"]
        )
        variables = [r["variable"] for r in result["ranking"]]
        assert "x1" in variables
        assert "x2" not in variables

    def test_top_n_truncation(self, simple_df):
        analyzer = CausalityAnalyzer(top_n=1)
        result = analyzer.analyze(simple_df, "target", methods=["pearson"])
        assert len(result["ranking"]) <= 1

    def test_ranking_sorted_by_score(self, simple_df):
        analyzer = CausalityAnalyzer()
        result = analyzer.analyze(simple_df, "target", methods=["pearson", "cross_corr"])
        scores = [r["score"] for r in result["ranking"]]
        assert scores == sorted(scores, reverse=True)


class TestComputeTargetStats:
    """Tests for _compute_target_stats."""

    def test_basic_stats(self):
        analyzer = CausalityAnalyzer()
        series = pd.Series(np.arange(100, dtype=float))
        stats = analyzer._compute_target_stats(series)
        assert "mean" in stats
        assert "std" in stats
        assert "min" in stats
        assert "max" in stats
        assert "trend" in stats
        assert "n_samples" in stats
        assert stats["n_samples"] == 100

    def test_increasing_trend(self):
        analyzer = CausalityAnalyzer()
        series = pd.Series(np.arange(100, dtype=float))
        stats = analyzer._compute_target_stats(series)
        assert stats["trend"] == "increasing"

    def test_decreasing_trend(self):
        analyzer = CausalityAnalyzer()
        series = pd.Series(np.arange(100, 0, -1, dtype=float))
        stats = analyzer._compute_target_stats(series)
        assert stats["trend"] == "decreasing"


class TestCompositeScoring:
    """Tests for _compute_composite_scores."""

    def test_scoring_pearson_only(self):
        analyzer = CausalityAnalyzer()
        results = {
            "var_a": {"variable": "var_a", "pearson_abs": 0.9},
            "var_b": {"variable": "var_b", "pearson_abs": 0.1},
        }
        ranking = analyzer._compute_composite_scores(results)
        assert ranking[0]["variable"] == "var_a"
        assert ranking[0]["score"] > ranking[1]["score"]

    def test_granger_cause_bonus(self):
        analyzer = CausalityAnalyzer()
        results = {
            "var_a": {"variable": "var_a", "pearson_abs": 0.5, "granger_type": "CAUSE"},
            "var_b": {"variable": "var_b", "pearson_abs": 0.5, "granger_type": "NONE"},
        }
        ranking = analyzer._compute_composite_scores(results)
        cause_score = next(r["score"] for r in ranking if r["variable"] == "var_a")
        none_score = next(r["score"] for r in ranking if r["variable"] == "var_b")
        assert cause_score > none_score

    def test_granger_effect_penalty(self):
        analyzer = CausalityAnalyzer()
        results = {
            "var_a": {"variable": "var_a", "pearson_abs": 0.5, "granger_type": "EFFECT"},
            "var_b": {"variable": "var_b", "pearson_abs": 0.5, "granger_type": "NONE"},
        }
        ranking = analyzer._compute_composite_scores(results)
        effect_score = next(r["score"] for r in ranking if r["variable"] == "var_a")
        none_score = next(r["score"] for r in ranking if r["variable"] == "var_b")
        assert effect_score < none_score

    def test_leader_lag_bonus(self):
        analyzer = CausalityAnalyzer()
        results = {
            "leader": {"variable": "leader", "pearson_abs": 0.5, "xcorr_abs": 0.5, "lag_samples": 5},
            "follower": {"variable": "follower", "pearson_abs": 0.5, "xcorr_abs": 0.5, "lag_samples": -5},
        }
        ranking = analyzer._compute_composite_scores(results)
        leader_score = next(r["score"] for r in ranking if r["variable"] == "leader")
        follower_score = next(r["score"] for r in ranking if r["variable"] == "follower")
        assert leader_score > follower_score
