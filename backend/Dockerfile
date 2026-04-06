# --- Stage 1: Build Frontend ---
FROM node:20-alpine as frontend_build

WORKDIR /frontend_build

# Copy frontend source
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ .
RUN npm run build


# --- Stage 2: Production Backend & Serve ---
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy built frontend assets from Stage 1
# app/main.py looks for "../../frontend/dist" relative to itself.
# Since app/main.py is at /app/app/main.py, it looks at /frontend/dist.
COPY --from=frontend_build /frontend_build/dist /frontend/dist

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
