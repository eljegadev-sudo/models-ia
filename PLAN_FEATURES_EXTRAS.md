# Plan de Implementación - Features Extras

## Fase 1: Notas de Voz con IA (Fish Audio)
**Prioridad**: Alta | **Esfuerzo**: Medio | **Impacto**: Muy Alto

### Descripción
Las modelos podrán enviar notas de voz generadas con IA usando Fish Audio TTS. Esto crea una conexión emocional mucho más fuerte que el texto.

### API
- **Servicio**: Fish Audio (fish.audio)
- **API Key**: `eb930e7868c944b7817dc74eac1c72a2`
- **Modelo de voz**: `5e816f5a0658460b960881a24733c418`
- **Endpoint**: `https://api.fish.audio/v1/tts`

### Tareas
1. **Crear `src/lib/fishaudio.ts`** - Cliente de Fish Audio TTS
   - Función `generateVoiceMessage(text, voiceModelId)` que retorna un buffer de audio
   - Función `saveAudioFile(buffer)` que guarda el audio en `/uploads/voice/`
   
2. **Actualizar schema de Prisma**
   - Agregar campo `audioUrl` a `Message`
   - Agregar campo `voiceModelId` a `ModelProfile` (para asignar voces diferentes por modelo)

3. **Modificar `src/lib/openai.ts`**
   - Agregar marcador `[SEND_VOICE]` al sistema de prompts
   - La IA decide cuándo mandar un audio (ej: "te mando un audio", mensajes íntimos, susurros)

4. **Modificar `src/app/api/chat/send/route.ts`**
   - Detectar marcador `[SEND_VOICE]` en respuesta de IA
   - Generar audio con Fish Audio del texto del mensaje
   - Guardar audio y crear mensaje con `audioUrl`

5. **Actualizar `src/components/chat/chat-interface.tsx`**
   - Componente de reproductor de audio en burbujas de chat
   - Botón play/pause, barra de progreso, duración
   - Estilo coherente con el diseño (pink/rose)

6. **Panel del creador**
   - Selector de voz por modelo (dropdown con voces disponibles)
   - Preview/test de la voz seleccionada

### Monetización
- Audios básicos (saludos, conversación): Gratis para suscriptores
- Audios íntimos/sensuales: $1.99 - $4.99 (similar a fotos de pago)

---

## Fase 2: Notificaciones Inteligentes (Re-engagement)
**Prioridad**: Alta | **Esfuerzo**: Bajo | **Impacto**: Alto

### Descripción
La modelo envía mensajes automáticos cuando el cliente lleva tiempo sin entrar. Recupera clientes inactivos sin esfuerzo del creador.

### Tareas
1. **Crear tabla `ScheduledMessage` en Prisma**
   - `conversationId`, `triggerAt`, `type` (re-engagement, follow-up), `status`, `content`

2. **Crear job/cron `src/lib/cron/re-engagement.ts`**
   - Detecta clientes inactivos (24h, 3 días, 7 días)
   - Genera mensajes personalizados con OpenAI según el contexto de la conversación
   - Cada tier de inactividad tiene diferente intensidad:
     - 24h: "hey, estuve pensando en ti..."
     - 3 días: "te extraño... mira lo que me puse hoy" + selfie gratis
     - 7 días: "me tienes abandonada..." + foto de pago con descuento

3. **API Route `/api/cron/re-engagement`**
   - Endpoint que ejecuta el job (llamado por cron externo o Vercel Cron)

4. **UI: Notificaciones en navbar**
   - Badge con número de mensajes no leídos
   - Dropdown con preview de mensajes recientes

### Notas
- Respetar horarios (no enviar de madrugada)
- Máximo 1 re-engagement por día por conversación
- Si el cliente no responde a 3 re-engagements seguidos, pausar

---

## Fase 3: Modo "Novia Virtual"
**Prioridad**: Alta | **Esfuerzo**: Medio | **Impacto**: Muy Alto

### Descripción
Suscripción premium donde la modelo actúa como pareja virtual: buenos días, buenas noches, mensajes espontáneos, seguimiento emocional, celos juguetones.

