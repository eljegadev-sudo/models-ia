# syntax=docker/dockerfile:1
# RunPod Serverless Worker - Photonic Fusion SDXL NSFW Generator
# Base: RunPod PyTorch image with CUDA 12.1 + Python 3.10

FROM runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app

# System dependencies for OpenCV, insightface, GFPGAN
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
        libgl1-mesa-glx \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        git \
        wget \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker code
COPY handler.py .
COPY generate_photonic.py .

# Model cache goes to the RunPod network volume (persistent storage)
ENV HF_HOME=/runpod-volume/hf_cache
ENV CHECKPOINTS_DIR=/runpod-volume/checkpoints

# Ensure cache directories exist at startup
RUN mkdir -p /runpod-volume/hf_cache /runpod-volume/checkpoints

CMD ["python", "-u", "handler.py"]
