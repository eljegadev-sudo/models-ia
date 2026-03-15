"""
Generador de imagenes NSFW explicitas con Photonic Fusion SDXL.
Modos: text-to-image, image-to-image, faceid (preservacion de identidad facial).
Modelo base: Photonic Fusion SDXL + IP-Adapter FaceID.
Optimizado para textura de piel hiperrealista y anatomia explicita.
"""

from __future__ import annotations

import os
from pathlib import Path

HF_HOME_DEFAULT = os.environ.get("HF_HOME", "/runpod-volume/hf_cache")
os.environ.setdefault("HF_HOME", HF_HOME_DEFAULT)

import torch
from PIL import Image

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------

MODEL_ID = "stablediffusionapi/photonic-fusion-sdxl"
VAE_ID = "madebyollin/sdxl-vae-fp16-fix"

FACEID_REPO = "h94/IP-Adapter-FaceID"
FACEID_BIN = "ip-adapter-faceid-plusv2_sdxl.bin"
CLIP_ENCODER = "laion/CLIP-ViT-H-14-laion2B-s32B-b79K"

CHECKPOINTS_DIR = Path(os.environ.get("CHECKPOINTS_DIR", "/runpod-volume/checkpoints"))
INSWAPPER_URL = "https://huggingface.co/thebiglaskowski/inswapper_128.onnx/resolve/main/inswapper_128.onnx"
INSWAPPER_PATH = CHECKPOINTS_DIR / "inswapper_128.onnx"
GFPGAN_URL = "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth"
GFPGAN_PATH = CHECKPOINTS_DIR / "GFPGANv1.4.pth"

DEFAULTS = {
    "width": 1024,
    "height": 1024,
    "steps": 35,
    "guidance": 5.5,
}

DEFAULT_NEGATIVE = (
    "(worst quality, low quality, normal quality:1.4), blurry, deformed, ugly, "
    "bad anatomy, disfigured, poorly drawn face, poorly drawn hands, poorly drawn feet, "
    "(deformed face, distorted face, bad face, ugly face, asymmetric face:1.3), "
    "mutation, mutated, extra limbs, extra fingers, missing fingers, "
    "fused fingers, too many fingers, long neck, malformed limbs, "
    "disproportionate body, bad proportions, gross proportions, "
    "merged limbs, extra digits, fewer digits, "
    "distorted body proportions, cropped head, "
    "watermark, text, signature, jpeg artifacts, cropped, duplicate, "
    "cloned face, worst face, extra arms, extra legs, "
    "clothing, dressed, clothed, underwear, bra, panties, "
    "censored, mosaic, censor bar, pixelated genitals, covered, hidden, obscured, "
    "(smooth skin, plastic skin, airbrushed skin, blurry skin, wax skin, cgi skin:1.2)"
)

SKIN_TAGS = (
    "skin pores, skin texture, natural skin imperfections, "
    "subsurface scattering, detailed skin, goosebumps"
)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def resolve(args):
    width = args.width or DEFAULTS["width"]
    height = args.height or DEFAULTS["height"]
    steps = args.steps or DEFAULTS["steps"]
    guidance = args.guidance if args.guidance is not None else DEFAULTS["guidance"]
    negative = args.negative_prompt or DEFAULT_NEGATIVE
    return width, height, steps, guidance, negative


def make_generator(seed: int | None) -> torch.Generator:
    gen = torch.Generator(device="cpu")
    if seed is not None:
        gen.manual_seed(seed)
    else:
        gen.seed()
    return gen


# ---------------------------------------------------------------------------
# Pipeline loader (Photonic Fusion SDXL)
# ---------------------------------------------------------------------------


def _apply_scheduler(pipe):
    from diffusers import DPMSolverMultistepScheduler

    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config,
        algorithm_type="sde-dpmsolver++",
        use_karras_sigmas=True,
    )


def _try_xformers(pipe):
    try:
        pipe.enable_xformers_memory_efficient_attention()
        print("  [opt] xformers habilitado")
        return True
    except Exception:
        pipe.enable_attention_slicing()
        return False


def _load_vae():
    from diffusers import AutoencoderKL

    print(f"[vae] Cargando VAE mejorado: {VAE_ID} ...")
    for kwargs in [{"use_safetensors": True}, {"use_safetensors": True, "variant": "fp16"}, {}]:
        try:
            vae = AutoencoderKL.from_pretrained(VAE_ID, torch_dtype=torch.float16, **kwargs)
            print(f"  [vae] OK con {kwargs}")
            return vae
        except Exception as e:
            print(f"  [vae] intento {kwargs} fallido: {e}")
    raise RuntimeError(f"No se pudo cargar VAE: {VAE_ID}")


