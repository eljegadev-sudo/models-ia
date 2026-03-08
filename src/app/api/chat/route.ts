import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const conversationInclude = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    take: 100,
  },
  modelProfile: {
    select: {
      name: true,
      chatAutomatic: true,
      chatPersonality: true,
      eroticLevel: true,
    },
  },
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const modelProfileId = searchParams.get("modelProfileId");

    if (!modelProfileId) {
      return NextResponse.json({ error: "Model ID required" }, { status: 400 });
    }

    const sub = await prisma.subscription.findUnique({
      where: {
        clientId_modelProfileId: {
          clientId: session.user.id,
          modelProfileId,
        },
      },
    });

    if (!sub || sub.status !== "ACTIVE") {
      return NextResponse.json({ error: "Not subscribed" }, { status: 403 });
    }

    const modelProfile = await prisma.modelProfile.findUnique({
      where: { id: modelProfileId },
      select: {
        name: true,
        chatAutomatic: true,
        chatPersonality: true,
        eroticLevel: true,
      },
    });

    if (!modelProfile) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    let conversation = await prisma.conversation.findUnique({
      where: {
        clientId_modelProfileId: {
          clientId: session.user.id,
          modelProfileId,
        },
      },
      include: conversationInclude,
    });

    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            clientId: session.user.id,
            modelProfileId,
            isAutomated: true,
            aiEnabled: modelProfile.chatAutomatic,
            eroticLevel: modelProfile.eroticLevel,
          },
          include: conversationInclude,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          conversation = await prisma.conversation.findUnique({
            where: {
              clientId_modelProfileId: {
                clientId: session.user.id,
                modelProfileId,
              },
            },
            include: conversationInclude,
          });
        } else {
          throw e;
        }
      }
    }

    if (!conversation) {
      return NextResponse.json({ error: "Failed to load chat" }, { status: 500 });
    }

    if (conversation.messages.length === 0 && modelProfile.chatAutomatic) {
      const client = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true },
      });

      const welcomeText = `hola ${client?.username || "guapo"}! que bueno que entraste... cuentame de ti, que te llamo la atencion de mi perfil? 😏`;

      try {
        const welcomeMsg = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderType: "MODEL",
            content: welcomeText,
          },
        });
        conversation.messages.push(welcomeMsg);
      } catch {
        // If welcome message fails (e.g. race condition), ignore
      }
    }

    return NextResponse.json({
      ...conversation,
      messages: conversation.messages.map((m) => ({
        ...m,
        price: Number(m.price),
      })),
    });
  } catch (error) {
    console.error("Get chat error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
