# syntax=docker/dockerfile:1
# RunPod Serverless Worker - Photonic Fusion SDXL NSFW Generator
# Base: RunPod PyTorch 2.4 + CUDA 12.4 + Python 3.11
# PyTorch 2.4 required by diffusers>=0.30 (torch.distributed.device_mesh)

FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

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

# Remove xformers bundled with base image — it was compiled for an older
# PyTorch and its torch.library.infer_schema calls break diffusers>=0.30
# imports on PyTorch 2.4. Our code enables it optionally via _try_xformers().
RUN pip uninstall -y xformers || true

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --force-reinstall --no-cache-dir "numpy==1.26.4" && \
    pip install --no-cache-dir "xformers>=0.0.28" || echo "xformers optional install skipped"

# Patch huggingface_hub.cached_download via sitecustomize.py so it runs at
# Python startup (before any import), fixing gfpgan compatibility with
# huggingface_hub >= 0.17.0 which removed cached_download.
RUN python3 -c "\
import site, os; \
patch = '''\ntry:\n    import huggingface_hub as _hf\n    if not hasattr(_hf, \"cached_download\"):\n        import urllib.request as _r, tempfile as _t\n        def _cd(url, *a, **kw):\n            d = kw.get(\"cache_dir\", _t.gettempdir()); os.makedirs(d, exist_ok=True)\n            f = os.path.join(d, url.split(\"/\")[-1].split(\"?\")[0])\n            if not os.path.exists(f): _r.urlretrieve(url, f)\n            return f\n        _hf.cached_download = _cd\nexcept Exception: pass\n'''; \
[open(os.path.join(p, 'sitecustomize.py'), 'w').write(patch) or print('Patched', p) for p in site.getsitepackages() if os.access(p, os.W_OK)][:1] \
"

# Copy worker code
COPY handler.py .
COPY generate_photonic.py .

# Model cache goes to the RunPod network volume (persistent storage)
ENV HF_HOME=/runpod-volume/hf_cache
ENV CHECKPOINTS_DIR=/runpod-volume/checkpoints

# Ensure cache directories exist at startup
RUN mkdir -p /runpod-volume/hf_cache /runpod-volume/checkpoints

CMD ["python", "-u", "handler.py"]
