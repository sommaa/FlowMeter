import io
import base64
import traceback
import logging
import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from scipy import stats
from sklearn.linear_model import LinearRegression, ElasticNet, Ridge, Lasso
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestRegressor

from app.models.schemas import VisualizationConfig, ExportSettings, SeriesConfiguration, FormulaResultConfig
from app.services.export_helpers.utils import filter_dataframe_by_date, format_datetime_axis

# Use non-interactive backend
matplotlib.use('Agg')

logger = logging.getLogger(__name__)

def add_regression(ax, x, y, degree, color, label_prefix="Regression", remove_outliers=False, show_ci=True, model_type="linear", alpha=1.0, l1_ratio=0.5, rf_params=None):
    """Adds regression line and CI to the axes."""
    try:
        # Prepare data
        if isinstance(x, (pd.Index, pd.Series)):
            x_vals = x.values
        else:
            x_vals = np.array(x)

        y_vals = y.values if isinstance(y, pd.Series) else np.array(y)

        # Numeric X for regression
        if isinstance(x, pd.DatetimeIndex) or (isinstance(x, pd.Series) and pd.api.types.is_datetime64_any_dtype(x)):
            x_numeric = np.arange(len(x))
        else:
            x_numeric = x_vals

        mask = ~(pd.isna(x_numeric) | pd.isna(y_vals))
        x_clean = x_numeric[mask].reshape(-1, 1)
        y_clean = y_vals[mask]

        if len(x_clean) > 1:
            # --- OUTLIER REMOVAL ---
            if remove_outliers:
                if len(y_clean) > 2 and np.std(y_clean) > 1e-9:
                    z_scores = np.abs(stats.zscore(y_clean))
                    z_scores = np.nan_to_num(z_scores, nan=0.0)
                    valid_mask = z_scores < 3.0
                    
                    x_clean = x_clean[valid_mask]
                    y_clean = y_clean[valid_mask]
                    
                    if len(x_clean) < 2:
                        return
            # -----------------------

            if degree > 1:
                poly = PolynomialFeatures(degree=degree)
                x_poly = poly.fit_transform(x_clean)
                
                # Select Model
                if model_type == 'elastic_net':
                    model = ElasticNet(alpha=alpha, l1_ratio=l1_ratio)
                elif model_type == 'ridge':
                    model = Ridge(alpha=alpha)
                elif model_type == 'lasso':
                    model = Lasso(alpha=alpha)
                elif model_type == 'random_forest':
                    params = rf_params or {}
                    model = RandomForestRegressor(**params)
                else:
                    model = LinearRegression()
                    
                model.fit(x_poly, y_clean)
                x_line = np.linspace(
                    x_clean.min(), x_clean.max(), 100).reshape(-1, 1)
                y_pred = model.predict(poly.transform(x_line))
                r2 = model.score(x_poly, y_clean)
            else:
                # Select Model
                if model_type == 'elastic_net':
                    model = ElasticNet(alpha=alpha, l1_ratio=l1_ratio)
                elif model_type == 'ridge':
                    model = Ridge(alpha=alpha)
                elif model_type == 'lasso':
                    model = Lasso(alpha=alpha)
                elif model_type == 'random_forest':
                    params = rf_params or {}
                    model = RandomForestRegressor(**params)
                else:
                    model = LinearRegression()
                    
                model.fit(x_clean, y_clean)
                x_line = np.linspace(
                    x_clean.min(), x_clean.max(), 100).reshape(-1, 1)
                y_pred = model.predict(x_line)
                r2 = model.score(x_clean, y_clean)

            # Map back to datetime if needed for display
            if isinstance(x, pd.DatetimeIndex):
                x_display = pd.to_datetime(
                    np.interp(
                        x_line.flatten(), np.arange(len(x)), x.astype(np.int64)
                    )
                )
            else:
                x_display = x_line.flatten()

            # --- CONFIDENCE INTERVALS (95%) ---
            try:
                n = len(x_clean)
                p = degree + 1
                dof = max(1, n - p)
                
                # Residuals on training data
                if degree > 1:
                    y_train_pred = model.predict(x_poly)
                    X_train = x_poly
                    X_line_design = poly.transform(x_line)
                else:
                    y_train_pred = model.predict(x_clean)
                    X_train = np.hstack([np.ones((n, 1)), x_clean])
                    X_line_design = np.hstack([np.ones((len(x_line), 1)), x_line])

                resid = y_clean - y_train_pred
                s_err = np.sqrt(np.sum(resid**2) / dof)
                
                # Leverage
                XTX_inv = np.linalg.inv(np.dot(X_train.T, X_train))
                leverage = np.sum((X_line_design @ XTX_inv) * X_line_design, axis=1)
                
                t_val = stats.t.ppf(0.975, dof)
                ci_margin = t_val * s_err * np.sqrt(leverage)
                
                y_up = y_pred + ci_margin
                y_low = y_pred - ci_margin
                
                if show_ci:
                    ax.fill_between(x_display, y_low, y_up, color=color, alpha=0.2)
            except Exception as e:
                logger.debug(f"CI Error: {e}")
                pass
            # ----------------------------------

            ax.plot(x_display, y_pred, '--', linewidth=3, color=color,
                    label=f'{label_prefix} (R²={r2:.3f})', alpha=0.8)
    except Exception as e:
        logger.error(f"Regression error: {e}")

