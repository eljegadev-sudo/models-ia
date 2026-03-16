"""
RunPod Serverless Handler para generacion de imagenes NSFW con Photonic Fusion SDXL.
Expone la misma API que photonic_server.py pero adaptada al formato de RunPod.
"""

from __future__ import annotations

import base64
import io
import os
import sys
import tempfile
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Compatibility patch: torch.xpu missing in some PyTorch builds (< 2.3).
# accelerate/diffusers/xformers call torch.xpu.* (is_available, empty_cache,
# synchronize, etc.). Provide a no-op stub for any unknown method.
# ---------------------------------------------------------------------------
import torch as _torch
if not hasattr(_torch, "xpu"):
    class _FakeXPU:
        def is_available(self) -> bool:
            return False
        def device_count(self) -> int:
            return 0
        def empty_cache(self) -> None:
            pass
        def synchronize(self, device=None) -> None:
            pass
        def __getattr__(self, name):
            def _noop(*args, **kwargs):
                return None
            return _noop
    _torch.xpu = _FakeXPU()  # type: ignore[attr-defined]

# ---------------------------------------------------------------------------
# Compatibility patch: torchvision >= 0.17 removed functional_tensor module.
# basicsr/gfpgan import from it. Provide a shim before any gfpgan import.
# ---------------------------------------------------------------------------
try:
    import torchvision.transforms.functional_tensor  # noqa: F401
except ImportError:
    import torchvision.transforms.functional as _tvtf
    sys.modules["torchvision.transforms.functional_tensor"] = _tvtf  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Compatibility patch: gfpgan uses cached_download which was removed in
# huggingface_hub >= 0.17.0. Patch it before any gfpgan import.
# ---------------------------------------------------------------------------
import huggingface_hub as _hf_hub
if not hasattr(_hf_hub, "cached_download"):
    import urllib.request as _urllib_req

    def _cached_download_compat(url: str, *args, **kwargs):
        """Minimal replacement: download URL to a temp file and return its path."""
        cache_dir = kwargs.get("cache_dir", tempfile.gettempdir())
        os.makedirs(cache_dir, exist_ok=True)
        filename = url.split("/")[-1].split("?")[0]
        dest = os.path.join(cache_dir, filename)
        if not os.path.exists(dest):
            print(f"[compat] Downloading {url} -> {dest}")
            _urllib_req.urlretrieve(url, dest)
        return dest

    _hf_hub.cached_download = _cached_download_compat

import runpod

# Agregar el directorio actual al path para importar generate_photonic
sys.path.insert(0, "/app")
import generate_photonic as gp

# ---------------------------------------------------------------------------
# Global model cache — loaded once per worker, reused across all requests.
# This avoids re-downloading and re-loading ~20 GB on every job.
# ---------------------------------------------------------------------------

_CACHE: dict = {
    "pipeline": None,       # StableDiffusionXLPipeline
    "vae": None,            # AutoencoderKL
    "ip_ckpt_plus": None,   # FaceID Plus v2 SDXL checkpoint path
    "ip_ckpt_basic": None,  # FaceID basic SDXL checkpoint path
}


def _ensure_pipeline():
    """Load SDXL pipeline + VAE into GPU once and cache globally."""
    if _CACHE["pipeline"] is not None:
        return _CACHE["pipeline"]

    from diffusers import StableDiffusionXLPipeline
    import torch

    print("[cache] Cargando pipeline SDXL (primera vez)...")
    vae = gp._load_vae()
    _CACHE["vae"] = vae

    snap = gp._get_local_snapshot_path(gp.MODEL_ID)
    if snap:
        print(f"[cache] Cargando desde snapshot local: {snap}")
        try:
            pipe = StableDiffusionXLPipeline.from_pretrained(
                snap, vae=vae, torch_dtype=torch.float16, use_safetensors=True
            )
        except Exception as e:
            print(f"[cache] Snapshot local falló ({e}), intentando repo ID...")
            pipe = StableDiffusionXLPipeline.from_pretrained(
                gp.MODEL_ID, vae=vae, torch_dtype=torch.float16, use_safetensors=True
            )
    else:
        print(f"[cache] Descargando desde repo: {gp.MODEL_ID}")
        pipe = StableDiffusionXLPipeline.from_pretrained(
            gp.MODEL_ID, vae=vae, torch_dtype=torch.float16, use_safetensors=True
        )

    gp._apply_scheduler(pipe)
    pipe.enable_model_cpu_offload()
    pipe.enable_vae_tiling()
    gp._try_xformers(pipe)

    _CACHE["pipeline"] = pipe
    print("[cache] Pipeline SDXL cargado y cacheado OK")
    return pipe


