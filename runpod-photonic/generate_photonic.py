"""
Generador de imagenes NSFW explicitas con Photonic Fusion SDXL.
Modos: text-to-image, image-to-image, faceid (preservacion de identidad facial).
Modelo base: Photonic Fusion SDXL + IP-Adapter FaceID.
Optimizado para textura de piel hiperrealista y anatomia explicita.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

HF_HOME_DEFAULT = os.environ.get("HF_HOME", "/runpod-volume/hf_cache")
os.environ.setdefault("HF_HOME", HF_HOME_DEFAULT)

import torch

# Patch: torch.xpu missing in some PyTorch builds (< 2.3)
if not hasattr(torch, "xpu"):
    class _FakeXPU:
        @staticmethod
        def is_available() -> bool:
            return False
        @staticmethod
        def device_count() -> int:
            return 0
    torch.xpu = _FakeXPU()  # type: ignore[attr-defined]

from PIL import Image


# ---------------------------------------------------------------------------
# Monkey patch: diffusers sharded safetensors en directorios locales
# ---------------------------------------------------------------------------
# diffusers < 0.30 tiene un bug donde _get_model_file no busca el index.json
# cuando carga desde un directorio local, forzando el uso de .bin.
# Este patch lo corrige buscando el index primero.
# ---------------------------------------------------------------------------

def _patch_diffusers_sharded_local():
    """
    Parchea diffusers._get_model_file para buscar .index.json en directorios
    locales antes que el archivo de pesos directo. Esto habilita la carga de
    modelos sharded (ej: photonic-fusion-sdxl UNet) desde cache local.
    """
    try:
        from diffusers.utils import hub_utils

        _orig = hub_utils._get_model_file

        def _patched(pretrained_model_name_or_path, *, weights_name, subfolder=None, **kwargs):
            pmnop = str(pretrained_model_name_or_path)
            if os.path.isdir(pmnop):
                check_dir = os.path.join(pmnop, subfolder) if subfolder else pmnop
                # Buscar index de safetensors primero (sharded model)
                for idx_name in [
                    "diffusion_pytorch_model.safetensors.index.json",
                    "model.safetensors.index.json",
                    "diffusion_pytorch_model.bin.index.json",
                    "model.bin.index.json",
                ]:
                    idx_path = os.path.join(check_dir, idx_name)
                    real_exists = os.path.exists(idx_path)  # follows symlinks
                    if real_exists:
                        print(f"[patch] Usando index sharded: {idx_path}")
                        return idx_path
            return _orig(pretrained_model_name_or_path, weights_name=weights_name, subfolder=subfolder, **kwargs)

        hub_utils._get_model_file = _patched

        # Actualizar todas las referencias ya importadas
        for mod_name, mod in list(sys.modules.items()):
            if "diffusers" in mod_name and hasattr(mod, "_get_model_file"):
                try:
                    setattr(mod, "_get_model_file", _patched)
                except Exception:
                    pass

        print("[patch] diffusers._get_model_file parcheado para sharded safetensors OK")
    except Exception as e:
        print(f"[patch] ADVERTENCIA: no se pudo parchear diffusers: {e}")


_patch_diffusers_sharded_local()


# ---------------------------------------------------------------------------
# Cache utilities
# ---------------------------------------------------------------------------


def _repo_to_dir_name(repo_id: str) -> str:
    """Convert 'owner/model' to 'models--owner--model' HF cache dir format."""
    return "models--" + repo_id.replace("/", "--")


# Tamaño minimo esperado para shards del UNet SDXL (~3.5 GB cada uno)
_MIN_SHARD_BYTES = 200 * 1024 * 1024  # 200 MB (conservador, shard 2 es ~269 MB)


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

        # Listar TODOS los archivos (siguiendo symlinks para tamaño real)
        all_entries = list(unet_dir.iterdir())
        print(f"[cache] Snapshot {snap_dir.name}: {len(all_entries)} entradas en unet/")
        for entry in all_entries:
            try:
                is_sym = entry.is_symlink()
                real_size = entry.stat().st_size if entry.exists() else -1
                print(f"[cache]   {entry.name}: symlink={is_sym}, size={real_size/1024/1024:.1f}MB")
            except Exception as ee:
                print(f"[cache]   {entry.name}: ERROR al leer: {ee}")

        # Archivos safetensors con tamaño minimo
        st_files = [
            e for e in all_entries
            if e.name.endswith(".safetensors") and not e.name.startswith("diffusion_pytorch_model-00")
            # Excluir shards (queremos verificar que el modelo tiene algo)
        ]
        shard_files = [
            e for e in all_entries
            if e.name.startswith("diffusion_pytorch_model-") and e.name.endswith(".safetensors")
        ]
        merged_file = unet_dir / "diffusion_pytorch_model.safetensors"

        print(f"[cache]   shards={len(shard_files)}, merged_exists={merged_file.exists()}")

        # Si no hay shards ni archivo merged, snapshot es invalido
        if len(shard_files) == 0 and not merged_file.exists():
            print(f"[cache] Snapshot sin shards ni merged, limpiando: {snap_dir.name}")
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
            print(f"[cache] Eliminado OK con shutil.rmtree")
        except Exception as e:
            print(f"[cache] ERROR en shutil.rmtree: {e}. Intento file-by-file...")
            deleted = 0
            failed = 0
            for f in sorted(model_dir.rglob("*"), reverse=True):
                try:
                    if f.is_symlink() or f.is_file():
                        f.unlink()
                        deleted += 1
                    elif f.is_dir():
                        f.rmdir()
                        deleted += 1
                except Exception as fe:
                    print(f"[cache]  skip {f.name}: {fe}")
                    failed += 1
            print(f"[cache] File-by-file: {deleted} eliminados, {failed} fallidos")
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
CLIP_ENCODER = "laion/CLIP-ViT-H-14-laion2B-s32K"

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
    Fusiona los shards del UNet en un solo archivo safetensors operando directamente
    sobre bytes (sin cargar tensores en memoria). Solo ocurre una vez.
    diffusers < 0.30 no puede cargar sharded safetensors desde directorios locales.
    """
    import json
    import struct
    import traceback

    print(f"[merge] === Verificando UNet en: {snapshot_path}")

    unet_dir = Path(snapshot_path) / "unet"
    print(f"[merge] unet_dir={unet_dir}, exists={unet_dir.exists()}")
    if not unet_dir.exists():
        print(f"[merge] unet_dir no existe, saliendo")
        return

    # Listar TODOS los archivos
    try:
        all_entries = list(unet_dir.iterdir())
        print(f"[merge] Entradas en unet/ ({len(all_entries)}):")
        for e in sorted(all_entries, key=lambda x: x.name):
            is_sym = e.is_symlink()
            real_exists = e.exists()  # follows symlinks
            size = -1
            if real_exists:
                try:
                    size = e.stat().st_size
                except Exception:
                    pass
            print(f"[merge]   {e.name}: sym={is_sym}, real={real_exists}, size={size/1024/1024:.1f}MB" if size >= 0 else f"[merge]   {e.name}: sym={is_sym}, real={real_exists}")
    except Exception as le:
        print(f"[merge] ERROR al listar unet_dir: {le}")
        return

    merged_file = unet_dir / "diffusion_pytorch_model.safetensors"
    print(f"[merge] merged_file: exists={merged_file.exists()}, is_sym={merged_file.is_symlink()}")
    if merged_file.exists():
        try:
            size = merged_file.stat().st_size
            print(f"[merge] merged_file size={size/1024/1024:.0f}MB")
            if size > 100_000_000:
                print(f"[merge] Ya fusionado ({size/1024**3:.2f} GB), saltando merge")
                return
            else:
                print(f"[merge] Archivo parcial ({size/1024/1024:.0f}MB), eliminando para re-fusionar")
                merged_file.unlink()
        except Exception as se:
            print(f"[merge] ERROR al verificar merged_file: {se}")

    # Buscar shards (pueden ser symlinks)
    shard_files = sorted(
        e for e in all_entries
        if e.name.startswith("diffusion_pytorch_model-") and e.name.endswith(".safetensors")
    )
    print(f"[merge] Shards encontrados: {len(shard_files)}: {[f.name for f in shard_files]}")

    if not shard_files:
        # Intentar buscar de nuevo con glob directo
        shard_files = sorted(unet_dir.glob("diffusion_pytorch_model-*.safetensors"))
        print(f"[merge] Shards (glob directo): {len(shard_files)}: {[f.name for f in shard_files]}")

    if not shard_files:
        print(f"[merge] No se encontraron shards, no es necesario merge")
        return

    total_mb = 0
    for sf in shard_files:
        try:
            total_mb += sf.stat().st_size / (1024 * 1024)
        except Exception:
            pass
    print(f"[merge] Iniciando fusion de {len(shard_files)} shards ({total_mb:.0f} MB total)")
    print(f"[merge] Operacion byte-level (sin cargar tensores en RAM) - solo ocurre una vez")

    tmp_file = unet_dir / "diffusion_pytorch_model.safetensors.tmp"
    try:
        # Paso 1: leer headers de cada shard
        shard_headers = []
        shard_header_sizes = []
        for shard in shard_files:
            print(f"[merge]   Leyendo header de {shard.name}...")
            with open(str(shard), "rb") as f:
                header_size_bytes = f.read(8)
                if len(header_size_bytes) < 8:
                    raise RuntimeError(f"Shard {shard.name} demasiado pequeño: {len(header_size_bytes)} bytes")
                header_size = struct.unpack("<Q", header_size_bytes)[0]
                header_raw = f.read(header_size)
                header = json.loads(header_raw.decode("utf-8"))
            shard_headers.append(header)
            shard_header_sizes.append(header_size)
            tensor_count = sum(1 for k in header if k != "__metadata__")
            print(f"[merge]   {shard.name}: {tensor_count} tensores, header={header_size} bytes")

        # Paso 2: construir header fusionado con offsets recalculados
        merged_header: dict = {"__metadata__": {}}
        global_data_offset = 0
        for i, header in enumerate(shard_headers):
            tensor_keys = [k for k in header if k != "__metadata__"]
            if not tensor_keys:
                print(f"[merge]   Shard {i} no tiene tensores con offset")
                continue
            for key in tensor_keys:
                info = header[key]
                offsets = info["data_offsets"]
                new_start = global_data_offset + offsets[0]
                new_end = global_data_offset + offsets[1]
                merged_header[key] = {**info, "data_offsets": [new_start, new_end]}
            # El offset global avanza por el tamaño de datos de este shard
            max_end = max(header[k]["data_offsets"][1] for k in tensor_keys)
            print(f"[merge]   Shard {i}: {len(tensor_keys)} tensores, datos={max_end/1024/1024:.0f}MB, offset_global={global_data_offset/1024/1024:.0f}MB")
            global_data_offset += max_end

        total_tensors = sum(1 for k in merged_header if k != "__metadata__")
        print(f"[merge] Header fusionado: {total_tensors} tensores totales")

        # Paso 3: serializar header fusionado
        header_bytes = json.dumps(merged_header, separators=(",", ":")).encode("utf-8")
        print(f"[merge] Header serializado: {len(header_bytes)} bytes")

        # Paso 4: escribir archivo fusionado
        print(f"[merge] Escribiendo {tmp_file.name}...")
        with open(str(tmp_file), "wb") as out:
            out.write(struct.pack("<Q", len(header_bytes)))
            out.write(header_bytes)
            bytes_written = 0
            for shard, h_size in zip(shard_files, shard_header_sizes):
                print(f"[merge]   Copiando bytes de {shard.name}...")
                with open(str(shard), "rb") as inp:
                    inp.seek(8 + h_size)  # Saltar header del shard
                    CHUNK = 64 * 1024 * 1024  # 64 MB
                    while True:
                        chunk = inp.read(CHUNK)
                        if not chunk:
                            break
                        out.write(chunk)
                        bytes_written += len(chunk)
                print(f"[merge]   {shard.name} copiado, total escrito: {bytes_written/1024/1024:.0f}MB")

        # Renombrar atomicamente
        tmp_file.rename(merged_file)
        size_gb = merged_file.stat().st_size / 1024**3
        print(f"[merge] === Fusion COMPLETA: {merged_file.name} ({size_gb:.2f} GB)")

    except Exception as e:
        print(f"[merge] === ERROR en fusion: {e}")
        traceback.print_exc()
        if tmp_file.exists():
            try:
                tmp_file.unlink()
            except Exception:
                pass
        # No eliminar merged_file si existe (podría ser un intento previo válido)


