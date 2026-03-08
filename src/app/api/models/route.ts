import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createModelSchema = z.object({
  name: z.string().min(2),
  age: z.number().int().min(18).max(60),
  nationality: z.string().min(2),
  bio: z.string().min(10),
  bodyType: z.string().optional(),
  hairColor: z.string().optional(),
  hairType: z.string().optional(),
  ethnicity: z.string().optional(),
  height: z.number().optional(),
  subscriptionPrice: z.number().min(0),
  chatPersonality: z.string().optional(),
  chatAutomatic: z.boolean().optional(),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role: string }).role !== "CREATOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createModelSchema.parse(body);

    let slug = slugify(data.name);
    const existing = await prisma.modelProfile.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const model = await prisma.modelProfile.create({
      data: {
        userId: session.user.id,
        slug,
        name: data.name,
        age: data.age,
        nationality: data.nationality,
        bio: data.bio,
        bodyType: data.bodyType,
        hairColor: data.hairColor,
        hairType: data.hairType,
        ethnicity: data.ethnicity,
        height: data.height,
        subscriptionPrice: data.subscriptionPrice,
        chatPersonality: data.chatPersonality,
        chatAutomatic: data.chatAutomatic ?? true,
      },
    });

    return NextResponse.json(model, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "validation", details: error.issues }, { status: 400 });
    }
    console.error("Create model error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "newest";

    const where = {
      isActive: true,
      ...(userId && { userId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { bio: { contains: search, mode: "insensitive" as const } },
          { nationality: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const orderBy = sort === "popular"
      ? { subscriptions: { _count: "desc" as const } }
      : sort === "priceAsc"
        ? { subscriptionPrice: "asc" as const }
        : sort === "priceDesc"
          ? { subscriptionPrice: "desc" as const }
          : { createdAt: "desc" as const };

    const [models, total] = await Promise.all([
      prisma.modelProfile.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          referenceImages: { take: 1, orderBy: { orderIndex: "asc" } },
          _count: { select: { subscriptions: true, contentPosts: true } },
        },
      }),
      prisma.modelProfile.count({ where }),
    ]);

    return NextResponse.json({
      models: models.map((m) => ({
        ...m,
        subscriptionPrice: Number(m.subscriptionPrice),
        subscriberCount: m._count.subscriptions,
        postCount: m._count.contentPosts,
        coverImage: m.referenceImages[0]?.imageUrl || null,
      })),
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get models error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