### Tareas
1. **Actualizar schema de Prisma**
   - Nuevo campo `subscriptionTier` en `Subscription`: `STANDARD` | `GIRLFRIEND`
   - Nuevo precio para tier girlfriend en `ModelProfile`

2. **Crear `src/lib/cron/girlfriend-mode.ts`**
   - Job que genera mensajes espontáneos durante el día:
     - 8-9am: Buenos días personalizado
     - 12-2pm: Mensaje random (foto del almuerzo, pregunta sobre su día)
     - 6-8pm: Mensaje de tarde (qué planes tiene, cómo le fue)
     - 10-11pm: Buenas noches íntimo
   - Mensajes basados en memoria y personalidad del modelo
   - Varía la hora exacta para parecer natural

3. **Modificar prompt de IA**
   - Cuando es tier GIRLFRIEND, la IA es más posesiva, cariñosa, hace seguimiento
   - "Celos juguetones" si lleva mucho sin escribir
   - Más uso de "mi amor", "bebe", contenido emocional

4. **UI: Badge "Novia" en perfil**
   - Indicador visual de que tiene modo novia activado
   - Opción de upgrade en la página del modelo

5. **Pricing**
   - Standard: precio actual del modelo
   - Girlfriend: 2x-3x el precio standard

---

## Fase 4: Contenido Personalizado Bajo Demanda
**Prioridad**: Media | **Esfuerzo**: Medio | **Impacto**: Alto

### Descripción
El cliente describe exactamente qué foto quiere y la IA la genera. Contenido único que solo él tiene.

### Tareas
1. **Crear UI de solicitud en chat**
   - Botón "Pedir foto personalizada" en el chat
   - Modal con campo de texto para describir lo que quiere
   - Preview del precio ($9.99 - $24.99 según complejidad)

2. **API Route `/api/chat/custom-request`**
   - Recibe la descripción del cliente
   - Usa OpenAI para convertir la descripción en un prompt optimizado para Replicate
   - Genera la imagen con Replicate (image-to-image con referencia del modelo)
   - Crea mensaje con la foto generada (de pago)

3. **Sistema de precios dinámicos**
   - Categorías simples (selfie, retrato): $9.99
   - Categorías medias (bikini, outfit específico): $14.99
   - Categorías premium (escenario complejo, múltiples detalles): $24.99

4. **Historial de solicitudes**
   - El cliente ve sus solicitudes pasadas
   - El creador ve las solicitudes de todos sus clientes (analytics)

---

## Fase 5: Gamificación y Niveles de Fan
**Prioridad**: Media | **Esfuerzo**: Alto | **Impacto**: Alto

### Tareas
1. **Schema de Prisma**
   - Tabla `FanLevel` con niveles y requisitos de puntos
   - Campo `points` y `level` en relación User-ModelProfile
   - Tabla `PointTransaction` para historial

2. **Sistema de puntos**
   - Mensaje enviado: +1 punto
   - Propina: +puntos proporcional al monto
   - Foto desbloqueada: +5 puntos
   - Día consecutivo: +3 puntos (streak bonus)
   - Suscripción mensual renovada: +50 puntos

3. **Niveles**
   - Nivel 1 - Fan (0 pts): Acceso básico
   - Nivel 2 - Admirador (100 pts): 5% descuento en fotos
   - Nivel 3 - VIP (500 pts): 10% descuento, badge especial, prioridad
   - Nivel 4 - Obsesionado (2000 pts): 15% descuento, contenido exclusivo
   - Nivel 5 - Alma Gemela (5000 pts): 20% descuento, acceso a todo

4. **UI**
   - Barra de progreso en perfil del modelo
   - Badge de nivel en chat
   - Notificación cuando sube de nivel
   - Panel del creador: ver nivel de cada fan

---

## Fase 6: Stories Temporales (24h)
**Prioridad**: Media | **Esfuerzo**: Medio | **Impacto**: Alto

### Tareas
1. **Schema de Prisma**
   - Tabla `Story`: contenido, tipo (imagen/texto), expiresAt, isSubscriberOnly
   - Relación con `ModelProfile`

2. **Generación automática**
   - Job diario que genera 1-3 stories por modelo con Replicate
   - Contenido variado: selfies, outfits, momentos del día
   - OpenAI genera el caption/texto de la story

