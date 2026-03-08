import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Sparkles } from "lucide-react";

export function Footer() {
  const t = useTranslations("nav");

  return (
    <footer className="border-t border-border/40 bg-background/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">
                AI<span className="text-primary">Models</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered content creation platform
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Platform</h4>
            <nav className="flex flex-col gap-2">
              <Link
                href="/explore"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("explore")}
              </Link>
            </nav>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Account</h4>
            <nav className="flex flex-col gap-2">
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("login")}
              </Link>
              <Link
                href="/auth/register"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("register")}
              </Link>
            </nav>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Legal</h4>
            <nav className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">
                Terms of Service
              </span>
              <span className="text-sm text-muted-foreground">
                Privacy Policy
              </span>
            </nav>
          </div>
        </div>

        <div className="mt-8 border-t border-border/40 pt-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} AIModels. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
