# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts

COPY frontend/ ./
RUN npm run build

# Stage 2: Run the app (simulates Databricks Apps runtime)
FROM python:3.11-slim

WORKDIR /app

# Install Databricks CLI
RUN apt-get update && apt-get install -y curl unzip && apt-get clean && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install Python dependencies (no dev extras)
COPY backend/pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy backend source
COPY backend/src/ ./src/
RUN uv pip install --system --no-cache -e .

# Copy pre-built frontend into backend/static/ so FastAPI serves it
COPY --from=frontend-builder /app/dist/ ./src/backend/static/

# Copy Databricks Apps manifest
COPY app.yaml ./

EXPOSE 8000

COPY databricks.yml ./

# Mirror app.yaml command; PORT falls back to 8000 for local runs
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
