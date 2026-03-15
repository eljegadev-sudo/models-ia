"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Heart,
  MessageCircle,
  Lock,
  MapPin,
  Ruler,
  Users,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { StoryCircles } from "@/components/stories/story-viewer";
import { PostGallery } from "@/components/content/post-gallery";

interface ContentPost {
  id: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  contentType?: string;
  caption: string | null;
  isPrivate: boolean;
  price: number;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved: boolean;
}

interface ModelProfileViewProps {
  model: {
    id: string;
    slug: string;
    name: string;
    age: number;
    nationality: string;
    bio: string;
    bodyType: string | null;
    hairColor: string | null;
    hairType: string | null;
    ethnicity: string | null;
    height: number | null;
    subscriptionPrice: number;
    subscriberCount: number;
    referenceImages: { id: string; imageUrl: string }[];
    contentPosts: ContentPost[];
    stories?: { id: string; imageUrl: string; caption: string | null; createdAt: string }[];
    exclusivityPrice?: number | null;
    isExclusiveOwner?: boolean;
    exclusiveOwnerId?: string | null;
  };
  isSubscribed: boolean;
  isLoggedIn: boolean;
  isFavorited?: boolean;
}

export function ModelProfileView({
  model,
  isSubscribed,
  isLoggedIn,
  isFavorited: initialFavorited = false,
}: ModelProfileViewProps) {
  const t = useTranslations("models.profile");
  const router = useRouter();
  const [subscribing, setSubscribing] = useState(false);
  const [acquiringExclusivity, setAcquiringExclusivity] = useState(false);
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [togglingFav, setTogglingFav] = useState(false);

  const canAcquireExclusivity =
    isLoggedIn &&
    !model.exclusiveOwnerId &&
    (model.exclusivityPrice ?? 0) > 0 &&
    !model.isExclusiveOwner;
  const isExclusiveOwner = model.isExclusiveOwner ?? false;

  const publicPosts = model.contentPosts.filter((p) => !p.isPrivate);
  const privatePosts = model.contentPosts.filter((p) => p.isPrivate);
  const coverImage = model.referenceImages[0]?.imageUrl;

  async function handleSubscribe() {
    if (!isLoggedIn) {
      router.push("/auth/login");
      return;
    }
    setSubscribing(true);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelProfileId: model.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to subscribe");
        return;
      }
      toast.success("Subscribed!");
      router.refresh();
    } catch {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  }

  async function toggleFavorite() {
    if (!isLoggedIn) {
      router.push("/auth/login");
      return;
    }
    setTogglingFav(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelProfileId: model.id }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIsFavorited(data.favorited);
      toast.success(data.favorited ? "Added to favorites" : "Removed from favorites");
    } catch {
      toast.error("Failed to update favorite");
    } finally {
      setTogglingFav(false);
    }
  }

  async function handleAcquireExclusivity() {
    if (!isLoggedIn || !canAcquireExclusivity) return;
    setAcquiringExclusivity(true);
    try {
      const res = await fetch(`/api/models/${model.id}/acquire-exclusivity`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al adquirir exclusividad");
        return;
      }
      toast.success("¡Ahora es tu modelo exclusiva!");
      router.refresh();
    } catch {
      toast.error("Error al adquirir exclusividad");
    } finally {
      setAcquiringExclusivity(false);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {model.stories && model.stories.length > 0 && (
        <div className="mb-6 flex justify-center">
          <StoryCircles
            stories={model.stories}
            modelName={model.name}
            modelAvatar={model.referenceImages[0]?.imageUrl}
          />
        </div>
      )}

      <div className="mb-8 flex flex-col gap-6 md:flex-row">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-muted md:w-72">
          {coverImage ? (
            <Image src={coverImage} alt={model.name} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl font-bold text-muted-foreground/20">
              {model.name.charAt(0)}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{model.name}</h1>
              {isExclusiveOwner && (
                <Badge className="bg-amber-500/90 text-white px-3 py-1">
                  Tu modelo exclusiva
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFavorite}
                disabled={togglingFav}
                className="shrink-0"
              >
                <Heart
                  className={`h-5 w-5 transition-colors ${isFavorited ? "fill-pink-500 text-pink-500" : "text-muted-foreground"}`}
                />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{model.age} years</span>
              <span>-</span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {model.nationality}
              </span>
              {model.height && (
                <>
                  <span>-</span>
                  <span className="flex items-center gap-1">
                    <Ruler className="h-3.5 w-3.5" />
                    {model.height}cm
                  </span>
                </>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {model.subscriberCount} subscribers
            </div>
          </div>

          <p className="text-muted-foreground">{model.bio}</p>

          <div className="flex flex-wrap gap-2">
            {model.bodyType && <Badge variant="secondary">{model.bodyType}</Badge>}
            {model.hairColor && <Badge variant="secondary">{model.hairColor} hair</Badge>}
            {model.ethnicity && <Badge variant="secondary">{model.ethnicity}</Badge>}
          </div>

          <div className="pt-2 space-y-3">
            {canAcquireExclusivity && (
              <Button
                variant="outline"
                className="gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                onClick={handleAcquireExclusivity}
                disabled={acquiringExclusivity}
              >
                {acquiringExclusivity ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Hacerla tuya - ${model.exclusivityPrice?.toFixed(2)}
              </Button>
            )}
            {(isSubscribed || isExclusiveOwner) ? (
              <div className="flex items-center gap-3">
                {isSubscribed && (
                  <Badge className="bg-pink-500 px-4 py-1.5 text-sm">{t("subscribed")}</Badge>
                )}
                <Button className="gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white" asChild>
                  <Link href={`/model/${model.slug}/chat`}>
                    <MessageCircle className="h-4 w-4" />
                    {t("chat")}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-xl bg-gradient-to-r from-pink-500/10 to-rose-500/10 p-4">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-pink-500" />
                  <p className="text-sm text-foreground/80">
                    {t("subscribeCta")}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white"
                  onClick={handleSubscribe}
                  disabled={subscribing}
                >
                  {subscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Heart className="h-4 w-4" />
                  )}
                  {t("subscribe")} - ${model.subscriptionPrice}{t("monthlyPrice")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all">
            {t("publicContent")} ({model.contentPosts.length})
          </TabsTrigger>
          <TabsTrigger value="private">
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            {t("privateContent")} ({privatePosts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {model.contentPosts.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              {t("noPublicContent")}
            </p>
          ) : (
            <PostGallery
              posts={model.contentPosts}
              isSubscribed={isSubscribed}
              isLoggedIn={isLoggedIn}
            />
          )}
        </TabsContent>

        <TabsContent value="private">
          {!isSubscribed ? (
            <div className="py-12 text-center">
              <Lock className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="mb-2 text-muted-foreground">
                {t("subscribeCta")}
              </p>
              <Button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="mt-4 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white"
              >
                {t("subscribe")} - ${model.subscriptionPrice}{t("monthlyPrice")}
              </Button>
            </div>
          ) : privatePosts.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              No private content yet
            </p>
          ) : (
            <PostGallery
              posts={privatePosts}
              isSubscribed={isSubscribed}
              isLoggedIn={isLoggedIn}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

