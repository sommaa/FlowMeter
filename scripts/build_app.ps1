$ErrorActionPreference = "Stop"

# Navigate to project root (parent of scripts/)
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "🏭 FlowMeter - Automated Build Script" -ForegroundColor Green
Write-Host "========================================"

# Check prerequisites
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Node.js is required but not installed."
    exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Python is required but not installed."
    exit 1
}

# --- 1. Frontend Build ---
Write-Host "`n📦 Building Frontend..." -ForegroundColor Cyan
Set-Location frontend

# Install Dependencies
Write-Host "  Installing dependencies..."
npm install --silent

# Generate Icon (SVG -> PNG) using sharp (temporary)
if (Test-Path "../backend/icon.png") { Remove-Item "../backend/icon.png" -Force }
if (Test-Path "../backend/icon.ico") { Remove-Item "../backend/icon.ico" -Force }

Write-Host "  Generating icon from logo_background.svg..."
if (Test-Path "public/logo_background.svg") {
    # Install sharp temporarily if not present
    if (-not (Test-Path "node_modules/sharp")) {
        Write-Host "  Installing sharp for icon conversion..."
        npm install sharp --no-save --silent
    }

    # Convert SVG to PNG using Node
    $iconScript = @"
const sharp = require('sharp');
const fs = require('fs');

sharp('public/logo_background.svg')
  .resize(256, 256, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png()
  .toFile('../backend/icon.png')
  .then(info => { console.log('✅ Icon converted to PNG'); })
  .catch(err => { console.error('❌ Icon conversion failed:', err); process.exit(1); });
"@
    node -e $iconScript
}
else {
    Write-Warning "⚠️ logo_background.svg not found in frontend/public. Skipping icon generation."
}

# Build React App
Write-Host "  Running Vite build..."
npm run build

if (-not $?) {
    Write-Error "❌ Frontend build failed."
    exit 1
}

Set-Location ..

# --- 2. Backend Build ---
Write-Host "`n📦 Building Backend..." -ForegroundColor Cyan
Set-Location backend

# Create/Activate Venv
if (-not (Test-Path "venv")) {
    Write-Host "  Creating virtual environment..."
    python -m venv venv
}

# Activate Venv (PowerShell)
$venvPath = "venv\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    . $venvPath
}
else {
    Write-Error "❌ Virtual environment activation script not found."
    exit 1
}

# Install Dependencies
Write-Host "  Installing Python dependencies..."
pip install -q -r requirements.txt

# Convert PNG to ICO using Python (Pillow is dependent of matplotlib)
if (Test-Path "icon.png") {
    Write-Host "  Converting PNG to ICO..."
    $pyScript = @"
from PIL import Image
try:
    img = Image.open('icon.png').convert("RGBA")
    img.save('icon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('✅ Icon converted to ICO')
except Exception as e:
    print(f'❌ Icon conversion failed: {e}')
"@
    python -c $pyScript
}
else {
    Write-Warning "⚠️ icon.png not found. Skipping ICO conversion."
}

# Build with PyInstaller
Write-Host "  Running PyInstaller..."
# Ensure PyInstaller is installed
pip install -q pyinstaller

# Run Docker-like build (but local)
pyinstaller --clean --noconfirm build_windows.spec

if (-not $?) {
    Write-Error "❌ Backend build failed."
    exit 1
}

Write-Host "`n🎉 Build Complete!" -ForegroundColor Green
Write-Host "Executable location: backend/dist/FlowMeter.exe"
