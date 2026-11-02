# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd --create-home --uid 10001 app && mkdir -p /app/data && chown -R app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost:8000/api/health || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

# GPU worker image (optional): docker build --target gpu -t motorworld-gpu backend/
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04 AS gpu
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends python3.11 python3-pip ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3.11 /usr/bin/python
WORKDIR /app
COPY requirements.txt requirements-gpu.txt ./
RUN python -m pip install -r requirements-gpu.txt
COPY . .
ENV LOCAL_DIFFUSERS_ENABLED=true
CMD ["arq", "app.worker.GpuWorker"]
