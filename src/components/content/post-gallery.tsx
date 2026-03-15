"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Heart,
  MessageCircle,
  Bookmark,
  DollarSign,
  Lock,
  X,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
}

interface Post {
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

interface PostGalleryProps {
  posts: Post[];
  isSubscribed: boolean;
  isLoggedIn: boolean;
}

export function PostGallery({ posts: initialPosts, isSubscribed, isLoggedIn }: PostGalleryProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isSubscribed={isSubscribed}
            isLoggedIn={isLoggedIn}
            onLike={(id, liked, count) =>
              setPosts((prev) =>
                prev.map((p) => (p.id === id ? { ...p, isLiked: liked, likesCount: count } : p))
              )
            }
            onOpen={() => setSelectedPost(post)}
          />
        ))}
      </div>

      {selectedPost && (
        <PostModal
          post={posts.find((p) => p.id === selectedPost.id) || selectedPost}
          isSubscribed={isSubscribed}
          isLoggedIn={isLoggedIn}
          onClose={() => setSelectedPost(null)}
          onLike={(liked, count) => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === selectedPost.id ? { ...p, isLiked: liked, likesCount: count } : p
              )
            );
          }}
          onSave={(saved) => {
            setPosts((prev) =>
              prev.map((p) => (p.id === selectedPost.id ? { ...p, isSaved: saved } : p))
            );
          }}
        />
      )}
    </>
  );
}

