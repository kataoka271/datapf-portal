# Stage 1: Build the React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY frontend/ ./frontend/
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
COPY pyproject.toml uv.lock ./
RUN uv sync -U --no-dev

# Copy backend source
COPY backend/ ./backend/

# Copy pre-built frontend into backend/static/ so FastAPI serves it
COPY --from=frontend-builder /app/backend/static/ ./backend/static/

# Copy Databricks Apps manifest
COPY app.yaml ./

ENV PATH="/app/.venv/bin:$PATH"
# backend/ uses "from backend.app.*" imports, so /app must be on PYTHONPATH
ENV PYTHONPATH="/app"

EXPOSE 8000

COPY databricks.yml ./

# Mirror app.yaml command; PORT falls back to 8000 for local runs
CMD ["uvicorn", "backend.app.main:app"]
