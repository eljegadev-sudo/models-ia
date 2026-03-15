"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "./language-switcher";
import {
  Menu,
  Heart,
  LayoutDashboard,
  Compass,
  LogOut,
  Bell,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { NotificationPanel } from "@/components/notifications/notification-panel";

export function Navbar() {
  const t = useTranslations("nav");
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!session?.user) return;
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* silent */ }
  }, [session?.user]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href={session ? "/explore" : "/"} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-pink-500 to-rose-500">
              <Heart className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">
              AI<span className="text-pink-500">Models</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Compass className="h-4 w-4" />
              {t("explore")}
            </Link>
            {session && (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t("dashboard")}
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />

          {session && (
            <div className="relative">
              <button
                onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) fetchUnread(); }}
                className="relative inline-flex items-center justify-center rounded-lg p-2 hover:bg-muted transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <NotificationPanel
                  onClose={() => setNotifOpen(false)}
                  onRead={() => setUnreadCount(0)}
                />
              )}
            </div>
          )}

          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="relative h-9 w-9 rounded-full outline-none">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-pink-500/10 text-pink-500">
                    {session.user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 p-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{session.user?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.user?.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/dashboard")} className="cursor-pointer gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  {t("dashboard")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/explore")} className="cursor-pointer gap-2">
                  <Compass className="h-4 w-4" />
                  {t("explore")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-destructive"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="h-4 w-4" />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/login">{t("login")}</Link>
              </Button>
              <Button size="sm" className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 border-0 text-white" asChild>
                <Link href="/auth/register">{t("register")}</Link>
              </Button>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-muted transition-colors md:hidden outline-none"
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <nav className="flex flex-col gap-4 pt-8">
                <Link
                  href="/explore"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Compass className="h-4 w-4" />
                  {t("explore")}
                </Link>
                {session && (
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    {t("dashboard")}
                  </Link>
                )}
                {!session && (
                  <>
                    <Link
                      href="/auth/login"
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {t("login")}
                    </Link>
                    <Link
                      href="/auth/register"
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-2 text-sm font-medium text-white hover:from-pink-600 hover:to-rose-600 transition-colors"
                    >
                      {t("register")}
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
