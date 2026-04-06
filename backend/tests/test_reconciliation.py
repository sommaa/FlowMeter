import pytest
import pandas as pd
import numpy as np
from app.services.reconciliation_service import ReconciliationService

def test_simple_balance_analytic():
    """
    Test simple A + B = C with analytical method (non_negative=False).
    """
    # True: 10 + 20 = 30
    # Measured: 10.5 + 19.5 = 30 (Satisfied? No, let's make it not satisfied)
    # Measured: 11 + 21 = 30? No, 32 != 30.
    # Error is 2. Distributed.
    
    df = pd.DataFrame({
        "A": [11.0],
        "B": [21.0],
        "C": [30.0]
    })
    
    equations = ["A + B = C"]
    
    rec_df, report = ReconciliationService.reconcile_data(
        df, equations, non_negative=False, fixed_sigma=1.0
    )
    
    # Check balance
    # A_rec + B_rec - C_rec should be approx 0
    res = rec_df["A"].iloc[0] + rec_df["B"].iloc[0] - rec_df["C"].iloc[0]
    assert res == pytest.approx(0.0, abs=1e-5)
    
    # Uniform sigma -> adjustments should be equal in magnitude if they interact symmetrically?
    # Residual = 11+21-30 = 2.
    # 3 vars involved.
    # This is a least squares redistribution.
    pass

def test_non_negative_osqp():
    """
    Test non-negativity constraint.
    A + B = 10.
    Measured: A = -5, B = 20. (Sum 15 != 10).
    Reconciled should enforce A >= 0.
    Likely A -> 0, B -> 10.
    """
    df = pd.DataFrame({
        "A": [-5.0],
        "B": [20.0]
    })
    
    equations = ["A + B = 10"]
    
    rec_df, report = ReconciliationService.reconcile_data(
        df, equations, non_negative=True, fixed_sigma=1.0
    )
    
    # Check constraints
    assert rec_df["A"].iloc[0] >= -1e-9 # Allow tiny floating point error
    assert rec_df["B"].iloc[0] >= -1e-9
    
    # Check balance
    res = rec_df["A"].iloc[0] + rec_df["B"].iloc[0]
    assert res == pytest.approx(10.0, abs=1e-4)
    
    # A should be close to 0 (pushed up from -5)
    assert rec_df["A"].iloc[0] == pytest.approx(0.0, abs=0.1)

def test_sigma_weighting():
    """
    Test that higher sigma (lower confidence) variables move more.
    A + B = 100
    Measured: A=60, B=60 (Sum 120, Error 20).
    A has high sigma (10.0) -> Uncertain
    B has low sigma (0.1) -> Certain
    Expect A to take most of the correction.
    """
    df = pd.DataFrame({
        "A": [60.0],
        "B": [60.0]
    })
    
    equations = ["A + B = 100"]
    sigma_vals = {"A": 10.0, "B": 0.1}
    
    rec_df, report = ReconciliationService.reconcile_data(
        df, equations, 
        sigma_values=sigma_vals, 
        sigma_mode="from_config",
        non_negative=False
    )
    
    # Check balance
    assert (rec_df["A"] + rec_df["B"]).iloc[0] == pytest.approx(100.0)
    
    # Change in A: 60 -> ?
    # Change in B: 60 -> ?
    # B should stay close to 60. A should go to approx 40.
    
    diff_A = abs(rec_df["A"].iloc[0] - 60.0)
    diff_B = abs(rec_df["B"].iloc[0] - 60.0)
    
    assert diff_A > diff_B
    assert rec_df["B"].iloc[0] == pytest.approx(60.0, abs=1.0) # Corrected very little

def test_complex_network():
    """
    node1: F1_in = F1_out + F2_in
    node2: F2_in = F2_out
    """
    df = pd.DataFrame({
        "F1_in": [100.0, 100.0],
        "F1_out": [40.0, 45.0],
        "F2_in": [55.0, 50.0], # 40+55=95 != 100
        "F2_out": [55.0, 50.0]
    })
    
    eqs = [
        "F1_in = F1_out + F2_in",
        "F2_in = F2_out" # Simple pass through
    ]
    
    rec_df, report = ReconciliationService.reconcile_data(
        df, eqs
    )
    
    # Check eq 1
    bal1 = rec_df["F1_in"] - rec_df["F1_out"] - rec_df["F2_in"]
    assert np.allclose(bal1, 0, atol=1e-4)
    
    # Check eq 2
    bal2 = rec_df["F2_in"] - rec_df["F2_out"]
    assert np.allclose(bal2, 0, atol=1e-4)
