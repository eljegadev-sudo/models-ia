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
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface ContentPost {
  id: string;
  imageUrl: string;
  caption: string | null;
  isPrivate: boolean;
  price: number;
  status: string;
  promptUsed: string | null;
  createdAt: Date;
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
        { ...newPost, price: Number(newPost.price) },
        ...prev,
      ]);
      setPrompt("");
      toast.success("Content generated!");
    } catch {
      toast.error("Failed to generate content");
    } finally {
      setGenerating(false);
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
      toast.error("Failed to get suggestions");
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
      toast.success("Updated!");
    } catch {
      toast.error("Failed to update");
    }
  }

  async function deletePost(postId: string) {
    try {
      const res = await fetch(`/api/content/${postId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Deleted!");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{model.name}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => router.push(`/dashboard/manager/models/${model.id}/stories`)}
        >
          <Sparkles className="h-4 w-4" />
          Stories
        </Button>
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
              AI Suggestions
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Click a suggestion to use it:
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

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {t("pending")} ({pendingPosts.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            {t("approved")} ({approvedPosts.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            {t("rejected")} ({rejectedPosts.length})
          </TabsTrigger>
        </TabsList>

        {(["pending", "approved", "rejected"] as const).map((tab) => {
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
  onUpdate: (id: string, data: Partial<{ status: string; isPrivate: boolean; price: number }>) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("models.content");
  const [price, setPrice] = useState(post.price);

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square">
        <Image
          src={post.imageUrl}
          alt={post.caption || "Content"}
          fill
          className="object-cover"
        />
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
              Private
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="space-y-3 p-3">
        {post.promptUsed && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {post.promptUsed}
          </p>
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
      </CardContent>
    </Card>
  );
}
