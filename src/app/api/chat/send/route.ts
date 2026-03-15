import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateChatResponse, extractMemoryFromConversation, extractModelDayEvents, generateImagePrompt, generateVideoPrompt } from "@/lib/ai";
import type { ChatMessagePart } from "@/lib/ai";
import type { ChatModelId } from "@/lib/venice";
import { CHAT_MODELS, queueVideo, retrieveVideo } from "@/lib/venice";
import { generateImageFromImage } from "@/lib/replicate";
import { generateNSFWImage, checkPhotonicHealth } from "@/lib/photonic";
import { saveImageFromUrl, saveImageFromBase64 } from "@/lib/upload";
import { generateVoiceMessage } from "@/lib/fishaudio";
import { parseCurrentState, getModelActivityContext } from "@/lib/model-context";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const NSFW_PRICE = 4.99;
const SUGGESTIVE_PRICE = 2.99;
const FREE_CATEGORIES = new Set(["selfie", "lips", "feet", "hands", "bikini", "body", "legs"]);
const NSFW_CATEGORIES = new Set(["nude", "explicit", "topless", "naked", "pussy", "ass_nude", "spread", "masturbation"]);
const SUGGESTIVE_PAID = new Set(["lingerie", "butt"]);
const MEMORY_EXTRACTION_INTERVAL = 10;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, content, imageUrl, isPaidContent, price, chatModel } =
      await request.json();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        modelProfile: {
          select: {
            id: true,
            name: true,
            age: true,
            nationality: true,
            bio: true,
            chatAutomatic: true,
            chatPersonality: true,
            backstory: true,
            eroticLevel: true,
            voiceModelId: true,
            timezone: true,
            userId: true,
            referenceImages: {
              take: 1,
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const isClient = conversation.clientId === session.user.id;
    const isCreator = conversation.modelProfile.userId === session.user.id;

    if (!isClient && !isCreator) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        senderType: isClient ? "CLIENT" : "MODEL",
        content,
        imageUrl,
        isPaidContent: isPaidContent || false,
        price: price || 0,
      },
    });

    const result: {
      userMessage: Record<string, unknown>;
      aiMessages?: Record<string, unknown>[];
    } = {
      userMessage: { ...userMessage, price: Number(userMessage.price) },
    };

    if (isClient && conversation.aiEnabled && conversation.modelProfile.chatAutomatic) {
      const reversedMessages = [...conversation.messages].reverse();

      const isToxicMessage = (text: string): boolean => {
        const lower = text.toLowerCase().trim();
        if (/\b(?:ia|inteligencia artificial|modelo de lenguaje|language model|ai assistant)\b/i.test(lower)) return true;
        if (/\b(?:pol[ií]ticas?|restricciones?|guidelines|content policy)\b/i.test(lower)) return true;
        if (/(?:i can'?t|i cannot|i am unable)/i.test(lower)) return true;
        if (/no puedo\b/i.test(lower) && lower.length < 120) return true;
        if (/no (?:debo|voy a|me (?:es|resulta) posible)\b/i.test(lower) && lower.length < 120) return true;
        if (/contenido (?:expl[ií]cito|inapropiado|inadecuado)/i.test(lower)) return true;
        if (/(?:no es apropiado|no est[aá] permitido|fuera de mis? l[ií]mites)/i.test(lower)) return true;
        if (/hay algo m[aá]s (?:en lo que|con lo que) pueda/i.test(lower)) return true;
        return false;
      };

      const history = reversedMessages
        .filter((m) => {
          if (!m.content) return true;
          if (m.senderType === "MODEL" && isToxicMessage(m.content)) return false;
          return true;
        })
        .map((m) => ({
          role: (m.senderType === "CLIENT" ? "user" : "assistant") as "user" | "assistant",
          content: m.content || "",
        }));
      history.push({ role: "user", content: content || "" });

      const recentTexts = reversedMessages
        .filter((m) => m.content)
        .map((m) => `${m.senderType === "CLIENT" ? "Cliente" : "Modelo"}: ${m.content}`)
        .slice(-8);
      recentTexts.push(`Cliente: ${content || ""}`);

      const currentState = parseCurrentState(conversation.currentState);
      const tz = conversation.modelProfile.timezone || "America/New_York";
      const activity = getModelActivityContext(tz);

      let msgsSinceLastPhoto = 0;
      let lastMessageWasMedia = false;
      for (let i = reversedMessages.length - 1; i >= 0; i--) {
        const m = reversedMessages[i];
        if (m.imageUrl || m.videoUrl) {
          if (m.senderType === "MODEL") lastMessageWasMedia = true;
          break;
        }
        if (m.content) msgsSinceLastPhoto++;
      }

      let timeSinceLastMessage: number | null = null;
      if (reversedMessages.length > 0) {
        const lastMsg = reversedMessages[reversedMessages.length - 1];
        timeSinceLastMessage = Math.floor((Date.now() - lastMsg.createdAt.getTime()) / 60000);
      }

      const isPendingPhoto = conversation.pendingPhotoGeneration;
      const isShortWaitMsg = isPendingPhoto && (content || "").trim().length < 15;

      if (isShortWaitMsg) {
        const waitResponses = [
          "ya casi, un momentito mas...",
          "espera que ya te la mando...",
          "un poquito mas... quiero que quede perfecta",
          "casi lista...",
        ];
        const waitMsg = await prisma.message.create({
          data: {
            conversationId,
            senderType: "MODEL",
            content: waitResponses[Math.floor(Math.random() * waitResponses.length)],
          },
        });
        result.aiMessages = [{ ...waitMsg, price: Number(waitMsg.price) }];
        return NextResponse.json(result);
      }

      const validModel = chatModel && chatModel in CHAT_MODELS ? chatModel as ChatModelId : undefined;

      const aiResult = await generateChatResponse({
        modelProfile: {
          name: conversation.modelProfile.name,
          age: conversation.modelProfile.age,
          nationality: conversation.modelProfile.nationality,
          bio: conversation.modelProfile.bio,
          chatPersonality: conversation.modelProfile.chatPersonality || "Calida, coqueta y encantadora",
          backstory: conversation.modelProfile.backstory,
          eroticLevel: conversation.eroticLevel || conversation.modelProfile.eroticLevel,
          timezone: tz,
        },
        conversationHistory: history,
        memoryContext: conversation.memoryContext,
        preferredName: conversation.preferredName,
        eroticLevel: conversation.eroticLevel,
        currentState,
        chatModel: validModel,
        msgsSinceLastPhoto,
        timeSinceLastMessage,
        pendingPhotoGeneration: isPendingPhoto,
        lastMessageWasMedia,
        modelDayContext: conversation.modelDayContext,
      });

      const photoContext = {
        modelDescription: {
          name: conversation.modelProfile.name,
          age: conversation.modelProfile.age,
          nationality: conversation.modelProfile.nationality,
        },
        currentState: {
          clothing: currentState?.clothing || activity.clothing,
          location: currentState?.location || activity.location,
          timeOfDay: activity.timeOfDay,
          hour: activity.hour,
          mood: activity.mood,
          nailColor: currentState?.nailColor || "rojo",
        },
        recentMessages: recentTexts,
        userMessage: content || "",
      };

      const userMsg = (content || "").toLowerCase();
      const userExplicitlyRequestedMedia = /\b(?:foto|video|imagen|mandame|manda|envia|env[ií]ame|quiero ver|muestrame|mu[eé]strame|env[ií]a|fotito|videito|selfie|desnud|nude|tetas|culo|cuqui)\b/i.test(userMsg);

      if (lastMessageWasMedia && !userExplicitlyRequestedMedia) {
        for (const part of aiResult.messages) {
          if (part.sendPhoto || part.sendVideo) {
            console.log(`[CHAT] Stripped unsolicited media (user did not request, last msg was media)`);
            part.sendPhoto = undefined;
            part.sendVideo = undefined;
          }
        }
      }

      const savedMessages: Record<string, unknown>[] = [];
      let mediaAlreadySent = false;

      const effectiveEroticLevel = conversation.eroticLevel || conversation.modelProfile.eroticLevel;
      for (const part of aiResult.messages) {
        if ((part.sendPhoto || part.sendVideo) && mediaAlreadySent) {
          console.log(`[CHAT] Stripped duplicate media marker (max 1 per response)`);
          part.sendPhoto = undefined;
          part.sendVideo = undefined;
        }

        const msgs = await processMessagePart(
          part,
          conversationId,
          conversation.modelProfile,
          photoContext,
          effectiveEroticLevel
        );
        savedMessages.push(...msgs);

        if (part.sendPhoto || part.sendVideo) {
          mediaAlreadySent = true;
        }
      }

      result.aiMessages = savedMessages;

      if (aiResult.stateUpdate) {
        const newState = {
          ...(currentState || {}),
          ...aiResult.stateUpdate,
          nailColor: currentState?.nailColor || "rojo",
          lastUpdated: new Date().toISOString(),
        };
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { currentState: JSON.stringify(newState) },
        });
      }

      const totalMessages = conversation.messages.length + 2;
      const lastUpdate = conversation.lastMemoryUpdate;
      const shouldExtractMemory =
        totalMessages >= MEMORY_EXTRACTION_INTERVAL &&
        (!lastUpdate ||
          conversation.messages.filter((m) => m.createdAt > lastUpdate).length >= MEMORY_EXTRACTION_INTERVAL);

      if (shouldExtractMemory) {
        const newMsgs = savedMessages.map((m) => ({
          senderType: m.senderType as string,
          content: m.content as string | null,
        }));
        extractAndSaveMemory(
          conversationId,
          conversation.messages,
          { senderType: userMessage.senderType, content: userMessage.content },
          ...newMsgs
        ).catch((err) => console.error("Memory extraction failed:", err));
      }

      const modelMsgs = savedMessages
        .filter((m) => m.senderType === "MODEL")
        .map((m) => ({ content: m.content as string | null }));
      if (modelMsgs.length > 0) {
        extractAndSaveModelDay(conversationId, conversation.modelDayContext, modelMsgs).catch((err) =>
          console.error("Model day extraction failed:", err)
        );
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface PhotoContext {
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
  recentMessages: string[];
  userMessage: string;
}

async function processMessagePart(
  part: ChatMessagePart,
  conversationId: string,
  modelProfile: {
    referenceImages: { imageUrl: string }[];
    voiceModelId: string | null;
  },
  photoContext: PhotoContext,
  eroticLevel: number
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];

  if (part.text) {
    let audioUrl: string | null = null;

    if (part.sendVoice) {
      try {
        audioUrl = await generateVoiceMessage(
          part.text,
          modelProfile.voiceModelId || undefined
        );
      } catch (err) {
        console.error("Voice generation failed:", err);
      }
    }

    const textMsg = await prisma.message.create({
      data: {
        conversationId,
        senderType: "MODEL",
        content: part.sendVoice ? null : part.text,
        audioUrl,
      },
    });
    results.push({ ...textMsg, price: Number(textMsg.price) });
  }

  if (part.sendPhoto) {
    const referenceImage = modelProfile.referenceImages[0];
    if (referenceImage) {
      const category = part.sendPhoto.category;
      const userMsgIsNSFW = NSFW_PROMPT_KEYWORDS.test(photoContext.userMessage);
      const needsPhotonic = NSFW_CATEGORIES.has(category) || userMsgIsNSFW;

      if (needsPhotonic) {
        const photonicOk = await checkPhotonicHealth();
        if (!photonicOk) {
          const fallbackMsg = await prisma.message.create({
            data: {
              conversationId,
              senderType: "MODEL",
              content: "mmm dame un ratito, no me quedo bien la foto... intento de nuevo despues",
            },
          });
          results.push({ ...fallbackMsg, price: Number(fallbackMsg.price) });
        } else {
          const preparingTexts = [
            "espera que me preparo...",
            "dame un momento...",
            "un segundito que quiero que quede bien...",
          ];
          const preparingMsg = await prisma.message.create({
            data: {
              conversationId,
              senderType: "MODEL",
              content: preparingTexts[Math.floor(Math.random() * preparingTexts.length)],
            },
          });
          results.push({ ...preparingMsg, price: Number(preparingMsg.price) });

          await prisma.conversation.update({ where: { id: conversationId }, data: { pendingPhotoGeneration: true } });

          generateAndSendPhoto(
            conversationId,
            referenceImage.imageUrl,
            category,
            photoContext,
            eroticLevel
          ).then(() => {
            prisma.conversation.update({ where: { id: conversationId }, data: { pendingPhotoGeneration: false } }).catch(() => {});
          }).catch((err) => {
            console.error("Background photo generation failed:", err);
            prisma.conversation.update({ where: { id: conversationId }, data: { pendingPhotoGeneration: false } }).catch(() => {});
          });
        }
      } else {
        try {
          const photoMsg = await generateAndSendPhoto(
            conversationId,
            referenceImage.imageUrl,
            category,
            photoContext,
            eroticLevel
          );
          if (photoMsg) {
            results.push({ ...photoMsg, price: Number(photoMsg.price) });
          }
        } catch (err) {
          console.error("Photo generation failed:", err);
        }
      }
    }
  }

  if (part.sendVideo) {
    const referenceImage = modelProfile.referenceImages[0];
    if (referenceImage) {
      const category = part.sendVideo.category;
      const preparingMsg = await prisma.message.create({
        data: {
          conversationId,
          senderType: "MODEL",
          content: "estoy grabando algo para ti... dame unos minutos",
        },
      });
      results.push({ ...preparingMsg, price: Number(preparingMsg.price) });

      generateAndSendVideo(
        conversationId,
        referenceImage.imageUrl,
        category,
        photoContext,
        eroticLevel
      ).catch((err) => {
        console.error("Background video generation failed:", err);
      });
    }
  }

  return results;
}

async function localPathToDataUri(localPath: string): Promise<string> {
  const filePath = path.join(process.cwd(), "public", localPath);
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).slice(1) || "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

const NSFW_PROMPT_KEYWORDS = /\b(nude|naked|topless|pussy|vagina|genital|breast|nipple|ass|butt.?naked|spread|masturbat|explicit|desnud|without.?cloth|no.?cloth|bare.?breast|exposed|cuquita|cuca|tetas|pecho.?desnud|senos|culo|nalgas|coño|panocha|chichi|pezones)\b/i;

async function generateAndSendPhoto(
  conversationId: string,
  referenceImageUrl: string,
  category: string,
  context: PhotoContext,
  eroticLevel: number
) {
  const prompt = await generateImagePrompt({
    category,
    userMessage: context.userMessage,
    recentMessages: context.recentMessages,
    modelDescription: context.modelDescription,
    currentState: context.currentState,
  });

  console.log("[PHOTO PROMPT]", prompt);

  const promptIsNSFW = NSFW_PROMPT_KEYWORDS.test(prompt) || NSFW_PROMPT_KEYWORDS.test(context.userMessage);
  const categoryIsNSFW = NSFW_CATEGORIES.has(category);

  if (promptIsNSFW && !categoryIsNSFW) {
    console.log(`[PHOTO] Prompt/request is NSFW but category "${category}" is not — upgrading to Photonic`);
  }

  let localUrl: string;

  const usePhotonic = (categoryIsNSFW || promptIsNSFW) && await checkPhotonicHealth();

  if (usePhotonic) {
    let refBase64: string;
    if (referenceImageUrl.startsWith("/uploads")) {
      const filePath = path.join(process.cwd(), "public", referenceImageUrl);
      const buffer = await readFile(filePath);
      refBase64 = buffer.toString("base64");
    } else if (referenceImageUrl.startsWith("data:")) {
      refBase64 = referenceImageUrl.split(",")[1];
    } else {
      const resp = await fetch(referenceImageUrl);
      const buf = Buffer.from(await resp.arrayBuffer());
      refBase64 = buf.toString("base64");
    }

    console.log(`[PHOTO] Photonic NSFW (category: ${category}, erotic: ${eroticLevel})`);
    const result = await generateNSFWImage(prompt, refBase64, {
      mode: "faceid",
      faceswap: true,
      restore: true,
    });
    localUrl = await saveImageFromBase64(result.image, "chat-photos");
  } else {
    console.log(`[PHOTO] Replicate/Qwen (category: ${category}, erotic: ${eroticLevel})`);
    let imageInput = referenceImageUrl;
    if (referenceImageUrl.startsWith("/uploads")) {
      imageInput = await localPathToDataUri(referenceImageUrl);
    }

    const generatedUrl = await generateImageFromImage(imageInput, prompt);
    localUrl = await saveImageFromUrl(generatedUrl, "chat-photos");
  }

  const isActuallyNSFW = categoryIsNSFW || promptIsNSFW;
  const isFree = FREE_CATEGORIES.has(category) && !isActuallyNSFW;
  const photoPrice = isActuallyNSFW ? NSFW_PRICE : isFree ? 0 : SUGGESTIVE_PRICE;

  return prisma.message.create({
    data: {
      conversationId,
      senderType: "MODEL",
      imageUrl: localUrl,
      content: null,
      isPaidContent: !isFree,
      price: photoPrice,
    },
  });
}

async function generateAndSendVideo(
  conversationId: string,
  referenceImageUrl: string,
  category: string,
  context: PhotoContext,
  eroticLevel: number
) {
  try {
    const prompt = await generateImagePrompt({
      category,
      userMessage: context.userMessage,
      recentMessages: context.recentMessages,
      modelDescription: context.modelDescription,
      currentState: context.currentState,
    });

    console.log("[VIDEO] Generating source image first...");

    const videoPromptIsNSFW = NSFW_PROMPT_KEYWORDS.test(prompt) || NSFW_PROMPT_KEYWORDS.test(context.userMessage);
    const usePhotonic = (NSFW_CATEGORIES.has(category) || videoPromptIsNSFW) && await checkPhotonicHealth();
    let sourceImageUrl: string;

    if (usePhotonic) {
      let refBase64: string;
      if (referenceImageUrl.startsWith("/uploads")) {
        const filePath = path.join(process.cwd(), "public", referenceImageUrl);
        const buffer = await readFile(filePath);
        refBase64 = buffer.toString("base64");
      } else if (referenceImageUrl.startsWith("data:")) {
        refBase64 = referenceImageUrl.split(",")[1];
      } else {
        const resp = await fetch(referenceImageUrl);
        const buf = Buffer.from(await resp.arrayBuffer());
        refBase64 = buf.toString("base64");
      }

      const result = await generateNSFWImage(prompt, refBase64, {
        mode: "faceid",
        faceswap: true,
        restore: true,
      });
      sourceImageUrl = await saveImageFromBase64(result.image, "video-sources");
    } else {
      let imageInput = referenceImageUrl;
      if (referenceImageUrl.startsWith("/uploads")) {
        imageInput = await localPathToDataUri(referenceImageUrl);
      }
      const generatedUrl = await generateImageFromImage(imageInput, prompt);
      sourceImageUrl = await saveImageFromUrl(generatedUrl, "video-sources");
    }

    const imageDataUrl = await localPathToDataUri(sourceImageUrl);

    const videoPrompt = await generateVideoPrompt({
      imagePrompt: prompt,
      category,
      userMessage: context.userMessage,
      currentState: context.currentState,
    });

    console.log("[VIDEO] Queueing video generation with Venice wan-2.6...");
    const { queueId, model } = await queueVideo({
      prompt: videoPrompt,
      duration: "5s",
      imageUrl: imageDataUrl,
      resolution: "720p",
      audio: false,
    });

    console.log(`[VIDEO] Queued: ${queueId}, polling for result...`);

    let videoBuffer: Buffer | undefined;
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const result = await retrieveVideo(queueId, model);
      console.log(`[VIDEO] Poll ${i + 1}: status=${result.status}, progress=${result.progress || 0}%`);

      if (result.status === "completed" && result.videoBuffer) {
        videoBuffer = result.videoBuffer;
        break;
      }
      if (result.status === "failed" || result.status === "error") {
        throw new Error(`Video generation failed with status: ${result.status}`);
      }
    }

    if (!videoBuffer) {
      throw new Error("Video generation timed out");
    }

    const videosDir = path.join(process.cwd(), "public", "uploads", "videos");
    await mkdir(videosDir, { recursive: true });
    const videoFilename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const videoPath = path.join(videosDir, videoFilename);
    await writeFile(videoPath, videoBuffer);
    const videoUrl = `/uploads/videos/${videoFilename}`;

    console.log(`[VIDEO] Saved: ${videoUrl}`);

    const isNSFWContent = NSFW_CATEGORIES.has(category) || videoPromptIsNSFW;
    await prisma.message.create({
      data: {
        conversationId,
        senderType: "MODEL",
        videoUrl,
        content: null,
        isPaidContent: isNSFWContent,
        price: isNSFWContent ? NSFW_PRICE : SUGGESTIVE_PRICE,
      },
    });

    console.log("[VIDEO] Message saved to conversation");
  } catch (err) {
    console.error("[VIDEO] Generation failed:", err);
    await prisma.message.create({
      data: {
        conversationId,
        senderType: "MODEL",
        content: "ay no me quedo bien el video... despues intento de nuevo",
      },
    });
  }
}

