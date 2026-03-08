"use client";

import { useState, useEffect, use } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Plus,
  Check,
  X,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";

interface Story {
  id: string;
  imageUrl: string;
  caption: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  expiresAt: string;
  createdAt: string;
}

export default function StoriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: modelId } = use(params);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      const res = await fetch(`/api/stories?modelProfileId=${modelId}&manage=true`);
      if (res.ok) {
        const data = await res.json();
        setStories(data);
      }
    } catch {
      toast.error("Error cargando stories");
    } finally {
      setLoading(false);
    }
  }

  async function generateStories() {
    setGenerating(true);
    try {
      const res = await fetch("/api/stories/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelProfileId: modelId, count: 3 }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setStories((prev) => [...data.stories, ...prev]);
      toast.success(`${data.stories.length} stories generadas`);
    } catch {
      toast.error("Error generando stories");
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(storyId: string, status: "APPROVED" | "REJECTED") {
    try {
      const res = await fetch("/api/stories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, status }),
      });

      if (!res.ok) throw new Error();

      setStories((prev) =>
        prev.map((s) => (s.id === storyId ? { ...s, status } : s))
      );

      toast.success(status === "APPROVED" ? "Story aprobada" : "Story rechazada");
    } catch {
      toast.error("Error actualizando story");
    }
  }

  const pending = stories.filter((s) => s.status === "PENDING");
  const approved = stories.filter((s) => s.status === "APPROVED");
  const rejected = stories.filter((s) => s.status === "REJECTED");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/manager/models/${modelId}/content`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Stories</h1>
          </div>
          <Button
            onClick={generateStories}
            disabled={generating}
            className="gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white border-0"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {generating ? "Generando..." : "Generar Stories"}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
          </div>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  Pendientes de aprobacion ({pending.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {pending.map((story) => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      onApprove={() => updateStatus(story.id, "APPROVED")}
                      onReject={() => updateStatus(story.id, "REJECTED")}
                    />
                  ))}
                </div>
              </section>
            )}

            {approved.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500" />
                  Aprobadas ({approved.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {approved.map((story) => (
                    <StoryCard key={story.id} story={story} />
                  ))}
                </div>
              </section>
            )}

            {rejected.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <X className="h-5 w-5 text-red-500" />
                  Rechazadas ({rejected.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {rejected.map((story) => (
                    <StoryCard key={story.id} story={story} />
                  ))}
                </div>
              </section>
            )}

            {stories.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>No hay stories todavia</p>
                <p className="text-sm mt-1">Genera tus primeras stories con el boton de arriba</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StoryCard({
  story,
  onApprove,
  onReject,
}: {
  story: Story;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const statusColors = {
    PENDING: "bg-yellow-500/10 text-yellow-500",
    APPROVED: "bg-green-500/10 text-green-500",
    REJECTED: "bg-red-500/10 text-red-500",
  };

  const isExpired = new Date(story.expiresAt) < new Date();

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[9/16]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={story.imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute top-2 left-2">
          <Badge className={statusColors[story.status]}>
            {story.status === "PENDING" ? "Pendiente" : story.status === "APPROVED" ? "Aprobada" : "Rechazada"}
          </Badge>
        </div>
        {isExpired && story.status === "APPROVED" && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary">Expirada</Badge>
          </div>
        )}
        {story.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
            <p className="text-white text-xs line-clamp-2">{story.caption}</p>
          </div>
        )}
      </div>
      {onApprove && onReject && (
        <CardContent className="p-2 flex gap-2">
          <Button
            size="sm"
            onClick={onApprove}
            className="flex-1 gap-1 bg-green-500 hover:bg-green-600 text-white border-0"
          >
            <Check className="h-3.5 w-3.5" />
            Aprobar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onReject}
            className="flex-1 gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
          >
            <X className="h-3.5 w-3.5" />
            Rechazar
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