function PostCard({
  post,
  isSubscribed,
  isLoggedIn,
  onLike,
  onOpen,
}: {
  post: Post;
  isSubscribed: boolean;
  isLoggedIn: boolean;
  onLike: (id: string, liked: boolean, count: number) => void;
  onOpen: () => void;
}) {
  const showBlur = post.isPrivate && !isSubscribed;

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isLoggedIn) return toast.error("Inicia sesion para dar like");
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onLike(post.id, data.liked, data.count);
    } catch {
      toast.error("Error");
    }
  }

  const isReel = post.contentType === "REEL" || post.videoUrl;

  return (
    <div className="group cursor-pointer overflow-hidden rounded-xl bg-card border" onClick={onOpen}>
      <div className="relative aspect-square">
        {isReel && post.videoUrl ? (
          <video
            src={post.videoUrl}
            className={`h-full w-full object-cover ${showBlur ? "blur-xl scale-110" : ""}`}
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : post.imageUrl ? (
          <Image
            src={post.imageUrl}
            alt={post.caption || ""}
            fill
            className={`object-cover ${showBlur ? "blur-xl scale-110" : ""}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <span className="text-4xl text-muted-foreground">▶</span>
          </div>
        )}
        {showBlur && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Lock className="h-8 w-8 text-white" />
          </div>
        )}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex w-full items-center gap-4 p-3 text-white">
            <span className="flex items-center gap-1 text-sm">
              <Heart className={`h-4 w-4 ${post.isLiked ? "fill-pink-500 text-pink-500" : ""}`} />
              {post.likesCount}
            </span>
            <span className="flex items-center gap-1 text-sm">
              <MessageCircle className="h-4 w-4" />
              {post.commentsCount}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 p-2">
        <button onClick={handleLike} className="hover:scale-110 transition-transform">
          <Heart className={`h-5 w-5 ${post.isLiked ? "fill-pink-500 text-pink-500" : "text-muted-foreground"}`} />
        </button>
        <span className="text-xs text-muted-foreground">{post.likesCount}</span>
        <MessageCircle className="ml-2 h-5 w-5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{post.commentsCount}</span>
      </div>
    </div>
  );
}

function PostModal({
  post,
  isSubscribed,
  isLoggedIn,
  onClose,
  onLike,
  onSave,
}: {
  post: Post;
  isSubscribed: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
  onLike: (liked: boolean, count: number) => void;
  onSave: (saved: boolean) => void;
}) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [showTip, setShowTip] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [saved, setSaved] = useState(post.isSaved);

  const showBlur = post.isPrivate && !isSubscribed;

  useEffect(() => {
    fetch(`/api/posts/${post.id}/comments`)
      .then((r) => r.json())
      .then(setComments)
      .catch(() => {});
  }, [post.id]);

  async function handleLike() {
    if (!isLoggedIn) return toast.error("Inicia sesion");
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
      const data = await res.json();
      setLiked(data.liked);
      setLikesCount(data.count);
      onLike(data.liked, data.count);
    } catch {
      toast.error("Error");
    }
  }

  async function handleSave() {
    if (!isLoggedIn) return toast.error("Inicia sesion");
    try {
      const res = await fetch(`/api/posts/${post.id}/save`, { method: "POST" });
      const data = await res.json();
      setSaved(data.saved);
      onSave(data.saved);
      toast.success(data.saved ? "Guardado" : "Eliminado de guardados");
    } catch {
      toast.error("Error");
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || sending) return;
    if (!isLoggedIn) return toast.error("Inicia sesion");
    setSending(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      const comment = await res.json();
      setComments((prev) => [comment, ...prev]);
      setNewComment("");
    } catch {
      toast.error("Error al comentar");
    } finally {
      setSending(false);
    }
  }

  async function handleTip() {
    const amount = parseFloat(tipAmount);
    if (!amount || amount <= 0) return;
    try {
      const res = await fetch(`/api/posts/${post.id}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error");
        return;
      }
      toast.success(`Propina de $${amount.toFixed(2)} enviada!`);
      setTipAmount("");
      setShowTip(false);
    } catch {
      toast.error("Error al enviar propina");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative flex w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-1/2 min-h-[400px] bg-black flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute left-3 top-3 z-10 rounded-full bg-black/60 p-1.5 hover:bg-black/80 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {showBlur ? (
            <>
              {post.contentType === "REEL" && post.videoUrl ? (
                <video src={post.videoUrl} className="h-full w-full object-contain blur-xl" muted />
              ) : post.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={post.imageUrl} alt="" className="h-full w-full object-contain blur-xl" />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Lock className="h-12 w-12 text-white" />
              </div>
            </>
          ) : post.contentType === "REEL" && post.videoUrl ? (
            <video
              src={post.videoUrl}
              className="h-full w-full object-contain"
              controls
              autoPlay
              loop
              playsInline
            />
          ) : post.imageUrl ? (
            <Image src={post.imageUrl} alt="" fill className="object-contain" />
          ) : null}
        </div>

        <div className="flex w-1/2 flex-col">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <button onClick={handleLike} className="hover:scale-110 transition-transform">
              <Heart className={`h-6 w-6 ${liked ? "fill-pink-500 text-pink-500" : ""}`} />
            </button>
            <span className="text-sm font-medium">{likesCount}</span>

            <MessageCircle className="ml-3 h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{comments.length}</span>

            <button onClick={handleSave} className="ml-auto hover:scale-110 transition-transform">
              <Bookmark className={`h-6 w-6 ${saved ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`} />
            </button>

            <button
              onClick={() => setShowTip(!showTip)}
              className="flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 text-white text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <DollarSign className="h-3.5 w-3.5" />
              Propina
            </button>
          </div>

          {showTip && (
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <Input
                type="number"
                min={1}
                step={0.5}
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="Monto..."
                className="h-8 w-24 text-sm"
              />
              <Button size="sm" onClick={handleTip} className="h-8 gap-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0">
                <DollarSign className="h-3.5 w-3.5" />
                Enviar
              </Button>
            </div>
          )}

          {post.caption && (
            <div className="border-b px-4 py-3">
              <p className="text-sm">{post.caption}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {comments.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Sin comentarios aun</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {c.user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.user.avatar} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      c.user.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-medium">{c.user.username}</span>
                    <p className="text-sm text-foreground/80">{c.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleComment} className="flex items-center gap-2 border-t px-4 py-3">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe un comentario..."
              className="flex-1 text-sm"
              disabled={!isLoggedIn}
            />
            <Button type="submit" size="icon" variant="ghost" disabled={!newComment.trim() || sending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
