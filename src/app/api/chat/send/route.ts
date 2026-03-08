import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateChatResponse, extractMemoryFromConversation, generateImagePrompt } from "@/lib/openai";
import type { ChatMessagePart } from "@/lib/openai";
import { generateImageFromImage } from "@/lib/replicate";
import { saveImageFromUrl } from "@/lib/upload";
import { generateVoiceMessage } from "@/lib/fishaudio";
import { parseCurrentState, getModelActivityContext } from "@/lib/model-context";
import { readFile } from "fs/promises";
import path from "path";

const PAID_PHOTO_PRICE = 3.99;
const FREE_CATEGORIES = new Set(["selfie"]);
const MEMORY_EXTRACTION_INTERVAL = 10;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, content, imageUrl, isPaidContent, price } =
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
      const history = reversedMessages.map((m) => ({
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

      const aiResult = await generateChatResponse({
        modelProfile: {
          name: conversation.modelProfile.name,
          age: conversation.modelProfile.age,
          nationality: conversation.modelProfile.nationality,
          bio: conversation.modelProfile.bio,
          chatPersonality: conversation.modelProfile.chatPersonality || "Calida, coqueta y encantadora",
          eroticLevel: conversation.eroticLevel || conversation.modelProfile.eroticLevel,
          timezone: tz,
        },
        conversationHistory: history,
        memoryContext: conversation.memoryContext,
        preferredName: conversation.preferredName,
        eroticLevel: conversation.eroticLevel,
        currentState,
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

      const savedMessages: Record<string, unknown>[] = [];

      for (const part of aiResult.messages) {
        const msgs = await processMessagePart(
          part,
          conversationId,
          conversation.modelProfile,
          photoContext
        );
        savedMessages.push(...msgs);
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
  photoContext: PhotoContext
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
      try {
        const photoMsg = await generateAndSendPhoto(
          conversationId,
          referenceImage.imageUrl,
          part.sendPhoto.category,
          photoContext
        );
        if (photoMsg) {
          results.push({ ...photoMsg, price: Number(photoMsg.price) });
        }
      } catch (err) {
        console.error("Photo generation failed:", err);
      }
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

async function generateAndSendPhoto(
  conversationId: string,
  referenceImageUrl: string,
  category: string,
  context: PhotoContext
) {
  const isFree = FREE_CATEGORIES.has(category);

  const prompt = await generateImagePrompt({
    category,
    userMessage: context.userMessage,
    recentMessages: context.recentMessages,
    modelDescription: context.modelDescription,
    currentState: context.currentState,
  });

  console.log("[PHOTO PROMPT]", prompt);

  let imageInput = referenceImageUrl;
  if (referenceImageUrl.startsWith("/uploads")) {
    imageInput = await localPathToDataUri(referenceImageUrl);
  }

  const generatedUrl = await generateImageFromImage(imageInput, prompt);
  const localUrl = await saveImageFromUrl(generatedUrl, "chat-photos");

  return prisma.message.create({
    data: {
      conversationId,
      senderType: "MODEL",
      imageUrl: localUrl,
      content: null,
      isPaidContent: !isFree,
      price: isFree ? 0 : PAID_PHOTO_PRICE,
    },
  });
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
