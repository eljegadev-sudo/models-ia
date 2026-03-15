"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Video, Play, Clock, DollarSign, Image as ImageIcon, Wand2, Check, X, Share2 } from "lucide-react";
import { toast } from "sonner";

interface VideoGeneration {
  id: string;
  sourceImageUrl: string;
  prompt: string;
  videoUrl: string | null;
  status: string;
  contentStatus?: "PENDING" | "APPROVED" | "REJECTED";
  duration: string;
  model: string;
  quoteCost: number | null;
  createdAt: string;
}

interface VideoGeneratorProps {
  model: {
    id: string;
    name: string;
    referenceImages: { id: string; imageUrl: string }[];
    availableImages?: { id: string; imageUrl: string; source: "reference" | "post" }[];
  };
}

const VIDEO_MODELS = [
  { id: "wan-2.6-image-to-video", name: "Wan 2.6", quality: "Mejor calidad", speed: "~3 min" },
  { id: "wan-2.1-pro-image-to-video", name: "Wan 2.1 Pro", quality: "Alta calidad", speed: "~2 min" },
  { id: "ltx-2-19b-full-image-to-video", name: "LTX 2 19B", quality: "Buena calidad", speed: "~1 min" },
];

const ALL_DURATIONS: Record<string, string> = {
  "5s": "5 segundos",
  "6s": "6 segundos",
  "8s": "8 segundos",
  "10s": "10 segundos",
  "15s": "15 segundos",
  "18s": "18 segundos",
};

const MODEL_DURATIONS: Record<string, string[]> = {
  "wan-2.6-image-to-video": ["6s"],
  "wan-2.1-pro-image-to-video": ["5s", "8s", "10s", "15s", "18s"],
  "ltx-2-19b-full-image-to-video": ["5s", "10s", "15s"],
  "kling-o3-pro-image-to-video": ["5s", "10s"],
};

function getDefaultDuration(model: string): string {
  const durations = MODEL_DURATIONS[model] ?? ["5s"];
  return durations[0];
}