def _ensure_ip_ckpts():
    """Download FaceID checkpoints once and cache paths."""
    from huggingface_hub import hf_hub_download
    if _CACHE["ip_ckpt_plus"] is None:
        print("[cache] Descargando FaceID Plus checkpoint...")
        _CACHE["ip_ckpt_plus"] = hf_hub_download(repo_id=gp.FACEID_REPO, filename=gp.FACEID_BIN)
        print(f"[cache] ip_ckpt_plus: {_CACHE['ip_ckpt_plus']}")
    if _CACHE["ip_ckpt_basic"] is None:
        print("[cache] Descargando FaceID basic checkpoint...")
        _CACHE["ip_ckpt_basic"] = hf_hub_download(repo_id=gp.FACEID_REPO, filename="ip-adapter-faceid_sdxl.bin")
        print(f"[cache] ip_ckpt_basic: {_CACHE['ip_ckpt_basic']}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _image_to_base64(img) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", quality=95)
    return base64.b64encode(buf.getvalue()).decode()


def _decode_image_to_tempfile(b64: str, suffix: str = ".png") -> str:
    data = base64.b64decode(b64)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(data)
    tmp.close()
    return tmp.name


class _Args:
    """Simula argparse.Namespace para funciones de generate_photonic."""
    pass


# ---------------------------------------------------------------------------
# Modos de generacion
# ---------------------------------------------------------------------------


def _run_txt2img(args: _Args, t0: float) -> dict:
    import torch

    width, height, steps, guidance, negative = gp.resolve(args)
    prompt = f"{args.prompt}, {gp.SKIN_TAGS}"
    pipe = _ensure_pipeline()

    result = pipe(
        prompt=prompt,
        negative_prompt=negative,
        num_inference_steps=steps,
        guidance_scale=guidance,
        width=width,
        height=height,
        generator=gp.make_generator(args.seed),
    )
    img = result.images[0]
    torch.cuda.empty_cache()

    return {
        "image": _image_to_base64(img),
        "elapsed_seconds": round(time.time() - t0, 2),
    }


def _run_img2img(args: _Args, req: dict, t0: float) -> dict:
    from PIL import Image
    import torch

    width, height, steps, guidance, negative = gp.resolve(args)
    prompt = f"{args.prompt}, {gp.SKIN_TAGS}"

    ref_path = _decode_image_to_tempfile(req["ref_image"])
    init_image = Image.open(ref_path).convert("RGB").resize((width, height), Image.LANCZOS)

    pipe = _ensure_pipeline()

    result = pipe(
        prompt=prompt,
        negative_prompt=negative,
        image=init_image,
        strength=req.get("strength", 0.65),
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=gp.make_generator(args.seed),
    )
    img = result.images[0]

    torch.cuda.empty_cache()
    Path(ref_path).unlink(missing_ok=True)

    return {
        "image": _image_to_base64(img),
        "elapsed_seconds": round(time.time() - t0, 2),
    }


