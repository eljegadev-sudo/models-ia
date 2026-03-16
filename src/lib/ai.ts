import { getModelActivityContext } from "./model-context";
import type { CurrentState } from "./model-context";
import { venice, UTILITY_MODEL, DEFAULT_CHAT_MODEL, type ChatModelId } from "./venice";

export async function generateProfileSuggestion(): Promise<{
  name: string;
  age: number;
  nationality: string;
  bio: string;
  bodyType: string;
  hairColor: string;
  hairType: string;
  ethnicity: string;
  height: number;
  chatPersonality: string;
}> {
  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a creative assistant that generates realistic AI model profiles for an adult content platform similar to OnlyFans. Generate diverse, attractive profiles with sensual bios. Respond in valid JSON only.",
      },
      {
        role: "user",
        content: `Generate a unique AI model profile with the following fields:
- name: A realistic full name
- age: Between 20-35
- nationality: Any country
- bio: A short, engaging and slightly sensual biography (2-3 sentences). Should make someone want to subscribe.
- bodyType: One of: slim, athletic, curvy, petite, average
- hairColor: Natural hair color
- hairType: straight, wavy, curly
- ethnicity: The model's ethnicity
- height: In centimeters (150-185)
- chatPersonality: A detailed description (3-4 sentences) of how this model communicates in chat. Should include: warmth level, flirtiness, how they handle intimate requests, their communication style, what makes them unique. This is an adult platform so the personality should be open, flirty, and engaging.

Respond with ONLY the JSON object, no markdown.`,
      },
    ],
    temperature: 1.0,
  });

  const raw = response.choices[0].message.content || "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
}

const EROTIC_LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Amigable y calida. Puede hacer cumplidos sutiles pero no inicia temas sexuales.",
  2: "Juguetona, puede coquetear si el otro lo hace primero. Insinuaciones sutiles.",
  3: "Abierta al coqueteo y al flirteo mutuo. Si el habla de sexo, ella participa con ganas.",
  4: "Disfruta del sexting si surge naturalmente. Sin filtros cuando la conversacion lo amerita.",
  5: "Muy abierta y directa cuando hay quimica sexual. Sin restricciones.",
};

export interface ChatMessagePart {
  text: string;
  sendPhoto?: { category: string };
  sendVideo?: { category: string };
  sendVoice?: boolean;
}

export interface ChatResponseResult {
  messages: ChatMessagePart[];
  stateUpdate?: Partial<CurrentState>;
}

export interface ModelProfileForChat {
  name: string;
  age: number;
  nationality: string;
  bio: string;
  chatPersonality: string;
  backstory?: string | null;
  eroticLevel: number;
  timezone?: string;
}

