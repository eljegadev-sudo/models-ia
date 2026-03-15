# Ejecutar modelos-ia en local (Windows)

## Prerequisitos

- Node.js 20+ (`node --version`)
- PostgreSQL 16+ (`psql --version`)
- Python 3.9+ con venv (para Photonic server, opcional)

---

## 1. Base de datos PostgreSQL

PostgreSQL ya esta instalado como servicio local (puerto 5432).
La base de datos `modelos_ia` ya esta creada.

Si por alguna razon necesitas recrearla:

```powershell
$env:PGPASSWORD = "24.Javier.98"
psql -U postgres -c "CREATE DATABASE modelos_ia;"
```

---

## 2. Instalar dependencias y configurar

```powershell
cd d:\trabajo\pruebas-nsfw\modelos-ia\modelos-ia

# Instalar paquetes de Node
npm install

# Generar el cliente de Prisma
npx prisma generate

# Crear tablas en la base de datos
npx prisma db push

# Cargar datos de prueba (usuarios demo, modelos demo)
npm run db:seed

# Activar interfaz de prisma
npx prisma studio
```

---

## 3. Ejecutar la app Next.js

```powershell
cd d:\trabajo\pruebas-nsfw\modelos-ia\modelos-ia
npm run dev
```

matar procesos: 

taskkill /PID 35040 /F


La app estara en: **http://localhost:3000**

### Usuarios de prueba

| Email             | Password      | Rol     |
|-------------------|---------------|---------|
| creator@demo.com  | password123   | CREATOR |
| client@demo.com   | password123   | CLIENT  |

---

## 4. Servidor Photonic (opcional, para imagenes NSFW)

Solo necesario si quieres generar imagenes NSFW desde el chat.
Requiere GPU NVIDIA con al menos 8GB VRAM.

```powershell
# En otra terminal
cd d:\trabajo\pruebas-nsfw\modelos-ia\modelos-ia

# Activar el venv del proyecto principal
d:\trabajo\pruebas-nsfw\venv\Scripts\Activate.ps1

# Ejecutar el microservicio (puerto 8100)
python photonic_server.py
```

Verificar que funciona: http://localhost:8100/health

---

## Resumen de puertos

| Servicio      | Puerto | URL                        |
|---------------|--------|----------------------------|
| Next.js App   | 3000   | http://localhost:3000      |
| PostgreSQL    | 5432   | localhost:5432             |
| Photonic NSFW | 8100   | http://localhost:8100      |

---

## Comandos utiles

```powershell
# Ver la base de datos con interfaz visual
npx prisma studio

# Resetear base de datos (borra todo y re-crea)
npx prisma db push --force-reset
npm run db:seed

# Actualizar esquema despues de cambios en schema.prisma
npx prisma db push
npx prisma generate
```

---

## Variables de entorno (.env)

El archivo `.env` ya esta configurado. Las variables clave:

- `DATABASE_URL` - Conexion a PostgreSQL
- `NEXTAUTH_SECRET` - Clave para encriptar sesiones (ya generada)
- `NEXTAUTH_URL` - URL base de la app (http://localhost:3000)
- `VENICE_API_KEY` - API de Venice.ai (chat + video)
- `REPLICATE_API_TOKEN` - API de Replicate (imagenes censuradas)
- `PHOTONIC_SERVER_URL` - URL del servidor Photonic local
- `FISH_AUDIO_API_KEY` - API de Fish Audio (notas de voz)

---

## Analisis de Hosting para Produccion

### Arquitectura recomendada (3 capas)

```
                    ┌─────────────────────┐
                    │  Frontend + Backend  │
                    │  Next.js (Railway)   │
                    │   $5-20/mes          │
                    └──────┬──────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │ PostgreSQL  │  │ RunPod GPU  │  │ APIs Ext.   │
   │ (Railway/   │  │ Serverless  │  │ Venice.ai   │
   │  Supabase)  │  │ Photonic    │  │ Replicate   │
   │ $0-10/mes   │  │ ~$17/mes    │  │ Pay-per-use │
   └─────────────┘  └─────────────┘  └─────────────┘
```

### Costos estimados mensuales (~1000 usuarios)

| Servicio | Proveedor | Costo |
|----------|-----------|-------|
| Next.js App | Railway | $5-20/mes |
| PostgreSQL | Railway (incluido) o Supabase free | $0-10/mes |
| GPU Photonic SDXL | RunPod Serverless (RTX 4000 16GB) | ~$17/mes* |
| Chat + Video | Venice.ai API | Segun uso (ya tienes API key) |
| Fotos censored | Replicate API | ~$0.01-0.05/imagen |
| Storage (imagenes/videos) | Cloudflare R2 ($0.015/GB) | $1-5/mes |
| **TOTAL** | | **$30-60/mes** |

*RunPod GPU: ~$0.58/hora activa. Con ~100 imagenes/dia, ~30s/imagen = 50 min/dia. Con flex workers (scale to zero), solo pagas cuando generas.

### Comparativa de opciones GPU

| Proveedor | Precio/hora | Cold Start | Setup | Ideal para |
|-----------|-------------|------------|-------|------------|
| **RunPod Serverless** | ~$0.58 (RTX 4000) | 3-5s | Docker custom | SDXL, zero egress fees |
| Modal | ~$0.60 | 2-4s | Python SDK | DX, free credits iniciales |
| Replicate | ~$0.80+ | Variable | Zero (modelos predefinidos) | Si no necesitas modelo custom |
| AWS SageMaker | $1.50-3.00 | 30-60s | Complejo | Empresas grandes |

### Recomendacion final

**Railway** (Next.js + PostgreSQL) + **RunPod Serverless** (Photonic SDXL worker) + Venice.ai/Replicate APIs.

- Railway: deploy con `git push`, SSL automatico, logs integrados, DB incluida.
- RunPod: Docker custom con Photonic + InSwapper + GFPGAN. Scale to zero = solo pagas uso real.
- El stack escala facilmente: Railway auto-escala contenedores, RunPod escala GPU workers.

### Para empezar (minimo viable)

1. **Crear cuenta en Railway** → conectar repo GitHub → deploy Next.js + Postgres
2. **Crear cuenta en RunPod** → subir Docker worker con Photonic → endpoint serverless
3. **Configurar env vars** en Railway con las API keys y la URL del RunPod endpoint
4. **Dominio custom** → Railway soporta dominios personalizados con SSL