def load_pipeline(pipeline_cls):
    """Carga Photonic Fusion SDXL con VAE mejorado + cpu_offload."""
    vae = _load_vae()
    print(f"[modelo] Cargando {MODEL_ID} ...")
    # Intentar diferentes configuraciones de safetensors para compatibilidad maxima
    for kwargs in [
        {"use_safetensors": True},
        {"use_safetensors": True, "variant": "fp16"},
        {},
    ]:
        try:
            pipe = pipeline_cls.from_pretrained(
                MODEL_ID,
                vae=vae,
                torch_dtype=torch.float16,
                **kwargs,
            )
            print(f"  [modelo] OK con {kwargs}")
            break
        except Exception as e:
            print(f"  [modelo] intento {kwargs} fallido: {e}")
    else:
        raise RuntimeError(f"No se pudo cargar el modelo: {MODEL_ID}")

    _apply_scheduler(pipe)
    pipe.enable_model_cpu_offload()
    pipe.enable_vae_tiling()
    _try_xformers(pipe)
    return pipe


# ---------------------------------------------------------------------------
# Face extraction
# ---------------------------------------------------------------------------


def extract_face_embedding(image_path: str) -> tuple[torch.Tensor, Image.Image]:
    """Extrae embedding facial + crop de la cara para IP-Adapter FaceID Plus."""
    import cv2
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    app.prepare(ctx_id=0, det_size=(640, 640))

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"No se pudo leer la imagen: {image_path}")

    faces = app.get(img)
    if not faces:
        raise RuntimeError(f"No se detecto ninguna cara en: {image_path}")

    print(f"  Caras detectadas: {len(faces)} (usando la de mayor tamano)")
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    embedding = torch.from_numpy(best.normed_embedding).unsqueeze(0)

    x1, y1, x2, y2 = [int(v) for v in best.bbox]
    h, w = img.shape[:2]
    pad_w, pad_h = int((x2 - x1) * 0.3), int((y2 - y1) * 0.3)
    x1, y1 = max(0, x1 - pad_w), max(0, y1 - pad_h)
    x2, y2 = min(w, x2 + pad_w), min(h, y2 + pad_h)
    face_crop = Image.fromarray(cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2RGB))

    return embedding, face_crop


# ---------------------------------------------------------------------------
# Face swap + restoration (post-proceso para mejorar rostro)
# ---------------------------------------------------------------------------


def _ensure_model(path: Path, url: str, name: str):
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"  [download] Descargando {name} ...")
    import urllib.request
    urllib.request.urlretrieve(url, str(path))
    print(f"  [download] OK -> {path}")


def face_swap_and_restore(
    generated_img: Image.Image,
    ref_image_path: str,
    fidelity: float = 0.5,
    do_restore: bool = True,
) -> Image.Image:
    """Swap the face from ref_image onto generated_img, then restore with GFPGAN."""
    import cv2
    import numpy as np
    import insightface
    from insightface.app import FaceAnalysis

    _ensure_model(INSWAPPER_PATH, INSWAPPER_URL, "inswapper_128.onnx (~554 MB)")

    print("[faceswap] Cargando face analyser...")
    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    app.prepare(ctx_id=0, det_size=(640, 640))

    source_cv = cv2.imread(str(ref_image_path))
    target_cv = cv2.cvtColor(np.array(generated_img), cv2.COLOR_RGB2BGR)

    source_faces = app.get(source_cv)
    target_faces = app.get(target_cv)

    if not source_faces:
        print("[faceswap] No se detecto cara en la referencia, saltando swap")
        return generated_img
    if not target_faces:
        print("[faceswap] No se detecto cara en la imagen generada, saltando swap")
        return generated_img

    source_face = max(source_faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    target_face = max(target_faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    print(f"[faceswap] Intercambiando cara (source score: {source_face.det_score:.2f}, target score: {target_face.det_score:.2f})")
    swapper = insightface.model_zoo.get_model(
        str(INSWAPPER_PATH),
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    result_cv = swapper.get(target_cv, target_face, source_face, paste_back=True)

    if do_restore:
        _ensure_model(GFPGAN_PATH, GFPGAN_URL, "GFPGANv1.4.pth (~350 MB)")
        print(f"[faceswap] Restaurando rostro (GFPGAN, fidelity={fidelity})...")
        from gfpgan import GFPGANer
        restorer = GFPGANer(
            model_path=str(GFPGAN_PATH),
            upscale=1,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=None,
        )
        _, _, result_cv = restorer.enhance(
            result_cv, has_aligned=False, only_center_face=False,
            paste_back=True, weight=fidelity,
        )

    result_rgb = cv2.cvtColor(result_cv, cv2.COLOR_BGR2RGB)
    return Image.fromarray(result_rgb)