def create_plot(df: pd.DataFrame, viz: VisualizationConfig, index: int, settings: ExportSettings) -> tuple[str, str]:
    """Generates a base64 encoded image of the plot and its config details."""
    try:
        # Filter data by date range
        df = filter_dataframe_by_date(df, viz.date_range)
        
        # Colors cycle matching frontend (MATLAB style)
        COLORS = [
            '#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30',
            '#4DBEEE', '#A2142F', '#2563eb', '#16a34a', '#dc2626'
        ]
        plot_color = COLORS[viz.style.color_index % len(COLORS)]

        # Setup figure
        if viz.viz_type == 'pca':
            fig, ax = plt.subplots(figsize=(14, 8), facecolor='white')
        else:
            fig, ax = plt.subplots(figsize=(12, 6), facecolor='white')

        x_data = None
        x_label_default = "Index"
        ax2 = None # Initialize secondary axis

        # Resolve X Data (similar to original logic)
        if viz.viz_type != 'pca':
            if viz.axis.x_axis == 'Index':
                x_data = df.index
            elif viz.axis.x_axis == 'Custom Formula' and viz.formula.x_formula:
                try:
                    # Safe-ish eval for custom x
                    namespace = {
                        'col': lambda k: df[k], 'np': np, 'pd': pd, 'df': df}
                    x_data = eval(viz.formula.x_formula, namespace)
                    x_label_default = "Custom X"
                except BaseException:
                    x_data = df.index
            elif viz.axis.x_axis and viz.axis.x_axis in df.columns:
                x_data = df[viz.axis.x_axis]
                x_label_default = viz.axis.x_axis
            else:
                x_data = df.index

        # --- PLOTTING LOGIC ---

        if viz.viz_type == 'formula' and viz.formula.input:
            try:
                # Execute formula
                df_copy = df.copy(deep=True)
                # Coerce columns to numeric to prevent "can only concatenate str" errors
                for c in df_copy.columns:
                    df_copy[c] = pd.to_numeric(df_copy[c], errors='coerce')
                namespace = {
                    'col': df_copy,
                    'np': np,
                    'pd': pd,
                    'df': df_copy}
                exec(viz.formula.input, namespace)

                results = {}
                # Extract result, result1, result2...
                if 'result' in namespace:
                    results['result'] = namespace['result']
                j = 1
                while f'result{j}' in namespace:
                    results[f'result{j}'] = namespace[f'result{j}']
                    j += 1

                if not results and 'results' in namespace:
                    res_obj = namespace['results']
                    if isinstance(res_obj, dict):
                        results = res_obj
                    elif isinstance(res_obj, list):
                        for k, v in enumerate(res_obj):
                            results[f'result{k + 1}'] = v

                # Prepare Secondary Axis if needed
                ax2 = None
                has_secondary = False
                if viz.formula.result_configs:
                    has_secondary = any((conf.y_axis_id == 'right') for conf in viz.formula.result_configs.values())
                
                if has_secondary:
                    ax2 = ax.twinx()
                    if viz.axis.y2_label:
                        ax2.set_ylabel(viz.axis.y2_label)

                for idx, (name, res) in enumerate(results.items()):
                    # Get Per-Result Config
                    res_config = viz.formula.result_configs.get(name) if viz.formula.result_configs else None
                    if not res_config:
                         # Fallback for legacy or default
                         res_config = FormulaResultConfig(
                             type=viz.formula.plot_type.lower() if hasattr(viz.formula, 'plot_type') else 'line',
                             color=None,
                             y_axis_id='left',
                             show_regression=viz.formula.add_regression if idx == 0 else False,
                             remove_outliers=viz.formula.regression_remove_outliers if idx == 0 else False,
                             show_confidence_interval=False
                         )

                    lb = name
                    if viz.legend.labels and idx < len(viz.legend.labels):
                        lb = viz.legend.labels[idx]

                    if not isinstance(res, (pd.Series, np.ndarray)):
                        res = pd.Series(res, index=df.index)

                    # Determine color
                    if viz.style.custom_colors and name in viz.style.custom_colors:
                        c = viz.style.custom_colors[name]
                    elif res_config.color:
                        c = res_config.color
                    else:
                        c = COLORS[idx % len(COLORS)] if len(results) > 1 else plot_color

                    # Determine Axis
                    target_ax = ax2 if res_config.y_axis_id == 'right' and ax2 else ax

                    # Plot Type
                    ptype = res_config.type.lower()
                    if ptype == 'scatter':
                        target_ax.scatter(x_data, res, alpha=viz.style.alpha, s=20, color=c, label=lb)
                    elif ptype == 'line+scatter':
                        target_ax.plot(x_data, res, alpha=viz.style.alpha, linewidth=2, color=c, label=lb)
                        target_ax.scatter(x_data, res, alpha=viz.style.alpha, s=20, color=c)
                    elif ptype == 'bar':
                         target_ax.bar(x_data, res, alpha=viz.style.alpha, color=c, label=lb)
                    elif ptype == 'step':
                         target_ax.step(x_data, res, where='post', alpha=viz.style.alpha, linewidth=2, color=c, label=lb)
                    else: # Line
                        target_ax.plot(x_data, res, alpha=viz.style.alpha, linewidth=2, color=c, label=lb)

                    # Regression
                    if res_config.show_regression:
                        add_regression(
                            target_ax,
                            x_data, 
                            res, 
                            viz.formula.regression_degree, 
                            c, # Use series/result color
                            label_prefix=f"Trend ({lb})",
                            remove_outliers=res_config.remove_outliers,
                            show_ci=res_config.show_confidence_interval
                        )




                # Axis Limits
                if viz.axis.enable_y_axis_range and viz.axis.y_axis_min is not None and viz.axis.y_axis_max is not None:
                    ax.set_ylim(viz.axis.y_axis_min, viz.axis.y_axis_max)
                
                # Secondary Axis Limits
                if has_secondary and ax2 and viz.axis.enable_y2_axis_range and viz.axis.y2_axis_min is not None and viz.axis.y2_axis_max is not None:
                    ax2.set_ylim(viz.axis.y2_axis_min, viz.axis.y2_axis_max)

                format_datetime_axis(
                    ax, x_data if isinstance(
                        x_data, pd.Index) else df.index)
            except Exception as e:
                ax.text(
                    0.5,
                    0.5,
                    f"Formula Error:\n{str(e)}",
                    ha='center',
                    va='center',
                    color='red')

        elif viz.viz_type == 'box':
            # Box Plot
            data_to_plot = []
            labels = []
            for col in viz.axis.y_axis:
                if col in df.columns:
                    data_to_plot.append(df[col].dropna().values)
                    label = col
                    if viz.legend.labels and len(labels) < len(viz.legend.labels):
                        label = viz.legend.labels[len(labels)]
                    labels.append(label)

            if data_to_plot:
                # Use colors list
                bplot = ax.boxplot(data_to_plot, labels=labels, patch_artist=True)
                
                # Color the boxes
                for i, patch in enumerate(bplot['boxes']):
                        c = COLORS[i % len(COLORS)]
                        patch.set_facecolor(c)
                        patch.set_alpha(viz.style.alpha)
                
                # Hide X axis ticks as requested (legend is enough)
                ax.set_xticklabels([])
                ax.legend(bplot['boxes'], labels, loc='best')

        elif viz.viz_type == 'universal':
            # === UNIVERSAL PLOT LOGIC ===
            
            # 1. Determine if Secondary Axis is needed
            ax2 = None
            has_secondary = False
            if viz.series_configs:
                has_secondary = any(viz.series_configs.get(col, SeriesConfiguration()).y_axis_id == 'right' 
                                    for col in viz.axis.y_axis if col in df.columns)
            
            # Setup secondary axis if needed
            if has_secondary:
                ax2 = ax.twinx()
                if viz.axis.y2_label:
                    ax2.set_ylabel(viz.axis.y2_label)
            
            # 2. Plot Series
            for j, col in enumerate(viz.axis.y_axis):
                if col not in df.columns:
                     continue
                
                # Get Config
                series_conf = viz.series_configs.get(col) if viz.series_configs else SeriesConfiguration()
                if series_conf is None:
                    series_conf = SeriesConfiguration()
                
                # Determine Target Axis
                target_ax = ax2 if series_conf.y_axis_id == 'right' and ax2 else ax
                
                # Determine Color (Custom Color -> Series Config Color -> Palette)
                if viz.style.custom_colors and col in viz.style.custom_colors:
                     c = viz.style.custom_colors[col]
                elif series_conf.color:
                     c = series_conf.color
                else:
                     c = COLORS[j % len(COLORS)]
                
                # Label
                lb = col
                if viz.legend.labels and j < len(viz.legend.labels):
                     lb = viz.legend.labels[j]
                
                # Plot Data
                y_vals = df[col]
                ptype = series_conf.type.lower()
                
                if ptype == 'scatter':
                    target_ax.scatter(x_data, y_vals, label=lb, alpha=viz.style.alpha, s=20, color=c)
                elif ptype == 'bar':
                    target_ax.bar(x_data, y_vals, label=lb, alpha=viz.style.alpha, color=c)
                elif ptype == 'step':
                    target_ax.step(x_data, y_vals, label=lb, where='post', alpha=viz.style.alpha, linewidth=2, color=c)
                else: # Line (default)
                    target_ax.plot(x_data, y_vals, label=lb, alpha=viz.style.alpha, linewidth=2, color=c)
                
                # Per-Series Regression
                if series_conf.show_regression:
                    add_regression(
                        target_ax,
                        x_data,
                        y_vals,
                        series_conf.degree or 1,
                        c, # Use series color
                        label_prefix=f"Trend ({lb})",
                        remove_outliers=series_conf.remove_outliers,
                        show_ci=series_conf.show_confidence_interval
                    )
            


            format_datetime_axis(ax, x_data if isinstance(x_data, pd.Index) else df.index)

        elif viz.viz_type in ['line', 'step', 'scatter', 'bar', 'area']:
            
            # Stacking Baseline
            baseline = np.zeros(len(x_data)) if (viz.viz_type == 'area' and viz.style.enable_stacking) else None
            
            for j, col in enumerate(viz.axis.y_axis):
                if col not in df.columns:
                    continue

                # Color Selection
                if viz.style.custom_colors and col in viz.style.custom_colors:
                    c = viz.style.custom_colors[col]
                else:
                    c = COLORS[j % len(COLORS)]
                        
                # Label priority: Legend > Config Label > Col Name
                label = col
                if viz.legend.labels and j < len(viz.legend.labels):
                    label = viz.legend.labels[j]
                
                # Ensure alignment for simple plotting
                y_vals = df[col]
                
                if viz.viz_type == 'step':
                    ax.step(
                        x_data,
                        y_vals,
                        label=label,
                        alpha=viz.style.alpha,
                        linewidth=2,
                        where='post',
                        color=c)
                elif viz.viz_type == 'scatter':
                    ax.scatter(
                        x_data,
                        y_vals,
                        label=label,
                        alpha=viz.style.alpha,
                        s=20,
                        color=c)
                elif viz.viz_type == 'bar':
                    ax.bar(
                        x_data,
                        y_vals,
                        label=label,
                        alpha=viz.style.alpha,
                        color=c)
                elif viz.viz_type == 'area':
                    if viz.style.enable_stacking:
                        # Fill between baseline and baseline + y
                        # Re-indexing numpy array if needed to ensure match
                        y_np = y_vals.values if hasattr(y_vals, 'values') else np.array(y_vals)
                        # Handle NaNs as 0 for stacking
                        y_np = np.nan_to_num(y_np)
                        
                        ax.fill_between(
                            x_data,
                            baseline,
                            baseline + y_np,
                            label=label,
                            alpha=0.6,
                            color=c)
                        
                        baseline += y_np
                    else:
                        ax.fill_between(
                            x_data,
                            y_vals,
                            label=label,
                            alpha=viz.style.alpha * 0.5,
                            color=c)
                else:  # Line
                    ax.plot(
                        x_data,
                        y_vals,
                        label=label,
                        alpha=viz.style.alpha,
                        linewidth=2,
                        color=c)

            # Regression (for Line/Scatter)
            if viz.regression.added and viz.axis.y_axis and viz.axis.y_axis[0] in df.columns:
                add_regression(ax,
                                x_data,
                                df[viz.axis.y_axis[0]],
                                viz.regression.degree,
                                viz.regression.line_color or '#f59e0b',
                                label_prefix="Regression",
                                remove_outliers=viz.regression.remove_outliers,
                                show_ci=viz.regression.show_confidence_interval)

            # Only add legend if we have labeled artists
            # handles, labels = ax.get_legend_handles_labels()
            # if handles and labels:
            #    ax.legend(loc='best')

            
            # Axis Limits
            if viz.axis.enable_y_axis_range and viz.axis.y_axis_min is not None and viz.axis.y_axis_max is not None:
                ax.set_ylim(viz.axis.y_axis_min, viz.axis.y_axis_max)

            format_datetime_axis(
                ax, x_data if isinstance(
                    x_data, pd.Index) else df.index)

        elif viz.viz_type == 'regression':
            # Dedicated Regression Analysis
            target_col = viz.axis.y_axis[0]
            
            x_plot = []
            y = []

            if target_col not in df.columns:
                 logger.warning(f"Column {target_col} missing for regression plot")
                 work_df = pd.DataFrame()
                 predictors = []
            else:
                 predictors = viz.regression.predictors if viz.regression.predictors else []
                 
                 # Extract predictors from Custom Formula if present
                 if viz.regression.model_type == 'custom' and viz.regression.custom_formula:
                     import re
                     # Extract col['ColumnName'] or df['ColumnName']
                     custom_cols = re.findall(r"(?:col|df)\['([^']+)'\]", viz.regression.custom_formula)
                     custom_cols += re.findall(r'(?:col|df)\["([^"]+)"\]', viz.regression.custom_formula)
                     
                     for c in custom_cols:
                         if c not in predictors and c in df.columns:
                             predictors.append(c)
                         elif c not in df.columns:
                             logger.error(f"DEBUG: Custom col '{c}' NOT found in df.columns: {df.columns.tolist()[:10]}...")

                 # Default to X-Axis if no predictors
                 if not predictors:
                    predictors = ['Index'] if viz.axis.x_axis == 'Index' else [viz.axis.x_axis]
                
                 logger.error(f"DEBUG: Final predictors for export: {predictors}")

            # 1. Setup DataFrame
            work_df = df.copy()

            # Align data for custom formula (differently spaced inputs)
            # if viz.regression.model_type == 'custom':
            #     work_df = work_df.ffill().bfill()
            if 'Index' in predictors:
                work_df['Index'] = work_df.index
            
            # 2. Filter NAs
            # Ensure all required columns exist
            cols = [target_col]
            for p in predictors:
                if p in work_df.columns:
                    cols.append(p)
            
            if viz.axis.x_axis != 'Index' and viz.axis.x_axis not in cols and viz.axis.x_axis in work_df.columns:
                cols.append(viz.axis.x_axis)
            
            work_df = work_df[cols].dropna()
            
            if not work_df.empty:
                y = work_df[target_col].values
                
                # 3. Build X Matrix (Numeric)
                X_list = []
                for p in predictors:
                    if p not in work_df.columns: continue
                    col_data = work_df[p]
                    if pd.api.types.is_datetime64_any_dtype(col_data):
                        X_list.append(col_data.astype('int64') / 1e9)
                    else:
                        X_list.append(col_data.values)
                
                if X_list:
                    X = np.column_stack(X_list)
                else:
                    X = np.array([]).reshape(len(y), 0)

                # 4. x_plot for Visualization
                if viz.axis.x_axis == 'Index':
                    x_plot = work_df.index
                else:
                    x_plot = work_df[viz.axis.x_axis] # Original type
                
                # --- OUTLIER REMOVAL (IQR Method - matches app) ---
                if viz.regression.remove_outliers and len(y) > 2:
                    q1 = np.percentile(y, 25)
                    q3 = np.percentile(y, 75)
                    iqr = q3 - q1
                    
                    iqr_mult = getattr(viz.regression, 'iqr_multiplier', 1.5) or 1.5
                    lower_bound = q1 - iqr_mult * iqr
                    upper_bound = q3 + iqr_mult * iqr
                    
                    valid_mask = (y >= lower_bound) & (y <= upper_bound)
                    
                    y = y[valid_mask]
                    X = X[valid_mask]
                    work_df = work_df.iloc[valid_mask]
                    
                    if len(x_plot) == len(valid_mask):
                        x_plot = x_plot[valid_mask] if hasattr(x_plot, '__getitem__') else x_plot
                # -----------------------
                
                y_pred = None
                r2 = 0
                mse = 0
                full_eq = "N/A"
                reg_label = "Insufficient Data"

                if len(y) > 1:
                    # Select Model - use nested regression config
                    reg = viz.regression
                    model_type = reg.model_type or 'linear'
                    
                    if model_type == 'custom' and reg.custom_formula and reg.custom_params:
                        # Custom Formula Regression using curve_fit
                        from scipy.optimize import curve_fit
                        import re
                        
                        custom_formula = reg.custom_formula
                        param_names = [p.strip() for p in reg.custom_params.split(',')]
                        
                        initial_guesses = None
                        if reg.custom_initial_guesses:
                            try:
                                initial_guesses = [float(g.strip()) for g in reg.custom_initial_guesses.split(',')]
                            except:
                                pass
                        
                        # Parse bounds
                        bounds_lower = None
                        bounds_upper = None
                        if reg.custom_bounds_lower:
                            try:
                                bounds_lower = [float(b.strip()) if b.strip().lower() not in ['inf', '-inf'] else (np.inf if b.strip().lower() == 'inf' else -np.inf) 
                                                for b in reg.custom_bounds_lower.split(',')]
                            except:
                                pass
                        if reg.custom_bounds_upper:
                            try:
                                bounds_upper = [float(b.strip()) if b.strip().lower() not in ['inf', '-inf'] else (np.inf if b.strip().lower() == 'inf' else -np.inf) 
                                                for b in reg.custom_bounds_upper.split(',')]
                            except:
                                pass
                        
                        # Safe math functions
                        SAFE_MATH = {
                            'exp': np.exp, 'log': np.log, 'log10': np.log10,
                            'sin': np.sin, 'cos': np.cos, 'tan': np.tan,
                            'sqrt': np.sqrt, 'abs': np.abs, 'pi': np.pi, 'e': np.e,
                            'power': np.power, 'pow': np.power
                        }
                        
                        # Build data context for col[] references
                        data_context = {c: work_df[c].values for c in work_df.columns if c != target_col}
                        
                        logger.error(f"DEBUG: Data context keys: {list(data_context.keys())}")
                        logger.error(f"DEBUG: Custom formula: {custom_formula}")

                        try:
                            def custom_func(x, *params):
                                local_ctx = {"x": x}
                                local_ctx.update(dict(zip(param_names, params)))
                                local_ctx.update(SAFE_MATH)
                                local_ctx['col'] = data_context
                                return eval(custom_formula, {"__builtins__": {}}, local_ctx)
                            
                            # Use first column of X as x for simple custom formulas
                            x_fit = X[:, 0] if X.ndim > 1 else X
                            
                            p0 = initial_guesses if initial_guesses and len(initial_guesses) == len(param_names) else [1.0] * len(param_names)
                            
                            # Prepare bounds
                            if bounds_lower or bounds_upper:
                                n_params = len(param_names)
                                lower = bounds_lower if bounds_lower and len(bounds_lower) == n_params else [-np.inf] * n_params
                                upper = bounds_upper if bounds_upper and len(bounds_upper) == n_params else [np.inf] * n_params
                                bounds = (lower, upper)
                                method = 'trf'
                            else:
                                bounds = (-np.inf, np.inf)
                                method = 'lm'
                            
                            popt, pcov = curve_fit(custom_func, x_fit, y, p0=p0, bounds=bounds, method=method, maxfev=10000)
                            y_pred = custom_func(x_fit, *popt)
                            
                            # Calculate R2
                            ss_res = np.sum((y - y_pred) ** 2)
                            ss_tot = np.sum((y - np.mean(y)) ** 2)
                            r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
                            mse = np.mean((y - y_pred) ** 2)
                            
                            # Build equation string
                            eq_str = custom_formula
                            for p_name, p_val in zip(param_names, popt):
                                pattern = re.compile(fr'\b{p_name}\b')
                                eq_str = pattern.sub(f"{p_val:.2e}", eq_str)
                            full_eq = eq_str
                            
                        except Exception as e:
                            logger.warning(f"Custom formula fit failed in export: {e}")
                            full_eq = f"Custom fit failed: {e}"
                    
                    elif model_type == 'elastic_net':
                        model = ElasticNet(alpha=reg.alpha or 1.0, l1_ratio=reg.l1_ratio or 0.5)
                        model.fit(X, y)
                        y_pred = model.predict(X)
                        r2 = model.score(X, y)
                        mse = np.mean((y - y_pred) ** 2)
                        full_eq = "Elastic Net Model"
                    elif model_type == 'ridge':
                        model = Ridge(alpha=reg.alpha or 1.0)
                        model.fit(X, y)
                        y_pred = model.predict(X)
                        r2 = model.score(X, y)
                        mse = np.mean((y - y_pred) ** 2)
                        if hasattr(model, 'coef_') and hasattr(model, 'intercept_'):
                            intercept = model.intercept_
                            coefs = model.coef_
                            eq_parts = [f"{intercept:.2e}"]
                            for i, col in enumerate(predictors):
                                coef = coefs[i] if hasattr(coefs, '__len__') and i < len(coefs) else (coefs if i==0 else 0)
                                if hasattr(coefs, 'shape') and len(coefs.shape) == 0:
                                     coef = float(coefs)
                                sign = "+" if coef >= 0 else "-"
                                eq_parts.append(f"{sign} {abs(coef):.2e}*{col}")
                            full_eq = " ".join(eq_parts)
                    elif model_type == 'lasso':
                        model = Lasso(alpha=reg.alpha or 1.0)
                        model.fit(X, y)
                        y_pred = model.predict(X)
                        r2 = model.score(X, y)
                        mse = np.mean((y - y_pred) ** 2)
                        full_eq = "Lasso Model"
                    elif model_type == 'random_forest':
                        params = {
                            'n_estimators': reg.rf_n_estimators or 100,
                            'max_depth': reg.rf_max_depth,
                            'min_samples_split': reg.rf_min_samples_split or 2,
                            'min_samples_leaf': reg.rf_min_samples_leaf or 1
                        }
                        model = RandomForestRegressor(**params)
                        model.fit(X, y)
                        y_pred = model.predict(X)
                        r2 = model.score(X, y)
                        mse = np.mean((y - y_pred) ** 2)
                        full_eq = "Random Forest Model"
                    else:
                        model = LinearRegression()
                        model.fit(X, y)
                        y_pred = model.predict(X)
                        r2 = model.score(X, y)
                        mse = np.mean((y - y_pred) ** 2)
                        
                        # Equation
                        full_eq = "Linear Model"
                        if hasattr(model, 'coef_') and hasattr(model, 'intercept_'):
                            intercept = model.intercept_
                            coefs = model.coef_
                            
                            eq_parts = [f"{intercept:.2e}"]
                            for i, col in enumerate(predictors):
                                coef = coefs[i] if hasattr(coefs, '__len__') and i < len(coefs) else (coefs if i==0 else 0)
                                if hasattr(coefs, 'shape') and len(coefs.shape) == 0:
                                     coef = float(coefs)

                                sign = "+" if coef >= 0 else "-"
                                eq_parts.append(f"{sign} {abs(coef):.2e}*{col}")
                            
                            full_eq = " ".join(eq_parts)
                

                
                # Legend Label Logic
                if len(full_eq) <= 30:
                    reg_label = f"y = {full_eq} | R²={r2:.3f} | MSE={mse:.2f}"
                else:
                    reg_label = f"y = f(X) | R²={r2:.3f} | MSE={mse:.2f}"
                    
                # 1. Plot Actual (Target vs X)
                # Use custom color from config, fallback to palette color based on index
                scatter_color = viz.style.custom_colors.get(target_col) if viz.style.custom_colors else None
                if not scatter_color:
                    scatter_color = COLORS[viz.style.color_index % len(COLORS)]
                ax.scatter(x_plot, y, label=f"Actual ({target_col})", alpha=0.5, color=scatter_color, s=5)
                
                # 2. Plot Predicted
                if y_pred is not None:
                    sort_idx = np.argsort(x_plot)
                    
                    is_time = isinstance(work_df.index, pd.DatetimeIndex) and viz.axis.x_axis == 'Index'
                    
                    if is_time:
                        ax.plot(x_plot, y_pred, label=reg_label, color=viz.regression.line_color or '#f59e0b', linewidth=2)
                    else:
                        ax.scatter(x_plot, y_pred, label=reg_label, color=viz.regression.line_color or '#f59e0b', marker='x', s=5)

                    # 3. Confidence Intervals (Approximate)
                    try:
                        n = len(y)
                        p = X.shape[1] + 1
                        dof = max(1, n - p)
                        resid = y - y_pred
                        s_err = np.sqrt(np.sum(resid**2) / dof)
                        
                        if n < 5000:
                            X_design = np.hstack([np.ones((n, 1)), X])
                            XTX_inv = np.linalg.inv(np.dot(X_design.T, X_design))
                            leverage = np.sum((X_design @ XTX_inv) * X_design, axis=1)
                            t_val = stats.t.ppf(0.975, dof)
                            ci_margin = t_val * s_err * np.sqrt(leverage)
                            
                            y_upper = y_pred + ci_margin
                            y_lower = y_pred - ci_margin
                            
                            if is_time and viz.regression.show_confidence_interval:
                                x_plot_sorted = x_plot[sort_idx]
                                y_lower_sorted = y_lower[sort_idx]
                                y_upper_sorted = y_upper[sort_idx]
                                
                                ax.fill_between(x_plot_sorted, y_lower_sorted, y_upper_sorted, color='#f59e0b', alpha=0.2, label='95% CI')
                    except Exception as e:
                        logger.debug(f"CI Error: {e}")

            format_datetime_axis(ax, df.index if viz.axis.x_axis == 'Index' else pd.Index(x_plot))

        elif viz.viz_type == 'pca':
            if len(viz.axis.y_axis) >= 2:
                data = df[viz.axis.y_axis].dropna()
                scaler = StandardScaler()
                data_scaled = scaler.fit_transform(data)
                pca = PCA(n_components=2)
                data_pca = pca.fit_transform(data_scaled)

                if viz.show_loadings:
                    loadings = pca.components_.T * \
                        np.sqrt(pca.explained_variance_)
                    
                    scale_val = min(np.abs(data_pca[:, 0]).max(), np.abs(
                        data_pca[:, 1]).max()) * 0.8
                    scale = float(scale_val) if scale_val > 0 else 1.0
                    
                    loadings *= scale

                    for k, var in enumerate(viz.axis.y_axis):
                        default_color = COLORS[k % len(COLORS)]
                        arrow_color = viz.style.custom_colors.get(var, default_color) if viz.style.custom_colors else default_color
                        
                        lx, ly = loadings[k, 0], loadings[k, 1]
                        ax.arrow(0, 0, lx, ly,
                                    color=arrow_color, alpha=0.9, width=scale * 0.008,
                                    length_includes_head=True)
                        
                        ax.plot([], [], color=arrow_color, label=var, linewidth=2)

                    circle = plt.Circle(
                        (0, 0), scale, fill=False, color='gray', linestyle='dotted')
                    ax.add_patch(circle)

                ax.set_xlabel(
                    f"PC1 ({pca.explained_variance_ratio_[0]:.1%})")
                ax.set_ylabel(
                    f"PC2 ({pca.explained_variance_ratio_[1]:.1%})")
                
                if viz.pca.show_loadings:
                        limit = scale * 1.4
                else:
                        limit = max(np.abs(data_pca[:, 0]).max(), np.abs(data_pca[:, 1]).max()) * 1.1

                ax.set_xlim(-limit, limit)
                ax.set_ylim(-limit, limit)
                
                ax.set_aspect('equal', adjustable='box')

        elif viz.viz_type == 'multi_axis':
            # Similar to Line/Scatter loop
            plot_type = viz.axis.multi_axis_plot_type
            for j, col in enumerate(viz.axis.y_axis):
                if col not in df.columns:
                    continue
                c = COLORS[j % len(COLORS)]
                lb = viz.legend.labels[j] if viz.legend.labels and j < len(
                    viz.legend.labels) else col

                data_s = df[col].dropna()
                if plot_type == 'Scatter':
                    ax.scatter(
                        data_s.index,
                        data_s.values,
                        label=lb,
                        alpha=viz.style.alpha,
                        s=20,
                        color=c)
                elif plot_type == 'Line + Scatter':
                    ax.plot(
                        data_s.index,
                        data_s.values,
                        label=lb,
                        alpha=viz.style.alpha,
                        color=c,
                        marker='o',
                        markersize=4,
                        linewidth=1.5
                    )
                else:
                    ax.plot(
                        data_s.index,
                        data_s.values,
                        label=lb,
                        alpha=viz.style.alpha,
                        linewidth=2,
                        color=c)

            format_datetime_axis(ax, df.index)

        elif viz.viz_type == 'hist':
            # Histogram
            for idx, col in enumerate(viz.axis.y_axis):
                if col not in df.columns:
                    continue
                
                data_s = df[col].dropna()
                label = col
                if viz.legend.labels and idx < len(viz.legend.labels):
                    label = viz.legend.labels[idx]
                    
                c = COLORS[idx % len(COLORS)]
                
                # Plot histogram
                ax.hist(data_s, bins=30, alpha=viz.style.alpha, label=label, color=c)
            
            ax.set_ylabel("Frequency", fontsize=10, fontweight='bold')
            
        elif viz.viz_type == 'anomaly':
            # Anomaly Detection
            target_col = viz.axis.y_axis[0]
            if target_col in df.columns:
                data = df[target_col]
                window = viz.anomaly.rolling_window
                threshold = viz.anomaly.threshold
                
                # Calculate Stats
                rolling_mean = data.rolling(window=window, min_periods=1).mean()
                rolling_std = data.rolling(window=window, min_periods=1).std().fillna(0)
                    # Handle initial NaN from std calculation (fill with first valid or 0)
                rolling_std = rolling_std.fillna(method='bfill').fillna(0)
                
                upper_bound = rolling_mean + threshold * rolling_std
                lower_bound = rolling_mean - threshold * rolling_std
                
                normal_mask = (data >= lower_bound) & (data <= upper_bound)
                anomaly_mask = ~normal_mask
                
                c = COLORS[viz.style.color_index % len(COLORS)]
                
                # Plot Normal
                ax.plot(data.index, data, label="Normal", color=c, alpha=0.5)
                
                # Plot Anomalies
                if anomaly_mask.any():
                    ax.scatter(data[anomaly_mask].index, data[anomaly_mask], 
                                color='red', label='Anomalies', s=5, zorder=5)
                    
                # Plot Bands
                ax.plot(data.index, upper_bound, color='red', linestyle=':', alpha=0.3, label='Upper Bound')
                ax.plot(data.index, lower_bound, color='red', linestyle=':', alpha=0.3, label='Lower Bound')
                
                format_datetime_axis(ax, df.index)

                format_datetime_axis(ax, df.index)
        
        elif viz.viz_type == 'correlation':
            # Correlation Matrix
            cols = viz.axis.y_axis
            if cols:
                # Use only selected columns
                data_corr = df[cols].dropna()
                if not data_corr.empty:
                    corr_matrix = data_corr.corr()
                    
                    CMAP_MAPPING = {
                        'RdBu': 'RdBu',
                        'Viridis': 'viridis',
                        'Plasma': 'plasma',
                        'Jet': 'jet',
                        'Hot': 'hot',
                        'Greys': 'Greys',
                        'YlGnBu': 'YlGnBu'
                    }
                    cmap_name = CMAP_MAPPING.get(viz.style.colormap, 'RdBu')
                    
                    im = ax.imshow(corr_matrix, cmap=cmap_name, vmin=-1, vmax=1)
                    
                    # Ticks
                    ax.set_xticks(range(len(cols)))
                    ax.set_yticks(range(len(cols)))
                    ax.set_xticklabels(cols, rotation=45, ha='right')
                    ax.set_yticklabels(cols)
                    
                    # Add values text if matrix is small enough
                    if len(cols) <= 10:
                        for i in range(len(cols)):
                            for j in range(len(cols)):
                                text = ax.text(j, i, f"{corr_matrix.iloc[i, j]:.2f}",
                                            ha="center", va="center", color="w" if abs(corr_matrix.iloc[i, j]) > 0.5 else "k", fontsize=8)
                    
                    plt.colorbar(im, ax=ax)
        final_x_label = viz.axis.x_label if viz.axis.x_label else x_label_default
        final_y_label = viz.axis.y_label if viz.axis.y_label else (
            "Value" if viz.viz_type not in ['pca', 'hist'] else ("Frequency" if viz.viz_type == 'hist' else ""))
        ax.set_xlabel(final_x_label, fontsize=10, fontweight='bold')
        ax.set_ylabel(final_y_label, fontsize=10, fontweight='bold')
        ax.grid(True, alpha=0.3, linestyle='--')

        # Apply Y-Axis Range Limits if enabled
        if viz.axis.enable_y_axis_range:
            current_ylim = ax.get_ylim()
            new_min = viz.axis.y_axis_min if viz.axis.y_axis_min is not None else current_ylim[0]
            new_max = viz.axis.y_axis_max if viz.axis.y_axis_max is not None else current_ylim[1]
            if new_min < new_max:
                ax.set_ylim(bottom=new_min, top=new_max)
        
        # --- Add Threshold Lines (Upper/Lower Limits) ---
        # --- Add Threshold Lines (Dynamic) ---
        if viz.viz_type != 'correlation':
            # Check for new threshold structure
            if hasattr(viz.limits, 'thresholds') and viz.limits.thresholds:
                current_ylim = ax.get_ylim()
                current_ymin, current_ymax = current_ylim
                
                # Expand range slightly for shading calculations if needed
                y_range = abs(current_ymax - current_ymin) or 10
                effective_ymax = current_ymax + y_range * 0.5
                effective_ymin = current_ymin - y_range * 0.5

                for threshold in viz.limits.thresholds:
                    # Draw Line
                    c = threshold.color if threshold.color else '#ef4444'
                    
                    # Target correct axis
                    target_trend_ax = ax
                    if hasattr(threshold, 'y_axis_id') and threshold.y_axis_id == 'right':
                         # If ax2 not already created, create it just for reference line? 
                         # Usually ax2 created if data present. If only ref line on right, we might need to create it or just plot on ax (which is wrong scale).
                         # For now, only use ax2 if it exists.
                         if 'ax2' in locals() and ax2 is not None:
                             target_trend_ax = ax2
                    
                    target_trend_ax.axhline(y=threshold.value, color=c, linestyle='--', linewidth=1.5,
                                label=f"{threshold.label}: {threshold.value}", zorder=3)
                    
                    # Draw Shaded Area
                    if threshold.show_shaded_area:
                        opacity = threshold.shaded_area_opacity if threshold.shaded_area_opacity is not None else 0.2
                        
                        # Use axis limits of the target axis for effective shading
                        current_ylim = target_trend_ax.get_ylim()
                        current_ymin, current_ymax = current_ylim
                        # Expand range slightly for shading calculations
                        y_range_span = abs(current_ymax - current_ymin) or 10
                        effective_ymax = current_ymax + y_range_span * 0.5
                        effective_ymin = current_ymin - y_range_span * 0.5

                        if threshold.shaded_area_direction == 'up':
                            # Shade from value up to effective max
                            upper_shade = max(effective_ymax, threshold.value * 1.2)
                            target_trend_ax.axhspan(ymin=threshold.value, ymax=upper_shade, 
                                       color=c, alpha=opacity, zorder=2, linewidth=0)
                        else:
                            # Shade from effective min up to value
                            lower_shade = min(effective_ymin, threshold.value * 0.8)
                            target_trend_ax.axhspan(ymin=lower_shade, ymax=threshold.value,
                                       color=c, alpha=opacity, zorder=2, linewidth=0)
            
            # Fallback for old limit config if it exists (legacy support/safety)
            elif hasattr(viz.limits, 'enable_upper'):
                 if viz.limits.enable_upper:
                        c_up = viz.limits.upper_color if hasattr(viz.limits, 'upper_color') and viz.limits.upper_color else '#ef4444'
                        ax.axhline(y=viz.limits.upper_value, color=c_up, linestyle='--', linewidth=1.5,
                                label=f"{viz.limits.upper_label}: {viz.limits.upper_value}")
                        current_ymax = ax.get_ylim()[1]
                        ax.axhspan(ymin=viz.limits.upper_value, ymax=max(current_ymax, viz.limits.upper_value * 1.1), 
                                color=c_up, alpha=0.1)

                 if viz.limits.enable_lower:
                        c_low = viz.limits.lower_color if hasattr(viz.limits, 'lower_color') and viz.limits.lower_color else '#ef4444'
                        ax.axhline(y=viz.limits.lower_value, color=c_low, linestyle='--', linewidth=1.5,
                                label=f"{viz.limits.lower_label}: {viz.limits.lower_value}")
                        current_ymin = ax.get_ylim()[0]
                        ax.axhspan(ymin=min(current_ymin, viz.limits.lower_value * 0.9), ymax=viz.limits.lower_value, 
                                color=c_low, alpha=0.1)
        
        # Add Legend
        if viz.viz_type == 'pca':
            ax.legend(loc='upper left', bbox_to_anchor=(1.05, 1), borderaxespad=0.)
        elif viz.viz_type == 'correlation':
            pass # No legend for correlation matrix (colorbar used)
        else:
            # Combine legends from both axes (Generic Final Legend)
            lines1, labels1 = ax.get_legend_handles_labels()
            if ax2:
                lines2, labels2 = ax2.get_legend_handles_labels()
                ax.legend(lines1 + lines2, labels1 + labels2, loc='best')
            else:
                ax.legend(loc='best')

        # Save
        buf = io.BytesIO()
        plt.tight_layout()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        img_b64 = base64.b64encode(buf.read()).decode()
        plt.close(fig)

        # Build HTML Config String
        config_parts = [
            f"<strong>Type:</strong> {viz.viz_type.value}",
            f"<strong>Color:</strong> {viz.style.color_index}"
        ]

        if viz.viz_type == 'pca':
            config_parts.append(
                f"<strong>Variables:</strong> {', '.join(viz.axis.y_axis)}")
            config_parts.append(
                f"<strong>Components:</strong> {viz.pca.components}")
        elif viz.viz_type == 'formula':
            config_parts.append(f"<strong>X:</strong> {viz.formula.x_formula}")
            config_parts.append(
                f"<strong>Plot:</strong> {viz.formula.plot_type}")
            if viz.formula.add_regression:
                config_parts.append(
                    f"<strong>Regression:</strong> Degree {viz.formula.regression_degree}")
        elif viz.viz_type == 'regression':
                config_parts.append(f"<strong>Target:</strong> {viz.axis.y_axis[0]}")
                config_parts.append(f"<strong>Predictors:</strong> {', '.join(viz.regression.predictors) if viz.regression.predictors else 'None'}")
        else:
            config_parts.append(f"<strong>X:</strong> {viz.axis.x_axis}")
            config_parts.append(
                f"<strong>Y:</strong> {', '.join(viz.axis.y_axis[:3]) + ('...' if len(viz.axis.y_axis) > 3 else '')}")
            if viz.viz_type == 'multi_axis':
                config_parts.append(
                    f"<strong>Plot Type:</strong> {viz.axis.multi_axis_plot_type}")
            if viz.regression.added:
                config_parts.append(
                    f"<strong>Regression:</strong> Degree {viz.regression.degree}")
        
        return img_b64, " | ".join(config_parts)

    except Exception as e:
        logger.error(f"Plot generation failed: {e}")
        traceback.print_exc()
        return "", f"Error: {str(e)}"
