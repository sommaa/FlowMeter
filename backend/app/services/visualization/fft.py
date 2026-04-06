
"""
FFT Visualization Module
"""
import numpy as np
import pandas as pd
from scipy import signal
from typing import List, Dict, Any, Optional
import logging

from app.models.schemas import (
    VisualizationConfig,
    PlotDataResponse,
    PlotDataSeries,
    FFTConfig
)

logger = logging.getLogger(__name__)

def generate_fft_data(df: pd.DataFrame, config: VisualizationConfig) -> PlotDataResponse:
    """
    Generate Power Spectral Density (PSD) data using Welch's method.
    
    Handles:
    - Sampling rate inference from DateTime index
    - Resampling for irregular data
    - NaN interpolation
    - Windowing and Overlap
    - Detrending
    - Unit conversion (Hz, CPM, CPH)
    - Peak detection
    """
    
    # 1. Validate inputs
    if df.empty:
        raise ValueError("Dataset is empty")
        
    y_cols = config.axis.y_axis
    if not y_cols:
        raise ValueError("No Y-axis columns selected for FFT analysis")
        
    fft_config = config.fft
    
    # 2. Preprocessing & Sampling Rate Inference
    # FFT requires constant sampling rate.
    # Check if index is Datetime
    if not isinstance(df.index, pd.DatetimeIndex):
         raise ValueError("Index must be DatetimeIndex for FFT analysis to infer sampling rate.")

    # Calculate sampling rate
    # If irregular, we resample to the mean interval
    diffs = df.index.to_series().diff().dropna()
    mean_interval_sec = diffs.mean().total_seconds()
    
    if mean_interval_sec <= 0:
        raise ValueError("Invalid time index (duplicate or non-monotonic times)")
        
    # Check regularity (simulated)
    # limit deviation to 5% before calling it irregular
    is_irregular = diffs.std().total_seconds() / mean_interval_sec > 0.05
    
    # Target Sampling Rate
    fs = 1.0 / mean_interval_sec
    
    data_to_process = df[y_cols].copy()
    
    # Resample if irregular or duplicates exist
    if is_irregular:
        logger.info(f"Data is irregular. Resampling to {mean_interval_sec:.4f}s interval.")
        # Create a uniform index covering the range
        new_index = pd.date_range(start=df.index.min(), end=df.index.max(), freq=f"{round(mean_interval_sec*1000)}ms")
        # Reindex and interpolate
        # 'time' interpolation is appropriate for continuous process variables
        data_to_process = data_to_process.reindex(new_index).interpolate(method='time')
        # Update fs based on precise new index
        fs = 1.0 / (new_index[1] - new_index[0]).total_seconds()
    else:
        # Just handle existing NaNs
        data_to_process = data_to_process.interpolate(method='time')

    # Final NaN check (edges might be NaN after partial interpolation)
    data_to_process = data_to_process.bfill().ffill()
    
    if data_to_process.isna().any().any():
        # Fallback for empty/all-NaN columns
        data_to_process = data_to_process.fillna(0)
    
    # 3. FFT Calculation (Welch's Method)
    n_samples = len(data_to_process)
    
    # Determine nperseg (Window Size)
    nperseg = fft_config.window_size
    if nperseg is None or nperseg <= 0:
        # Default: 10% of data, capped at 4096, min 256
        default_size = int(n_samples * 0.1)
        nperseg = min(max(default_size, 256), 4096)
        # Ensure it doesn't exceed data length
        nperseg = min(nperseg, n_samples)
        
    if nperseg > n_samples:
         logger.warning(f"Window size {nperseg} > data length {n_samples}. adjusting.")
         nperseg = n_samples

    # Overlap
    noverlap = int(nperseg * fft_config.overlap)
    if noverlap >= nperseg:
        noverlap = nperseg - 1

    # Detrend parameter mapping
    detrend_mode = fft_config.detrend if fft_config.detrend in ['linear', 'constant'] else False
    if fft_config.detrend == 'none':
        detrend_mode = False

    series_list = []
    all_peaks_meta = []
    
    # Frequency Scaling Factor
    freq_scale = 1.0
    freq_label_unit = "Hz"
    
    if fft_config.frequency_unit == 'cpm':
        freq_scale = 60.0
        freq_label_unit = "CPM (Cycles/Min)"
    elif fft_config.frequency_unit == 'cph':
        freq_scale = 3600.0
        freq_label_unit = "CPH (Cycles/Hour)"
        
    
    for col in y_cols:
        signal_data = data_to_process[col].values
        
        # Welch's Method
        freqs, psd = signal.welch(
            signal_data,
            fs=fs,
            window=fft_config.window_type,
            nperseg=nperseg,
            noverlap=noverlap,
            detrend=detrend_mode,
            scaling='density', # V**2/Hz
            axis=0
        )
        
        # Apply Unit Scaling
        freqs = freqs * freq_scale
        
        # Normalization
        if fft_config.normalize:
            total_power = np.sum(psd)
            if total_power > 0:
                psd = psd / total_power
                
        # Peak Detection
        # Find peaks with some prominence
        # We assume 'significant' peaks have some height relative to neighbors
        # For simplicity, we take the top 5 peaks by PSD value
        peak_indices, _ = signal.find_peaks(psd)
        
        # Sort by peak height (PSD value) descending
        peak_indices = sorted(peak_indices, key=lambda i: psd[i], reverse=True)[:5]
        
        top_peaks = []
        for i in peak_indices:
            top_peaks.append({
                "frequency": float(freqs[i]),
                "power": float(psd[i]),
                "series": col
            })
        all_peaks_meta.extend(top_peaks)

        # Prepare Series Data
        plot_data = [
            {"x": float(f), "y": float(p)} 
            for f, p in zip(freqs, psd)
            # Filter 0Hz (DC) if linear detrend was used, or generally to avoid log(0) issues if log scale
            if f > 0 or not fft_config.detrend
        ]
        
        series_list.append(PlotDataSeries(
             name=col,
             data=plot_data,
             type="line",
             y_axis_id="left"
        ))

    # Metadata needed for frontend
    # We'll pass peak info in `annotations` or a dedicated field if schema allowed.
    # Schema has `annotations: Optional[list[dict]]`. We'll use that for now to mark peaks?
    # Or just return them as generic metadata.
    # Let's verify schema. PlotDataResponse has 'annotations'.
    
    peak_annotations = []
    for p in all_peaks_meta:
         peak_annotations.append({
             "type": "text",
             "x": p["frequency"],
             "y": p["power"], # Position at peak
             "text": f"{p['frequency']:.2f} {freq_label_unit}",
             "showarrow": True,
             "arrowhead": 2,
             "series": p["series"]
         })
         
    # Nyquist
    nyquist = fs * freq_scale / 2.0
    freq_res = (fs / nperseg) * freq_scale

    return PlotDataResponse(
        title=f"Power Spectral Density ({config.title})",
        series=series_list,
        x_label=f"Frequency ({freq_label_unit})",
        y_label="Power Spectral Density (Normalized)" if fft_config.normalize else "Power Spectral Density (V²/Hz)",
        annotations=peak_annotations
        # We could stash extra metadata in the response if we added a flexible dict field, 
        # but for now we stick to schema.
    )
