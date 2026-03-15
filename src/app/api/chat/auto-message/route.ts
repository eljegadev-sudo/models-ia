import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateChatResponse } from "@/lib/ai";
import { parseCurrentState, getModelActivityContext } from "@/lib/model-context";

const INACTIVITY_HOURS = 4;
const COOLDOWN_HOURS = 8;

export async function POST() {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_HOURS * 60 * 60 * 1000);
    const cooldown = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);

    const conversations = await prisma.conversation.findMany({
      where: {
        aiEnabled: true,
        modelProfile: { chatAutomatic: true },
        messages: {
          some: {
            createdAt: { lt: cutoff },
          },
        },
      },
      include: {
        modelProfile: {
          select: {
            name: true,
            age: true,
            nationality: true,
            bio: true,
            chatPersonality: true,
            eroticLevel: true,
            timezone: true,
            id: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        client: {
          select: { id: true },
        },
      },
    });

    let sentCount = 0;

    for (const conv of conversations) {
      if (conv.messages.length === 0) continue;

      const lastMsg = conv.messages[0];
      if (lastMsg.createdAt > cutoff) continue;

      const hasRecentAutoMsg = conv.messages.some(
        (m) => m.senderType === "MODEL" && !m.imageUrl && m.createdAt > cooldown
      );
      if (hasRecentAutoMsg && lastMsg.senderType === "MODEL") continue;

      const minutesSince = Math.floor((Date.now() - lastMsg.createdAt.getTime()) / 60000);
      const hoursSince = Math.floor(minutesSince / 60);

      const reversedMessages = [...conv.messages].reverse();
      const history = reversedMessages.map((m) => ({
        role: (m.senderType === "CLIENT" ? "user" : "assistant") as "user" | "assistant",
        content: m.content || "",
      }));

      const currentState = parseCurrentState(conv.currentState);
      const tz = conv.modelProfile.timezone || "America/New_York";

      const aiResult = await generateChatResponse({
        modelProfile: {
          name: conv.modelProfile.name,
          age: conv.modelProfile.age,
          nationality: conv.modelProfile.nationality,
          bio: conv.modelProfile.bio,
          chatPersonality: conv.modelProfile.chatPersonality || "Calida, coqueta y encantadora",
          eroticLevel: conv.eroticLevel || conv.modelProfile.eroticLevel,
          timezone: tz,
        },
        conversationHistory: history,
        memoryContext: conv.memoryContext,
        preferredName: conv.preferredName,
        eroticLevel: conv.eroticLevel,
        currentState,
        msgsSinceLastPhoto: 999,
        timeSinceLastMessage: minutesSince,
        pendingPhotoGeneration: false,
      });

      const textParts = aiResult.messages.filter((m) => m.text && !m.sendPhoto);
      const textContent = textParts.map((m) => m.text).join(" ") || `Hola! hace rato no hablamos... te extrañe 😊`;

      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderType: "MODEL",
          content: textContent,
        },
      });

      await prisma.notification.create({
        data: {
          userId: conv.client.id,
          type: "message",
          title: conv.modelProfile.name,
          body: textContent.substring(0, 100),
          link: `/chat/${conv.id}`,
        },
      });

      console.log(`[AUTO-MSG] Sent to conv ${conv.id} (inactive ${hoursSince}h)`);
      sentCount++;
    }

    return NextResponse.json({ sent: sentCount });
  } catch (error) {
    console.error("Auto-message error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