def _try_load_pipeline(pipeline_cls, vae):
    """
    Intenta cargar el pipeline con multiples estrategias.
    Si todo falla, lanza RuntimeError con stack traces completos.
    """
    import traceback as _tb
    errors = []

    # Siempre intentar merge antes de cargar (idempotente si ya está hecho)
    local_path = _get_local_snapshot_path(MODEL_ID)
    if local_path:
        print(f"  [try_load] Ejecutando merge check en: {local_path}")
        _maybe_merge_unet_shards(local_path)

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

    # Estrategia 2: cargar desde repo ID (con descarga si no está en cache)
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
    import traceback as _tb
    print(f"[modelo] Iniciando carga de {MODEL_ID} ...")

    _verify_and_clean_model_cache(MODEL_ID)

    # Ejecutar merge ANTES de cualquier intento de carga
    snap_path = _get_local_snapshot_path(MODEL_ID)
    print(f"[modelo] Snapshot local: {snap_path}")
    if snap_path:
        _maybe_merge_unet_shards(snap_path)
    else:
        print(f"[modelo] No hay snapshot local, se descargara en _try_load_pipeline")

    vae = _load_vae()

    try:
        pipe = _try_load_pipeline(pipeline_cls, vae)
    except RuntimeError as first_err:
        print(f"\n[modelo] === Primer intento fallido ===")
        print(str(first_err)[:1000])
        print("[modelo] Intentando nuclear clean + snapshot_download + merge + retry...")
        _nuclear_clean_model_cache(MODEL_ID)

        # Usar snapshot_download para descarga explícita y controlada
        print("[modelo] Descargando modelo con snapshot_download (~10 GB, tardara 15-30 min)...")
        try:
            from huggingface_hub import snapshot_download
            snap_path2_raw = snapshot_download(
                MODEL_ID,
                local_dir=None,  # Usar cache HF estándar
                ignore_patterns=["*.msgpack", "*.ckpt", "flax_model*"],
            )
            print(f"[modelo] snapshot_download OK: {snap_path2_raw}")
        except Exception as dl_err:
            print(f"[modelo] snapshot_download fallido: {dl_err}")
            _tb.print_exc()

        snap_path2 = _get_local_snapshot_path(MODEL_ID)
        print(f"[modelo] Snapshot local post-descarga: {snap_path2}")
        if snap_path2:
            _maybe_merge_unet_shards(snap_path2)
        else:
            print("[modelo] ADVERTENCIA: no se encontro snapshot tras descarga")

        vae = _load_vae()
        try:
            pipe = _try_load_pipeline(pipeline_cls, vae)
        except RuntimeError as second_err:
            raise RuntimeError(
                f"No se pudo cargar {MODEL_ID} ni tras limpiar cache.\n"
                f"1er intento:\n{str(first_err)[:500]}\n\n2do intento:\n{str(second_err)[:500]}"
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
