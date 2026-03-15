"""
Microservicio FastAPI que expone generate_photonic.py como API HTTP.
Endpoint principal: POST /generate
Puerto por defecto: 8100
"""

from __future__ import annotations

import base64
import io
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

import generate_photonic as gp

app = FastAPI(title="Photonic NSFW Generator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str
    mode: str = Field(default="faceid", description="faceid | txt2img | img2img")
    ref_image: Optional[str] = Field(default=None, description="Base64-encoded reference image (required for faceid/img2img)")
    negative_prompt: Optional[str] = None
    width: int = 1024
    height: int = 1024
    steps: int = 35
    guidance: float = 5.5
    seed: Optional[int] = None
    face_strength: float = 0.4
    s_scale: float = 4.5
    strength: float = 0.65
    faceswap: bool = True
    restore: bool = True
    fidelity: float = 0.5


class GenerateResponse(BaseModel):
    image: str = Field(description="Base64-encoded PNG result")
    raw_image: Optional[str] = Field(default=None, description="Base64-encoded raw image before faceswap (faceid mode)")
    elapsed_seconds: float


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
    """Simulates argparse.Namespace for generate_photonic functions."""
    pass


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    t0 = time.time()

    args = _Args()
    args.prompt = req.prompt
    args.negative_prompt = req.negative_prompt
    args.width = req.width
    args.height = req.height
    args.steps = req.steps
    args.guidance = req.guidance
    args.seed = req.seed
    args.output = "api_output.png"

    try:
        if req.mode == "txt2img":
            return _run_txt2img(args, t0)
        elif req.mode == "img2img":
            if not req.ref_image:
                raise HTTPException(400, "ref_image is required for img2img mode")
            return _run_img2img(args, req, t0)
        elif req.mode == "faceid":
            if not req.ref_image:
                raise HTTPException(400, "ref_image is required for faceid mode")
            return _run_faceid(args, req, t0)
        else:
            raise HTTPException(400, f"Unknown mode: {req.mode}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


def _run_txt2img(args: _Args, t0: float) -> GenerateResponse:
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

    return GenerateResponse(
        image=_image_to_base64(img),
        elapsed_seconds=round(time.time() - t0, 2),
    )


def _run_img2img(args: _Args, req: GenerateRequest, t0: float) -> GenerateResponse:
    from diffusers import StableDiffusionXLImg2ImgPipeline
    from PIL import Image
    import torch

    width, height, steps, guidance, negative = gp.resolve(args)
    prompt = f"{args.prompt}, {gp.SKIN_TAGS}"

    ref_path = _decode_image_to_tempfile(req.ref_image)
    init_image = Image.open(ref_path).convert("RGB").resize((width, height), Image.LANCZOS)

    pipe = gp.load_pipeline(StableDiffusionXLImg2ImgPipeline)

    args.strength = req.strength
    result = pipe(
        prompt=prompt,
        negative_prompt=negative,
        image=init_image,
        strength=req.strength,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=gp.make_generator(args.seed),
    )
    img = result.images[0]

    del pipe
    torch.cuda.empty_cache()
    Path(ref_path).unlink(missing_ok=True)

    return GenerateResponse(
        image=_image_to_base64(img),
        elapsed_seconds=round(time.time() - t0, 2),
    )


def _run_faceid(args: _Args, req: GenerateRequest, t0: float) -> GenerateResponse:
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

    ref_path = _decode_image_to_tempfile(req.ref_image)
    faceid_embeds, face_crop = gp.extract_face_embedding(ref_path)

    ip_ckpt = hf_hub_download(repo_id=gp.FACEID_REPO, filename=gp.FACEID_BIN)

    vae = gp._load_vae()
    pipe = StableDiffusionXLPipeline.from_pretrained(
        gp.MODEL_ID, vae=vae, torch_dtype=torch.float16,
    )
    gp._apply_scheduler(pipe)
    pipe.enable_vae_tiling()
    gp._try_xformers(pipe)

    ip_model = IPAdapterFaceIDPlusXL(pipe, gp.CLIP_ENCODER, ip_ckpt, "cuda")
    ip_model.set_scale(req.face_strength)

    image_prompt_embeds, uncond_image_prompt_embeds = ip_model.get_image_embeds(
        faceid_embeds, face_crop, req.s_scale, shortcut=True,
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

    if req.faceswap:
        final_image = gp.face_swap_and_restore(
            raw_image,
            ref_path,
            fidelity=req.fidelity,
            do_restore=req.restore,
        )
        result_b64 = _image_to_base64(final_image)
    else:
        result_b64 = raw_b64
        raw_b64 = None

    Path(ref_path).unlink(missing_ok=True)

    return GenerateResponse(
        image=result_b64,
        raw_image=raw_b64,
        elapsed_seconds=round(time.time() - t0, 2),
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8100)
