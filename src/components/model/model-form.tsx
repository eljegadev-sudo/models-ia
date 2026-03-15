"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Wand2, Upload, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface ModelFormProps {
  initialData?: {
    id: string;
    name: string;
    age: number;
    nationality: string;
    bio: string;
    bodyType?: string;
    hairColor?: string;
    hairType?: string;
    ethnicity?: string;
    height?: number;
    subscriptionPrice: number;
    exclusivityPrice?: number | null;
    chatPersonality?: string;
    backstory?: string;
    chatAutomatic: boolean;
    referenceImages?: { id: string; imageUrl: string }[];
  };
}

export function ModelForm({ initialData }: ModelFormProps) {
  const t = useTranslations("models.create");
  const router = useRouter();
  const isEditing = !!initialData;

  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [imageGenLoading, setImageGenLoading] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<
    { id?: string; url: string; file?: File }[]
  >(
    initialData?.referenceImages?.map((img) => ({
      id: img.id,
      url: img.imageUrl,
    })) || []
  );

  const [form, setForm] = useState({
    name: initialData?.name || "",
    age: initialData?.age || 25,
    nationality: initialData?.nationality || "",
    bio: initialData?.bio || "",
    bodyType: initialData?.bodyType || "",
    hairColor: initialData?.hairColor || "",
    hairType: initialData?.hairType || "",
    ethnicity: initialData?.ethnicity || "",
    height: initialData?.height || 170,
    subscriptionPrice: initialData?.subscriptionPrice || 9.99,
    exclusivityPrice: initialData?.exclusivityPrice ?? 0,
    chatPersonality: initialData?.chatPersonality || "",
    backstory: initialData?.backstory || "",
    chatAutomatic: initialData?.chatAutomatic ?? true,
  });

  function updateField(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-profile", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setForm((prev) => ({
        ...prev,
        name: data.name || prev.name,
        age: data.age || prev.age,
        nationality: data.nationality || prev.nationality,
        bio: data.bio || prev.bio,
        bodyType: data.bodyType || prev.bodyType,
        hairColor: data.hairColor || prev.hairColor,
        hairType: data.hairType || prev.hairType,
        ethnicity: data.ethnicity || prev.ethnicity,
        height: data.height || prev.height,
        chatPersonality: data.chatPersonality || prev.chatPersonality,
      }));
      toast.success("Profile generated with AI!");
    } catch {
      toast.error("Failed to generate profile");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const remaining = 5 - referenceImages.length;
    const toUpload = Array.from(files).slice(0, remaining);

    for (const file of toUpload) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subfolder", "references");

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setReferenceImages((prev) => [...prev, { url: data.url }]);
      } catch {
        toast.error("Failed to upload image");
      }
    }
  }

  async function handleGenerateImage() {
    if (!imagePrompt.trim()) return;
    setImageGenLoading(true);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imagePrompt,
          type: "reference",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReferenceImages((prev) => [...prev, { url: data.imageUrl }]);
      setImagePrompt("");
      toast.success("Image generated!");
    } catch {
      toast.error("Failed to generate image");
    } finally {
      setImageGenLoading(false);
    }
  }

  function removeImage(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const url = isEditing ? `/api/models/${initialData!.id}` : "/api/models";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = err?.details
          ? err.details.map((d: { message: string }) => d.message).join(", ")
          : err?.error || "Error saving model";
        throw new Error(msg);
      }
      const model = await res.json();

      if (!isEditing && referenceImages.length > 0) {
        for (let i = 0; i < referenceImages.length; i++) {
          const refRes = await fetch(`/api/models/${model.id}/references`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: referenceImages[i].url,
              orderIndex: i,
            }),
          });
          if (!refRes.ok) console.error("Failed to save reference image", i);
        }
      }

      toast.success(isEditing ? t("success") : t("success"));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {isEditing ? t("title") : t("title")}
          </h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleAiSuggest}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {t("aiSuggest")}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("name")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("age")}</Label>
                <Input
                  type="number"
                  min={18}
                  max={60}
                  value={form.age}
                  onChange={(e) => updateField("age", parseInt(e.target.value))}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("nationality")}</Label>
                <Input
                  value={form.nationality}
                  onChange={(e) => updateField("nationality", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t("ethnicity")}</Label>
                <Input
                  value={form.ethnicity}
                  onChange={(e) => updateField("ethnicity", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("bio")}</Label>
              <Textarea
                value={form.bio}
                onChange={(e) => updateField("bio", e.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("bodyType")}</Label>
                <Select
                  value={form.bodyType}
                  onValueChange={(v) => v && updateField("bodyType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slim">Slim</SelectItem>
                    <SelectItem value="athletic">Athletic</SelectItem>
                    <SelectItem value="curvy">Curvy</SelectItem>
                    <SelectItem value="petite">Petite</SelectItem>
                    <SelectItem value="average">Average</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("hairColor")}</Label>
                <Input
                  value={form.hairColor}
                  onChange={(e) => updateField("hairColor", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("hairType")}</Label>
                <Select
                  value={form.hairType}
                  onValueChange={(v) => v && updateField("hairType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight">Straight</SelectItem>
                    <SelectItem value="wavy">Wavy</SelectItem>
                    <SelectItem value="curly">Curly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("height")}</Label>
                <Input
                  type="number"
                  min={140}
                  max={200}
                  value={form.height}
                  onChange={(e) =>
                    updateField("height", parseFloat(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("subscriptionPrice")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.subscriptionPrice}
                  onChange={(e) =>
                    updateField(
                      "subscriptionPrice",
                      parseFloat(e.target.value)
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Precio exclusividad (opcional)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0 = no disponible"
                  value={form.exclusivityPrice === 0 || form.exclusivityPrice === undefined ? "" : form.exclusivityPrice}
                  onChange={(e) =>
                    updateField(
                      "exclusivityPrice",
                      e.target.value === "" ? 0 : parseFloat(e.target.value)
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Si pones un precio, los usuarios podran &quot;hacerla suya&quot; y solo ellos la veran.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chat Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Automated Chat</Label>
                <p className="text-sm text-muted-foreground">
                  Enable AI-powered automatic responses
                </p>
              </div>
              <Switch
                checked={form.chatAutomatic}
                onCheckedChange={(v) => updateField("chatAutomatic", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("chatPersonality")}</Label>
              <Textarea
                value={form.chatPersonality}
                onChange={(e) =>
                  updateField("chatPersonality", e.target.value)
                }
                placeholder={t("chatPersonalityPlaceholder")}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Historia de vida (backstory)</Label>
              <Textarea
                value={form.backstory}
                onChange={(e) => updateField("backstory", e.target.value)}
                placeholder="Cuenta la historia de vida de esta modelo: infancia, familia, como crecio, que estudia o trabaja, hobbies, gustos, cosas que no le gustan, su personalidad real. Mientras mas detallada, mas humana sera la conversacion. Ej: 'Crecio en un pueblo pequeno con su mama y hermana. Sus papas se separaron cuando tenia 12. Nunca le gustaron los videojuegos pero le encanta bailar y cocinar. Trabaja como bartender los fines de semana...'"
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Esta historia influye en como habla, que sabe, que no sabe, y como reacciona en el chat.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("referenceImages")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("referenceImagesDesc")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {referenceImages.length > 0 && (
              <div className="grid grid-cols-5 gap-3">
                {referenceImages.map((img, i) => (
                  <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-lg border">
                    <Image
                      src={img.url}
                      alt={`Reference ${i + 1}`}
                      fill
                      className="object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {referenceImages.length < 5 && (
              <>
                <div className="flex gap-3">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary/50 transition-colors">
                    <Upload className="h-4 w-4" />
                    {t("uploadImages")}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>{t("imagePrompt")}</Label>
                  <div className="flex gap-2">
                    <Textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="A beautiful 25 year old woman with long brown hair, green eyes, natural lighting, portrait photo..."
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={handleGenerateImage}
                      disabled={imageGenLoading || !imagePrompt.trim()}
                      className="gap-2 self-end"
                    >
                      {imageGenLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      {t("generateImages")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
