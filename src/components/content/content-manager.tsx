"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Wand2,
  Check,
  X,
  Lock,
  Unlock,
  Sparkles,
  Trash2,
  Video,
  Heart,
  MessageCircle,
  Gift,
  Send,
  ChevronDown,
  ChevronUp,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface PostComment {
  id: string;
  content: string;
  createdAt: Date;
  user: { id: string; username: string; avatar: string | null };
}

interface ContentPost {
  id: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  contentType?: string;
  caption: string | null;
  isPrivate: boolean;
  price: number;
  status: string;
  promptUsed: string | null;
  createdAt: Date;
  likesCount?: number;
  commentsCount?: number;
  tipsCount?: number;
  tipRevenue?: number;
  comments?: PostComment[];
}

interface ContentManagerProps {
  model: {
    id: string;
    name: string;
    referenceImages: { id: string; imageUrl: string }[];
    contentPosts: ContentPost[];
  };
}

export function ContentManager({ model }: ContentManagerProps) {
  const t = useTranslations("models.content");
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [uploadingReel, setUploadingReel] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [posts, setPosts] = useState(model.contentPosts);

  const pendingPosts = posts.filter((p) => p.status === "PENDING");
  const approvedPosts = posts.filter((p) => p.status === "APPROVED");
  const rejectedPosts = posts.filter((p) => p.status === "REJECTED");

  async function generateContent() {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const referenceImage = model.referenceImages[0]?.imageUrl;
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          modelProfileId: model.id,
          type: referenceImage ? "image-to-image" : "text-to-image",
          referenceImageUrl: referenceImage,
        }),
      });

      if (!res.ok) throw new Error();
      const { imageUrl } = await res.json();

      const contentRes = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProfileId: model.id,
          imageUrl,
          promptUsed: prompt,
          caption: "",
          isPrivate: false,
          price: 0,
        }),
      });

      if (!contentRes.ok) throw new Error();
      const newPost = await contentRes.json();
      setPosts((prev) => [
        { ...newPost, price: Number(newPost.price), likesCount: 0, commentsCount: 0, tipsCount: 0, tipRevenue: 0, comments: [], contentType: "IMAGE" },
        ...prev,
      ]);
      setPrompt("");
      toast.success("Contenido generado!");
    } catch {
      toast.error("Error al generar contenido");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadReel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("video/")) {
      toast.error("Selecciona un archivo de video");
      return;
    }
    setUploadingReel(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload/video", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error();
      const { videoUrl } = await uploadRes.json();

      const contentRes = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProfileId: model.id,
          videoUrl,
          contentType: "REEL",
          caption: "",
          isPrivate: false,
          price: 0,
        }),
      });
      if (!contentRes.ok) throw new Error();
      const newPost = await contentRes.json();
      setPosts((prev) => [
        { ...newPost, price: Number(newPost.price), likesCount: 0, commentsCount: 0, tipsCount: 0, tipRevenue: 0, comments: [], contentType: "REEL", imageUrl: null },
        ...prev,
      ]);
      toast.success("Reel subido!");
      e.target.value = "";
    } catch {
      toast.error("Error al subir reel");
    } finally {
      setUploadingReel(false);
    }
  }

  async function getSuggestions() {
    setSuggestionsLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: model.name,
          modelProfileId: model.id,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {
      toast.error("Error al obtener sugerencias");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function updatePost(
    postId: string,
    updates: Partial<{ status: string; isPrivate: boolean; price: number; caption: string }>
  ) {
    try {
      const res = await fetch(`/api/content/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, ...updates } : p))
      );
      toast.success("Actualizado!");
    } catch {
      toast.error("Error al actualizar");
    }
  }

  async function deletePost(postId: string) {
    try {
      const res = await fetch(`/api/content/${postId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Eliminado!");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{model.name}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push(`/dashboard/manager/models/${model.id}/videos`)}
          >
            <Video className="h-4 w-4" />
            Videos
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push(`/dashboard/manager/models/${model.id}/stories`)}
          >
            <Sparkles className="h-4 w-4" />
            Stories
          </Button>
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{t("generate")}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={getSuggestions}
              disabled={suggestionsLoading}
            >
              {suggestionsLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Sugerencias IA
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Haz clic en una sugerencia para usarla:
              </Label>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(s)}
                    className="rounded-lg border border-border/50 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                  >
                    {s.length > 80 ? s.substring(0, 80) + "..." : s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("generatePrompt")}
              rows={2}
              className="flex-1"
            />
            <Button
              onClick={generateContent}
              disabled={generating || !prompt.trim()}
              className="gap-2 self-end"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {t("generate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Nuevo Reel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept="video/*"
              onChange={uploadReel}
              disabled={uploadingReel}
              className="max-w-xs"
            />
            {uploadingReel && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="approved">
        <TabsList>
          <TabsTrigger value="approved">
            Aprobados ({approvedPosts.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t("pending")} ({pendingPosts.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            {t("rejected")} ({rejectedPosts.length})
          </TabsTrigger>
        </TabsList>

        {(["approved", "pending", "rejected"] as const).map((tab) => {
          const tabPosts =
            tab === "pending" ? pendingPosts : tab === "approved" ? approvedPosts : rejectedPosts;

          return (
            <TabsContent key={tab} value={tab}>
              {tabPosts.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  {t("noContent")}
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {tabPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onUpdate={updatePost}
                      onDelete={deletePost}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function PostCard({
  post,
  onUpdate,
  onDelete,
}: {
  post: ContentPost;
  onUpdate: (id: string, data: Partial<{ status: string; isPrivate: boolean; price: number; caption: string }>) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("models.content");
  const [price, setPrice] = useState(post.price);
  const [editingCaption, setEditingCaption] = useState(false);
  const [caption, setCaption] = useState(post.caption || "");
  const [showComments, setShowComments] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replying, setReplying] = useState(false);
  const [comments, setComments] = useState<PostComment[]>(post.comments || []);

  async function handleReply() {
    if (!replyContent.trim()) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments((prev) => [newComment, ...prev]);
      setReplyContent("");
      toast.success("Comentario enviado!");
    } catch {
      toast.error("Error al comentar");
    } finally {
      setReplying(false);
    }
  }

  function saveCaption() {
    onUpdate(post.id, { caption });
    setEditingCaption(false);
  }

  const isReel = post.contentType === "REEL" || post.videoUrl;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square">
        {isReel && post.videoUrl ? (
          <video
            src={post.videoUrl}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : post.imageUrl ? (
          <Image
            src={post.imageUrl}
            alt={post.caption || "Content"}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Video className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge
            variant={post.status === "APPROVED" ? "default" : "secondary"}
            className="text-xs"
          >
            {post.status}
          </Badge>
          {post.isPrivate && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="mr-1 h-3 w-3" />
              Privado
            </Badge>
          )}
        </div>
      </div>

      <CardContent className="space-y-3 p-3">
        {(post.likesCount !== undefined || post.commentsCount !== undefined || post.tipsCount !== undefined) && (
          <div className="flex items-center gap-3 text-xs border-b pb-2">
            <span className="flex items-center gap-1 text-pink-500">
              <Heart className="h-3 w-3" /> {post.likesCount ?? 0}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <MessageCircle className="h-3 w-3" /> {post.commentsCount ?? 0}
            </span>
            <span className="flex items-center gap-1 text-green-500">
              <Gift className="h-3 w-3" /> {post.tipsCount ?? 0}
            </span>
            {(post.tipRevenue ?? 0) > 0 && (
              <span className="ml-auto font-semibold text-green-500">
                ${(post.tipRevenue ?? 0).toFixed(2)}
              </span>
            )}
          </div>
        )}

        {editingCaption ? (
          <div className="space-y-2">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="Escribe un caption..."
            />
            <div className="flex gap-1">
              <Button size="sm" className="text-xs flex-1" onClick={saveCaption}>
                <Check className="mr-1 h-3 w-3" />
                Guardar
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingCaption(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-1">
            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
              {post.caption || post.promptUsed || "Sin caption"}
            </p>
            <button
              onClick={() => setEditingCaption(true)}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={post.isPrivate}
              onCheckedChange={(v) => onUpdate(post.id, { isPrivate: v })}
            />
            <span className="text-xs">
              {post.isPrivate ? (
                <Lock className="inline h-3 w-3" />
              ) : (
                <Unlock className="inline h-3 w-3" />
              )}
            </span>
          </div>
          {post.isPrivate && (
            <div className="flex items-center gap-1">
              <span className="text-xs">$</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value))}
                onBlur={() => onUpdate(post.id, { price })}
                className="h-7 w-16 text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex gap-1.5">
          {post.status === "PENDING" && (
            <>
              <Button
                size="sm"
                className="flex-1 gap-1 text-xs"
                onClick={() => onUpdate(post.id, { status: "APPROVED" })}
              >
                <Check className="h-3 w-3" />
                {t("approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1 text-xs"
                onClick={() => onUpdate(post.id, { status: "REJECTED" })}
              >
                <X className="h-3 w-3" />
                {t("reject")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="destructive"
            className="gap-1 text-xs"
            onClick={() => onDelete(post.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        {(post.commentsCount ?? 0) > 0 && (
          <div className="border-t pt-2">
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <MessageCircle className="h-3 w-3" />
              {showComments ? "Ocultar" : "Ver"} {post.commentsCount} comentario{(post.commentsCount ?? 0) !== 1 ? "s" : ""}
              {showComments ? <ChevronUp className="ml-auto h-3 w-3" /> : <ChevronDown className="ml-auto h-3 w-3" />}
            </button>

            {showComments && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Responder..."
                    className="h-7 text-xs flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleReply()}
                  />
                  <Button
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleReply}
                    disabled={replying || !replyContent.trim()}
                  >
                    {replying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md bg-accent/30 px-2 py-1.5">
                      <span className="text-[11px] font-medium">
                        @{c.user.username}
                      </span>
                      <p className="text-xs text-muted-foreground">{c.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
