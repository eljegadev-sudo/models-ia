import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { VideoGenerator } from "@/components/content/video-generator";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

export default async function VideosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const locale = await getLocale();
  const { id } = await params;

  if (!session?.user) {
    redirect({ href: "/auth/login", locale: locale as "es" | "en" });
    return null;
  }

  const model = await prisma.modelProfile.findUnique({
    where: { id },
    include: {
      referenceImages: { orderBy: { orderIndex: "asc" } },
      contentPosts: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, imageUrl: true, caption: true },
      },
    },
  });

  if (!model || model.userId !== session.user.id) {
    redirect({ href: "/dashboard", locale: locale as "es" | "en" });
    return null;
  }

  const availableImages = [
    ...model.referenceImages.map((r) => ({ id: r.id, imageUrl: r.imageUrl, source: "reference" as const })),
    ...model.contentPosts
      .filter((p): p is typeof p & { imageUrl: string } => p.imageUrl != null)
      .map((p) => ({ id: p.id, imageUrl: p.imageUrl, source: "post" as const })),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/manager/models/${id}/content`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Videos - {model.name}</h1>
        </div>
        <VideoGenerator
          model={{
            id: model.id,
            name: model.name,
            referenceImages: model.referenceImages.map((r) => ({
              id: r.id,
              imageUrl: r.imageUrl,
            })),
            availableImages,
          }}
        />
      </main>
    </div>
  );
}
