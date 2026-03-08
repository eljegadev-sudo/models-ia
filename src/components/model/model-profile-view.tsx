"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Heart,
  MessageCircle,
  Lock,
  DollarSign,
  MapPin,
  Ruler,
  Users,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface ContentPost {
  id: string;
  imageUrl: string;
  caption: string | null;
  isPrivate: boolean;
  price: number;
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
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [togglingFav, setTogglingFav] = useState(false);

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

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
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
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{model.name}</h1>
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

          <div className="pt-2">
            {isSubscribed ? (
              <div className="flex items-center gap-3">
                <Badge className="bg-pink-500 px-4 py-1.5 text-sm">{t("subscribed")}</Badge>
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

      <Tabs defaultValue="public" className="space-y-6">
        <TabsList>
          <TabsTrigger value="public">
            {t("publicContent")} ({publicPosts.length})
          </TabsTrigger>
          <TabsTrigger value="private">
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            {t("privateContent")} ({privatePosts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          {publicPosts.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              {t("noPublicContent")}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {publicPosts.map((post) => (
                <Card key={post.id} className="overflow-hidden">
                  <div className="relative aspect-square">
                    <Image
                      src={post.imageUrl}
                      alt={post.caption || ""}
                      fill
                      className="object-cover"
                    />
                  </div>
                  {post.caption && (
                    <CardContent className="p-3">
                      <p className="text-sm">{post.caption}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
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
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {privatePosts.map((post) => (
                <ContentCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContentCard({ post }: { post: ContentPost }) {
  const [unlocked, setUnlocked] = useState(post.price === 0);
  const t = useTranslations("models.profile");

  async function handleUnlock() {
    try {
      const res = await fetch("/api/content/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: post.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to unlock");
        return;
      }
      setUnlocked(true);
      toast.success("Content unlocked!");
    } catch {
      toast.error("Failed to unlock");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square">
        <Image
          src={post.imageUrl}
          alt={post.caption || ""}
          fill
          className={`object-cover ${!unlocked ? "blur-xl" : ""}`}
        />
        {!unlocked && post.price > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
            <Lock className="mb-2 h-8 w-8 text-white" />
            <Button size="sm" onClick={handleUnlock} className="gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              {t("unlockContent")} ${post.price}
            </Button>
          </div>
        )}
      </div>
      {post.caption && unlocked && (
        <CardContent className="p-3">
          <p className="text-sm">{post.caption}</p>
        </CardContent>
      )}
    </Card>
  );
}
