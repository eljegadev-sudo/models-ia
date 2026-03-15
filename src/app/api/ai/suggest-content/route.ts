import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestContentIdeas } from "@/lib/ai";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelProfileId, name } = await request.json();

    let modelName = name;
    let bio = "";
    let nationality = "";

    if (modelProfileId) {
      const model = await prisma.modelProfile.findUnique({
        where: { id: modelProfileId },
        select: { name: true, bio: true, nationality: true, userId: true },
      });
      if (model) {
        modelName = model.name;
        bio = model.bio;
        nationality = model.nationality;
      }
    }

    const suggestions = await suggestContentIdeas({
      name: modelName,
      bio,
      nationality,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Suggest content error:", error);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
