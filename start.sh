#!/bin/bash

# FlowMeter - Quick Start Script
# This script sets up and runs both backend and frontend

set -e

echo "🏭 FlowMeter - Quick Start"
echo "================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    exit 1
fi

echo -e "${BLUE}📦 Setting up Backend...${NC}"
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -q -r requirements.txt

# Copy .env if not exists
if [ ! -f ".env" ]; then
    cp .env.example .env
fi

echo -e "${GREEN}✅ Backend ready${NC}"

# Start backend in background
echo -e "${BLUE}🚀 Starting Backend on http://localhost:8000${NC}"
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

cd ../frontend

echo -e "${BLUE}📦 Setting up Frontend...${NC}"

# Install dependencies
npm install --silent

echo -e "${GREEN}✅ Frontend ready${NC}"

# Start frontend
echo -e "${BLUE}🚀 Starting Frontend on http://localhost:3000${NC}"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}🎉 FlowMeter is running!${NC}"
echo ""
echo "  📊 Frontend: http://localhost:3000"
echo "  📡 Backend:  http://localhost:8000"
echo "  📚 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo -e "${GREEN}================================${NC}"

# Wait for interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait
