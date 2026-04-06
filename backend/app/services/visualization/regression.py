"""Regression engine for fitting and predicting with various model types.

This module provides a comprehensive regression framework supporting:
- Linear regression (OLS, Ridge, Lasso, ElasticNet)
- Polynomial regression (any degree)
- Random Forest regression
- Custom formula fitting using non-linear least squares

Features include:
- Automatic handling of datetime predictors (converted to relative days)
- Outlier removal using IQR method
- 95% confidence interval calculation
- Model persistence (save/load with joblib)
- Support for multi-variable regression

The regression results include fitted coefficients, equation strings,
R², MSE, MAE metrics, and data series for plotting regression lines
and confidence bands.
"""

import numpy as np
import pandas as pd
from typing import Optional, List, Tuple, Any
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
from scipy import stats
from scipy.optimize import curve_fit
import joblib
import os
import logging

logger = logging.getLogger(__name__)

from app.models.schemas import (
    VisualizationConfig,
    PlotDataSeries,
    RegressionModel,
    SeriesRenderType
)
from app.services.export_helpers.utils import hex_to_rgb
from app.services.visualization.processing import downsample_series

MODEL_DIR = os.path.join("data", "models")
"""Directory path for storing trained model files."""

if not os.path.exists(MODEL_DIR):
    os.makedirs(MODEL_DIR, exist_ok=True)

SAFE_MATH = {
    'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
    'exp': np.exp, 'log': np.log, 'log10': np.log10,
    'sqrt': np.sqrt, 'abs': np.abs, 'power': np.power,
    'pi': np.pi, 'e': np.e,
    'arcsin': np.arcsin, 'arccos': np.arccos, 'arctan': np.arctan,
}
"""Safe math functions and constants for custom formula evaluation.

These are the only functions available in custom formula eval() contexts,
preventing arbitrary code execution while allowing common mathematical
operations.
"""


def _sort_key_for_x(x_val):
    """Return sortable key for x values (handles ISO date strings and numerics).
    
    This ensures regression line and CI points are sorted correctly for plotting,
    regardless of whether x-axis is datetime (stored as ISO strings) or numeric.
    """
    if isinstance(x_val, str):
        try:
            # Parse ISO datetime strings to timestamp for sorting
            return pd.to_datetime(x_val).timestamp()
        except:
            # If parsing fails, use string comparison
            return x_val
    try:
        return float(x_val)
    except:
        return x_val


def _sort_points_by_x(points: list) -> list:
    """Sort a list of point dicts by their 'x' value."""
    if not points:
        return points
    return sorted(points, key=lambda pt: _sort_key_for_x(pt["x"]))


