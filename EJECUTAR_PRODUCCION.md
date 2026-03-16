# Producción — Comandos y configuración

---

## Base de datos (Fly.io Postgres) — ver con interfaz

```powershell
flyctl proxy 15432:5432 -a models-ia-db

cd d:\trabajo\pruebas-nsfw\modelos-ia\modelos-ia
$env:DATABASE_URL="postgres://models_ia:fudLGsgAonQZIsi@localhost:15432/models_ia?sslmode=disable"
npx prisma studio
```

---

## Fly.io — deploy de la app Next.js

```powershell
cd d:\trabajo\pruebas-nsfw\modelos-ia\modelos-ia
fly deploy --app models-ia --strategy immediate
```

Ver logs en tiempo real:
```powershell
fly logs -a models-ia
```

Actualizar secretos de entorno:
```powershell
fly secrets set PHOTONIC_SERVER_URL="https://api.runpod.ai/v2/<ENDPOINT_ID>" --app models-ia
```

---

## RunPod — Worker de generación de imágenes NSFW

### Cómo funciona
El worker (`runpod-photonic/`) es un contenedor Docker que corre en RunPod Serverless:
- **Modelo**: Photonic Fusion SDXL (`stablediffusionapi/photonic-fusion-sdxl`)
- **Face preservation**: IP-Adapter FaceID Plus v2 SDXL + face swap (inswapper_128) + GFPGAN restoration
- **API**: RunPod Serverless (submit job → polling status → result)
- **Imagen Docker**: `ghcr.io/eljegadev-sudo/photonic-worker:latest`
- **Build automático**: GitHub Actions al hacer push a `main` (`.github/workflows/build-photonic-worker.yml`)

### Rebuild manual de la imagen Docker

```powershell
# Forzar rebuild (hacer cualquier cambio en runpod-photonic/ y push)
cd d:\trabajo\pruebas-nsfw\modelos-ia\modelos-ia
git add runpod-photonic/
git commit -m "rebuild worker"
git push origin main
# → GitHub Actions construye y pushea ghcr.io/eljegadev-sudo/photonic-worker:latest
```

### Verificar estado del endpoint RunPod

```powershell
# Listar workers activos
$headers = @{ "Authorization" = "Bearer <TU_RUNPOD_API_KEY>" }
Invoke-RestMethod -Uri "https://api.runpod.io/v2/<ENDPOINT_ID>/health" -Headers $headers

# Ver último job
Invoke-RestMethod -Uri "https://api.runpod.io/v2/<ENDPOINT_ID>/requests" -Headers $headers
```

### Enviar job de prueba

```powershell
$body = @{
  input = @{
    mode = "txt2img"
    prompt = "woman, nude, photorealistic"
    width = 512
    height = 512
    steps = 20
  }
} | ConvertTo-Json -Depth 3

$headers = @{
  "Authorization" = "Bearer <TU_RUNPOD_API_KEY>"
  "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "https://api.runpod.io/v2/<ENDPOINT_ID>/run" -Method POST -Headers $headers -Body $body
```

### Configuración actual del endpoint

| Parámetro | Valor |
|-----------|-------|
| GPU | 48 GB High Supply (NVIDIA A6000 / similar) |
| Workers mínimos | 0 (arrancan bajo demanda) |
| Workers máximos | 3 |
| Timeout idle | 300 seg (5 min) |
| Container disk | 40 GB |
| HF_HOME | `/tmp/hf_cache` |
| CHECKPOINTS_DIR | `/tmp/checkpoints` |

### Costos aproximados (RunPod, GPU 48 GB)

| Escenario | Costo estimado |
|-----------|---------------|
| Por hora activa (GPU corriendo) | ~$0.50–0.70/hora |
| Por imagen generada (~2–3 min GPU) | ~$0.017–0.035/imagen |
| Worker idle (0 workers min) | $0 cuando no hay requests |
| Con Network Volume 50 GB | +~$3.50/mes fijo |
| **Estimado mensual (uso moderado, ~200 imágenes)** | **~$7–15/mes** |

> **Nota de cold start**: El primer request del día tarda ~25-35 min porque descarga ~20 GB de modelos.  
> Con **Network Volume** montado en `/runpod-volume`, los modelos persisten → cold start baja a ~2-3 min.

### Configurar Network Volume (recomendado para producción)

1. En RunPod → **Storage** → **Network Volumes** → **New Volume**
   - Nombre: `photonic-models`
   - Tamaño: **50 GB**
   - Región: igual que el endpoint
2. En el endpoint → **Edit** → sección **Volume** → seleccionar `photonic-models` → Mount path: `/runpod-volume`
3. Primera request: descarga modelos a `/runpod-volume/hf_cache` y `/runpod-volume/checkpoints`
4. Requests siguientes: acceso instantáneo desde el volumen

### Cambiar `workersMin` para tener siempre 1 worker caliente

En RunPod UI → endpoint → Edit → **Min Workers = 1**
- Costo: ~$0.60/hora siempre activo
- Beneficio: primera imagen en ~2-3 min (solo carga en VRAM, sin descargas)
