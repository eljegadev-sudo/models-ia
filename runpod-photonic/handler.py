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
    from diffusers import StableDiffusionXLPipeline
    import torch

    width, height, steps, guidance, negative = gp.resolve(args)
    prompt = f"{args.prompt}, {gp.SKIN_TAGS}"
    pipe = gp.load_pipeline(StableDiffusionXLPipeline)

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

    del pipe
    torch.cuda.empty_cache()

    return {
        "image": _image_to_base64(img),
        "elapsed_seconds": round(time.time() - t0, 2),
    }


def _run_img2img(args: _Args, req: dict, t0: float) -> dict:
    from diffusers import StableDiffusionXLImg2ImgPipeline
    from PIL import Image
    import torch

    width, height, steps, guidance, negative = gp.resolve(args)
    prompt = f"{args.prompt}, {gp.SKIN_TAGS}"

    ref_path = _decode_image_to_tempfile(req["ref_image"])
    init_image = Image.open(ref_path).convert("RGB").resize((width, height), Image.LANCZOS)

    pipe = gp.load_pipeline(StableDiffusionXLImg2ImgPipeline)

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

    del pipe
    torch.cuda.empty_cache()
    Path(ref_path).unlink(missing_ok=True)

    return {
        "image": _image_to_base64(img),
        "elapsed_seconds": round(time.time() - t0, 2),
    }


def _run_faceid(args: _Args, req: dict, t0: float) -> dict:
    from diffusers import StableDiffusionXLPipeline
    from huggingface_hub import hf_hub_download
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

    ip_ckpt = hf_hub_download(repo_id=gp.FACEID_REPO, filename=gp.FACEID_BIN)

    gp._verify_and_clean_model_cache(gp.MODEL_ID)
    vae = gp._load_vae()

    def _load_faceid_pipe(_vae):
        _errors = []
        # Probar primero desde ruta local (evita bug sharded safetensors en diffusers)
        _local = gp._get_local_snapshot_path(gp.MODEL_ID)
        _sources = [_local] if _local else []
        _sources.append(gp.MODEL_ID)
        for _src in _sources:
            for _kwargs in [{"use_safetensors": True}, {}]:
                try:
                    p = StableDiffusionXLPipeline.from_pretrained(
                        _src, vae=_vae, torch_dtype=torch.float16, **_kwargs,
                    )
                    print(f"  [faceid pipe] OK: src={_src}, kwargs={_kwargs}")
                    return p
                except Exception as _e:
                    _errors.append(f"src={_src},kwargs={_kwargs}: {_e}")
        raise RuntimeError("\n".join(_errors))

    try:
        pipe = _load_faceid_pipe(vae)
    except RuntimeError as _fe:
        print(f"[faceid] Primer intento fallido, limpieza nuclear y reintento...\n{_fe}")
        gp._nuclear_clean_model_cache(gp.MODEL_ID)
        vae = gp._load_vae()
        pipe = _load_faceid_pipe(vae)
    gp._apply_scheduler(pipe)
    pipe.enable_vae_tiling()
    gp._try_xformers(pipe)

    ip_model = IPAdapterFaceIDPlusXL(pipe, gp.CLIP_ENCODER, ip_ckpt, "cuda")
    ip_model.set_scale(req.get("face_strength", 0.4))

    image_prompt_embeds, uncond_image_prompt_embeds = ip_model.get_image_embeds(
        faceid_embeds, face_crop, req.get("s_scale", 4.5), shortcut=True,
    )

    ip_model.image_encoder.to("cpu")
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
