#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "🚀 Starting Build Process..."

# 1. Build Frontend
echo "📦 Building Frontend..."
cd frontend
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi
cd ..

# 2. Build Backend / Executable
echo "🐍 Building Backend (FlowMeter)..."
cd backend
if [ ! -d "venv" ]; then
    echo "Creating python virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Running PyInstaller..."
pyinstaller build_linux.spec --clean

# 3. Cleanup and Info
echo "✅ Build Complete!"
echo "----------------------------------------"
echo "Executable location: backend/dist/FlowMeter"
echo "To run: ./backend/dist/FlowMeter"
echo "----------------------------------------"
