import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateImageFromText, generateImageFromImage } from "@/lib/replicate";
import { saveImageFromUrl } from "@/lib/upload";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

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
    if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, modelProfileId, referenceImageUrl, type } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    }

    let imageUrl: string;

    if (type === "image-to-image" && referenceImageUrl) {
      let imageInput = referenceImageUrl;

      if (referenceImageUrl.startsWith("/uploads")) {
        imageInput = await localPathToDataUri(referenceImageUrl);
      }

      imageUrl = await generateImageFromImage(imageInput, prompt);
    } else {
      imageUrl = await generateImageFromText(prompt);
    }

    const localUrl = await saveImageFromUrl(imageUrl, "generated");

    if (modelProfileId && type === "reference") {
      const count = await prisma.referenceImage.count({
        where: { modelProfileId },
      });

      if (count < 5) {
        await prisma.referenceImage.create({
          data: {
            modelProfileId,
            imageUrl: localUrl,
            isAiGenerated: true,
            prompt,
            orderIndex: count,
          },
        });
      }
    }

    return NextResponse.json({ imageUrl: localUrl });
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
