"""Data reconciliation service using constrained optimization.

This module provides functionality to reconcile measured data against known
physical constraints (e.g., mass balance equations). It uses weighted least
squares optimization to find adjusted values that satisfy the constraints
while staying as close as possible to the measured values.

The reconciliation problem is formulated as:
    Minimize ||W^0.5 (x - x_m)||^2
    Subject to: Ax = b (and optionally x >= 0)

Where:
    - x_m: measured values
    - x: reconciled values
    - W: weight matrix (inverse of measurement variances)
    - A, b: constraint matrices derived from balance equations
"""

import pandas as pd
import numpy as np
import sympy as sp
import re
from typing import List, Dict, Set, Tuple
from app.core.profiler import profile_performance

import logging

logger = logging.getLogger(__name__)

VALVE_CLOSED_EPS = 1e-3
"""Threshold below which values are treated as zero (valve closed)."""

MIN_SIGMA = 1e-6
"""Minimum allowed sigma value to prevent division by zero in weights."""


class ReconciliationService:
    """Service for reconciling measured data against physical constraints.

    This service provides methods to:
    - Normalize and canonicalize variable names for consistent matching
    - Parse and validate balance equations
    - Build constraint matrices from symbolic equations using SymPy
    - Solve the reconciliation problem using either analytical or OSQP methods

    The reconciliation adjusts measured values to satisfy mass/energy balance
    equations while minimizing weighted squared deviations from measurements.
    """
    @staticmethod
    def normalize_spaces(s: str) -> str:
        """Normalize whitespace in a string.

        Replaces non-breaking spaces with regular spaces, collapses multiple
        consecutive whitespace characters into single spaces, and trims
        leading/trailing whitespace.

        Args:
            s: The string to normalize.

        Returns:
            The normalized string, or the original value if not a string.
        """
        if not isinstance(s, str):
            return s
        s = s.replace("\u00A0", " ")
        s = re.sub(r"\s+", " ", s)
        return s.strip()

    @staticmethod
    def canonical_name(name: str) -> str:
        """Convert a variable name to canonical form for consistent matching.

        The canonical form:
        - Normalizes whitespace
        - Replaces parentheses and slashes with spaces
        - Replaces non-alphanumeric characters with underscores
        - Strips leading/trailing underscores

        Args:
            name: The variable name to canonicalize.

        Returns:
            The canonicalized name suitable for use as a Python identifier.

        Example:
            >>> ReconciliationService.canonical_name("Flow (kg/s)")
            'Flow_kg_s'
        """
        name = ReconciliationService.normalize_spaces(str(name))
        name = re.sub(r"[()\/]", " ", name)
        name = re.sub(r"[^0-9A-Za-z]+", "_", name)
        return name.strip("_")

    @staticmethod
    def canonicalize_equation(eq: str, canonical_cols: Set[str]) -> str:
        """Convert variable names in an equation to their canonical forms.

        Parses the equation string and replaces any tokens that match known
        column names with their canonical equivalents.

        Args:
            eq: The equation string (e.g., "A + B = C").
            canonical_cols: Set of canonical column names to match against.

        Returns:
            The equation with variable names replaced by canonical forms.

        Example:
            >>> cols = {'Flow_A', 'Flow_B', 'Flow_C'}
            >>> ReconciliationService.canonicalize_equation("Flow A + Flow B = Flow C", cols)
            'Flow_A + Flow_B = Flow_C'
        """
        eq = ReconciliationService.normalize_spaces(eq)

        def repl(m):
            token = m.group(0)
            token_canon = ReconciliationService.canonical_name(token)
            if token_canon in canonical_cols:
                return token_canon
            return token

        return re.sub(r"[A-Za-z0-9_]+", repl, eq)

    @staticmethod
    def build_constraint_matrices(equations: List[str], var_list: List[str]) -> Tuple[np.ndarray, np.ndarray]:
        """Build constraint matrices A and b from symbolic equations.

        Parses a list of equation strings using SymPy and converts them to
        the standard linear constraint form Ax = b.

        Args:
            equations: List of equation strings (e.g., ["A + B = C", "D = E + F"]).
            var_list: List of variable names that appear in the equations.

        Returns:
            A tuple (A, b) where:
                - A: Coefficient matrix of shape (num_equations, num_variables)
                - b: Right-hand side vector of shape (num_equations,)

        Raises:
            ValueError: If no valid equations could be parsed.

        Example:
            >>> A, b = ReconciliationService.build_constraint_matrices(
            ...     ["x + y = 10", "x - y = 2"],
            ...     ["x", "y"]
            ... )
            >>> A  # [[1, 1], [1, -1]]
            >>> b  # [10, 2]
        """
        syms = {v: sp.Symbol(v) for v in var_list}
        eqs = []

        for eq_str in equations:
            if "=" not in eq_str:
                continue
            left, right = eq_str.split("=")
            left, right = left.strip(), right.strip()

            try:
                left_expr = sp.sympify(left, locals=syms)
                right_expr = sp.sympify(right, locals=syms)
                eqs.append(sp.Eq(left_expr, right_expr))
            except Exception as e:
                # Skip invalid equations
                logger.warning(f"Skipping invalid equation: {eq_str}. Error: {e}")
                continue

        if not eqs:
            raise ValueError("No valid equations parsed")

        A_sym, b_sym = sp.linear_eq_to_matrix(eqs, [syms[v] for v in var_list])
        return np.array(A_sym, float), np.array(b_sym, float).flatten()

    

    @staticmethod
    def _reconcile_analytical(
        df_canon: pd.DataFrame,
        constrained: List[str],
        A: np.ndarray,
        b: np.ndarray,
        W: np.ndarray
    ) -> List[np.ndarray]:
        """Solve reconciliation using vectorized analytical solution.

        Uses the closed-form solution for weighted least squares with equality
        constraints (no non-negativity constraints). This is much faster than
        iterative methods when non-negativity is not required.

        The solution formula is:
            x = x_m - W^-1 A^T (A W^-1 A^T)^-1 (A x_m - b)

        Args:
            df_canon: DataFrame with canonicalized column names.
            constrained: List of variable names involved in constraints.
            A: Constraint coefficient matrix of shape (m, n).
            b: Constraint RHS vector of shape (m,).
            W: Diagonal weight matrix of shape (n, n).

        Returns:
            List of reconciled value arrays, one per row in the DataFrame.
            Rows with NaN values will have NaN in the output.
        """
        # Ensure matrices are correct shape
        # A: (m constraints, n vars)
        # b: (m constraints)
        # W: (n, n) diagonal
        
        # 1. Precompute fixed matrices
        W_inv = np.linalg.inv(W)  # Since W is diagonal, easy
        AWAT = A @ W_inv @ A.T    # (m, n) * (n, n) * (n, m) -> (m, m)
        
        try:
            # pinv is safer than inv for singular matrices, though AWAT should be invertible if equations are distinct
            AWAT_inv = np.linalg.pinv(AWAT) 
        except np.linalg.LinAlgError:
            logger.warning("Singularity detected in constraint matrix. Fallback to QP recommended in future.")
            return [np.full(len(constrained), np.nan)] * len(df_canon)

        CorrectionMatrix = W_inv @ A.T @ AWAT_inv # (n, n) * (n, m) * (m, m) -> (n, m)

        # 2. Vectorized calculation
        X_m = df_canon[constrained].values # (N_samples, n_vars)
        
        # Handle NA: If any NaN in row, output is NaN
        # We'll use a mask to compute only valid rows
        valid_mask = ~np.isnan(X_m).any(axis=1)
        
        X_m_valid = X_m[valid_mask]
        
        # Valve closed logic (vectorized)
        X_m_adj = np.where(np.abs(X_m_valid) < VALVE_CLOSED_EPS, 0.0, X_m_valid)

        # Residuals r = A x_m - b
        # A is (m, n), X_m_adj.T is (n, N)
        # A @ X_m_adj.T -> (m, N)
        residuals = A @ X_m_adj.T - b[:, None] # Broadcast b

        # Corrections = CorrectionMatrix @ residuals
        # (n, m) @ (m, N) -> (n, N)
        corrections = CorrectionMatrix @ residuals

        # X_rec = X_m - corrections.T
        X_rec_valid = X_m_adj - corrections.T
        
        # 3. Reconstruct full result
        X_final = np.full(X_m.shape, np.nan)
        X_final[valid_mask] = X_rec_valid
        
        return list(X_final)

    @staticmethod
    def _reconcile_osqp(
        df_canon: pd.DataFrame,
        constrained: List[str],
        A: np.ndarray,
        b: np.ndarray,
        W: np.ndarray
    ) -> List[np.ndarray]:
        """Solve reconciliation using OSQP quadratic programming solver.

        Uses the OSQP solver when non-negativity constraints are required.
        The problem is formulated as a standard QP:
            Minimize 0.5 x^T P x + q^T x
            Subject to: Ax = b, x >= 0

        Where:
            - P = 2*W (positive definite objective matrix)
            - q = -2*W*x_measured (linear objective term)

        Uses warm-starting between consecutive rows for better performance.

        Args:
            df_canon: DataFrame with canonicalized column names.
            constrained: List of variable names involved in constraints.
            A: Constraint coefficient matrix of shape (m, n).
            b: Constraint RHS vector of shape (m,).
            W: Diagonal weight matrix of shape (n, n).

        Returns:
            List of reconciled value arrays, one per row in the DataFrame.
            Failed optimizations return NaN arrays.
        """
        import osqp
        from scipy import sparse

        n = len(constrained)
        m = len(b)
        
        # 1. Setup OSQP Problem (once)
        # P = 2*W (Diagonal)
        P = sparse.csc_matrix(2 * W)
        
        # Constraints:
        # 1. Ax = b (Equality)
        # 2. x >= 0 (Inequality, effectively I*x >= 0)
        
        # OSQP format: l <= Ax <= u
        # We try to stack:
        # [ A ] x = [ b ]
        # [ I ] x >= [ 0 ]
        
        # Stacked A matrix for OSQP
        # Vstack A and Identity (for non-negativity)
        A_osqp = sparse.vstack([
            sparse.csc_matrix(A),
            sparse.eye(n)
        ]).tocsc()
        
        # Stacked bounds
        # Equality: l=b, u=b
        # Inequality: l=0, u=inf
        l = np.hstack([b.flatten(), np.zeros(n)])
        u = np.hstack([b.flatten(), np.full(n, np.inf)])
        
        prob = osqp.OSQP()
        # Initialize with dummy q (zeros), updated later
        prob.setup(P, np.zeros(n), A_osqp, l, u, verbose=False, eps_abs=1e-4, eps_rel=1e-4)
        
        # 2. Iterate and Solve
        reconciled_rows = []
        x_prev = None
        
        # Extract data as matrix for speed
        X_m_all = df_canon[constrained].fillna(0).values
        
        # Precompute -2*W diagonal for fast q calculation
        neg_2_W_diag = -2 * np.diag(W)
        
        for i, row_vals in enumerate(X_m_all):
            # Update linear cost vector q = -2 * W * x_measured
            # efficiently: q = elementwise multiply since W is diagonal
            q = neg_2_W_diag * row_vals
            
            prob.update(q=q)
            
            # Warm start
            if x_prev is not None:
                prob.warm_start(x=x_prev)
            
            res = prob.solve()
            
            if res.info.status == 'solved':
                x_sol = res.x
                # Filter small values (valve closed equivalent)
                x_sol[np.abs(x_sol) < VALVE_CLOSED_EPS] = 0.0
                reconciled_rows.append(x_sol)
                x_prev = x_sol # Save for next warm start
            else:
                reconciled_rows.append(np.full(n, np.nan))
                x_prev = None # Reset warm start on failure
                
        return reconciled_rows

    @staticmethod
    @profile_performance
    def reconcile_data(
        df: pd.DataFrame,
        equations: List[str],
        sigma_values: Dict[str, float] = {},
        fixed_sigma: float = 1.0,
        sigma_mode: str = "fixed_all",
        non_negative: bool = True
    ) -> Tuple[pd.DataFrame, List[Dict]]:
        """Reconcile measured data against balance equations.

        Main entry point for data reconciliation. Adjusts measured values to
        satisfy the given constraint equations while minimizing weighted squared
        deviations from the original measurements.

        Args:
            df: DataFrame containing measured values with variable columns.
            equations: List of balance equations (e.g., ["A + B = C"]).
            sigma_values: Per-variable sigma (uncertainty) values for weighting.
                Keys can be original or canonical column names.
            fixed_sigma: Default sigma value when not specified per-variable.
            sigma_mode: How to determine sigma values:
                - "fixed_all": Use fixed_sigma for all variables
                - "from_config": Use sigma_values dict with fixed_sigma as fallback
            non_negative: If True, enforce x >= 0 constraints (uses OSQP solver).
                If False, use faster analytical solution without non-negativity.

        Returns:
            A tuple containing:
                - rec_df: DataFrame with reconciled values for constrained variables
                - report: List of dicts with reconciliation statistics per variable:
                    - variable: Original variable name
                    - mean_error: Mean (measured - reconciled)
                    - mae: Mean absolute error
                    - rel_error_pct: Relative error as percentage
                    - std_error: Standard deviation of errors
                    - avg_abs_change: Average absolute adjustment
                    - max_abs_change: Maximum absolute adjustment
                    - count: Number of valid data points

        Raises:
            ValueError: If no constrained variables found or no valid equations.
        """
        # 1. Prepare Columns
        df_cols = [ReconciliationService.normalize_spaces(c) for c in df.columns]
        df.columns = df_cols
        
        canonical_map = {col: ReconciliationService.canonical_name(col) for col in df_cols}
        reverse_map = {v: k for k, v in canonical_map.items()}
        canonical_cols = set(canonical_map.values())
        
        # 2. Prepare Equations
        canon_eqs = [
            ReconciliationService.canonicalize_equation(eq, canonical_cols) 
            for eq in equations
        ]

        # 3. Identify Variables
        tokens = set()
        for eq in canon_eqs:
            parts = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", eq)
            for p in parts:
                if not p.isdigit():
                    tokens.add(p)
        
        constrained = [c for c in canonical_cols if c in tokens]
        if not constrained:
            raise ValueError("No constrained variables found in the equations matching dataset columns")

        # 4. Build Matrices
        A, b = ReconciliationService.build_constraint_matrices(canon_eqs, constrained)

        # 5. Build Sigma/Weights
        sigmas = []
        for col in constrained:
            orig_col = reverse_map[col]
            if sigma_mode == "from_config":
                val = sigma_values.get(col, sigma_values.get(orig_col, fixed_sigma))
            else:
                val = fixed_sigma
            sigmas.append(max(float(val), MIN_SIGMA))
        
        W = np.diag(1.0 / np.array(sigmas)**2)
        df_canon = df.rename(columns=canonical_map)

        # 6. Reconcile Rows (Optimized)
        reconciled_rows = []
        
        if not non_negative:
            # STRATEGY 1: Vectorized Analytical Solution
            reconciled_rows = ReconciliationService._reconcile_analytical(df_canon, constrained, A, b, W)
        else:
            # STRATEGY 2: OSQP (Warm Start)
            reconciled_rows = ReconciliationService._reconcile_osqp(df_canon, constrained, A, b, W)

        # 7. Format Output
        rec_df = pd.DataFrame(reconciled_rows, columns=[reverse_map[c] for c in constrained], index=df.index)
        
        # 8. Generate Report
        report = []
        for col in constrained:
            orig_name = reverse_map[col]
            meas = df_canon[col]
            rec = pd.Series([r[constrained.index(col)] for r in reconciled_rows], index=df.index)
            
            mask = meas.notna() & rec.notna()
            if mask.sum() == 0:
                continue
                
            err = meas[mask] - rec[mask]
            denom = meas[mask].abs().mean()
            
            report.append({
                "variable": orig_name,
                "mean_error": float(err.mean()),
                "mae": float(err.abs().mean()),
                "rel_error_pct": float((err.abs().mean() / denom * 100.0) if denom > 0 else 0),
                "std_error": float(err.std()),
                "avg_abs_change": float(err.abs().mean()),
                "max_abs_change": float(err.abs().max()),
                "count": int(mask.sum())
            })

        return rec_df, report
