
import pytest
import pandas as pd
import numpy as np
from scipy import signal
from datetime import datetime, timedelta
from app.models.schemas import VisualizationConfig, VisualizationType, AxisConfig, FFTConfig
from app.services.visualization.fft import generate_fft_data

@pytest.fixture
def basic_fft_config():
    return VisualizationConfig(
        id="test_fft",
        title="Test FFT",
        viz_type=VisualizationType.FFT,
        axis=AxisConfig(x_axis="Index", y_axis=["Value"]),
        fft=FFTConfig(
            window_size=None,
            overlap=0.5,
            window_type="hann",
            detrend="linear",
            frequency_unit="hz",
            normalize=False,
            x_axis_scale="linear",
            y_axis_scale="log"
        )
    )

def create_sine_wave(freq=5.0, duration=10.0, fs=100.0, amplitude=1.0, bias=0.0):
    t = np.linspace(0, duration, int(duration * fs), endpoint=False)
    y = amplitude * np.sin(2 * np.pi * freq * t) + bias
    
    start_date = datetime(2023, 1, 1)
    dates = [start_date + timedelta(seconds=val) for val in t]
    
    df = pd.DataFrame({"Index": dates, "Value": y})
    df.set_index("Index", inplace=True)
    return df, fs

def test_fft_sine_wave(basic_fft_config):
    """Test FFT on a pure 5Hz sine wave."""
    freq = 5.0
    fs = 50.0 # 50 Hz sampling
    df, _ = create_sine_wave(freq=freq, duration=10.0, fs=fs)
    
    # Configure FFT
    basic_fft_config.fft.window_type = "hann"
    basic_fft_config.fft.detrend = "none" # pure sine, no trend
    
    response = generate_fft_data(df, basic_fft_config)
    
    # Verify response structure
    assert response.title == "Power Spectral Density (Test FFT)"
    assert len(response.series) == 1
    assert response.series[0].name == "Value"
    
    # Check Peaks
    # We expect a peak at 5 Hz
    freqs = [pt['x'] for pt in response.series[0].data]
    psd = [pt['y'] for pt in response.series[0].data]
    
    # Find max peak
    max_idx = np.argmax(psd)
    peak_freq = freqs[max_idx]
    
    assert peak_freq == pytest.approx(freq, abs=fs/len(freqs)) # Check within resolution
    
    # Check Annotations
    assert response.annotations is not None
    top_peak = response.annotations[0]
    # Plotly annotation uses 'x' and 'y'
    assert top_peak['x'] == pytest.approx(freq, abs=0.5)

def test_fft_irregular_sampling(basic_fft_config):
    """Test FFT handles irregular sampling by resampling."""
    # Create sine wave but remove random points to make it irregular
    freq = 2.0
    fs = 50.0
    df, _ = create_sine_wave(freq=freq, duration=10.0, fs=fs)
    
    # Drop 20% of points randomly
    np.random.seed(42)
    drop_indices = np.random.choice(df.index, int(len(df)*0.2), replace=False)
    df_irregular = df.drop(drop_indices).sort_index()
    
    response = generate_fft_data(df_irregular, basic_fft_config)
    
    freqs = [pt['x'] for pt in response.series[0].data]
    psd = [pt['y'] for pt in response.series[0].data]
    
    # Check if 2Hz is in the top peaks (might have some spectral leakage or DC)
    # Find indices of peaks
    peak_indices, _ = signal.find_peaks(psd)
    sorted_peak_indices = sorted(peak_indices, key=lambda i: psd[i], reverse=True)
    
    # Check top 3 peaks
    found_peak = False
    top_freqs = [freqs[i] for i in sorted_peak_indices[:3]]
    
    for idx in sorted_peak_indices[:3]:
         if freqs[idx] == pytest.approx(freq, abs=0.5):
             found_peak = True
             break
    
    assert found_peak, f"Did not find 2Hz peak in top 3. Top freqs: {top_freqs}"

def test_fft_nan_handling(basic_fft_config):
    """Test FFT handles NaNs via interpolation."""
    freq = 4.0
    fs = 40.0
    df, _ = create_sine_wave(freq=freq, duration=5.0, fs=fs)
    
    # Insert NaNs
    df.iloc[10:20, 0] = np.nan
    
    response = generate_fft_data(df, basic_fft_config)
    
    # Should not crash and find peak
    freqs = [pt['x'] for pt in response.series[0].data]
    psd = [pt['y'] for pt in response.series[0].data]
    
    max_idx = np.argmax(psd)
    peak_freq = freqs[max_idx]
    
    assert peak_freq == pytest.approx(freq, abs=0.5)

def test_fft_detrending(basic_fft_config):
    """Test that linear detrending removes DC/Trend component."""
    # Sine wave + Linear Trend
    t = np.linspace(0, 10, 500)
    y = np.sin(2 * np.pi * 5 * t) + 2 * t + 10 # 5Hz + Trend + Offset
    
    start_date = datetime(2023, 1, 1)
    dates = [start_date + timedelta(seconds=val) for val in t]
    df = pd.DataFrame({"Index": dates, "Value": y})
    df.set_index("Index", inplace=True)
    
    # With Detrending
    basic_fft_config.fft.detrend = "linear"
    response = generate_fft_data(df, basic_fft_config)
    
    freqs = [pt['x'] for pt in response.series[0].data]
    psd = [pt['y'] for pt in response.series[0].data]
    
    # DC component (0Hz) should be low
    if freqs[0] == 0:
        # Check against peak power. 
        # But if DC dominates, it means detrend failed.
        pass
    
    # Peak at 5Hz should be dominant
    max_idx = np.argmax(psd)
    assert freqs[max_idx] == pytest.approx(5.0, abs=0.5)

def test_fft_normalization(basic_fft_config):
    """Test normalization option."""
    freq = 10.0
    fs = 100.0
    df, _ = create_sine_wave(freq=freq, duration=2.0, fs=fs, amplitude=2.0)
    
    basic_fft_config.fft.normalize = True
    response = generate_fft_data(df, basic_fft_config)
    
    psd = [pt['y'] for pt in response.series[0].data]
    
    # Sum of normalized PSD (approx) should be related to 1 or similar convention.
    
    total_power = sum(psd)
    assert total_power == pytest.approx(1.0, 0.01)

def test_frequency_units(basic_fft_config):
    """Test CPM conversion."""
    freq_hz = 1.0 # 1 Hz = 60 CPM
    fs = 10.0
    df, _ = create_sine_wave(freq=freq_hz, duration=10.0, fs=fs)
    
    basic_fft_config.fft.frequency_unit = "cpm"
    response = generate_fft_data(df, basic_fft_config)
    
    x_label = response.x_label
    assert "CPM" in x_label
    
    freqs = [pt['x'] for pt in response.series[0].data]
    psd = [pt['y'] for pt in response.series[0].data]
    
    max_idx = np.argmax(psd)
    peak_freq = freqs[max_idx]
    
    assert peak_freq == pytest.approx(60.0, abs=5.0) # 1 Hz * 60 = 60 CPM