export function VideoGenerator({ model }: VideoGeneratorProps) {
  const router = useRouter();
  const availableImages = model.availableImages ?? model.referenceImages.map((r) => ({ id: r.id, imageUrl: r.imageUrl, source: "reference" as const }));
  const [videos, setVideos] = useState<VideoGeneration[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string>(
    availableImages[0]?.imageUrl || ""
  );
  const [imageOptions, setImageOptions] = useState<typeof availableImages>(availableImages);
  const [prompt, setPrompt] = useState("");
  const [imageGenPrompt, setImageGenPrompt] = useState("");
  const [videoModel, setVideoModel] = useState("wan-2.6-image-to-video");
  const [duration, setDuration] = useState(() => getDefaultDuration("wan-2.6-image-to-video"));
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    loadVideos();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);


  useEffect(() => {
    if (pollingIds.size === 0) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = undefined;
      }
      return;
    }

    if (pollTimerRef.current) return;

    pollTimerRef.current = setInterval(() => {
      pollingIds.forEach((id) => pollVideoStatus(id));
    }, 5000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = undefined;
      }
    };
  }, [pollingIds]);

  async function loadVideos() {
    try {
      const res = await fetch(`/api/ai/generate-video?modelProfileId=${model.id}`);
      if (!res.ok) return;
      const data: VideoGeneration[] = await res.json();
      setVideos(data);

      const pending = new Set<string>();
      data.forEach((v) => {
        if (v.status === "processing" || v.status === "pending") {
          pending.add(v.id);
        }
      });
      if (pending.size > 0) setPollingIds(pending);
    } catch {
      /* silent */
    }
  }

  async function pollVideoStatus(videoId: string) {
    try {
      const res = await fetch(`/api/ai/generate-video/${videoId}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === "completed" || data.status === "failed") {
        setPollingIds((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });

        setVideos((prev) =>
          prev.map((v) =>
            v.id === videoId
              ? { ...v, status: data.status, videoUrl: data.videoUrl || v.videoUrl, contentStatus: data.contentStatus ?? v.contentStatus }
              : v
          )
        );

        if (data.status === "completed") {
          toast.success("Video generado exitosamente");
        } else {
          toast.error("Error al generar video");
        }
      }
    } catch {
      /* silent */
    }
  }

  async function handleGenerateImage() {
    if (!imageGenPrompt.trim()) {
      toast.error("Escribe un prompt para generar la imagen");
      return;
    }
    setGeneratingImage(true);
    try {
      const referenceImage = model.referenceImages[0]?.imageUrl;
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imageGenPrompt.trim(),
          modelProfileId: model.id,
          type: referenceImage ? "image-to-image" : "text-to-image",
          referenceImageUrl: referenceImage,
        }),
      });
      if (!res.ok) throw new Error();
      const { imageUrl } = await res.json();
      const newOption = { id: `gen-${Date.now()}`, imageUrl, source: "reference" as const };
      setImageOptions((prev) => [newOption, ...prev]);
      setSelectedImage(imageUrl);
      setImageGenPrompt("");
      toast.success("Imagen generada. Usala como base para el video.");
    } catch {
      toast.error("Error al generar imagen");
    } finally {
      setGeneratingImage(false);
    }
  }

  async function updateVideoStatus(videoId: string, contentStatus: "APPROVED" | "REJECTED") {
    try {
      const res = await fetch(`/api/ai/generate-video/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentStatus }),
      });
      if (!res.ok) throw new Error();
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, contentStatus } : v))
      );
      toast.success(contentStatus === "APPROVED" ? "Video aprobado" : "Video rechazado");
    } catch {
      toast.error("Error al actualizar");
    }
  }

  async function publishAsReel(videoId: string) {
    try {
      const res = await fetch(`/api/ai/generate-video/${videoId}/publish`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success("Reel creado. Revisalo en la seccion Contenido.");
      router.push(`/dashboard/manager/models/${model.id}/content`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al publicar");
    }
  }

  async function handleGenerate() {
    if (!prompt.trim() || !selectedImage) {
      toast.error("Selecciona una imagen y escribe un prompt");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProfileId: model.id,
          imageUrl: selectedImage,
          prompt: prompt.trim(),
          duration,
          model: videoModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al generar video");
      }

      const data = await res.json();

      const newVideo: VideoGeneration = {
        id: data.id,
        sourceImageUrl: selectedImage,
        prompt: prompt.trim(),
        videoUrl: null,
        status: "processing",
        contentStatus: "PENDING",
        duration,
        model: videoModel,
        quoteCost: data.quote,
        createdAt: new Date().toISOString(),
      };

      setVideos((prev) => [newVideo, ...prev]);
      setPollingIds((prev) => new Set([...prev, data.id]));
      setPrompt("");
      toast.success(`Video en cola (costo: $${data.quote?.toFixed(4) || "?"})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar video");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Generar Video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Image selection */}
          <div className="space-y-2">
            <Label>Imagen de partida (selecciona o genera una nueva)</Label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {imageOptions.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(img.imageUrl)}
                  className={`shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedImage === img.imageUrl
                      ? "border-pink-500"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.imageUrl}
                    alt=""
                    className="h-20 w-20 object-cover"
                  />
                </button>
              ))}
              {imageOptions.length === 0 && (
                <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Genera una imagen abajo para comenzar
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Input
                value={imageGenPrompt}
                onChange={(e) => setImageGenPrompt(e.target.value)}
                placeholder="O genera una imagen nueva con IA (ej: mujer en la playa al atardecer)"
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleGenerateImage}
                disabled={generatingImage || !imageGenPrompt.trim()}
                className="gap-2 shrink-0"
              >
                {generatingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Generar imagen
              </Button>
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label>Prompt (describe la escena y accion)</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Mujer caminando lentamente hacia la camara en un jardin al atardecer, sonriendo seductoramente..."
              className="min-h-[80px]"
            />
          </div>

          {/* Model & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Modelo de video</Label>
              <Select value={videoModel} onValueChange={(v) => {
                  const m = v ?? videoModel;
                  setVideoModel(m);
                  setDuration(getDefaultDuration(m));
                }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span>{m.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.quality} &middot; {m.speed}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duracion</Label>
              <Select value={duration} onValueChange={(v) => setDuration(v ?? duration)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(MODEL_DURATIONS[videoModel] ?? ["5s"]).map((d) => (
                    <SelectItem key={d} value={d}>
                      {ALL_DURATIONS[d] ?? d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || !selectedImage}
            className="w-full gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Video className="h-4 w-4" />
                Generar Video
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Video list */}
      {videos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Videos Generados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="rounded-lg border overflow-hidden bg-card"
                >
                  {video.status === "completed" && video.videoUrl ? (
                    <video
                      src={video.videoUrl}
                      controls
                      className="w-full aspect-video bg-black"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted flex flex-col items-center justify-center gap-2">
                      {video.status === "processing" || video.status === "pending" ? (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
                          <span className="text-sm text-muted-foreground">Procesando...</span>
                        </>
                      ) : (
                        <>
                          <Video className="h-8 w-8 text-destructive" />
                          <span className="text-sm text-destructive">Error</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    <p className="text-sm line-clamp-2">{video.prompt}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        {video.model.split("-image-to")[0]}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {video.duration}
                      </span>
                      {video.quoteCost != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {video.quoteCost.toFixed(4)}
                        </span>
                      )}
                      {(video.status === "completed" && video.videoUrl) && (
                        <Badge
                          variant={
                            video.contentStatus === "APPROVED"
                              ? "default"
                              : video.contentStatus === "REJECTED"
                                ? "destructive"
                                : "outline"
                          }
                          className="text-xs"
                        >
                          {video.contentStatus === "APPROVED"
                            ? "Aprobado"
                            : video.contentStatus === "REJECTED"
                              ? "Rechazado"
                              : "Pendiente"}
                        </Badge>
                      )}
                    </div>
                    {(video.status === "completed" && video.videoUrl && video.contentStatus === "PENDING") && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1 h-7 text-xs"
                          onClick={() => updateVideoStatus(video.id, "APPROVED")}
                        >
                          <Check className="h-3 w-3" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1 h-7 text-xs"
                          onClick={() => updateVideoStatus(video.id, "REJECTED")}
                        >
                          <X className="h-3 w-3" />
                          Rechazar
                        </Button>
                      </div>
                    )}
                    {(video.status === "completed" && video.videoUrl && video.contentStatus === "APPROVED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 h-7 text-xs w-full"
                        onClick={() => publishAsReel(video.id)}
                      >
                        <Share2 className="h-3 w-3" />
                        Publicar como reel en el feed
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