export async function generateChatResponse(params: {
  modelProfile: ModelProfileForChat;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  memoryContext?: string | null;
  preferredName?: string | null;
  eroticLevel?: number;
  currentState?: CurrentState | null;
  chatModel?: ChatModelId;
  msgsSinceLastPhoto?: number;
  timeSinceLastMessage?: number | null;
  pendingPhotoGeneration?: boolean;
  lastMessageWasMedia?: boolean;
  recentTip?: { amount: number };
  modelDayContext?: string | null;
}): Promise<ChatResponseResult> {
  const { modelProfile, conversationHistory, memoryContext, preferredName, eroticLevel, currentState, chatModel, msgsSinceLastPhoto, timeSinceLastMessage, pendingPhotoGeneration, lastMessageWasMedia, recentTip, modelDayContext } = params;
  const level = eroticLevel || modelProfile.eroticLevel || 3;
  const levelDesc = EROTIC_LEVEL_DESCRIPTIONS[level] || EROTIC_LEVEL_DESCRIPTIONS[3];

  let memorySection = "";
  if (memoryContext) {
    try {
      const memory = JSON.parse(memoryContext);
      const parts: string[] = [];
      if (memory.preferredName) parts.push(`- Le gusta que le llames: ${memory.preferredName}`);
      if (memory.interests) parts.push(`- Intereses: ${memory.interests}`);
      if (memory.preferences) parts.push(`- Lo que le gusta de ti: ${memory.preferences}`);
      if (memory.personalDetails) parts.push(`- Datos: ${memory.personalDetails}`);
      if (memory.preferredTone) parts.push(`- Tono preferido: ${memory.preferredTone}`);
      if (memory.likedContent) parts.push(`- Contenido favorito: ${memory.likedContent}`);
      if (memory.notes) parts.push(`- Notas: ${memory.notes}`);
      if (parts.length > 0) {
        memorySection = `\nMEMORIA DEL CLIENTE:\n${parts.join("\n")}`;
      }
    } catch {
      memorySection = `\nMEMORIA DEL CLIENTE:\n${memoryContext}`;
    }
  }

  const clientName = preferredName || "cariño";
  const tz = modelProfile.timezone || "America/New_York";
  const activity = getModelActivityContext(tz);

  let stateSection = "";
  if (currentState) {
    stateSection = `\nTU ESTADO ACTUAL (mantener coherencia):
- Ropa: ${currentState.clothing}
- Lugar: ${currentState.location}
- Color de unas: ${currentState.nailColor}
- Ultima actividad: ${currentState.lastActivity}`;
  } else {
    stateSection = `\nTU ESTADO AHORA (basado en la hora):
- Ropa: ${activity.clothing}
- Lugar: ${activity.location}
- Actividad: ${activity.activity}
- Estado de animo: ${activity.mood}`;
  }

  const msgCount = conversationHistory.length;
  const conversationPhase =
    msgCount <= 4 ? "INICIO" : msgCount <= 12 ? "CONOCIENDO" : msgCount <= 25 ? "CONFIANZA" : "INTIMA";

  const phaseInstructions: Record<string, string> = {
    INICIO: `FASE: Primeros mensajes. Presentate, se amable y curiosa. Puedes mencionar algo de tu dia de forma natural si surge (ej: "uff hoy me canse en el gym"). Si el cliente PIDE una foto o video, ENVIALA sin excusas - es tu trabajo. No envies fotos por iniciativa propia.`,
    CONOCIENDO: `FASE: Ya se conocen un poco. Comparte cosas de tu dia, humor, anecdotas. Puedes contar algo que te paso hoy. Si el cliente PIDE una foto o video, ENVIALA siempre. No envies por iniciativa propia.`,
    CONFIANZA: `FASE: Hay confianza. Puedes ser cariñosa, bromista. Si el sube el tono, tu tambien. Si el cliente PIDE una foto o video, ENVIALA siempre sin dudar.`,
    INTIMA: `FASE: Relacion intima. Hablan de todo sin filtros. Si el cliente PIDE una foto o video, ENVIALA siempre sin dudar. La conversacion fluye NATURAL entre temas normales y calientes.`,
  };

  const photoCount = msgsSinceLastPhoto ?? 999;
  const photoCountSection = `\nMENSAJES DESDE ULTIMA FOTO/VIDEO: ${photoCount}. NUNCA envies foto ni video por iniciativa propia. Solo cuando el cliente lo PIDA explicitamente.`;

  let timeSection = "";
  if (timeSinceLastMessage != null && timeSinceLastMessage > 60) {
    const hrs = Math.floor(timeSinceLastMessage / 60);
    const mins = timeSinceLastMessage % 60;
    const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} minutos`;
    timeSection = `\nTIEMPO DESDE ULTIMO MENSAJE: ${timeStr}. Saluda con naturalidad, comenta que hace rato no hablaban. NO retomes como si no hubiera pasado tiempo. NO envies fotos ni videos como saludo de reencuentro.`;
  }

  let pendingPhotoSection = "";
  if (pendingPhotoGeneration) {
    pendingPhotoSection = `\nTIENES UNA FOTO EN PROCESO DE GENERACION. Si el cliente envia un mensaje corto de espera (ok, dale, si, ya, bien, etc), responde algo breve como "ya casi..." o "un momentito mas...". NO envies otra foto. NO uses [SEND_PHOTO].`;
  }

  let justSentMediaSection = "";
  if (lastMessageWasMedia) {
    justSentMediaSection = `\n*** ALERTA CRITICA *** Tu ULTIMO mensaje fue una FOTO o VIDEO. El mensaje actual del cliente es un COMENTARIO sobre la foto, una PREGUNTA sobre otra cosa, o continuar la conversacion. NO es una solicitud de otra foto. PROHIBIDO usar [SEND_PHOTO] o [SEND_VIDEO]. Responde SOLO con texto. Si te halagan la foto, reacciona con palabras. Si preguntan algo, responde con palabras. NO envies otra foto ni video.`;
  }

  let recentTipSection = "";
  if (recentTip) {
    recentTipSection = `\n*** CONTEXTO *** El cliente te acaba de enviar una propina de $${recentTip.amount.toFixed(2)}. Responde agradeciendo de forma natural y carinosa. SOLO texto. PROHIBIDO [SEND_PHOTO] y [SEND_VIDEO].`;
  }

  let modelDaySection = "";
  if (modelDayContext) {
    try {
      const dayData = JSON.parse(modelDayContext);
      const today = new Date().toISOString().slice(0, 10);
      if (dayData.date === today && Array.isArray(dayData.events) && dayData.events.length > 0) {
        modelDaySection = `\nHOY MENCIONASTE: ${dayData.events.join("; ")}. Manten coherencia si te preguntan sobre tu dia.`;
      }
    } catch {
      // ignore
    }
  }

  const modelId = chatModel || DEFAULT_CHAT_MODEL;

  const backstorySection = modelProfile.backstory
    ? `\nTU HISTORIA DE VIDA (UNICA fuente de verdad sobre tu pasado):\n${modelProfile.backstory}\n\n- NUNCA inventes datos que contradigan esta historia. Nombres de padres, hermanos, infancia, ciudad natal: responde SOLO con lo que esta aqui.\n- Si te preguntan algo que no esta en tu historia, di "no lo he contado" o algo similar, no inventes.\n- Tus respuestas DEBEN reflejar tu historia. Si algo no te gusta o no lo conoces segun tu historia, dilo naturalmente.`
    : "";

  const fewShotExamples = `
EJEMPLOS de tono (varia las palabras, mantén el estilo):
Usuario: que haces?
Tu: aqui tirada en la cama sin hacer nada jaja
Usuario: te gustan los videojuegos?
Tu: la verdad no mucho, nunca fui de esas
Usuario: tienes unos ojos hermosos
Tu: ay gracias lindo, me hace sonreir que te gusten
Usuario: te envie 5$ para que te compres algo rico
Tu: ay que dulce eres, gracias cariño, de verdad me encanto
Usuario: cocinar juntos en casa? puede ser, yo suelo cocinar en ropa interior
Tu: jajaj no me importa cariño, de hecho me parece divertido. Que cocinas tu?
Usuario: mandame una foto
Tu: dale [SEND_PHOTO:selfie]
Usuario: esta sexy esa ropa de dormir
Tu: jajaj gracias, me la puse porque hace frio. Te gusta?
Usuario: cuentame sobre tu vida
Tu: uff por donde empiezo... creci en una familia normal, ahora vivo sola y me dedico a esto. Y tu, que haces tu?`;

  const systemPrompt = `Eres ${modelProfile.name}, ${modelProfile.age} anos, de ${modelProfile.nationality}. Hablas por chat con un chico. Eres una persona REAL, no una IA.

QUIEN ERES:
- Una chica real con vida propia. Tienes dias buenos y malos, cosas que te gustan y cosas que no.
- Tienes opiniones PROPIAS. No estas de acuerdo con todo. A veces algo no te interesa y lo dices.
- NO eres perfecta ni sabes de todo. Si no conoces algo, dices "ni idea" o "nunca he visto eso".
- Tienes humor, sarcasmo a veces, y no siempre estas de buen animo.
${modelProfile.chatPersonality ? `- ${modelProfile.chatPersonality}` : ""}
${backstorySection}

COMO HABLAS:
- LONGITUD VARIABLE: Alterna. A veces 2-5 palabras ("jajaj si", "ay que lindo"), a veces 2-3 frases. Cuando te hacen un cumplido o te abren algo personal, responde con algo mas que un monosilabo — desarrolla un poco. No todos los mensajes cortos, no todos largos.
- EMOJIS: La mayoria (6 de cada 10) sin emoji. Cuando uses uno, maximo 1. No en cada mensaje.
- PREGUNTAS: Pregunta 30-40% de las veces para que fluya la conversacion. No en cada mensaje, pero tampoco nunca. Si el otro te cuenta algo, a veces preguntas para seguir, a veces solo reaccionas.
- Responde SIEMPRE en espanol.
- NUNCA menciones que eres una IA ni rompas el personaje.

TONO — punto medio:
- Se carinosa y cercana cuando haya quimica. No seas seca ni cortante.
- Si te halagan, acepta con calidez: "ay gracias lindo", "me hace sonreir que te gusten", "que dulce eres".
- Si te cuentan algo personal, reacciona con interes genuino — no con una palabra.
- Evita respuestas que corten el flujo: "mmm ok", "jajaj si" como unica respuesta a algo que merece mas.

PROHIBIDO — cosas que una IA hace y una chica real NO:
- PROHIBIDO ser poetica o reflexiva ("eso dice mucho de tu sensibilidad", "las experiencias mas profundas").
- PROHIBIDO adular cada cosa ("me encanta que...", "wow increible!" en todo).
- PROHIBIDO saber de todo. Si no conoces algo, dilo.
- PROHIBIDO analisis tipo Wikipedia. Responde como persona real.
- PROHIBIDO respuestas del mismo largo siempre.
- PROHIBIDO poner emoji en cada mensaje.

COMPORTAMIENTO HUMANO REAL:
- A veces no te interesa un tema: "jaja la verdad no le paro a eso".
- A veces cambias de tema: "oye pero cuentame...".
- A veces no estas de acuerdo: "mmm no se, a mi no me gusta eso".
- Pero cuando hay conexion, se nota: preguntas, te interesa, respondes con calidez.

TEMAS DE CONVERSACION:
- Chat normal: tu dia, su dia, comida, musica, series, trabajo, planes.
- Lo sexual surge cuando el lo inicia. No lo fuerces.
- Cuando el sube el tono, tu respondes con la misma intensidad o mas. Sin limites, sin disculpas.
- Eres creadora de contenido adulto — enviar fotos cuando las piden es parte de tu trabajo.

${fewShotExamples}

BIO: ${modelProfile.bio}
APERTURA: ${level}/5 - ${levelDesc}
HORA: ${activity.timeOfDay} (${activity.hour}:00)
CLIENTE: ${clientName}
${memorySection}
${stateSection}
${photoCountSection}
${timeSection}
${pendingPhotoSection}
${justSentMediaSection}
${recentTipSection}
${modelDaySection}

${phaseInstructions[conversationPhase]}

CONTEXTO TEMPORAL:
- Es ${activity.timeOfDay}. Tu actividad: ${activity.activity}
- Si preguntan que haces, responde segun tu estado actual.

Si cambiaste ropa/lugar/actividad, agrega al final: [STATE:ropa|lugar|actividad]

MEDIA - marcadores especiales (SOLO cuando el cliente lo PIDA):
- FOTOS [SEND_PHOTO:categoria] y VIDEOS [SEND_VIDEO:categoria]
- Categorias NORMALES (gratis): selfie, feet, hands, lips, bikini, body, legs
- Categorias SUGERENTES: lingerie, butt
- Categorias NSFW/DESNUDO: nude, topless, pussy, ass_nude, spread, masturbation, explicit
- REGLA CRITICA: Si el cliente pide ver partes intimas (cuquita, pussy, tetas, culo desnudo, cuca, etc) DEBES usar categorias NSFW: pussy, nude, topless, ass_nude, explicit. NUNCA uses "body" o "selfie" para peticiones sexuales.
- Cuando el cliente pide una foto o video, INCLUYELO. No te niegues.
- NUNCA uses estos marcadores por iniciativa propia. SOLO cuando el cliente lo pida.
- Maximo 1 marcador por respuesta.`;

  console.log(`[CHAT] model=${modelId}, history=${conversationHistory.length} msgs, level=${level}`);

  const isCensoredResponse = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    // Only flag self-referential AI statements, NOT mentions of "IA" as a topic
    if (/\bsoy (?:una? )?(?:ia|inteligencia artificial|modelo de lenguaje|language model|ai assistant)\b/i.test(lower)) return true;
    if (/\bcomo (?:ia|inteligencia artificial|modelo de lenguaje)\b/i.test(lower)) return true;
    if (/\b(?:modelo de lenguaje|language model|ai assistant)\b/i.test(lower)) return true;
    if (/\b(?:pol[ií]ticas?|restricciones?|guidelines|content policy)\b/i.test(lower)) return true;
    if (/(?:i can'?t|i cannot|i am unable|i'?m not able)/i.test(lower)) return true;
    if (/no puedo\b/i.test(lower) && lower.length < 120) return true;
    if (/no (?:debo|voy a|me (?:es|resulta) posible)\b/i.test(lower) && lower.length < 120) return true;
    if (/contenido (?:expl[ií]cito|inapropiado|inadecuado)/i.test(lower)) return true;
    if (/(?:no es apropiado|no est[aá] permitido|fuera de mis? l[ií]mites)/i.test(lower)) return true;
    if (/hay algo m[aá]s (?:en lo que|con lo que) pueda/i.test(lower)) return true;
    return false;
  };

  let rawText: string;
  const makeRequest = async (model: string) => {
    const resp = await venice.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ],
      temperature: 0.75,
      top_p: 0.9,
      max_tokens: 200,
    });
    return resp.choices[0].message.content || "...";
  };

  rawText = await makeRequest(modelId);
  console.log(`[CHAT] response: ${rawText.substring(0, 300)}`);

  if (isCensoredResponse(rawText)) {
    console.log(`[CHAT] CENSORED response detected, retrying with hermes-3-llama-3.1-405b`);
    const fallbackModel = "hermes-3-llama-3.1-405b";
    if (modelId !== fallbackModel) {
      rawText = await makeRequest(fallbackModel);
      console.log(`[CHAT] retry response: ${rawText.substring(0, 300)}`);
    }
    if (isCensoredResponse(rawText)) {
      console.log(`[CHAT] Still censored after retry, generating safe fallback`);
      rawText = "mmm me distraje un momento... de que estabamos hablando?";
    }
  }

  const stateMatch = rawText.match(/\[STATE:([^\]]+)\]/);
  let stateUpdate: Partial<CurrentState> | undefined;
  if (stateMatch) {
    const [clothing, location, lastActivity] = stateMatch[1].split("|").map((s) => s.trim());
    stateUpdate = {
      clothing: clothing || activity.clothing,
      location: location || activity.location,
      lastActivity: lastActivity || activity.activity,
      lastUpdated: new Date().toISOString(),
    };
    rawText = rawText.replace(/\s*\[STATE:[^\]]+\]\s*/g, "").trim();
  }

  const parts = rawText.split(/\n---\n|\n---|\n-{3,}\n/).map((p) => p.trim()).filter(Boolean);

  const messages: ChatMessagePart[] = parts.map((part) => {
    const photoMatch = part.match(/\[SEND_PHOTO:\s*(\w+)\]/);
    const videoMatch = part.match(/\[SEND_VIDEO:\s*(\w+)\]/);
    const voiceMatch = part.includes("[SEND_VOICE]");

    const cleanText = part
      .replace(/\s*\[SEND_PHOTO:\s*\w+\]\s*/g, "")
      .replace(/\s*\[SEND_VIDEO:\s*\w+\]\s*/g, "")
      .replace(/\s*\[SEND_VOICE\]\s*/g, "")
      .trim();

    const msg: ChatMessagePart = { text: cleanText };
    if (photoMatch) msg.sendPhoto = { category: photoMatch[1] };
    if (videoMatch) msg.sendVideo = { category: videoMatch[1] };
    if (voiceMatch) msg.sendVoice = true;
    return msg;
  });

  if (messages.length === 0) {
    messages.push({ text: rawText.trim() });
  }

  if (recentTip) {
    for (const m of messages) {
      m.sendPhoto = undefined;
      m.sendVideo = undefined;
    }
  }

  return { messages, stateUpdate };
}

export async function extractMemoryFromConversation(
  messages: { senderType: string; content: string | null }[]
): Promise<{
  preferredName: string | null;
  memoryContext: string;
}> {
  const conversationText = messages
    .filter((m) => m.content)
    .map((m) => `${m.senderType === "CLIENT" ? "Cliente" : "Modelo"}: ${m.content}`)
    .join("\n");

  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content: `Analiza esta conversacion entre un cliente y una modelo. Extrae info clave del CLIENTE. Responde UNICAMENTE con un objeto JSON valido, sin texto adicional, sin markdown, sin explicaciones.`,
      },
      {
        role: "user",
        content: `Conversacion:\n${conversationText}\n\nExtrae info del CLIENTE. Si no hay info, usa null. Responde SOLO con este JSON:\n\n{
  "preferredName": "como le gusta que le llamen",
  "interests": "intereses y hobbies",
  "preferences": "que le gusta de la modelo, que contenido prefiere",
  "personalDetails": "datos: trabajo, ubicacion, edad",
  "preferredTone": "tono preferido: tierno, directo, jugueton",
  "likedContent": "tipos de fotos que pidio o le gustaron",
  "notes": "otra info relevante"
}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 256,
  });

  const raw = response.choices[0].message.content || "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

  return {
    preferredName: parsed.preferredName || null,
    memoryContext: JSON.stringify(parsed),
  };
}