async function extractAndSaveMemory(
  conversationId: string,
  existingMessages: { senderType: string; content: string | null; createdAt: Date }[],
  ...newMessages: { senderType: string; content: string | null }[]
) {
  const allMessages = [
    ...existingMessages.reverse().map((m) => ({ senderType: m.senderType, content: m.content })),
    ...newMessages,
  ];

  const recentMessages = allMessages.slice(-30);
  const memoryResult = await extractMemoryFromConversation(recentMessages);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      memoryContext: memoryResult.memoryContext,
      preferredName: memoryResult.preferredName,
      lastMemoryUpdate: new Date(),
    },
  });
}

async function extractAndSaveModelDay(
  conversationId: string,
  existingDayContext: string | null,
  modelMessages: { content: string | null }[]
) {
  const events = await extractModelDayEvents(modelMessages);
  if (events.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  let mergedEvents = events;

  if (existingDayContext) {
    try {
      const parsed = JSON.parse(existingDayContext);
      if (parsed.date === today && Array.isArray(parsed.events)) {
        const existingSet = new Set<string>(parsed.events as string[]);
        for (const e of events) {
          if (!existingSet.has(e)) existingSet.add(e);
        }
        mergedEvents = Array.from(existingSet);
      }
    } catch {
      // use only new events
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      modelDayContext: JSON.stringify({ date: today, events: mergedEvents }),
    },
  });
}
