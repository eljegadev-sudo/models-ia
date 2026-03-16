# syntax=docker/dockerfile:1
# RunPod Serverless Worker - Photonic Fusion SDXL NSFW Generator
# Base: RunPod PyTorch 2.2.1 + CUDA 12.1 + Python 3.10 (stable, proven)

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

# Force numpy 1.26.4 — torch 2.2.1 uses numpy 1.x C API
RUN pip install --force-reinstall --no-cache-dir "numpy==1.26.4"

# Patch huggingface_hub.cached_download via sitecustomize.py
RUN python3 -c "\
import site, os; \
patch = '''\ntry:\n    import huggingface_hub as _hf\n    if not hasattr(_hf, \"cached_download\"):\n        import urllib.request as _r, tempfile as _t\n        def _cd(url, *a, **kw):\n            d = kw.get(\"cache_dir\", _t.gettempdir()); os.makedirs(d, exist_ok=True)\n            f = os.path.join(d, url.split(\"/\")[-1].split(\"?\")[0])\n            if not os.path.exists(f): _r.urlretrieve(url, f)\n            return f\n        _hf.cached_download = _cd\nexcept Exception: pass\n'''; \
[open(os.path.join(p, 'sitecustomize.py'), 'w').write(patch) or print('Patched', p) for p in site.getsitepackages() if os.access(p, os.W_OK)][:1] \
"

# Copy worker code
COPY handler.py .
COPY generate_photonic.py .

# Fallback cache dirs (used when no network volume is mounted)
ENV HF_HOME=/tmp/hf_cache
ENV CHECKPOINTS_DIR=/tmp/checkpoints

RUN mkdir -p /tmp/hf_cache /tmp/checkpoints

CMD ["python", "-u", "handler.py"]
