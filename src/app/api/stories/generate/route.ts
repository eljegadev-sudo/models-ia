import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateImageFromImage } from "@/lib/replicate";
import { saveImageFromUrl } from "@/lib/upload";
import { generateStoryCaption } from "@/lib/openai";
import { readFile } from "fs/promises";
import path from "path";

const STORY_PROMPTS = [
  "casual selfie, smiling, morning vibes, natural lighting, cozy bedroom",
  "mirror selfie, stylish outfit, confident pose, warm lighting",
  "close up face, playful expression, soft focus, golden hour",
  "relaxing on couch, comfortable outfit, reading a book, warm tones",
  "workout outfit, post-gym glow, energetic pose, natural setting",
  "beach or pool setting, bikini, sun-kissed skin, summer vibes",
  "evening look, elegant dress, date night ready, soft ambient lighting",
  "bed selfie, cozy pijamas, sleepy cute, warm lighting",
  "cooking in kitchen, casual outfit, domestic vibes, natural",
  "close up of legs and feet, relaxing pose, natural light",
];

async function localPathToDataUri(localPath: string): Promise<string> {
  const filePath = path.join(process.cwd(), "public", localPath);
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).slice(1) || "png";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { modelProfileId, count = 3 } = await request.json();

    const modelProfile = await prisma.modelProfile.findUnique({
      where: { id: modelProfileId },
      include: {
        referenceImages: {
          take: 1,
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!modelProfile || modelProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const referenceImage = modelProfile.referenceImages[0];
    if (!referenceImage) {
      return NextResponse.json({ error: "No reference image" }, { status: 400 });
    }

    let imageInput = referenceImage.imageUrl;
    if (imageInput.startsWith("/uploads")) {
      imageInput = await localPathToDataUri(imageInput);
    }

    const generatedStories = [];
    const usedIndexes = new Set<number>();

    for (let i = 0; i < Math.min(count, 5); i++) {
      try {
        let idx: number;
        do {
          idx = Math.floor(Math.random() * STORY_PROMPTS.length);
        } while (usedIndexes.has(idx) && usedIndexes.size < STORY_PROMPTS.length);
        usedIndexes.add(idx);

        const prompt = `${STORY_PROMPTS[idx]}, same person as reference, photorealistic, high quality, instagram story style`;

        const generatedUrl = await generateImageFromImage(imageInput, prompt);
        const localUrl = await saveImageFromUrl(generatedUrl, "stories");

        const caption = await generateStoryCaption({
          name: modelProfile.name,
          bio: modelProfile.bio,
          chatPersonality: modelProfile.chatPersonality,
        });

        const story = await prisma.story.create({
          data: {
            modelProfileId,
            imageUrl: localUrl,
            caption,
            status: "PENDING",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        generatedStories.push(story);
      } catch (err) {
        console.error(`Story generation ${i} failed:`, err);
      }
    }

    return NextResponse.json({ stories: generatedStories });
  } catch (error) {
    console.error("Generate stories error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
