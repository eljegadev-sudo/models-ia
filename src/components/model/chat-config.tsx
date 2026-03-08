"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Loader2,
  MessageCircle,
  Save,
  Brain,
  Flame,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

const EROTIC_LEVELS = [
  { level: 1, label: "Suave", desc: "Flirteo ligero, conversación cálida" },
  { level: 2, label: "Coqueta", desc: "Insinuaciones, dobles sentidos" },
  { level: 3, label: "Sensual", desc: "Habla abiertamente de atracción" },
  { level: 4, label: "Explícita", desc: "Lenguaje provocativo y directo" },
  { level: 5, label: "Sin Filtros", desc: "Muy desinhibida, sin restricciones" },
];

interface ChatConfigProps {
  model: {
    id: string;
    name: string;
    chatAutomatic: boolean;
    chatPersonality: string | null;
    eroticLevel: number;
  };
  conversations: {
    id: string;
    clientUsername: string;
    messageCount: number;
    lastMessage: string | null;
    lastMessageAt: Date;
    isAutomated: boolean;
    aiEnabled: boolean;
    eroticLevel: number;
    memoryContext: string | null;
    preferredName: string | null;
  }[];
}

export function ChatConfig({ model, conversations }: ChatConfigProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [chatAutomatic, setChatAutomatic] = useState(model.chatAutomatic);
  const [chatPersonality, setChatPersonality] = useState(
    model.chatPersonality || ""
  );
  const [eroticLevel, setEroticLevel] = useState(model.eroticLevel);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/models/${model.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatAutomatic, chatPersonality, eroticLevel }),
      });
      if (!res.ok) throw new Error();
      toast.success("Configuración guardada");
      router.refresh();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function updateConversationConfig(
    convId: string,
    data: { aiEnabled?: boolean; eroticLevel?: number }
  ) {
    try {
      const res = await fetch("/api/chat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, ...data }),
      });
      if (!res.ok) throw new Error();
      toast.success("Chat actualizado");
      router.refresh();
    } catch {
      toast.error("Error al actualizar");
    }
  }

  const currentLevel = EROTIC_LEVELS.find((l) => l.level === eroticLevel) || EROTIC_LEVELS[2];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Configuración de Chat</h1>
      <p className="mb-8 text-muted-foreground">{model.name}</p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuración Global de IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Respuestas Automáticas</Label>
                <p className="text-sm text-muted-foreground">
                  La IA responderá automáticamente a los mensajes de suscriptores
                </p>
              </div>
              <Switch
                checked={chatAutomatic}
                onCheckedChange={setChatAutomatic}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                <Label>Nivel Erótico: {currentLevel.label} ({eroticLevel}/5)</Label>
              </div>
              <Slider
                value={[eroticLevel]}
                onValueChange={(v) => setEroticLevel(Array.isArray(v) ? v[0] : v)}
                min={1}
                max={5}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                {currentLevel.desc}
              </p>
              <div className="flex justify-between text-xs text-muted-foreground">
                {EROTIC_LEVELS.map((l) => (
                  <span key={l.level} className={l.level === eroticLevel ? "text-orange-500 font-medium" : ""}>
                    {l.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Personalidad del Chat</Label>
              <Textarea
                value={chatPersonality}
                onChange={(e) => setChatPersonality(e.target.value)}
                placeholder="Describe cómo debe comunicarse este modelo. Incluye: tono, estilo, cómo maneja peticiones íntimas, qué la hace única, palabras o expresiones que usa..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Este prompt define cómo la IA responde en el chat. Sé lo más específica posible
                sobre personalidad, estilo, nivel de coqueteo y cómo reacciona a distintas situaciones.
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar Configuración
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Conversaciones Activas ({conversations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">
                No hay conversaciones aún
              </p>
            ) : (
              <div className="space-y-3">
                {conversations.map((conv) => (
                  <div key={conv.id} className="rounded-lg border border-border/50">
                    <button
                      onClick={() => setExpandedConv(expandedConv === conv.id ? null : conv.id)}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            @{conv.clientUsername}
                            {conv.preferredName && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({conv.preferredName})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {conv.lastMessage || "Sin mensajes"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {conv.messageCount} msgs
                        </Badge>
                        {conv.aiEnabled && (
                          <Badge className="text-xs bg-green-500/20 text-green-700">IA</Badge>
                        )}
                        {expandedConv === conv.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {expandedConv === conv.id && (
                      <div className="border-t border-border/50 p-3 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm">IA Activada</Label>
                            <p className="text-xs text-muted-foreground">
                              Para este chat específico
                            </p>
                          </div>
                          <Switch
                            checked={conv.aiEnabled}
                            onCheckedChange={(checked) =>
                              updateConversationConfig(conv.id, { aiEnabled: checked })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm flex items-center gap-1.5">
                            <Flame className="h-3.5 w-3.5 text-orange-500" />
                            Nivel Erótico: {conv.eroticLevel}/5
                          </Label>
                          <Slider
                            value={[conv.eroticLevel]}
                            onValueChange={(v) =>
                              updateConversationConfig(conv.id, { eroticLevel: Array.isArray(v) ? v[0] : v })
                            }
                            min={1}
                            max={5}
                            step={1}
                            className="w-full"
                          />
                        </div>

                        {conv.memoryContext && (
                          <div className="space-y-2">
                            <Label className="text-sm flex items-center gap-1.5">
                              <Brain className="h-3.5 w-3.5 text-purple-500" />
                              Memoria del Chat
                            </Label>
                            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                              {(() => {
                                try {
                                  const mem = JSON.parse(conv.memoryContext);
                                  return Object.entries(mem)
                                    .filter(([, v]) => v)
                                    .map(([k, v]) => (
                                      <p key={k}>
                                        <span className="font-medium">{k}:</span> {String(v)}
                                      </p>
                                    ));
                                } catch {
                                  return <p>{conv.memoryContext}</p>;
                                }
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