3. **UI**
   - Barra de stories en la parte superior de `/explore` (estilo Instagram)
   - Círculo con borde gradient si tiene stories nuevas
   - Vista de story fullscreen con tap para avanzar
   - Indicador de vistas

4. **Monetización**
   - Stories públicas: visibles para todos (engagement)
   - Stories privadas: solo para suscriptores (retención)
   - Stories premium: desbloquear por $0.99 (impulso)

---

## Fase 7: Feed Social / Timeline
**Prioridad**: Media | **Esfuerzo**: Alto | **Impacto**: Medio

### Tareas
1. **Schema de Prisma**
   - Tabla `Post`: contenido, imágenes, likes, comentarios
   - Tabla `Comment`, `Like`

2. **UI**
   - Feed tipo Instagram en `/feed`
   - Cards con foto, caption, likes, comentarios
   - Botones de like, comentar, compartir (interno)
   - Publicaciones automáticas generadas por IA

3. **Generación automática**
   - Job que crea posts según calendario
   - Variedad: fotos casuales, pensamientos, preguntas a fans

---

## Fase 8: Multi-idioma Nativo en Chat
**Prioridad**: Media | **Esfuerzo**: Bajo | **Impacto**: Alto

### Tareas
1. **Detección de idioma**
   - Detectar idioma del primer mensaje del cliente
   - Guardar `preferredLanguage` en `Conversation`

2. **Modificar prompt de IA**
   - Instrucción: "Responde en el mismo idioma que el cliente"
   - Mantener personalidad y estilo en cualquier idioma

3. **Fallback**
   - Si no se detecta, usar idioma de la plataforma del usuario

---

## Fase 9: Sistema de Regalos Virtuales
**Prioridad**: Baja | **Esfuerzo**: Medio | **Impacto**: Medio

### Tareas
1. **Catálogo de regalos**
   - Rosa ($0.99), Corazón ($2.99), Perfume ($4.99), Joya ($9.99), Viaje ($24.99), Diamante ($49.99)

2. **UI**
   - Botón de regalo en chat
   - Modal con catálogo visual
   - Animación al enviar regalo
   - La modelo reacciona con mensaje automático de agradecimiento

3. **Schema**
   - Tabla `Gift`: tipo, precio, senderId, recipientId
   - Tabla `GiftCatalog`: ítems disponibles

---

## Fase 10: Referidos / Afiliados
**Prioridad**: Baja | **Esfuerzo**: Bajo | **Impacto**: Alto (largo plazo)

### Tareas
1. **Generar link de referido único por usuario**
2. **Tracking de registros por referido**
3. **Crédito de $5 para ambos al primer pago del referido**
4. **Panel de referidos con estadísticas**

---

## Fase 11: Video Personalizado con IA
**Prioridad**: Baja (tech aún inmadura) | **Esfuerzo**: Muy Alto | **Impacto**: Muy Alto

### Notas
- Depende de que los modelos de video mejoren (Kling AI, Runway, Replicate)
- Actualmente costoso y lento (30-120 segundos por clip)
- Implementar cuando la tecnología madure

### Tareas futuras
1. Integrar API de generación de video
2. Clips cortos (5-10s) basados en imagen de referencia
3. Monetización premium ($14.99-$49.99 por video)

---

## Resumen de Prioridades

| Fase | Feature | Dependencias | Estimación |
|------|---------|-------------|-----------|
| 1 | Notas de Voz (Fish Audio) | Ninguna | 1-2 días |
| 2 | Notificaciones Re-engagement | Ninguna | 1 día |
| 3 | Modo Novia Virtual | Fase 2 | 1-2 días |
| 4 | Contenido Personalizado | Ninguna | 1 día |
| 5 | Gamificación / Niveles | Ninguna | 2-3 días |
| 6 | Stories Temporales | Ninguna | 2 días |
| 7 | Feed Social | Ninguna | 2-3 días |
| 8 | Multi-idioma Chat | Ninguna | 0.5 días |
| 9 | Regalos Virtuales | Ninguna | 1-2 días |
| 10 | Referidos | Ninguna | 1 día |
| 11 | Video IA | Tech madura | 3+ días |
