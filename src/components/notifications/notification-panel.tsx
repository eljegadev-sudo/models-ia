"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, Image as ImageIcon, MessageCircle, Film, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationPanelProps {
  onClose: () => void;
  onRead: () => void;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  new_post: ImageIcon,
  new_story: Sparkles,
  message: MessageCircle,
  new_video: Film,
};

export function NotificationPanel({ onClose, onRead }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onRead();
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] overflow-hidden rounded-xl border bg-background shadow-xl z-[100]"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Notificaciones</h3>
        {notifications.some((n) => !n.read) && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead}>
            <Check className="h-3 w-3" />
            Leer todo
          </Button>
        )}
      </div>

      <div className="max-h-[22rem] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-pink-500 border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Bell className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm">Sin notificaciones</p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] || Bell;
            return (
              <a
                key={n.id}
                href={n.link || "#"}
                className={`flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${!n.read ? "bg-pink-500/5" : ""}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${!n.read ? "bg-pink-500/10 text-pink-500" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${!n.read ? "font-medium" : ""}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-pink-500" />
                )}
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
