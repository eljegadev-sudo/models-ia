import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processPayment } from "@/lib/payments";
import { generateChatResponse } from "@/lib/ai";
import { parseCurrentState, getModelActivityContext } from "@/lib/model-context";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, amount } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        modelProfile: {
          select: {
            userId: true,
            name: true,
            age: true,
            nationality: true,
            bio: true,
            chatPersonality: true,
            backstory: true,
            eroticLevel: true,
            timezone: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!conversation || conversation.clientId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const payment = await processPayment(
      session.user.id,
      conversation.modelProfile.userId,
      amount,
      "TIP",
      conversationId
    );

    if (!payment.success) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    const tipMessage = await prisma.message.create({
      data: {
        conversationId,
        senderType: "CLIENT",
        content: `💰 Sent a $${amount.toFixed(2)} tip!`,
      },
    });

    const tz = conversation.modelProfile.timezone || "America/New_York";
    const activity = getModelActivityContext(tz);
    const currentState = parseCurrentState(conversation.currentState);

    const reversedMessages = [...conversation.messages].reverse();
    const history = reversedMessages
      .filter((m) => m.content)
      .map((m) => ({
        role: (m.senderType === "CLIENT" ? "user" : "assistant") as "user" | "assistant",
        content: m.content || "",
      }));
    history.push({ role: "user", content: `💰 Sent a $${amount.toFixed(2)} tip!` });

    const aiResult = await generateChatResponse({
      modelProfile: {
        name: conversation.modelProfile.name,
        age: conversation.modelProfile.age,
        nationality: conversation.modelProfile.nationality,
        bio: conversation.modelProfile.bio,
        chatPersonality: conversation.modelProfile.chatPersonality || "Calida, coqueta y encantadora",
        backstory: conversation.modelProfile.backstory,
        eroticLevel: conversation.modelProfile.eroticLevel,
        timezone: tz,
      },
      conversationHistory: history,
      memoryContext: conversation.memoryContext,
      preferredName: conversation.preferredName,
      eroticLevel: conversation.eroticLevel,
      currentState,
      recentTip: { amount },
    });

    const aiText = aiResult.messages.map((m) => m.text).filter(Boolean).join("\n").trim() || "ay gracias cariño!";
    const aiMessage = await prisma.message.create({
      data: {
        conversationId,
        senderType: "MODEL",
        content: aiText,
      },
    });

    return NextResponse.json({
      success: true,
      message: { ...tipMessage, price: Number(tipMessage.price) },
      aiResponse: { ...aiMessage, price: Number(aiMessage.price) },
      transactionId: payment.transactionId,
    });
  } catch (error) {
    console.error("Tip error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