def _run_faceid(args: _Args, req: dict, t0: float) -> dict:
    from ip_adapter.ip_adapter_faceid import IPAdapterFaceIDPlusXL
    import torch

    width, height, steps, guidance, negative = gp.resolve(args)
    if args.guidance is None:
        guidance = 5.5

    prompt = args.prompt
    face_quality = "beautiful detailed face, natural skin texture, sharp facial features"
    if face_quality.split(",")[0].strip() not in prompt.lower():
        prompt = f"{prompt}, {face_quality}"
    prompt = f"{prompt}, {gp.SKIN_TAGS}"

    ref_path = _decode_image_to_tempfile(req["ref_image"])
    faceid_embeds, face_crop = gp.extract_face_embedding(ref_path)

    # Usar pipeline cacheado (evita recargar ~15 GB en cada request)
    _ensure_ip_ckpts()
    ip_ckpt = _CACHE["ip_ckpt_plus"]
    pipe = _ensure_pipeline()

    # Intentar FaceID Plus (con CLIP image encoder para mayor fidelidad facial)
    # Si el CLIP encoder falla, caer a FaceID no-plus (solo embedding facial)
    _use_plus = True
    try:
        print(f"[faceid] Cargando CLIP encoder: {gp.CLIP_ENCODER}")
        ip_model = IPAdapterFaceIDPlusXL(pipe, gp.CLIP_ENCODER, ip_ckpt, "cuda")
        print(f"[faceid] CLIP encoder cargado OK")
    except Exception as _clip_err:
        print(f"[faceid] CLIP encoder falló ({_clip_err}), usando FaceID no-plus")
        from ip_adapter.ip_adapter_faceid import IPAdapterFaceIDXL
        ip_model = IPAdapterFaceIDXL(pipe, _CACHE["ip_ckpt_basic"], "cuda")
        _use_plus = False

    ip_model.set_scale(req.get("face_strength", 0.4))

    if _use_plus:
        image_prompt_embeds, uncond_image_prompt_embeds = ip_model.get_image_embeds(
            faceid_embeds, face_crop, req.get("s_scale", 4.5), shortcut=True,
        )
        ip_model.image_encoder.to("cpu")
    else:
        image_prompt_embeds, uncond_image_prompt_embeds = ip_model.get_image_embeds(faceid_embeds)

    torch.cuda.empty_cache()

    with torch.inference_mode():
        (
            prompt_embeds,
            negative_prompt_embeds,
            pooled_prompt_embeds,
            negative_pooled_prompt_embeds,
        ) = ip_model.pipe.encode_prompt(
            [prompt],
            num_images_per_prompt=1,
            do_classifier_free_guidance=True,
            negative_prompt=[negative],
        )
        prompt_embeds = torch.cat([prompt_embeds, image_prompt_embeds], dim=1)
        negative_prompt_embeds = torch.cat(
            [negative_prompt_embeds, uncond_image_prompt_embeds], dim=1,
        )

    ip_model.pipe.text_encoder.to("cpu")
    ip_model.pipe.text_encoder_2.to("cpu")
    ip_model.pipe.text_encoder = None
    ip_model.pipe.text_encoder_2 = None
    torch.cuda.empty_cache()

    seed = args.seed if args.seed is not None else 42
    generator = torch.Generator(device="cpu").manual_seed(seed)

    images = ip_model.pipe(
        prompt_embeds=prompt_embeds,
        negative_prompt_embeds=negative_prompt_embeds,
        pooled_prompt_embeds=pooled_prompt_embeds,
        negative_pooled_prompt_embeds=negative_pooled_prompt_embeds,
        num_inference_steps=steps,
        generator=generator,
        guidance_scale=guidance,
        width=width,
        height=height,
    ).images

    raw_image = images[0]
    raw_b64 = _image_to_base64(raw_image)

    del ip_model, pipe
    torch.cuda.empty_cache()

    if req.get("faceswap", True):
        final_image = gp.face_swap_and_restore(
            raw_image,
            ref_path,
            fidelity=req.get("fidelity", 0.5),
            do_restore=req.get("restore", True),
        )
        result_b64 = _image_to_base64(final_image)
    else:
        result_b64 = raw_b64
        raw_b64 = None

    Path(ref_path).unlink(missing_ok=True)

    return {
        "image": result_b64,
        "raw_image": raw_b64,
        "elapsed_seconds": round(time.time() - t0, 2),
    }


# ---------------------------------------------------------------------------
# RunPod handler principal
# ---------------------------------------------------------------------------


def handler(job: dict) -> dict:
    t0 = time.time()
    inp = job.get("input", {})

    prompt = inp.get("prompt", "")
    mode = inp.get("mode", "faceid")

    args = _Args()
    args.prompt = prompt
    args.negative_prompt = inp.get("negative_prompt")
    args.width = inp.get("width", 1024)
    args.height = inp.get("height", 1024)
    args.steps = inp.get("steps", 35)
    args.guidance = inp.get("guidance", 5.5)
    args.seed = inp.get("seed")
    args.output = "api_output.png"

    try:
        if mode == "diagnose":
            # Modo diagnostico: retorna info del cache + source code relevante
            import inspect
            diag = gp.diagnose_model_cache(gp.MODEL_ID)
            diag["vae_cache"] = gp.diagnose_model_cache(gp.VAE_ID)
            try:
                from diffusers.utils import hub_utils
                diag["hub_utils_get_model_file_src"] = inspect.getsource(hub_utils._get_model_file)
            except Exception as e:
                diag["hub_utils_src_error"] = str(e)
            try:
                from diffusers.models import modeling_utils
                src = inspect.getsource(modeling_utils.ModelMixin.from_pretrained)
                # Solo primeras 3000 chars para no exceder el output
                diag["modeling_utils_from_pretrained_src"] = src[:3000]
            except Exception as e:
                diag["modeling_utils_src_error"] = str(e)
            return {"diagnose": diag}
        elif mode == "txt2img":
            return _run_txt2img(args, t0)
        elif mode == "img2img":
            if not inp.get("ref_image"):
                return {"error": "ref_image is required for img2img mode"}
            return _run_img2img(args, inp, t0)
        elif mode == "faceid":
            if not inp.get("ref_image"):
                return {"error": "ref_image is required for faceid mode"}
            return _run_faceid(args, inp, t0)
        else:
            return {"error": f"Unknown mode: {mode}"}
    except Exception as e:
        print(f"[handler] ERROR: {e}", flush=True)
        return {"error": str(e)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
