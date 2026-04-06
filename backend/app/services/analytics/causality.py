"""
Root Cause Analysis Module — Target-Centric Causality Detection

Given a target variable, this module analyzes all other numeric columns
to rank them by likelihood of being the "root cause" of changes in the target.

Methods used (in order of depth):
  1. Pearson correlation — linear screening
  2. Cross-correlation with lag — temporal direction (who leads whom)
  3. Mutual Information — non-linear dependencies
  4. Granger causality — statistical causality test

Output: A ranked list of candidate variables with composite scores.
"""

import numpy as np
import pandas as pd
import logging
from typing import Optional
from scipy import signal

logger = logging.getLogger(__name__)


class CausalityAnalyzer:
    """Target-centric root cause analyzer.
    
    Analyzes all numeric columns relative to a single target variable
    to identify which variables most likely *cause* changes in the target.
    """

    def __init__(
        self,
        max_lag: int = 40,
        top_n: int = 15,
        significance_threshold: float = 0.05,
        min_correlation: float = 0.1,
    ):
        self.max_lag = max_lag
        self.top_n = top_n
        self.significance_threshold = significance_threshold
        self.min_correlation = min_correlation

    def analyze(
        self,
        df: pd.DataFrame,
        target_col: str,
        methods: list[str] = None,
        include_variables: list[str] = None,
    ) -> dict:
        """Run full root cause analysis pipeline.
        
        Args:
            df: DataFrame with numeric columns.
            target_col: Name of the target column to analyze.
            methods: List of methods to apply. 
                     Defaults to ["pearson", "cross_corr", "mutual_info", "granger"].
        
        Returns:
            Dictionary with keys:
                - ranking: list of dicts with variable scores and details
                - target_stats: dict with target variable statistics
                - methods_used: list of methods actually applied
        """
        if methods is None:
            methods = ["pearson", "cross_corr", "mutual_info", "granger"]

        if target_col not in df.columns:
            raise ValueError(f"Target column '{target_col}' not found in DataFrame")

        # Select only numeric columns and drop the target
        df_num = df.select_dtypes(include=[np.number]).copy()

        # Clean: drop columns with too many NaN or zero variance
        df_num = df_num.dropna(axis=1, thresh=int(len(df_num) * 0.5))
        df_num = df_num.loc[:, df_num.std() > 1e-6]

        # Downsample if dataset is large (keep temporal order)
        MAX_ROWS = 5000
        if len(df_num) > MAX_ROWS:
            step = len(df_num) // MAX_ROWS
            df_num = df_num.iloc[::step].copy()
            logger.info(f"Downsampled to {len(df_num)} rows for performance")

        if target_col not in df_num.columns:
            raise ValueError(f"Target column '{target_col}' has no valid numeric data")

        other_cols = [c for c in df_num.columns if c != target_col]

        # Filter by user-selected variables if specified
        if include_variables:
            other_cols = [c for c in other_cols if c in include_variables]

        if not other_cols:
            raise ValueError("No other numeric columns available for analysis")

        # Target stats
        target_series = df_num[target_col]
        target_stats = self._compute_target_stats(target_series)

        # Run each method
        results = {col: {"variable": col} for col in other_cols}

        if "pearson" in methods:
            self._run_pearson(df_num, target_col, other_cols, results)

        if "cross_corr" in methods:
            self._run_cross_correlation(df_num, target_col, other_cols, results)

        if "mutual_info" in methods:
            self._run_mutual_information(df_num, target_col, other_cols, results)

        if "granger" in methods:
            # Run on top candidates from earlier methods to save time
            candidates = self._select_granger_candidates(results, other_cols)
            self._run_granger(df_num, target_col, candidates, results)

        # Compute composite scores
        ranking = self._compute_composite_scores(results)

        # Truncate to top_n
        ranking = ranking[:self.top_n]

        return {
            "ranking": ranking,
            "target_stats": target_stats,
            "methods_used": methods,
        }

    # ─── Target Statistics ─────────────────────────────────────────────

    def _compute_target_stats(self, series: pd.Series) -> dict:
        """Compute summary statistics for the target variable."""
        window = max(10, len(series) // 50)
        smooth = series.rolling(window=window, min_periods=1).mean()
        t_start = float(smooth.iloc[:max(1, len(smooth) // 10)].mean())
        t_end = float(smooth.iloc[-max(1, len(smooth) // 10):].mean())
        delta = t_end - t_start

        return {
            "mean": float(series.mean()),
            "std": float(series.std()),
            "min": float(series.min()),
            "max": float(series.max()),
            "start_value": t_start,
            "end_value": t_end,
            "delta": delta,
            "trend": "decreasing" if delta < 0 else ("increasing" if delta > 0 else "stable"),
            "n_samples": len(series),
        }

    # ─── 1. Pearson Correlation ────────────────────────────────────────

    def _run_pearson(self, df: pd.DataFrame, target_col: str,
                     other_cols: list[str], results: dict):
        """Compute Pearson correlation between target and all other columns."""
        corr = df.corr()
        for col in other_cols:
            if col in corr.columns and target_col in corr.columns:
                r = corr.loc[col, target_col]
                if pd.isna(r):
                    r = 0.0
                results[col]["pearson"] = float(r)
                results[col]["pearson_abs"] = abs(float(r))
            else:
                results[col]["pearson"] = 0.0
                results[col]["pearson_abs"] = 0.0

    # ─── 2. Cross-Correlation with Lag ─────────────────────────────────

    def _run_cross_correlation(self, df: pd.DataFrame, target_col: str,
                                other_cols: list[str], results: dict):
        """Compute cross-correlation to detect who leads/follows the target."""
        target = df[target_col].interpolate().values
        target_norm = (target - np.mean(target)) / (np.std(target) + 1e-10)

        for col in other_cols:
            try:
                serie = df[col].interpolate().values
                serie_norm = (serie - np.mean(serie)) / (np.std(serie) + 1e-10)

                # Use 'direct' method for speed on shorter signals
                lag_limit = min(self.max_lag, len(target_norm) // 4)
                xcorr = np.correlate(target_norm, serie_norm, mode="full") / len(target_norm)
                mid = len(xcorr) // 2
                start = max(0, mid - lag_limit)
                end = min(len(xcorr), mid + lag_limit + 1)
                xcorr_window = xcorr[start:end]
                lags = np.arange(start - mid, end - mid)

                best_idx = int(np.argmax(np.abs(xcorr_window)))
                best_lag = int(lags[best_idx])
                best_corr = float(xcorr_window[best_idx])

                results[col]["xcorr"] = best_corr
                results[col]["xcorr_abs"] = abs(best_corr)
                results[col]["lag_samples"] = best_lag
                # Positive lag = variable anticipates the target (potential cause)
                results[col]["is_leader"] = best_lag > 0
            except Exception as e:
                logger.warning(f"Cross-correlation failed for {col}: {e}")
                results[col]["xcorr"] = 0.0
                results[col]["xcorr_abs"] = 0.0
                results[col]["lag_samples"] = 0
                results[col]["is_leader"] = False

    # ─── 3. Mutual Information ─────────────────────────────────────────

    def _run_mutual_information(self, df: pd.DataFrame, target_col: str,
                                 other_cols: list[str], results: dict):
        """Compute Mutual Information for non-linear dependency detection."""
        try:
            from sklearn.feature_selection import mutual_info_regression
            from sklearn.preprocessing import StandardScaler

            df_clean = df[other_cols + [target_col]].dropna()
            if len(df_clean) < 50:
                logger.warning("Insufficient data for Mutual Information")
                for col in other_cols:
                    results[col]["mutual_info"] = 0.0
                return

            # Subsample for MI performance (k-NN is O(n²))
            MI_MAX_ROWS = 2000
            if len(df_clean) > MI_MAX_ROWS:
                df_clean = df_clean.sample(n=MI_MAX_ROWS, random_state=42)

            X = StandardScaler().fit_transform(df_clean[other_cols].values)
            y = df_clean[target_col].values
            mi = mutual_info_regression(X, y, random_state=42, n_neighbors=3)
            mi_max = float(max(mi)) if max(mi) > 0 else 1.0

            for i, col in enumerate(other_cols):
                results[col]["mutual_info"] = float(mi[i])
                results[col]["mutual_info_norm"] = float(mi[i] / mi_max)
        except ImportError:
            logger.warning("scikit-learn not available, skipping Mutual Information")
            for col in other_cols:
                results[col]["mutual_info"] = 0.0
                results[col]["mutual_info_norm"] = 0.0
        except Exception as e:
            logger.warning(f"Mutual Information failed: {e}")
            for col in other_cols:
                results[col]["mutual_info"] = 0.0
                results[col]["mutual_info_norm"] = 0.0

    # ─── 4. Granger Causality ──────────────────────────────────────────

    def _select_granger_candidates(self, results: dict, other_cols: list[str]) -> list[str]:
        """Select top candidates from Pearson + Cross-corr for Granger testing."""
        scored = []
        for col in other_cols:
            r = results[col]
            s = r.get("pearson_abs", 0) + r.get("xcorr_abs", 0)
            scored.append((col, s))
        scored.sort(key=lambda x: x[1], reverse=True)
        # Test top 10 candidates (Granger is expensive)
        return [c for c, _ in scored[:min(10, len(scored))]]

    def _run_granger(self, df: pd.DataFrame, target_col: str,
                     candidates: list[str], results: dict):
        """Run Granger causality test for selected candidates."""
        try:
            from statsmodels.tsa.stattools import grangercausalitytests
        except ImportError:
            logger.warning("statsmodels not available, skipping Granger causality")
            for col in candidates:
                results[col]["granger_type"] = "n/a"
                results[col]["granger_p"] = 1.0
            return

        target = df[target_col].interpolate()
        # Cap lag aggressively for speed: Granger with high lag is very slow
        max_lag = min(10, self.max_lag, len(df) // 10)
        if max_lag < 2:
            logger.warning("Not enough data for Granger test")
            for col in candidates:
                results[col]["granger_type"] = "n/a"
                results[col]["granger_p"] = 1.0
            return

        import warnings
        for col in candidates:
            try:
                serie = df[col].interpolate()
                data = pd.DataFrame({target_col: target, col: serie}).dropna()
                if len(data) < max_lag * 5:
                    results[col]["granger_type"] = "n/a"
                    results[col]["granger_p"] = 1.0
                    continue

                # Forward: col → target (does col help predict target?)
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    test_fwd = grangercausalitytests(
                        data[[target_col, col]], maxlag=max_lag, verbose=False
                    )
                best_lag_fwd = min(test_fwd.keys(),
                                    key=lambda k: test_fwd[k][0]["ssr_ftest"][1])
                p_fwd = float(test_fwd[best_lag_fwd][0]["ssr_ftest"][1])

                # Reverse: target → col (does target help predict col?)
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    test_rev = grangercausalitytests(
                        data[[col, target_col]], maxlag=max_lag, verbose=False
                    )
                best_lag_rev = min(test_rev.keys(),
                                    key=lambda k: test_rev[k][0]["ssr_ftest"][1])
                p_rev = float(test_rev[best_lag_rev][0]["ssr_ftest"][1])

                alpha = self.significance_threshold
                if p_fwd < alpha and p_rev >= alpha:
                    granger_type = "CAUSE"
                elif p_fwd >= alpha and p_rev < alpha:
                    granger_type = "EFFECT"
                elif p_fwd < alpha and p_rev < alpha:
                    granger_type = "FEEDBACK"
                else:
                    granger_type = "NONE"

                results[col]["granger_type"] = granger_type
                results[col]["granger_p"] = p_fwd
                results[col]["granger_lag"] = int(best_lag_fwd)
            except Exception as e:
                logger.warning(f"Granger test failed for {col}: {e}")
                results[col]["granger_type"] = "n/a"
                results[col]["granger_p"] = 1.0

    # ─── Composite Scoring ─────────────────────────────────────────────

    def _compute_composite_scores(self, results: dict) -> list[dict]:
        """Combine all method results into a single composite score.
        
        Scoring weights (inspired by the user's original script):
          - Pearson:       up to 25 pts  (|r| * 25)
          - Cross-corr:    up to 20 pts  (|xcorr| * 20) + 10 pts bonus for leading lag
          - Mutual Info:   up to 15 pts  (normalized MI * 15)
          - Granger:       CAUSE = +30, FEEDBACK = +15, EFFECT = -10
        """
        ranking = []
        for col, r in results.items():
            score = 0.0

            # Pearson (0–25)
            pearson_abs = r.get("pearson_abs", 0)
            score += pearson_abs * 25

            # Cross-correlation (0–30)
            xcorr_abs = r.get("xcorr_abs", 0)
            score += xcorr_abs * 20
            lag = r.get("lag_samples", 0)
            if lag > 0:
                # Bonus for variables that anticipate the target
                score += min(lag, 10)

            # Mutual Information (0–15)
            mi_norm = r.get("mutual_info_norm", 0)
            score += mi_norm * 15

            # Granger (−10 to +30)
            granger_type = r.get("granger_type", "n/a")
            if granger_type == "CAUSE":
                score += 30
            elif granger_type == "FEEDBACK":
                score += 15
            elif granger_type == "EFFECT":
                score -= 10

            r["score"] = round(score, 2)
            ranking.append(r)

        ranking.sort(key=lambda x: x["score"], reverse=True)
        return ranking