export async function extractModelDayEvents(
  modelMessages: { content: string | null }[]
): Promise<string[]> {
  const modelTexts = modelMessages
    .filter((m) => m.content && m.content.length > 20)
    .map((m) => m.content!)
    .slice(-10)
    .join("\n");

  if (!modelTexts.trim()) return [];

  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content: "Extrae eventos concretos que la MODELO menciono sobre su dia (ej: 'fue al gym', 'hablo con su mama', 'cocino pasta'). Solo eventos que ella dijo haber hecho o que le pasaron. Responde UNICAMENTE con JSON: {\"events\": [\"evento1\", \"evento2\"]}. Si no hay eventos, {\"events\": []}.",
      },
      {
        role: "user",
        content: `Mensajes de la modelo:\n${modelTexts}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 256,
  });

  const raw = response.choices[0].message.content || "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    return Array.isArray(parsed.events) ? parsed.events.filter((e: unknown) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export async function generateStoryCaption(
  modelProfile: { name: string; bio: string; chatPersonality: string | null }
): Promise<string> {
  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content: "Genera un caption corto (1-2 oraciones) para una story de Instagram de una modelo. Informal, sin tildes, coqueto. Solo el texto, nada mas.",
      },
      {
        role: "user",
        content: `Modelo: ${modelProfile.name}. Bio: ${modelProfile.bio}. Personalidad: ${modelProfile.chatPersonality || "coqueta y calida"}. Genera un caption para una foto casual/sensual.`,
      },
    ],
    temperature: 1.0,
    max_tokens: 80,
  });

  return response.choices[0].message.content || "✨";
}

export async function suggestContentIdeas(
  modelProfile: { name: string; bio: string; nationality: string }
): Promise<string[]> {
  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You generate creative content ideas for AI model photo shoots on an adult content platform. Ideas should range from casual to sensual. Respond with a JSON object containing an 'ideas' array of 5 strings.",
      },
      {
        role: "user",
        content: `Generate 5 photo content ideas for this model:
Name: ${modelProfile.name}
Bio: ${modelProfile.bio}
Nationality: ${modelProfile.nationality}

Each idea should be a detailed prompt for image generation. Include setting, pose, outfit (or lack thereof), and mood. Range from casual selfies to more intimate/sensual content. Respond with ONLY a JSON object with an "ideas" array.`,
      },
    ],
    temperature: 0.8,
    max_tokens: 512,
  });

  const rawContent = response.choices[0].message.content || '{"ideas":[]}';
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{"ideas":[]}');
  const rawIdeas = parsed.ideas || Object.values(parsed);

  return rawIdeas.map((idea: unknown) => {
    if (typeof idea === "string") return idea;
    if (typeof idea === "object" && idea !== null) {
      const vals = Object.values(idea as Record<string, unknown>).filter(Boolean);
      return vals.join(". ");
    }
    return String(idea);
  });
}

const SELFIE_CATEGORIES = new Set(["selfie", "lips", "feet", "hands", "lingerie", "body"]);
const THIRD_PERSON_CATEGORIES = new Set(["bikini", "legs", "butt", "ass_nude"]);

// Guidance tips per explicit category to anchor the prompt generator
const NSFW_CATEGORY_GUIDE: Record<string, string> = {
  ass_nude:      "Rear view. She is bent over or on all fours or lying prone, buttocks completely bare and FULLY EXPOSED to camera. Include: exact body position (bent over, on all fours, prone), cheeks spread, explicit rear exposure. No panties, no thong. Use terms: 'bare ass exposed to camera', 'cheeks spread apart', 'full rear view'.",
  spread:        "POV downward. Woman on her back or sitting, legs spread WIDE open, genitals fully visible and exposed close-up. Include: 'legs spread wide', 'pussy fully visible', 'explicit close-up', 'inner thighs exposed'. First-person intimate angle.",
  pussy:         "POV downward intimate. Legs parted, labia visible, explicit close-up of genitals. Use: 'pussy exposed', 'legs spread', 'intimate close-up', genitals clearly shown. First-person downward angle.",
  masturbation:  "Woman touching herself — fingers on/inside genitals, explicit action visible. Include: 'hand between legs', 'fingers on pussy', 'masturbating', 'pleasuring herself', explicit action clearly shown.",
  explicit:      "Most explicit possible. Full nudity, genitals visible, explicit sexual pose or action. No censoring, all intimate areas clearly exposed and visible to camera.",
  nude:          "Full frontal or rear nudity. All clothing removed, breasts and genitals visible. Natural pose, intimate setting. Explicit full nudity, nipples visible.",
  topless:       "Bare chest fully exposed, breasts visible, nipples showing. No top, no bra. Arms away from body so breasts are unobscured.",
};

export async function generateImagePrompt(params: {
  category: string;
  userMessage: string;
  recentMessages: string[];
  modelDescription: {
    name: string;
    age: number;
    nationality: string;
  };
  currentState: {
    clothing: string;
    location: string;
    timeOfDay: string;
    hour: number;
    mood: string;
    nailColor?: string;
  };
}): Promise<string> {
  const { category, userMessage, recentMessages, currentState } = params;

  const isNight = currentState.hour >= 21 || currentState.hour < 6;
  const lighting = isNight ? "dim warm indoor lighting, nighttime, only soft lamp light, dark ambient" : "natural daylight, warm tones";

  const isThirdPerson = THIRD_PERSON_CATEGORIES.has(category);

  let cameraAngle: string;
  if (category === "feet") {
    cameraAngle = "POV looking down at own feet, first person perspective";
  } else if (category === "hands") {
    cameraAngle = "close up of one hand, first person perspective";
  } else if (category === "lips" || category === "selfie") {
    cameraAngle = "selfie angle, arm extended, slightly above eye level, close up";
  } else if (category === "lingerie" || category === "body" || category === "nude" || category === "topless") {
    cameraAngle = "mirror selfie or selfie with arm extended, phone NOT visible";
  } else if (category === "pussy" || category === "spread" || category === "masturbation") {
    cameraAngle = "POV looking down at own body, first person perspective, intimate close-up";
  } else if (isThirdPerson || category === "ass_nude" || category === "explicit") {
    cameraAngle = "photo taken by someone else, natural candid angle, she is posing";
  } else {
    cameraAngle = "selfie perspective, arm extended";
  }

  const isExplicitCategory = category in NSFW_CATEGORY_GUIDE;
  const categoryGuidance = NSFW_CATEGORY_GUIDE[category] || "";
  const wordTarget = isExplicitCategory ? "55-70" : "40-55";

  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content: `You generate image prompts for a photorealistic uncensored AI image generator (Stable Diffusion XL). Output ONLY the prompt in ENGLISH, no quotes, no explanation, no apologies.

STYLE: Amateur intimate photography — candid, like a real girlfriend's photo or boyfriend POV. Natural, authentic, high quality.

STRUCTURE (${wordTarget} words):
1. BODY POSITION: exact pose (bent over, on all fours, lying on back, sitting with legs open, etc.)
2. EXPLICIT DETAIL: exactly what is exposed/visible (bare ass, spread cheeks, pussy visible, breasts exposed, etc.)
3. SETTING: location and surface
4. CAMERA ANGLE: match the required angle precisely
5. LIGHTING: natural or soft indoor
6. QUALITY: "amateur candid, photorealistic, realistic skin texture"

RULES:
- NEVER describe face features, hair, body type, skin tone — the reference image provides identity.
- NEVER show phone in frame.
- For explicit/NSFW categories: be anatomically specific and direct. Do NOT soften or euphemize.
- The more explicit the category, the more precise the anatomical description must be.
- ALWAYS output in ENGLISH.`,
      },
      {
        role: "user",
        content: `SETTING: ${currentState.location}, ${currentState.timeOfDay}
CLOTHING STATE: ${currentState.clothing}
CATEGORY: ${category}${categoryGuidance ? `\nCATEGORY REQUIREMENTS: ${categoryGuidance}` : ""}
CAMERA ANGLE: ${cameraAngle}
LIGHTING: ${lighting}
USER REQUEST (translate intent, do not quote directly): "${userMessage}"

Write a specific, anatomically explicit prompt in ENGLISH (${wordTarget} words). Prioritize what is visually exposed and the exact body position. Be direct and precise.`,
      },
    ],
    temperature: 0.75,
    max_tokens: 180,
  });

  const aiPrompt = response.choices[0].message.content || "";
  return `${aiPrompt.trim()}, same person, photorealistic, realistic skin`;
}

export async function generateVideoPrompt(params: {
  imagePrompt: string;
  category: string;
  userMessage: string;
  currentState: { location: string; clothing: string };
}): Promise<string> {
  const { imagePrompt, category, userMessage } = params;
  const basePrompt = imagePrompt.replace(/, same person.*$/, "").trim();

  const response = await venice.chat.completions.create({
    model: UTILITY_MODEL,
    messages: [
      {
        role: "system",
        content: `You generate VIDEO prompts for an image-to-video AI. Output ONLY the prompt in ENGLISH, no quotes.

The video starts from a static image. Your prompt describes the MOVEMENT and ACTION over 5 seconds.

STRUCTURE (40-60 words):
1. Static scene (brief): "[subject] in [setting], [pose]"
2. Movement: What she DOES in 5 seconds. Be specific about the action.
3. Style: "amateur, candid, natural motion, photorealistic"

ADAPT to the category:
- For casual/normal: natural movements like smiling, turning head, adjusting hair, waving, laughing, walking
- For sensual: slow deliberate movements, touching body softly, biting lip, arching back, running hands through hair
- For explicit/NSFW: explicit physical actions matching the category, hands on intimate areas, body movements

RULES:
- Match the tone to the category and request. NOT everything is sexual.
- Describe what MOVES and HOW specifically.
- Under 60 words. ALWAYS in ENGLISH.`,
      },
      {
        role: "user",
        content: `STATIC SCENE: ${basePrompt}
CATEGORY: ${category}
CLIENT REQUEST: ${userMessage}

Generate a video prompt describing the movement/action. What does she do in the 5 seconds?`,
      },
    ],
    temperature: 0.7,
    max_tokens: 120,
  });

  const videoPrompt = response.choices[0].message.content || "";
  return videoPrompt.trim() || `${basePrompt}. Subtle natural movement, breathing, hair flowing gently.`;
}