class CustomRegressionWrapper:
    """Wrapper to make custom formula models compatible with sklearn predict interface.

    This class enables saving and loading custom formula models with joblib
    by encapsulating the formula string, fitted parameters, and predictor names.

    Attributes:
        formula: The custom formula string (e.g., "a * exp(-b * x) + c").
        param_names: List of parameter names in the formula (e.g., ["a", "b", "c"]).
        params: Fitted parameter values from curve_fit.
        predictors: List of predictor column names used in the formula.
    """

    def __init__(self, formula: str, param_names: List[str], params: np.ndarray, predictors: List[str]):
        """Initialize the custom regression wrapper.

        Args:
            formula: The formula string to evaluate.
            param_names: Names of the parameters in the formula.
            params: Fitted parameter values.
            predictors: Column names used as predictors.
        """
        self.formula = formula
        self.param_names = param_names
        self.params = params
        self.predictors = predictors

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Predict target values using the custom formula.

        Evaluates the stored formula with fitted parameters for each input sample.

        Args:
            X: Input features array of shape (n_samples, n_predictors) or (n_samples,)
               for single-predictor models.

        Returns:
            Array of predicted values with shape (n_samples,).
        """
        # X is (n_samples, n_predictors)
        ctx = {}
        for i, p in enumerate(self.predictors):
            if X.ndim == 1:
                col_data = X[i] if len(self.predictors) > 1 else X
                # Special case: if 1 predictor, X might be scalar or 1D array
                # If X is 1D array of shape (N,), and predictors=1, then X is the column.
                # If predictors > 1, X is (N,) representing 1 row? 
                # Scikit-learn predict X is usually (N_samples, N_features).
                # Here we assume standard sklearn input.
                pass
            else:
                 col_data = X[:, i]
            
            ctx[p] = col_data

        # If X is standard sklearn (n, p), we mapped it.
        # But if X provided to predict is just 1D array for single sample?
        # Standardize X to 2D for robustness
        X_arr = np.array(X)
        if X_arr.ndim == 1 and len(self.predictors) == 1:
            # Ambiguous: 1 sample with 1 feature OR N samples with 1 feature?
            # Typically predict takes (N, Features).
            # If 1 feature, it is (N, 1) or (N,).
            ctx[self.predictors[0]] = X_arr
        elif X_arr.ndim == 1:
            # Single sample with multiple features
            for i, p in enumerate(self.predictors):
                ctx[p] = X_arr[i]
        else:
            # 2D (N, P)
            for i, p in enumerate(self.predictors):
                ctx[p] = X_arr[:, i]

        local_ctx = {}
        local_ctx.update(dict(zip(self.param_names, self.params)))
        local_ctx.update(SAFE_MATH)
        local_ctx['col'] = ctx
        # Also support 'x' if single predictor
        if len(self.predictors) == 1:
             local_ctx['x'] = ctx[self.predictors[0]]
             
        return eval(self.formula, {"__builtins__": {}}, local_ctx)


class RegressionEngine:
    """Static methods for training, predicting, and managing regression models.

    This class provides the core regression functionality including:
    - Training various model types (linear, polynomial, ridge, lasso, elastic net, random forest)
    - Fitting custom formulas using non-linear least squares
    - Calculating regression lines and confidence intervals for plotting
    - Multi-variable regression support
    - Model persistence (save/load)

    All methods are static and operate on provided data without maintaining state.
    """

    @staticmethod
    def train_model(
        X: np.ndarray,
        y: np.ndarray,
        model_type: str,
        degree: int = 1,
        use_ridge: bool = False,
        alpha: float = 1.0,
        l1_ratio: float = 0.5,
        rf_params: dict = None
    ) -> Tuple[Any, Optional[PolynomialFeatures], float, np.ndarray]:
        """Train a regression model on the provided data.

        Args:
            X: Feature matrix of shape (n_samples, n_features).
            y: Target values of shape (n_samples,).
            model_type: Type of model - "linear", "ridge", "lasso", "elastic_net", or "random_forest".
            degree: Polynomial degree (>1 enables polynomial features).
            use_ridge: If True and model_type is "linear", use Ridge regression.
            alpha: Regularization strength for Ridge/Lasso/ElasticNet.
            l1_ratio: L1 ratio for ElasticNet (0=Ridge, 1=Lasso).
            rf_params: Parameters for RandomForestRegressor (n_estimators, max_depth, etc.).

        Returns:
            A tuple containing:
                - model: The fitted sklearn model object
                - poly: PolynomialFeatures transformer if degree > 1, else None
                - r2: R-squared score on training data
                - y_pred: Predicted values on training data
        """
        is_poly = degree > 1
        
        if model_type == 'random_forest':
             params = rf_params or {}
             model = RandomForestRegressor(
                 n_estimators=params.get('n_estimators', 100),
                 max_depth=params.get('max_depth', None),
                 min_samples_split=params.get('min_samples_split', 2),
                 min_samples_leaf=params.get('min_samples_leaf', 1),
                 random_state=42
             )
             if is_poly:
                poly = PolynomialFeatures(degree=degree, include_bias=False)
                X_poly = poly.fit_transform(X)
                model.fit(X_poly, y)
                r2 = model.score(X_poly, y)
                y_pred = model.predict(X_poly)
             else:
                poly = None
                model.fit(X, y)
                r2 = model.score(X, y)
                y_pred = model.predict(X)
                
        else:
            # Configure Ridge/Lasso with alpha if selected
            if model_type == 'ridge' or use_ridge:
                 model_cls = lambda: Ridge(alpha=alpha)
            elif model_type == 'lasso':
                 model_cls = lambda: Lasso(alpha=alpha)
            elif model_type == 'elastic_net':
                 model_cls = lambda: ElasticNet(alpha=alpha, l1_ratio=l1_ratio)
            else:
                 model_cls = LinearRegression
            
            if is_poly:
                poly = PolynomialFeatures(degree=degree, include_bias=False)
                X_poly = poly.fit_transform(X)
                model = model_cls().fit(X_poly, y)
                r2 = model.score(X_poly, y)
                y_pred = model.predict(X_poly)
            else:
                poly = None
                model = model_cls().fit(X, y)
                r2 = model.score(X, y)
                y_pred = model.predict(X)
                
        return model, poly, r2, y_pred

    @staticmethod
    def _fit_custom_model(
        x_data: np.ndarray,
        y_data: np.ndarray,
        formula: str,
        param_names: List[str],
        initial_guesses: Optional[List[float]] = None,
        data_context: Optional[dict] = None,
        bounds_lower: Optional[List[float]] = None,
        bounds_upper: Optional[List[float]] = None,
        loss: str = "linear",
        method: str = "trf"
    ) -> Tuple[np.ndarray, np.ndarray, float, np.ndarray]:
        """Fit a custom formula to data using non-linear least squares (scipy curve_fit).

        Supports arbitrary formulas with multiple parameters and optional column
        references via col['ColumnName'] syntax.

        Args:
            x_data: Independent variable data (primary predictor).
            y_data: Dependent variable data (target).
            formula: Formula string using 'x' for predictor, parameter names,
                and optionally col['Name'] for additional columns.
                Example: "a * exp(-b * x) + c * col['Temperature']"
            param_names: List of parameter names to fit (e.g., ["a", "b", "c"]).
            initial_guesses: Initial parameter values for optimization.
            data_context: Dict mapping column names to arrays for col[] access.
                Must be aligned with x_data/y_data rows.
            bounds_lower: Lower bounds for each parameter (-np.inf for unbounded).
            bounds_upper: Upper bounds for each parameter (np.inf for unbounded).
            loss: Loss function to use for optimization.
                Options: 'linear' (least squares), 'soft_l1', 'huber', 'cauchy', 'arctan'
            method: Optimization method to use.
                Options: 'lm', 'trf', 'dogbox'
                
        Returns:
            A tuple containing:
                - popt: Optimal parameter values
                - pcov: Parameter covariance matrix
                - r2: R-squared score
                - y_pred: Predicted values for all input data

        Raises:
            ValueError: If not enough valid data points after filtering NaN.
            Exception: If curve fitting fails.
        """
        try:
            # Create a wrapper function for curve_fit
            # signature: f(x, *params)
            def func(x, *params, ctx=None):
                local_ctx = {"x": x}
                # Zip param names with values
                local_ctx.update(dict(zip(param_names, params)))
                # Add safe math
                local_ctx.update(SAFE_MATH)
                
                # Add global variable/column access
                if ctx is not None:
                     local_ctx['col'] = ctx
                
                # RESTRICTED EVAL
                return eval(formula, {"__builtins__": {}}, local_ctx)
            
            # Pre-evaluate formula to find which rows produce valid results
            # Use initial guesses or 1.0 for each param
            test_params = initial_guesses if initial_guesses and len(initial_guesses) == len(param_names) else [1.0] * len(param_names)
            
            try:
                test_result = func(x_data.ravel(), *test_params, ctx=data_context)
                valid_mask = ~np.isnan(test_result) & ~np.isinf(test_result)
            except Exception:
                valid_mask = np.ones(len(x_data), dtype=bool)
            
            # Filter data to only valid rows
            if data_context is not None:
                # Create filtered context for fitting
                filtered_context = {k: np.array(v)[valid_mask] for k, v in data_context.items()}
            else:
                filtered_context = None
            
            x_filtered = x_data.ravel()[valid_mask]
            y_filtered = np.array(y_data)[valid_mask]
            
            if len(x_filtered) < len(param_names) + 1:
                raise ValueError(f"Not enough valid data points ({len(x_filtered)}) after filtering NaN. Need at least {len(param_names) + 1}.")
            
            # Create fitting function with filtered context
            def func_fit(x, *params):
                return func(x, *params, ctx=filtered_context)
                
            # Prepare initial guesses
            p0 = None
            if initial_guesses and len(initial_guesses) == len(param_names):
                p0 = initial_guesses
            elif len(param_names) > 0:
                p0 = [1.0] * len(param_names)
            
            # Prepare bounds for curve_fit
            # bounds should be a tuple of (lower_bounds_array, upper_bounds_array)
            bounds = (-np.inf, np.inf)  # Default: no bounds
            if bounds_lower is not None or bounds_upper is not None:
                n_params = len(param_names)
                lower = bounds_lower if bounds_lower and len(bounds_lower) == n_params else [-np.inf] * n_params
                upper = bounds_upper if bounds_upper and len(bounds_upper) == n_params else [np.inf] * n_params
                bounds = (lower, upper)
                # When using bounds, we must use 'trf' or 'dogbox' method
                if method == 'lm':
                    method = 'trf'
            
            # Ensure method is valid for loss
            if loss != 'linear' and method == 'lm':
                 method = 'trf'
                
            # Fit on filtered data
            popt, pcov = curve_fit(func_fit, x_filtered, y_filtered, p0=p0, bounds=bounds, method=method, loss=loss, f_scale=1.0, maxfev=10000)
            
            # Predict on ALL original data (including where formula produces NaN)
            y_pred = func(x_data.ravel(), *popt, ctx=data_context)
            
            # R2 on filtered data only
            y_pred_filtered = func_fit(x_filtered, *popt)
            ss_res = np.sum((y_filtered - y_pred_filtered) ** 2)
            ss_tot = np.sum((y_filtered - np.mean(y_filtered)) ** 2)
            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            
            return popt, pcov, r2, y_pred
            
        except Exception as e:
            logger.error(f"Custom calibration failed: {e}")
            raise e

    @staticmethod
    def add_regression(
        x_data: list,
        y_data: list,
        degree: int = 1,
        remove_outliers: bool = False,
        use_ridge: bool = False,
        model_type: str = "linear",
        alpha: float = 1.0,
        l1_ratio: float = 0.5,
        rf_params: dict = None,
        line_color: str = None,
        custom_formula: str = None,
        custom_params: list = None,
        custom_guesses: list = None,
        custom_bounds_lower: list = None,
        custom_bounds_upper: list = None,
        custom_loss: str = "linear",
        custom_method: str = "trf",
        dataframe: Optional[pd.DataFrame] = None,
        predictor_names: list = None,
        iqr_multiplier: float = 1.5
    ) -> Tuple[Optional[PlotDataSeries], List[PlotDataSeries], Optional[RegressionModel]]:
        """Calculate regression line with confidence intervals and metrics.

        Fits a regression model and generates plot data series for the regression
        line and 95% confidence bands.

        Args:
            x_data: List of x-axis values (numeric or datetime strings).
            y_data: List of y-axis values (numeric).
            degree: Polynomial degree (1 for linear).
            remove_outliers: If True, remove outliers using IQR method before fitting.
            use_ridge: If True, use Ridge regression (deprecated, use model_type).
            model_type: Model type - "linear", "ridge", "lasso", "elastic_net",
                "random_forest", or "custom".
            alpha: Regularization strength for regularized models.
            l1_ratio: ElasticNet L1 ratio.
            rf_params: Random Forest hyperparameters dict.
            line_color: Hex color for regression line (default: "#f59e0b").
            custom_formula: Formula string for custom model type.
            custom_params: Parameter names for custom formula.
            custom_guesses: Initial parameter guesses for custom formula.
            custom_bounds_lower: Lower bounds for custom parameters.
            custom_bounds_upper: Upper bounds for custom parameters.
            custom_loss: Loss function to use for optimization.
                Options: 'linear' (least squares), 'soft_l1', 'huber', 'cauchy', 'arctan'
            custom_method: Optimization method to use.
                Options: 'lm', 'trf', 'dogbox'
            dataframe: Source DataFrame for col[] references in custom formulas.
            predictor_names: Explicit predictor column names.
            iqr_multiplier: IQR multiplier for outlier detection (default: 1.5).

        Returns:
            A tuple containing:
                - main_series: PlotDataSeries for the regression line, or None on failure
                - ci_series: List of PlotDataSeries for CI bands (lower, upper)
                - reg_model: RegressionModel with coefficients and metrics, or None
        """
        try:
            y_arr = np.array(y_data, dtype=float)
            
            # Try to use x as numeric
            predictor_type = "numeric"
            ref_date = None
            try:
                # Check for dates first
                # If x_data is list of strings that look like dates?
                # pd.to_datetime handles mix, but let's try strict float first for speed
                x_arr = np.array(x_data, dtype=float)
                is_numeric_x = True
            except (ValueError, TypeError):
                # Try Date conversion
                try:
                    dates = pd.to_datetime(x_data)
                    if len(dates) == 0:
                        return None, [], None
                    
                    # RELATIVE DATA LOGIC
                    # Find reference date (min date)
                    ref_date = dates.min()
                    
                    # Use days RELATIVE to reference date
                    # (dates - ref_date) gives timedelta. .dt.total_seconds() / 86400
                    # This avoids 1970 epoch large numbers
                    x_arr = np.array((dates - ref_date).total_seconds() / 86400.0)
                    
                    predictor_type = "datetime"
                    is_numeric_x = True
                except:
                    # Fallback to index
                    x_arr = np.arange(len(y_arr), dtype=float)
                    is_numeric_x = False
                    ref_date = None
            
            # Mask NaN values
            mask = ~np.isnan(y_arr) & ~np.isnan(x_arr)
            x_clean = x_arr[mask].reshape(-1, 1)
            y_clean = y_arr[mask]
            
            if len(x_clean) < 2:
                return None, [], None
            
            # --- OUTLIER REMOVAL (IQR Method) ---
            if remove_outliers:
                q1 = np.percentile(y_clean, 25)
                q3 = np.percentile(y_clean, 75)
                iqr = q3 - q1
                
                lower_bound = q1 - iqr_multiplier * iqr
                upper_bound = q3 + iqr_multiplier * iqr
                
                valid_mask = (y_clean >= lower_bound) & (y_clean <= upper_bound)
                
                x_clean = x_clean[valid_mask]
                y_clean = y_clean[valid_mask]
                
                if len(x_clean) < 2:
                    return None, [], None
            # -----------------------
            
            # Explain: Use helper
            poly = None
            if model_type != 'custom':
                # Check for Robust Linear Regression request (Linear model + Non-linear Loss)
                # Only strictly for 'linear' model type (not ridge/lasso/RF) and non-linear loss
                if model_type in ('linear', 'polynomial') and custom_loss != 'linear':
                     # Use curve_fit to perform robust linear regression
                     # Formula: y = m*x + c
                     
                     if degree == 1: # Simple linear
                         def func_lin(x, m, c):
                             return m * x + c
                         
                         try:
                             # Use robust fitting
                             # x_clean is (N, 1), flatten to (N,)
                             x_flat = x_clean.ravel()
                             
                             # Initial guess: use standard linear regression for guess
                             # (or just 0s, but OLS guess helps convergence)
                             m_guess, c_guess = 0, 0
                             try:
                                 reg = LinearRegression().fit(x_clean, y_clean)
                                 m_guess = reg.coef_[0]
                                 c_guess = reg.intercept_
                             except:
                                 pass
                             
                             popt, pcov = curve_fit(
                                 func_lin, x_flat, y_clean, 
                                 p0=[m_guess, c_guess], 
                                 method=custom_method if custom_method != 'lm' else 'trf',  # 'lm' doesn't support non-linear loss
                                 loss=custom_loss, 
                                 f_scale=1.0 # default outlier scale
                             )
                             
                             m, c = popt
                             model = None # No sklearn model
                             y_pred_clean = func_lin(x_flat, m, c)
                             
                             # Calculate R2
                             ss_res = np.sum((y_clean - y_pred_clean) ** 2)
                             ss_tot = np.sum((y_clean - np.mean(y_clean)) ** 2)
                             r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
                             
                             robust_result = {'intercept': c, 'coeffs': [m]}
                         except Exception as e:
                             logger.error(f"Robust linear regression failed: {e}")
                             # Fallback to OLS
                             model, poly, r2, y_pred_clean = RegressionEngine.train_model(x_clean, y_clean, model_type, degree, use_ridge, alpha=alpha, l1_ratio=l1_ratio, rf_params=rf_params)
                             robust_result = None

                     else:
                         # Polynomial Robust is harder because we need dynamic function arguments
                         # We can define a wrapper that takes *params
                         def func_poly(x, *params):
                             # params is [intercept, coef_x, coef_x2, ...]
                             # x is raw x (not poly features)
                             res = params[0] # intercept
                             for i, p in enumerate(params[1:], 1):
                                 res += p * (x ** i)
                             return res
                         
                         try:
                             # Need degree + 1 parameters
                             n_params = degree + 1
                             # Guess from OLS
                             p0 = np.zeros(n_params)
                             
                             # Flatten
                             x_flat = x_clean.ravel()
                             
                             # Safe method selection
                             method_to_use = custom_method if custom_method != 'lm' else 'trf'
                             
                             popt, pcov = curve_fit(
                                 func_poly, x_flat, y_clean,
                                 p0=p0,
                                 method=method_to_use,
                                 loss=custom_loss,
                                 f_scale=1.0
                             )
                             
                             # Extract results
                             # Our train_model returns (intercept, coefs list)
                             # Here popt is [intercept, c1, c2...]
                             intercept = popt[0]
                             coeffs = popt[1:]
                             
                             # Mock the sklearn model structure for below logic
                             # We need 'model' to be None to signal we handled it, or valid object
                             # Let's use None and set data directly below, but we need to bypass train_model
                             model = None
                             poly = PolynomialFeatures(degree)
                             poly.fit(x_clean)
                             y_pred_clean = func_poly(x_flat, *popt)
                              
                              # Calculate R2
                             ss_res = np.sum((y_clean - y_pred_clean) ** 2)
                             ss_tot = np.sum((y_clean - np.mean(y_clean)) ** 2)
                             r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
                             
                             # To make the logic below work, we need to pass these values out
                             # The logic below uses 'model' object to get intercept/coefs.
                             # We will need to set them explicitly if model is None but it wasn't 'custom' or 'random_forest'
                             # Store them in a temporary structure
                             robust_result = {'intercept': intercept, 'coeffs': coeffs}
                             
                         except Exception as e:
                             logger.error(f"Robust poly regression failed: {e}")
                             model, poly, r2, y_pred_clean = RegressionEngine.train_model(x_clean, y_clean, model_type, degree, use_ridge, alpha=alpha, l1_ratio=l1_ratio, rf_params=rf_params)
                             robust_result = None
                else:
                    # Standard OLS / Ridge / etc
                    model, poly, r2, y_pred_clean = RegressionEngine.train_model(x_clean, y_clean, model_type, degree, use_ridge, alpha=alpha, l1_ratio=l1_ratio, rf_params=rf_params)
                    robust_result = None
            else:
                # Placeholder for custom, logic is below
                model, poly, r2, y_pred_clean = None, None, 0, []
                robust_result = None
            
            if poly:
                x_poly = poly.transform(x_clean)
            
            # --- CUSTOM MODEL LOGIC ---
            # (Handled inside add_regression logic flow below)

            
            # --- CONSTRUCT METADATA ---
            intercept = 0
            coeffs = [0]
            
            if model_type == 'custom':
                 try:
                     # Prepare data context if dataframe provided
                     df_clean_ctx = None
                     if dataframe is not None:
                         try:
                             # We assume rows match between dataframe and ORIGINAL x_data/y_data
                             # mask filters based on NaNs in x_arr/y_arr.
                             
                             if len(dataframe) == len(mask):
                                 # 1. Identify columns used in custom formula
                                 import re
                                 # Matches col['Name'] or col["Name"]
                                 used_cols = set(re.findall(r"col\['([^']+)'\]", custom_formula))
                                 used_cols.update(re.findall(r'col\["([^"]+)"\]', custom_formula))
                                 
                                 # 2. Update mask to exclude rows where ANY used column is NaN
                                 # We must access the original dataframe rows aligned with x_arr/y_arr
                                 # mask is boolean array of length len(dataframe)
                                 
                                 combined_mask = mask.copy()
                                 for col in used_cols:
                                     if col in dataframe.columns:
                                         # Mark as invalid where column is NaN
                                         col_valid = ~dataframe[col].isna().values
                                         combined_mask &= col_valid
                                 
                                 # Re-slice everything using the stricter mask
                                 # Note: x_clean and y_clean were already sliced by 'mask'. 
                                 # We need to re-slice them or slice from original.
                                 # Easier to slice from original x_arr/y_arr with new mask.
                                 
                                 x_clean = x_arr[combined_mask].reshape(-1, 1)
                                 y_clean = y_arr[combined_mask]
                                 
                                 # Slice dataframe
                                 df_filtered = dataframe.iloc[combined_mask]

                                 # Apply outlier removal if needed (on the already stricter set)
                                 if len(x_clean) > 2 and remove_outliers:
                                        # Recalculate outliers on strict set
                                        if np.std(y_clean) > 1e-9:
                                            q1 = np.percentile(y_clean, 25)
                                            q3 = np.percentile(y_clean, 75)
                                            iqr = q3 - q1
                                            lower_bound = q1 - iqr_multiplier * iqr
                                            upper_bound = q3 + iqr_multiplier * iqr
                                            
                                            valid_outlier = (y_clean >= lower_bound) & (y_clean <= upper_bound)
                                            
                                            x_clean = x_clean[valid_outlier]
                                            y_clean = y_clean[valid_outlier]
                                            df_filtered = df_filtered.iloc[valid_outlier]

                                 # Convert to dict of numpy arrays for fast access in eval
                                 df_clean_ctx = {c: df_filtered[c].values for c in df_filtered.columns}
                         except Exception as e:
                             logger.warning(f"Warning: Could not prepare data context: {e}")


                     # Use bounds parameters directly
                     
                     if len(x_clean) < 2:
                        return None, [], None

                     popt, pcov, r2, y_pred_clean = RegressionEngine._fit_custom_model(
                         x_clean, y_clean, custom_formula, custom_params, custom_guesses, 
                         data_context=df_clean_ctx, bounds_lower=custom_bounds_lower, bounds_upper=custom_bounds_upper,
                         loss=custom_loss, method=custom_method
                     )
                     
                     # Construct Equation String
                     # Replace param names with values in the formula string for display
                     eq_str = custom_formula
                     for p_name, p_val in zip(custom_params, popt):
                         # Simple string replace - might be risky if param names are substrings of others
                         # e.g. param "a" and "aa".
                         # Use regex word boundary replacement
                         import re
                         pattern = re.compile(fr'\b{p_name}\b')
                         eq_str = pattern.sub(f"{p_val:.2e}", eq_str)
                     
                     coeffs = popt
                     c = 0 # Intercept concept undefined for arbitrary Formula
                 except Exception as e:
                     logger.error(f"Custom fit failed: {e}")
                     return None, [], None

            elif model_type == 'random_forest':
                 eq_str = f"Random Forest (R2={r2:.2f})"
                 c = 0
                 m = 0
            else:
                # Linear / Ridge methods have coef_ / intercept_
                if robust_result:
                    # Use results from robust fitting
                    intercept = robust_result['intercept']
                    coeffs = robust_result['coeffs']
                else:
                    intercept = model.intercept_
                    coeffs = model.coef_
                
                # For datetime polynomial, coefficients span many orders of magnitude
                # (e.g., x coef ~1e-11, x^2 coef ~1e-22). Don't filter any of them!
                # Only filter actual zeros (< 1e-300, which is effectively the smallest float)
                zero_thresh = 1e-300
                
                if poly:
                    # Polynomial equation - filter out zero coefficients
                    eq_str = f"y = {intercept:.2e}"
                    for i, coef_val in enumerate(coeffs, 1):
                        if abs(coef_val) < zero_thresh:  # Skip zero coefficients
                            continue
                        sign = "+" if coef_val >= 0 else ""
                        eq_str += f" {sign} {coef_val:.2e}x^{i}"
                    c = intercept
                    m = 0 # Not fitting linear model structure
                else:
                    # Linear equation
                    c = intercept
                    m = coeffs[0]
                    # If slope is effectively zero (relative to its own magnitude), show intercept only
                    if abs(m) < zero_thresh:
                        eq_str = f"y = {c:.2e}"
                    else:
                        sign = "+" if c >= 0 else "-"
                        eq_str = f"y = {m:.2e}x {sign} {abs(c):.2e}"
                    # unify vars
                    coeffs = [m]

            # Create RegressionModel
            reg_type = "polynomial" if degree > 1 else "linear"
            if model_type == 'random_forest':
                reg_type = "random_forest"
            elif model_type == 'custom':
                reg_type = "custom"

            # Determine predictors for the model
            # For custom formulas, extract column references like col['Name'] or df['Name']
            if predictor_names:
                model_predictors = predictor_names
            else:
                model_predictors = ["x"]
            
            model_predictor_types = [predictor_type] * len(model_predictors)
            
            if model_type == 'custom' and custom_formula:
                import re
                # Extract column references from formula: col['Name'], col["Name"]
                col_pattern = r"col\s*\[\s*['\"]([^'\"]+)['\"]\s*\]"
                col_refs = re.findall(col_pattern, custom_formula)
                if col_refs:
                    # Use unique column names as predictors (preserve order)
                    seen = set()
                    unique_cols = []
                    for col in col_refs:
                        if col not in seen:
                            seen.add(col)
                            unique_cols.append(col)
                    model_predictors = unique_cols
                    model_predictor_types = ['numeric'] * len(unique_cols)
                # If formula uses 'x' but no col[] references, keep ["x"]

            reg_model = RegressionModel(
                type=reg_type,
                degree=degree,
                intercept=float(intercept) if model_type != 'random_forest' and degree > 1 else float(c),
                coefficients=[float(x) for x in (coeffs if hasattr(coeffs, '__iter__') and not isinstance(coeffs, (str, bytes)) else [m])],
                equation=eq_str,
                r2=r2,
                mse=0, # Will calculate below
                mae=0,
                predictors=model_predictors,
                predictor_types=model_predictor_types,
                reference_date=ref_date.isoformat() if ref_date else None
            )
            
            # Calculate Metrics
            # Handle NaN in predictions (can occur with division by zero in custom formulas)
            valid_mask = ~np.isnan(y_pred_clean) & ~np.isinf(y_pred_clean)
            if np.sum(valid_mask) < 2:
                print("Warning: Too few valid predictions after NaN removal")
                mse = 0
                mae = 0
            else:
                mse = mean_squared_error(y_clean[valid_mask], y_pred_clean[valid_mask])
                mae = mean_absolute_error(y_clean[valid_mask], y_pred_clean[valid_mask])
            
            # Update values in model
            reg_model.mse = mse
            reg_model.mae = mae
            
            # Calculate Confidence Intervals (95%)
            # Do calculation on x_line
            try:
                x_line = np.linspace(x_clean.min(), x_clean.max(), 100).reshape(-1, 1)
                
                if poly and model:
                    x_line_features = poly.transform(x_line)
                    y_line = model.predict(x_line_features)
                elif model_type == 'custom':
                          # For custom formulas using col[], we can't generate smooth lines
                     # because we don't know column values at arbitrary x points
                     if 'col' in custom_formula:
                         # Use actual sorted data points instead of synthetic x_line
                         sort_idx = np.argsort(x_clean.ravel())
                         x_line = x_clean[sort_idx]
                         y_line = y_pred_clean[sort_idx]
                     else:
                         # Simple formula without col[] - can generate smooth line
                         def func_pred(x, *params):
                            local_ctx = {"x": x}
                            local_ctx.update(dict(zip(custom_params, params)))
                            local_ctx.update(SAFE_MATH)
                            return eval(custom_formula, {"__builtins__": {}}, local_ctx)
                         
                         y_line = func_pred(x_line.ravel(), *coeffs)
                elif robust_result:
                     # Robust polynomial / linear
                     # We have manual coeffs
                     if poly:
                         # Manual polynomial evaluation
                         # coeffs are [c1, c2, ...] matching degrees 1..N
                         y_line = np.full(len(x_line), intercept)
                         for i, c_val in enumerate(coeffs, 1):
                             y_line += c_val * (x_line.ravel() ** i)
                     else:
                        # Linear
                        m = coeffs[0]
                        c = intercept
                        y_line = m * x_line + c
                else:
                    x_line_features = x_line
                    y_line = model.predict(x_line)
                    
                # Confidence Band Calculation
                # 1. Estimate error variance
                n = len(x_clean)
                p = x_clean.shape[1] + 1 if not poly else x_poly.shape[1] # number of params
                dof = max(1, n - p)
                resid = y_clean - y_pred_clean
                s_err = np.sqrt(np.sum(resid**2) / dof)
                
                # 2. Calculate t-statistic (95%)
                t_val = stats.t.ppf(0.975, dof)
                
                # 3. Calculate CI for mean response at each x_line point
                # For Poly/Multiple regression: term is x_0 * (X^T X)^-1 * x_0^T
                # We construct Design Matrix X for training data
                if poly:
                     X_train = np.hstack([np.ones((n, 1)), x_poly])
                elif robust_result:
                     # Construct design matrix for robust result
                     if poly:
                         # Manual poly features
                         # We need to recreate x_poly-like structure: [x, x^2, ...]
                         x_poly_manual = np.hstack([(x_clean.reshape(-1,1) ** i) for i in range(1, len(coeffs)+1)])
                         X_train = np.hstack([np.ones((n, 1)), x_poly_manual])
                     else:
                         X_train = np.hstack([np.ones((n, 1)), x_clean])
                else:
                     X_train = np.hstack([np.ones((n, 1)), x_clean])
                
                # Compute (X^T X)^-1
                # Add small epsilon for stability if needed, usually ok
                try:
                    XTX_inv = np.linalg.inv(np.dot(X_train.T, X_train))
                    
                    # Construct X_line design matrix
                    if not poly:
                        X_line = np.hstack([np.ones((len(x_line), 1)), x_line])
                    else:
                        X_line = np.hstack([np.ones((len(x_line), 1)), x_line_features])
                    
                    # Compute variance for each point: s^2 * x_0 (X^T X)^-1 x_0^T
                    # We want diag(X_line * XTX_inv * X_line^T)
                    # Optimized: sum((X_line @ XTX_inv) * X_line, axis=1)
                    leverage = np.sum((X_line @ XTX_inv) * X_line, axis=1)
                    
                    ci_interval = t_val * s_err * np.sqrt(leverage)
                    
                    y_upper = y_line + ci_interval
                    y_lower = y_line - ci_interval
                except Exception:
                    # Fallback if singular matrix etc
                    y_upper = y_line
                    y_lower = y_line



                line_data = []
                for i in range(len(x_line)):
                     x_val = x_line[i].item() # Use .item() for safe scalar conversion
                     if predictor_type == "datetime":
                         # Convert days back to ISO string
                         # x_val is days relative to ref_date
                         if ref_date:
                             dt = ref_date + pd.to_timedelta(x_val, unit='D')
                         else:
                             dt = pd.to_datetime(x_val, unit='D') # Fallback
                         x_val_out = dt.isoformat()
                     else:
                         x_val_out = x_val
                     
                     line_data.append({"x": x_val_out, "y": float(y_line[i])})
                
                # Helper to format X for CI
                def format_points(x_in, y_in):
                    pts = []
                    for i in range(len(x_in)):
                        xv = x_in[i].item() 
                        if predictor_type == "datetime":
                             if ref_date:
                                dt = ref_date + pd.to_timedelta(xv, unit='D')
                             else:
                                dt = pd.to_datetime(xv, unit='D')
                             xv_out = dt.isoformat()
                        else:
                             xv_out = xv
                        pts.append({"x": xv_out, "y": float(y_in[i])})
                    return pts

                line_c = line_color or "#f59e0b"
                
                # Sort line data by x for proper line rendering
                line_data = _sort_points_by_x(line_data)
                
                main_series = PlotDataSeries(
                    name=f"Regression: {eq_str} | R²={r2:.3f}",
                    data=line_data,
                    color=line_c,
                    type="line",
                    render_type=SeriesRenderType.REGRESSION
                )
                
                upper_points = format_points(x_line, y_upper)
                lower_points = format_points(x_line, y_lower)
                
                # Sort CI points by x for proper band rendering
                upper_points = _sort_points_by_x(upper_points)
                lower_points = _sort_points_by_x(lower_points)
                
                ci_c = f"rgba({hex_to_rgb(line_c)}, 0.2)"
                
                # IMPORTANT: Lower must come before Upper for Plotly's fill='tonexty'
                # which fills from the current trace down to the previous trace.
                ci_series = [
                    PlotDataSeries(
                        name="95% CI Lower",
                        data=lower_points,
                        color=ci_c,
                        type="line",
                        render_type=SeriesRenderType.CI_LOWER
                    ),
                    PlotDataSeries(
                        name="95% CI Upper",
                        data=upper_points,
                        color=ci_c,
                        type="line",
                        render_type=SeriesRenderType.CI_UPPER
                    )
                ]
            except Exception as e:
                print(f"CI Calculation failed: {e}")
                ci_series = []
                # If x_line setup failed, we might need a fallback for x_line to plot the main line?
                # Actually, the main line plotting (line_data) relies on x_line too.
                # If x_line generation fails, we can't plot line.
                # But 'x_line' is defined at start of try block.
                # If custom formula logic for x_line fails, we have problem.
                # We should ensure 'line_data' generation is robust or handled separately?
                # Refactoring slightly to ensure main line is preserved if possible.
                pass

            
            # Helper to ensure line_data exists if CI block failed but x_line exists
            if 'line_data' not in locals():
               # Fallback: plot nothing or try basic
               return None, [], None

            return main_series, ci_series, reg_model
            
        except Exception as e:
            print(f"Regression error: {e}")
            import traceback
            traceback.print_exc()
            return None, [], None

    @staticmethod
    def add_multivariable_regression(
        df: pd.DataFrame,
        target_col: str,
        predictor_cols: list[str],
        config: VisualizationConfig
    ) -> Tuple[Optional[PlotDataSeries], List[PlotDataSeries], Optional[str], Optional[RegressionModel]]:
        """Calculate multi-variable regression: Target ~ Predictors.

        Fits a regression model with multiple predictor variables and generates
        plot data for visualization.

        Args:
            df: Source DataFrame containing all required columns.
            target_col: Name of the target (dependent) variable column.
            predictor_cols: List of predictor (independent) variable column names.
            config: VisualizationConfig with regression settings including:
                - model_type, degree, alpha, l1_ratio
                - remove_outliers, iqr_multiplier
                - Random Forest parameters

        Returns:
            A tuple containing:
                - main_series: PlotDataSeries for predicted values line
                - ci_series: List of CI band series (lower, upper)
                - equation: Equation string representation
                - reg_model: RegressionModel with full metadata
        """
        try:
            # Prepare data
            # We need Target and Predictors for the model
            # We ALSO need the X-Axis data for plotting the result correctly aligned
            
            req_cols = predictor_cols + [target_col]
            
            # Determine X-Axis column if not index
            # Ensure Index/Date is available as a column if requested in predictors
            if "Index" in predictor_cols and "Index" not in df.columns:
                 df = df.copy()
                 df["Index"] = df.index
            
            # Also check if any predictor matches the index name
            if df.index.name and df.index.name in predictor_cols and df.index.name not in df.columns:
                 df = df.copy()
                 df[df.index.name] = df.index
            
            x_col = None
            if config.axis.x_axis != "Index" and config.axis.x_axis in df.columns:
                 x_col = config.axis.x_axis
                 if x_col not in req_cols:
                     req_cols.append(x_col)
            
            # Ensure columns exist
            missing = [c for c in req_cols if c not in df.columns]
            if missing:
                return None, [], None, None
            
            # Drop NaNs
            print(f"[DEBUG] Dropping NaNs. Before: {len(df)}")
            data = df[req_cols].dropna()
            print(f"[DEBUG] After dropna: {len(data)}")
            
            if len(data) < 2:
                print("[DEBUG] <2 points remaining after dropna")
                return None, [], None, None
            

            
            # Check dtypes and convert dates
            predictor_types = []
            
            # We need to store reference dates for each predictor
            # But currently RegressionModel supports 'reference_date' as singular (assuming x-axis or main predictor).
            # For multi-variable, we might have multiple date columns.
            # Ideally we should store a dict or list.
            # However, for now let's assume if there are date predictors, we use the FIRST one as reference?
            # Or simplified: All date columns are relative to THEIR own start?
            # Yes, standardizing each column independently is best for regression.
            # But we need to store these offsets to reconstruct/predict later.
            # The current RegressionModel schema has `reference_date` (singular).
            # If multiple date predictors exist, this is a limitation.
            # BUT: Usually in this app users regression against Time (1 var) OR numeric vars.
            # Mixing multiple date vars in one regression is rare.
            # Let's support the FIRST date predictor as the "reference_date" source if multiple?
            # OR better: Just store the reference for the X-Axis if it's one of them.
            
            # Let's implement: For every datetime column, subtract its own min. 
            # AND we need to return this metadata.
            # CURRENT LIMITATION: Schema only has one `reference_date`.
            # Let's map it to the FIRST datetime predictor found.
            
            reference_date = None
            
            # We need to act on a COPY of the dataframe slice to avoid SettingWithCopy
            X_df = data[predictor_cols].copy()
            
            for col in predictor_cols:
                if pd.api.types.is_datetime64_any_dtype(X_df[col]):
                    col_min = X_df[col].min()
                    if reference_date is None:
                        reference_date = col_min
                    
                    # Convert to relative days
                    X_df[col] = (X_df[col] - col_min).dt.total_seconds() / 86400.0
                    predictor_types.append("datetime")
                else:
                    predictor_types.append("numeric")
            
            X = X_df.values
            y = data[target_col].values
            
            # Save full X for plotting predictions across entire range
            X_full = X.copy()

            # --- OUTLIER REMOVAL (IQR Method) ---
            if config.regression.remove_outliers:
                iqr_multiplier = config.regression.iqr_multiplier or 1.5
                print(f"[DEBUG] Multivariable Outlier removal enabled. iqr_multiplier={iqr_multiplier}, points before: {len(y)}")
                q1 = np.percentile(y, 25)
                q3 = np.percentile(y, 75)
                iqr = q3 - q1
                
                lower_bound = q1 - iqr_multiplier * iqr
                upper_bound = q3 + iqr_multiplier * iqr
                print(f"[DEBUG] Bounds: lower={lower_bound}, upper={upper_bound}")
                
                valid_mask = (y >= lower_bound) & (y <= upper_bound)
                
                # Update X and y for training
                X = X[valid_mask]
                y = y[valid_mask]
                print(f"[DEBUG] Points after outlier filter: {len(y)}")
                print(f"[DEBUG] X shape after filter: {X.shape}")
                
                if len(y) < 2:
                        print("[DEBUG] <2 points remaining after outlier removal")
                        return None, [], None, None
            # ---------------------------------------------------------
            
            # --- Check for Polynomial (Single Variable) ---
            degree = config.regression.degree
            is_poly = len(predictor_cols) == 1 and degree > 1
            
            model = None
            r2 = 0
            y_pred = None
            coeffs = []


            # Model selection
            model_type = config.regression.model_type
            use_ridge = (model_type == 'ridge')
            
            print(f"[DEBUG] Training model: {model_type} on {len(y)} samples")
            
            # Train on filtered data
            model, poly, r2, _ = RegressionEngine.train_model(
                X, y, model_type, degree, use_ridge, 
                alpha=config.regression.alpha, l1_ratio=config.regression.l1_ratio,
                rf_params={
                    'n_estimators': config.regression.rf_n_estimators,
                    'max_depth': config.regression.rf_max_depth,
                    'min_samples_split': config.regression.rf_min_samples_split,
                    'min_samples_leaf': config.regression.rf_min_samples_leaf
                }
            )
            
            if model is None:
                print("[DEBUG] Model training returned None!")
            else:
                print(f"[DEBUG] Model trained successfully. R2={r2}")

            # Predict on FULL range for plotting
            if model:
                X_plot = X_full
                if poly:
                    X_plot = poly.transform(X_full)
                y_pred_plot = model.predict(X_plot)
                
                # Also predict on training data for metrics calculation
                X_train_pred = X
                if poly:
                    X_train_pred = poly.transform(X)
                y_pred_train = model.predict(X_train_pred)
            else:
                y_pred_plot = np.array([])
                y_pred_train = np.array([])
            
            intercept = 0
            coeffs = []
            
            if model_type == 'random_forest':
                 pass # No coefs
            else:
                 intercept = model.intercept_
                 coeffs = model.coef_

            
            # Metrics (use TRAINING predictions to match filtered y)
            mse = mean_squared_error(y, y_pred_train) if len(y_pred_train) > 0 else 0
            mae = mean_absolute_error(y, y_pred_train) if len(y_pred_train) > 0 else 0
            
            
            # Equation construction
            if model_type == 'random_forest':
                 full_eq = f"Random Forest (R2={r2:.2f})"
                 metric_str = full_eq
            else:
                eq_parts = [f"{intercept:.2e}"]
                # For datetime polynomial, coefficients span many orders of magnitude
                # (e.g., x coef ~1e-11, x^2 coef ~1e-22). Don't filter any of them!
                # Only filter actual zeros (< 1e-300, which is effectively the smallest float)
                zero_thresh = 1e-300
                
                if is_poly:
                    # Polynomial equation
                    for i, c in enumerate(coeffs, 1):
                        if abs(c) < zero_thresh:  # Skip zero coefficients
                            continue
                        sign = "+" if c >= 0 else ""
                        # Actually for multivariable poly this is wrong (poly generates interactions).
                        # But config ensures is_poly = True ONLY if len(predictors) == 1.
                        eq_parts.append(f"{sign} {abs(c):.2e}*{predictor_cols[0]}^{i}")
                    full_eq = " ".join(eq_parts) if eq_parts else f"{intercept:.2e}"  # Only intercept if all coeffs zero
                    metric_str = f"y = {full_eq} | R²={r2:.3f} | MSE={mse:.2f}"
                else:
                    # Linear equation - filter out zero coefficients
                    for i, (col, coef) in enumerate(zip(predictor_cols, coeffs)):
                        if abs(coef) < zero_thresh:  # Skip zero coefficients
                            continue
                        sign = "+" if coef >= 0 else "-"
                        eq_parts.append(f"{sign} {abs(coef):.2e}*{col}")
                    
                    full_eq = " ".join(eq_parts) if eq_parts else "(all coefficients zero)"
                    # Metric String
                    # User request: Only show in legend if short
                    if len(full_eq) <= 30:
                         metric_str = f"y = {full_eq} | R²={r2:.3f} | MSE={mse:.2f}"
                    else:
                         metric_str = f"y = f(X) | R²={r2:.3f} | MSE={mse:.2f}"
            

            
            # Prepare Plot Series
            # Helper to get formatted X value
            def get_x_val(row_idx, row):
                if x_col:
                     return row[x_col]
                else:
                     # Index
                     t = row.name
                     return t.isoformat() if hasattr(t, 'isoformat') else str(t)
            
            # Prepare Plot Series
            x_vals = [get_x_val(i, data.iloc[i]) for i in range(len(data))]
            y_vals = y_pred_plot.tolist()
            
            # Debug output stats
            if len(y_vals) > 0:
                 print(f"[DEBUG] Generated {len(y_vals)} points. Y Min: {min(y_vals)}, Y Max: {max(y_vals)}")
                 print(f"[DEBUG] Sample X: {x_vals[:3]}")
                 print(f"[DEBUG] Sample Y: {y_vals[:3]}")
            else:
                 print("[DEBUG] Generated 0 points!")

            # Downsample
            ds_x, ds_y = downsample_series(x_vals, y_vals)
            
            data_points = [{"x": x, "y": float(y)} for x, y in zip(ds_x, ds_y)]
            
            # Sort by x-value for proper line rendering when x-axis is not date/index
            data_points = _sort_points_by_x(data_points)
            
            main_series = PlotDataSeries(
                name=f"Predicted ({target_col}) | {metric_str}",
                data=data_points,
                color=config.regression.line_color or "#8b5cf6",
                type="line" if config.axis.x_axis == "Index" else "scatter",
                render_type=SeriesRenderType.REGRESSION
            )
            
            # Confidence Interval (Prediction)
            ci_series = []
            try:
                resid = y - y_pred_train
                n = len(y)
                p = X.shape[1] + 1
                dof = max(1, n - p)
                s_err = np.sqrt(np.sum(resid**2) / dof)
                t_val = stats.t.ppf(0.975, dof)
                
                if is_poly:
                     poly_vals = PolynomialFeatures(degree=degree, include_bias=False).fit_transform(X)
                     X_design = np.hstack([np.ones((n, 1)), poly_vals])
                else:
                     X_design = np.hstack([np.ones((n, 1)), X])
                
                XTX_inv = np.linalg.inv(np.dot(X_design.T, X_design))
                leverage = np.sum((X_design @ XTX_inv) * X_design, axis=1)
                ci_margin = t_val * s_err * np.sqrt(leverage)
                
                # CI applied to training predictions (same length as filtered data)
                # CI applied to training predictions (same length as filtered data)
                y_upper = y_pred_train + ci_margin
                y_lower = y_pred_train - ci_margin
                
                # CI is calculated on training data, so iterate based on y length (filtered)
                # Note: This means CI will only show for non-outlier points
                # The main regression line still shows for full range
                # Collect CI points with their corresponding x values for sorting
                ci_raw = []
                for i in range(len(y)):
                    # Use the index of the training data (relative to filtered data)
                    x_val = get_x_val(i, data.iloc[i])
                    ci_raw.append({"x": x_val, "y_upper": float(y_upper[i]), "y_lower": float(y_lower[i])})
                
                # Sort CI points by x-value for proper band rendering
                ci_raw.sort(key=lambda pt: _sort_key_for_x(pt["x"]))
                
                upper_points = [{"x": pt["x"], "y": pt["y_upper"]} for pt in ci_raw]
                lower_points = [{"x": pt["x"], "y": pt["y_lower"]} for pt in ci_raw]
                
                # IMPORTANT: Lower must come before Upper for Plotly's fill='tonexty'
                # which fills from the current trace down to the previous trace.
                ci_series = [
                    PlotDataSeries(
                        name="95% CI Lower",
                        data=lower_points,
                        color=f"rgba({hex_to_rgb(config.regression.line_color or '#8b5cf6')}, 0.2)",
                        type="line",
                        render_type=SeriesRenderType.CI_LOWER
                    ),
                    PlotDataSeries(
                        name="95% CI Upper",
                        data=upper_points,
                        color=f"rgba({hex_to_rgb(config.regression.line_color or '#8b5cf6')}, 0.2)",
                        type="line",
                        render_type=SeriesRenderType.CI_UPPER
                    )
                ]
            except Exception as e:
                print(f"CI Calculation failed: {e}")
                # Continue without CI
            # Create RegressionModel
            reg_type = "linear"
            if model_type == 'random_forest':
                 reg_type = "random_forest"
            elif is_poly:
                 reg_type = "polynomial"
                 
            reg_model = RegressionModel(
                type=reg_type,
                degree=degree,
                intercept=float(intercept),
                coefficients=[float(c) for c in coeffs],
                predictors=predictor_cols,
                predictor_types=predictor_types,
                equation=full_eq,
                r2=r2,
                mse=mse,
                mae=mae,
                reference_date=reference_date.isoformat() if reference_date else None
            )
            
            return main_series, ci_series, full_eq, reg_model

        except Exception as e:
            # print(f"Multi-var regression error: {e}")
            return None, [], None, None

    @staticmethod
    def predict_regression(df: pd.DataFrame, config: VisualizationConfig, inputs: dict) -> float:
        """Train a regression model and predict for given input values.

        This method is useful for models like Random Forest where coefficients
        cannot be sent to the frontend for client-side prediction. It trains
        the model on the fly (or loads a saved model) and returns a prediction.

        Args:
            df: Source DataFrame for training.
            config: VisualizationConfig specifying the regression setup:
                - axis.x_axis, axis.y_axis: Variable selections
                - regression.predictors: Optional explicit predictor list
                - regression.model_type, degree, etc.
                - saved_model_name: Optional name of pre-saved model to load
            inputs: Dict mapping predictor names to input values.
                For single-variable regression, use {"x": value}.
                For multi-variable, use {"predictor1": val1, "predictor2": val2}.

        Returns:
            The predicted target value as a float.

        Raises:
            ValueError: If required columns are missing or insufficient data.
        """
        # Determine Target and Predictors
        predictors = []
        target_col = ""
        
        if config.regression.predictors:
            # Multi-variable configuration explicit
            predictors = config.regression.predictors
            target_col = config.axis.y_axis[0]
        else:
            # Single variable implicit (X-axis vs Y-axis)
            # Find the actual column name for the X-axis
            if config.axis.x_axis == "Index":
                 # We need to treat the index as a column named "Index"
                 predictors = ["Index"]
            else:
                 predictors = [config.axis.x_axis]
            
            target_col = config.axis.y_axis[0]
            
        # Prepare Data Frame
        data = df.copy()
        
        # Ensure 'Index' is available if needed for prediction
        if 'Index' in predictors:
             if data.index.name:
                 data[data.index.name] = data.index
             data['Index'] = data.index
             
        # Validate columns
        req_cols = predictors + [target_col]
        
        # For custom formulas, also include any columns referenced via col['Name'] or df['Name']
        model_type = config.regression.model_type
        if model_type == 'custom' and config.regression.custom_formula:
            import re
            col_pattern = r"(?:col|df)\s*\[\s*['\"]([^'\"]+)['\"]\s*\]"
            formula_cols = re.findall(col_pattern, config.regression.custom_formula)
            
            # If formula uses explicit columns, those are the predictors
            if formula_cols:
                 # Use unique column names as predictors (preserve order)
                 seen = set()
                 unique_cols = []
                 for col in formula_cols:
                     if col not in seen:
                         seen.add(col)
                         unique_cols.append(col)
                 predictors = unique_cols
            
            for col_name in formula_cols:
                if col_name not in req_cols and col_name in data.columns:
                    req_cols.append(col_name)
        
        missing = [c for c in req_cols if c not in data.columns]
        if missing:
             raise ValueError(f"Missing columns for prediction: {missing}")
             
        data = data[req_cols].dropna()
        if len(data) < 2:
             raise ValueError("Not enough data to train model")

        # Prepare X and y
        X_df = data[predictors].copy()
        
        # Reference Dates map (predictor -> min_date)
        ref_dates = {}
        
        # Handle Date conversion in Training Data
        for col in predictors:
            if pd.api.types.is_datetime64_any_dtype(X_df[col]):
                 ref = X_df[col].min()
                 ref_dates[col] = ref
                 X_df[col] = (X_df[col] - ref).dt.total_seconds() / 86400.0
        
        X = X_df.values
        y = data[target_col].values
        
        # Outlier Removal
        outlier_mask = None
        if config.regression.remove_outliers:
            q1 = np.percentile(y, 25)
            q3 = np.percentile(y, 75)
            iqr = q3 - q1
            iqr_mult = config.regression.iqr_multiplier or 1.5
            lower = q1 - iqr_mult * iqr
            upper = q3 + iqr_mult * iqr
            outlier_mask = (y >= lower) & (y <= upper)
            X = X[outlier_mask]
            y = y[outlier_mask]
            # Also filter data for use in custom formula context
            data = data.iloc[outlier_mask]

        # Prepare Input Vector
        # Inputs dict keys must match predictor names
        # SPECIAL CASE: Single variable regression often uses "x" as the predictor name in the frontend model
        # but the backend knows the real column name.
        
        input_values = []
        if len(predictors) == 1 and "x" in inputs and predictors[0] not in inputs:
             # Map "x" input to the real column
             val = inputs["x"]
             p = predictors[0]
             
             # Handle date string input if applicable
             if p in ref_dates and isinstance(val, str):
                  try:
                      d_val = pd.to_datetime(val)
                      # Subtract reference
                      ref = ref_dates[p]
                      val = (d_val - ref).total_seconds() / 86400.0
                  except:
                      pass
             input_values.append(val)
        else:
            for p in predictors:
                val = inputs.get(p, 0.0)
                # Handle dates in inputs
                if p in ref_dates:
                     if isinstance(val, str):
                          try:
                               d_val = pd.to_datetime(val)
                               ref = ref_dates[p]
                               val = (d_val - ref).total_seconds() / 86400.0
                          except:
                               pass
                input_values.append(val)
            
        input_arr = np.array([input_values])
        
        # Check for Saved Model Loading
        if config.saved_model_name:
             try:
                 safe_name = "".join([c for c in config.saved_model_name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
                 path = os.path.join(MODEL_DIR, f"{safe_name}.joblib")
                 if os.path.exists(path):
                     saved_data = joblib.load(path)
                     
                     # Verify predictors match
                     saved_predictors = saved_data.get('predictors', [])
                     if set(saved_predictors) != set(predictors):
                         print(f"Saved model predictors {saved_predictors} mismatch current {predictors}, falling back to training.")
                         # Fallback to training
                     else:
                        model = saved_data['model']
                        poly = saved_data['poly']
                        
                        # Saved model has its own reference date!
                        # If we use a saved model, we must respect ITS reference date, not the current data's min().
                        # WE NEED TO RE-CALCULATE INPUTS relative to SAVED MODEL REFERENCE DATE.
                        saved_ref = saved_data.get('reference_date')
                        # 'reference_date' in saved model is singular string (from schema).
                        # Limitation: If multi-var date, we might have issues if we didn't store dict.
                        # But typically 1 date var.
                        
                        if saved_ref:
                            # Re-process inputs relative to saved_ref
                            saved_ref_dt = pd.to_datetime(saved_ref)
                            
                            # Re-map inputs
                            final_inputs = []
                            idx = 0
                            if len(predictors) == 1 and "x" in inputs and predictors[0] not in inputs:
                                val = inputs["x"]
                                p_name = predictors[0]
                            else:
                                # This block logic is getting complicated due to mapping loop structure.
                                # Let's simplify: We have input_values calculated relative to current df min.
                                # We need them relative to saved_ref.
                                # New_Val = Val_Current + (Ref_Current - Ref_Saved)
                                pass 
                            
                            # Actually, it's safer to just re-parse raw inputs if we can access them.
                            # But we already parsed them.
                            # Let's use the 'ref_dates' map we built.
                            
                            recalc_inputs = []
                            for i, p in enumerate(predictors):
                                val_numeric = input_values[i]
                                if p in ref_dates:
                                    # It was a date.
                                    # val_numeric is (Date - Ref_Current)
                                    # We want (Date - Ref_Saved)
                                    # (Date - Ref_Current) + (Ref_Current - Ref_Saved)
                                    current_ref = ref_dates[p]
                                    offset = (current_ref - saved_ref_dt).total_seconds() / 86400.0
                                    recalc_inputs.append(val_numeric + offset)
                                else:
                                    recalc_inputs.append(val_numeric)
                            
                            input_arr = np.array([recalc_inputs])
                        
                        
                        prediction = 0.0
                        if poly:
                           input_poly = poly.transform(input_arr)
                           prediction = model.predict(input_poly)[0]
                        else:
                           prediction = model.predict(input_arr)[0]
                           
                        return float(prediction)
                 else:
                     print(f"Saved model {config.saved_model_name} not found, falling back to training.")
             except Exception as e:
                 print(f"Error loading model {config.saved_model_name}: {e}, falling back to training.")


        # Train Model
        try:
            model_type = config.regression.model_type
            degree = config.regression.degree
            use_ridge = (model_type == 'ridge')
            
            # Handle Custom Formula Prediction
            if model_type == 'custom':
                custom_formula = config.regression.custom_formula
                custom_params_str = config.regression.custom_params
                custom_guesses_str = config.regression.custom_initial_guesses
                
                if not custom_formula or not custom_params_str:
                    raise ValueError("Custom formula and parameters are required")
                
                param_names = [p.strip() for p in custom_params_str.split(',')]
                initial_guesses = None
                if custom_guesses_str:
                    try:
                        initial_guesses = [float(g.strip()) for g in custom_guesses_str.split(',')]
                    except:
                        pass
                
                # Parse bounds if present
                bounds_lower = None
                bounds_upper = None
                if config.regression.custom_bounds_lower:
                    try:
                        bounds_lower = [float(b.strip()) if b.strip().lower() not in ['inf', '-inf'] else (np.inf if b.strip().lower() == 'inf' else -np.inf) 
                                        for b in config.regression.custom_bounds_lower.split(',')]
                    except:
                        pass
                if config.regression.custom_bounds_upper:
                    try:
                        bounds_upper = [float(b.strip()) if b.strip().lower() not in ['inf', '-inf'] else (np.inf if b.strip().lower() == 'inf' else -np.inf) 
                                        for b in config.regression.custom_bounds_upper.split(',')]
                    except:
                        pass
                
                # For custom formulas, we need x_data to fit the model
                # x should be the first predictor (or index as fallback)
                # Other predictors are accessed via col['Name'] in the formula
                if X.ndim > 1 and X.shape[1] >= 1:
                    x_fit = X[:, 0]  # First predictor column
                else:
                    x_fit = X.ravel()
                
                # Prepare data context for col[] references
                data_context = {c: data[c].values for c in data.columns if c != target_col}
                
                # Fit the custom model to get coefficients
                popt, pcov, r2, y_pred = RegressionEngine._fit_custom_model(
                    x_fit, y, custom_formula, param_names, initial_guesses,
                    data_context=data_context, bounds_lower=bounds_lower, bounds_upper=bounds_upper
                )
                
                # Now predict using the inputs
                # Build the evaluation context with fitted params and input values
                local_ctx = {"x": inputs.get("x", 0.0)}
                local_ctx.update(dict(zip(param_names, popt)))
                local_ctx.update(SAFE_MATH)
                
                # Add col accessor with input values
                local_ctx['col'] = inputs
                
                # Evaluate the formula with fitted params and input values
                prediction = eval(custom_formula, {"__builtins__": {}}, local_ctx)
                return float(prediction)
            
            # Ensure degree is 1 if multiple predictors (unless we support multi-poly later)
            effective_degree = degree if len(predictors) == 1 else 1

            model, poly, _, _ = RegressionEngine.train_model(X, y, model_type, effective_degree, use_ridge, alpha=config.regression.alpha, l1_ratio=config.regression.l1_ratio)
            
            prediction = 0.0
            if poly:
                input_poly = poly.transform(input_arr)
                prediction = model.predict(input_poly)[0]
            else:
                prediction = model.predict(input_arr)[0]
                      
            return float(prediction)
        except Exception as e:
            print(f"Prediction Error during training/predict: {e}")
            raise e

    @staticmethod
    def save_trained_model(df: pd.DataFrame, config: VisualizationConfig, name: str) -> dict:
        """Train a model based on config and save it to disk with joblib.

        The saved model includes the trained estimator, polynomial transformer
        (if applicable), and all metadata needed for later prediction.

        Args:
            df: Source DataFrame for training.
            config: VisualizationConfig with regression settings.
            name: Name for the saved model (sanitized for filesystem safety).

        Returns:
            Dict with model metadata:
                - name: Sanitized model name
                - type: Model type string
                - predictors: List of predictor column names
                - target: Target column name
                - r2: R-squared score
                - mse: Mean squared error
                - reference_date: ISO date string if datetime predictors used

        Raises:
            ValueError: If required columns missing or insufficient data.
        """
        # 1. Prepare Data (Duplicated from predict_regression unfortunately, consider refactoring get_training_data)
        predictors = []
        target_col = ""
        
        if config.regression.predictors:
            predictors = config.regression.predictors
            target_col = config.axis.y_axis[0]
        else:
            if config.axis.x_axis == "Index":
                 predictors = ["Index"]
            else:
                 predictors = [config.axis.x_axis]
            target_col = config.axis.y_axis[0]
            
        # For custom formulas, override predictors with referenced columns
        if config.regression.model_type == 'custom' and config.regression.custom_formula:
            import re
            col_pattern = r"(?:col|df)\s*\[\s*['\"]([^'\"]+)['\"]\s*\]"
            formula_cols = re.findall(col_pattern, config.regression.custom_formula)
            if formula_cols:
                 seen = set()
                 unique_cols = []
                 for col in formula_cols:
                     if col not in seen:
                         seen.add(col)
                         unique_cols.append(col)
                 predictors = unique_cols
                 
        req_cols = predictors + [target_col]
            
        # Ensure 'Index' is available
        data = df.copy()
        if data.index.name:
            data[data.index.name] = data.index
        data['Index'] = data.index
        
        req_cols = predictors + [target_col]
        
        # Missing check
        missing = [c for c in req_cols if c not in data.columns]
        if missing:
             raise ValueError(f"Missing cols: {missing}")
             
        data = data[req_cols].dropna()
        if len(data) < 2:
             raise ValueError("Not enough data")
             
        # Convert dates and Store References
        X_df = data[predictors].copy()
        ref_date = None
        
        # Note: Saved Model schema has single reference_date.
        # We store the FIRST date predictor's min as the reference.
        # This assumes single date predictor usually.
        
        for col in predictors:
            if pd.api.types.is_datetime64_any_dtype(X_df[col]):
                 col_min = X_df[col].min()
                 if ref_date is None:
                     ref_date = col_min
                 X_df[col] = (X_df[col] - col_min).dt.total_seconds() / 86400.0
                 
        X = X_df.values
        y = data[target_col].values
        
        # Outliers
        if config.regression.remove_outliers:
            q1 = np.percentile(y, 25)
            q3 = np.percentile(y, 75)
            iqr = q3 - q1
            iqr_mult = config.regression.iqr_multiplier or 1.5
            lower = q1 - iqr_mult * iqr
            upper = q3 + iqr_mult * iqr
            mask = (y >= lower) & (y <= upper)
            X = X[mask]
            y = y[mask]
            
        # Train
        model_type = config.regression.model_type
        degree = config.regression.degree
        use_ridge = (model_type == 'ridge')
        
        if model_type == 'custom':
            # Custom Model Fitting
            custom_formula = config.regression.custom_formula
            custom_params_str = config.regression.custom_params
            custom_guesses_str = config.regression.custom_initial_guesses
            
            if not custom_formula or not custom_params_str:
                raise ValueError("Custom formula and parameters are required")
            
            param_names = [p.strip() for p in custom_params_str.split(',')]
            initial_guesses = None
            if custom_guesses_str:
                try:
                    initial_guesses = [float(g.strip()) for g in custom_guesses_str.split(',')]
                except:
                    pass
            
            bounds_lower = None
            if config.regression.custom_bounds_lower:
                 # Re-parsing logic or use helper if imported (it's in plotting.py sadly)
                 # Quick parse here
                 try:
                     bounds_lower = [float(b.strip()) if b.strip().lower() not in ['inf', '-inf'] else (np.inf if b.strip().lower() == 'inf' else -np.inf) for b in config.regression.custom_bounds_lower.split(',')]
                 except: pass

            bounds_upper = None
            if config.regression.custom_bounds_upper:
                 try:
                     bounds_upper = [float(b.strip()) if b.strip().lower() not in ['inf', '-inf'] else (np.inf if b.strip().lower() == 'inf' else -np.inf) for b in config.regression.custom_bounds_upper.split(',')]
                 except: pass

            # Prepare Context from Training Data (X cols)
            # predictors list matches columns of X
            data_context = {}
            for i, p in enumerate(predictors):
                data_context[p] = X[:, i]
            
            # Use X as x_fit (some formulas rely on 'x' directly)
            x_fit = X[:, 0] if X.shape[1] > 0 else X.ravel()
            
            popt, pcov, r2, y_pred = RegressionEngine._fit_custom_model(
                x_fit, y, custom_formula, param_names, initial_guesses,
                data_context=data_context, bounds_lower=bounds_lower, bounds_upper=bounds_upper
            )
            
            # Create Wrapper
            model = CustomRegressionWrapper(custom_formula, param_names, popt, predictors)
            poly = None
            
        else:
            # Ensure degree is 1 if multiple predictors
            effective_degree = degree if len(predictors) == 1 else 1

            model, poly, r2, y_pred = RegressionEngine.train_model(X, y, model_type, effective_degree, use_ridge, alpha=config.regression.alpha, l1_ratio=config.regression.l1_ratio)
        
        # Save payload
        safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
        save_path = os.path.join(MODEL_DIR, f"{safe_name}.joblib")
        
        config_json = config.model_dump_json()
        payload = {
            "model": model,
            "poly": poly,
            "predictors": predictors,
            "target": target_col,
            "config": config_json,
            "r2": r2,
            "mse": mean_squared_error(y, y_pred),
            "reference_date": ref_date.isoformat() if ref_date else None,
            "type": model_type
        }
        
        joblib.dump(payload, save_path)
        
        return {
            "name": safe_name,
            "type": model_type,
            "predictors": predictors,
            "target": target_col,
            "r2": r2,
            "mse": payload["mse"],
            "reference_date": payload["reference_date"]
        }
