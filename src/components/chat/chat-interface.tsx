"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  DollarSign,
  Lock,
  Loader2,
  ArrowLeft,
  X,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";

interface Message {
  id: string;
  senderType: "CLIENT" | "MODEL";
  content: string | null;
  imageUrl: string | null;
  audioUrl?: string | null;
  isPaidContent: boolean;
  price: number;
  isUnlocked: boolean;
  createdAt: Date;
}

interface ChatInterfaceProps {
  modelProfileId: string;
  modelName: string;
  modelSlug: string;
  modelAvatar?: string;
  isAutomatic: boolean;
}

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
    setPlaying(!playing);
  }

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el && el.duration) setProgress((el.currentTime / el.duration) * 100);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="h-1.5 w-full rounded-full bg-pink-500/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-pink-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {duration > 0 ? `${Math.floor(duration)}s` : "..."}
        </span>
      </div>
      <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

export function ChatInterface({
  modelProfileId,
  modelName,
  modelSlug,
  modelAvatar,
  isAutomatic,
}: ChatInterfaceProps) {
  const t = useTranslations("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tipAmount, setTipAmount] = useState("");
  const [showTip, setShowTip] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversation();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const loadConversation = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?modelProfileId=${modelProfileId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConversationId(data.id);
      setMessages(data.messages || []);
    } catch {
      toast.error("Error al cargar el chat");
    } finally {
      setLoading(false);
    }
  }, [modelProfileId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !conversationId || sending) return;

    const text = input.trim();
    setInput("");
    setSending(true);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      senderType: "CLIENT",
      content: text,
      imageUrl: null,
      isPaidContent: false,
      price: 0,
      isUnlocked: false,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, optimistic]);

    const typingDelay = 2000 + Math.random() * 4000;
    await new Promise((r) => setTimeout(r, typingDelay));
    setTyping(true);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content: text }),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== optimistic.id);
        const newMessages = [...filtered, data.userMessage];
        if (data.aiMessages) {
          newMessages.push(...data.aiMessages);
        }
        // Legacy support
        if (data.aiResponse) newMessages.push(data.aiResponse);
        if (data.photoMessage) newMessages.push(data.photoMessage);
        return newMessages;
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      toast.error("Error al enviar mensaje");
    } finally {
      setSending(false);
      setTyping(false);
    }
  }

  async function sendTip() {
    const amount = parseFloat(tipAmount);
    if (!amount || amount <= 0 || !conversationId) return;

    try {
      const res = await fetch("/api/chat/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, amount }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al enviar propina");
        return;
      }

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setTipAmount("");
      setShowTip(false);
      toast.success(`Propina de $${amount.toFixed(2)} enviada!`);
    } catch {
      toast.error("Error al enviar propina");
    }
  }

  async function unlockMessage(messageId: string) {
    try {
      const res = await fetch("/api/chat/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al desbloquear");
        return;
      }

      const result = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isUnlocked: true, imageUrl: result.imageUrl || m.imageUrl }
            : m
        )
      );
      toast.success("Foto desbloqueada!");
    } catch {
      toast.error("Error al desbloquear");
    }
  }

  function renderImage(msg: Message) {
    if (!msg.imageUrl) return null;

    if (msg.isPaidContent && !msg.isUnlocked) {
      return (
        <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-pink-500/10 to-rose-500/10 border border-pink-500/20">
          <Lock className="h-8 w-8 text-pink-500" />
          <p className="text-xs text-muted-foreground">
            {t("paidPhoto")}
          </p>
          <Button
            size="sm"
            onClick={() => unlockMessage(msg.id)}
            className="gap-1.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {t("unlockPhoto")} ${msg.price}
          </Button>
        </div>
      );
    }

    return (
      <button
        onClick={() => setFullscreenImage(msg.imageUrl)}
        className="block overflow-hidden rounded-xl cursor-pointer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={msg.imageUrl}
          alt=""
          className="h-72 w-64 object-cover rounded-xl"
          loading="lazy"
        />
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 top-[65px] flex flex-col bg-background">
        {/* Header */}
        <div className="shrink-0 border-b border-border/40 bg-background px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/model/${modelSlug}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Avatar className="h-10 w-10 ring-2 ring-pink-500/20">
              {modelAvatar && <AvatarImage src={modelAvatar} />}
              <AvatarFallback className="bg-pink-500/10 text-pink-500">
                {modelName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{modelName}</h2>
              <div className="flex items-center gap-2">
                {typing ? (
                  <span className="text-xs text-pink-500 font-medium animate-pulse">
                    {t("typing")}
                  </span>
                ) : (
                  <>
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-xs text-muted-foreground">
                      {t("online")}
                    </span>
                  </>
                )}
                {isAutomatic && (
                  <Badge variant="secondary" className="text-xs">
                    {t("autoMode")}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setShowTip(!showTip)}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("sendTip")}</span>
            </Button>
          </div>
        </div>

        {/* Tip bar */}
        {showTip && (
          <div className="shrink-0 border-b border-border/40 bg-muted/30 px-4 py-2">
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <span className="text-sm">{t("tipAmount")}:</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="h-8 w-24"
                placeholder="$5"
              />
              <Button size="sm" onClick={sendTip} disabled={!tipAmount}>
                {t("send")}
              </Button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => {
              const hasImage = !!msg.imageUrl;
              const hasAudio = !!msg.audioUrl;
              const hasText = !!msg.content && !hasAudio;
              const isPhotoOnly = hasImage && !hasText && !hasAudio;
              const isAudioOnly = hasAudio && !hasImage;

              return (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.senderType === "CLIENT" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="max-w-[85%] sm:max-w-[70%]">
                    {msg.senderType === "MODEL" && (
                      <div className="mb-1 flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {modelAvatar && <AvatarImage src={modelAvatar} />}
                          <AvatarFallback className="bg-pink-500/10 text-xs text-pink-500">
                            {modelName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          {modelName}
                        </span>
                      </div>
                    )}

                    {isPhotoOnly ? (
                      <div>{renderImage(msg)}</div>
                    ) : isAudioOnly ? (
                      <div className="rounded-2xl bg-muted px-3 py-2">
                        <AudioPlayer src={msg.audioUrl!} />
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          msg.senderType === "CLIENT"
                            ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white"
                            : "bg-muted"
                        }`}
                      >
                        {hasImage && <div className="mb-2">{renderImage(msg)}</div>}
                        {hasAudio && (
                          <div className="mb-2">
                            <AudioPlayer src={msg.audioUrl!} />
                          </div>
                        )}
                        {hasText && (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}

            {typing && (
              <div className="flex justify-start">
                <div className="max-w-[85%] sm:max-w-[70%]">
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {modelAvatar && <AvatarImage src={modelAvatar} />}
                      <AvatarFallback className="bg-pink-500/10 text-xs text-pink-500">
                        {modelName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {modelName}
                    </span>
                  </div>
                  <div className="rounded-2xl bg-muted px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-pink-400 animate-bounce [animation-delay:0ms]" />
                        <span className="inline-block h-2 w-2 rounded-full bg-pink-400 animate-bounce [animation-delay:200ms]" />
                        <span className="inline-block h-2 w-2 rounded-full bg-pink-400 animate-bounce [animation-delay:400ms]" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t("typing")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border/40 bg-background px-4 py-3">
          <form
            onSubmit={sendMessage}
            className="mx-auto flex max-w-3xl items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              disabled={sending}
              className="h-10 flex-1 rounded-full px-4"
            />
            <Button
              type="submit"
              disabled={sending || !input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Fullscreen image overlay */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 cursor-pointer"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            className="absolute right-4 top-4 z-[101] rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImage}
            alt=""
            className="max-h-[85vh] max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
