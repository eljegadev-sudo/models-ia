"""
Generador de imagenes NSFW explicitas con Photonic Fusion SDXL.
Modos: text-to-image, image-to-image, faceid (preservacion de identidad facial).
Modelo base: Photonic Fusion SDXL + IP-Adapter FaceID.
Optimizado para textura de piel hiperrealista y anatomia explicita.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

HF_HOME_DEFAULT = os.environ.get("HF_HOME", "/runpod-volume/hf_cache")
os.environ.setdefault("HF_HOME", HF_HOME_DEFAULT)

import torch
from PIL import Image


# ---------------------------------------------------------------------------
# Cache utilities
# ---------------------------------------------------------------------------


def _repo_to_dir_name(repo_id: str) -> str:
    """Convert 'owner/model' to 'models--owner--model' HF cache dir format."""
    return "models--" + repo_id.replace("/", "--")


# Tamaño minimo esperado para shards del UNet SDXL (~3.5 GB cada uno)
_MIN_SHARD_BYTES = 500 * 1024 * 1024  # 500 MB (conservador)


def _verify_and_clean_model_cache(repo_id: str) -> bool:
    """
    Verifica que el cache del modelo tiene archivos validos.
    Limpia snapshots con shards incompletos (archivos demasiado pequenos).
    Retorna True si el cache esta limpio o no existe.
    """
    hf_cache = Path(os.environ.get("HF_HOME", "/runpod-volume/hf_cache"))
    model_dir = hf_cache / "hub" / _repo_to_dir_name(repo_id)

    if not model_dir.exists():
        print(f"[cache] Modelo no cacheado aun: {repo_id}")
        return True

    snapshots_dir = model_dir / "snapshots"
    if not snapshots_dir.exists():
        return True

    cleaned = False
    for snap_dir in snapshots_dir.iterdir():
        if not snap_dir.is_dir():
            continue
        unet_dir = snap_dir / "unet"
        if not unet_dir.exists():
            print(f"[cache] Snapshot sin directorio unet/, limpiando: {snap_dir.name}")
            shutil.rmtree(str(snap_dir), ignore_errors=True)
            cleaned = True
            continue

        files = [f for f in unet_dir.iterdir() if f.is_file()]
        # Verificar archivos safetensors con tamaño minimo valido
        valid_st = [f for f in files if f.suffix == ".safetensors" and f.stat().st_size >= _MIN_SHARD_BYTES]
        total_size_mb = sum(f.stat().st_size for f in files) / (1024 * 1024)

        print(f"[cache] Snapshot {snap_dir.name}: {len(files)} archivos en unet/, "
              f"{len(valid_st)} safetensors validos, {total_size_mb:.0f} MB total")

        if len(valid_st) == 0:
            print(f"[cache] Sin safetensors validos, limpiando snapshot: {snap_dir.name}")
            shutil.rmtree(str(snap_dir), ignore_errors=True)
            cleaned = True

    return not cleaned


def _nuclear_clean_model_cache(repo_id: str) -> None:
    """Elimina todo el cache del modelo para forzar re-descarga limpia."""
    hf_cache = Path(os.environ.get("HF_HOME", "/runpod-volume/hf_cache"))
    model_dir = hf_cache / "hub" / _repo_to_dir_name(repo_id)
    if model_dir.exists():
        print(f"[cache] NUCLEAR CLEAN: eliminando {model_dir}")
        try:
            shutil.rmtree(str(model_dir))
            print(f"[cache] Eliminado OK, se descargara de nuevo (~7 GB, ~15 min)")
        except Exception as e:
            print(f"[cache] ERROR en shutil.rmtree: {e}. Intento file-by-file...")
            for f in sorted(model_dir.rglob("*"), reverse=True):
                try:
                    if f.is_symlink() or f.is_file():
                        f.unlink()
                    elif f.is_dir():
                        f.rmdir()
                except Exception as fe:
                    print(f"[cache]  skip {f}: {fe}")
    else:
        print(f"[cache] No hay cache que limpiar para {repo_id}")


def diagnose_model_cache(repo_id: str) -> dict:
    """Retorna diagnostico detallado del cache del modelo."""
    hf_cache = Path(os.environ.get("HF_HOME", "/runpod-volume/hf_cache"))
    model_dir = hf_cache / "hub" / _repo_to_dir_name(repo_id)
    result: dict = {
        "hf_home": str(hf_cache),
        "model_dir": str(model_dir),
        "exists": model_dir.exists(),
        "snapshots": {},
    }
    if not model_dir.exists():
        return result
    snapshots_dir = model_dir / "snapshots"
    if not snapshots_dir.exists():
        return result
    for snap in snapshots_dir.iterdir():
        if not snap.is_dir():
            continue
        snap_files: dict = {}
        for sub in ["unet", "vae", "text_encoder", "text_encoder_2", "."]:
            sub_dir = snap if sub == "." else snap / sub
            if not sub_dir.exists():
                continue
            for f in sub_dir.iterdir():
                if not f.is_file() and not f.is_symlink():
                    continue
                size_mb = 0
                real_exists = False
                try:
                    size_mb = round(f.stat().st_size / 1024 / 1024, 1)
                    real_exists = True
                except Exception:
                    pass
                snap_files[f"{sub}/{f.name}"] = {
                    "size_mb": size_mb,
                    "is_symlink": f.is_symlink(),
                    "real_exists": real_exists,
                }
        result["snapshots"][snap.name] = snap_files
    return result

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


def _get_local_snapshot_path(repo_id: str) -> str | None:
    """Retorna la ruta local del snapshot cacheado, o None si no existe."""
    hf_cache = Path(os.environ.get("HF_HOME", "/runpod-volume/hf_cache"))
    snapshots_dir = hf_cache / "hub" / _repo_to_dir_name(repo_id) / "snapshots"
    if not snapshots_dir.exists():
        return None
    for snap in snapshots_dir.iterdir():
        if snap.is_dir() and (snap / "unet").exists():
            return str(snap)
    return None


def _maybe_merge_unet_shards(snapshot_path: str) -> None:
    """
    Si el UNet esta en formato sharded safetensors, lo fusiona en un solo archivo.
    diffusers 0.27.2 no puede cargar shards desde directorios locales.
    Esta fusion se hace UNA SOLA VEZ y el archivo queda en el volumen persistente.
    """
    unet_dir = Path(snapshot_path) / "unet"
    if not unet_dir.exists():
        return

    merged_file = unet_dir / "diffusion_pytorch_model.safetensors"
    if merged_file.exists() and merged_file.stat().st_size > 100_000_000:
        print(f"[merge] UNet ya fusionado: {merged_file.stat().st_size / 1024**3:.2f} GB")
        return

    shard_files = sorted(unet_dir.glob("diffusion_pytorch_model-*-of-*.safetensors"))
    if not shard_files:
        print("[merge] No se encontraron shards del UNet")
        return

    total_mb = sum(f.stat().st_size for f in shard_files) / (1024 * 1024)
    print(f"[merge] Fusionando {len(shard_files)} shards del UNet ({total_mb:.0f} MB total)...")
    print(f"[merge] Esto tomara varios minutos, solo ocurre una vez.")

    try:
        from safetensors.torch import load_file, save_file
        merged: dict = {}
        for shard in shard_files:
            print(f"[merge] Cargando shard: {shard.name} ({shard.stat().st_size / 1024**2:.0f} MB)...")
            tensors = load_file(str(shard))
            merged.update(tensors)

        print(f"[merge] Guardando archivo fusionado ({len(merged)} tensores)...")
        save_file(merged, str(merged_file))
        size_gb = merged_file.stat().st_size / 1024**3
        print(f"[merge] Fusion completa: {merged_file} ({size_gb:.2f} GB)")
        del merged
        import gc
        gc.collect()
    except Exception as e:
        print(f"[merge] ERROR al fusionar shards: {e}")
        if merged_file.exists():
            merged_file.unlink()  # Limpiar archivo incompleto


def _try_load_pipeline(pipeline_cls, vae):
    """
    Intenta cargar el pipeline con multiples estrategias.
    Si todo falla, lanza RuntimeError con stack traces completos.
    """
    import traceback as _tb
    errors = []

    # Estrategia 0: cargar UNet directamente para diagnosticar
    local_path = _get_local_snapshot_path(MODEL_ID)
    if local_path:
        print(f"  [modelo] Probando carga directa del UNet para diagnostico...")
        try:
            from diffusers import UNet2DConditionModel
            unet = UNet2DConditionModel.from_pretrained(
                local_path,
                subfolder="unet",
                torch_dtype=torch.float16,
                use_safetensors=True,
                local_files_only=True,
            )
            print(f"  [modelo] UNet cargado OK directamente: {type(unet)}")
            del unet
            import gc; gc.collect()
        except Exception as e:
            print(f"  [modelo] UNet directo fallido: {e}\n{_tb.format_exc()}")

    # Estrategia 1: cargar desde ruta local del snapshot
    if local_path:
        print(f"  [modelo] Intentando pipeline desde ruta local: {local_path}")
        for kwargs in [{"use_safetensors": True}, {"local_files_only": True}, {}]:
            try:
                pipe = pipeline_cls.from_pretrained(
                    local_path,
                    vae=vae,
                    torch_dtype=torch.float16,
                    **kwargs,
                )
                print(f"  [modelo] OK desde ruta local con kwargs={kwargs}")
                return pipe
            except Exception as e:
                msg = f"local_path+{kwargs}: {e}\n{_tb.format_exc()}"
                print(f"  [modelo] intento fallido: local_path+{kwargs}: {e}")
                errors.append(msg)

    # Estrategia 2: cargar desde repo ID
    print(f"  [modelo] Intentando desde repo ID: {MODEL_ID}")
    for kwargs in [{"use_safetensors": True}, {}]:
        try:
            pipe = pipeline_cls.from_pretrained(
                MODEL_ID,
                vae=vae,
                torch_dtype=torch.float16,
                **kwargs,
            )
            print(f"  [modelo] OK desde repo ID con kwargs={kwargs}")
            return pipe
        except Exception as e:
            msg = f"repo_id+{kwargs}: {e}\n{_tb.format_exc()}"
            print(f"  [modelo] intento fallido: repo_id+{kwargs}: {e}")
            errors.append(msg)

    raise RuntimeError("Todos los intentos fallaron:\n\n" + "\n\n---\n".join(errors))


def load_pipeline(pipeline_cls):
    """Carga Photonic Fusion SDXL con VAE mejorado + cpu_offload."""
    print(f"[modelo] Iniciando carga de {MODEL_ID} ...")

    _verify_and_clean_model_cache(MODEL_ID)

    # Fusionar shards del UNet si es necesario (fix para diffusers 0.27.2)
    snap_path = _get_local_snapshot_path(MODEL_ID)
    if snap_path:
        _maybe_merge_unet_shards(snap_path)

    vae = _load_vae()

    try:
        pipe = _try_load_pipeline(pipeline_cls, vae)
    except RuntimeError as first_err:
        print(f"[modelo] Primer intento fallido:\n{first_err}")
        print("[modelo] Limpieza nuclear del cache y reintento (descarga ~7 GB, ~10-15 min)...")
        _nuclear_clean_model_cache(MODEL_ID)
        vae = _load_vae()
        try:
            pipe = _try_load_pipeline(pipeline_cls, vae)
        except RuntimeError as second_err:
            raise RuntimeError(
                f"No se pudo cargar {MODEL_ID} ni tras limpiar cache.\n"
                f"1er intento:\n{first_err}\n\n2do intento:\n{second_err}"
            )

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
