"use client";
import * as React from "react";
import { toast } from "sonner";
import { Users, Upload, ClipboardPaste, Tags as TagsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ContactsList, type ContactRow, type TagOption } from "./contacts-list";
import { ContactsImport } from "./contacts-import";
import { ContactsPaste } from "./contacts-paste";
import { TagsManager } from "./tags-manager";

type TabKey = "list" | "import" | "paste";

export function ContactsClient() {
  const [tab, setTab] = React.useState<TabKey>("list");
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [tagsManagerOpen, setTagsManagerOpen] = React.useState(false);

  const loadTags = React.useCallback(async () => {
    const res = await fetch("/api/tags", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setTags(data.tags);
  }, []);

  React.useEffect(() => {
    loadTags();
  }, [loadTags]);

  const onImportDone = React.useCallback(() => {
    toast.success("Importação concluída");
    setTab("list");
  }, []);

  const nav: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "list", label: "Lista de Contatos", icon: Users },
    { key: "import", label: "Importar CSV/XLSX", icon: Upload },
    { key: "paste", label: "Copie e Cole", icon: ClipboardPaste },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="space-y-2">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors border",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent border-border",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => setTagsManagerOpen(true)}
        >
          <TagsIcon /> Gerenciar tags ({tags.length})
        </Button>
      </aside>

      <div>
        {tab === "list" && <ContactsList tags={tags} onTagsChanged={loadTags} />}
        {tab === "import" && (
          <Card>
            <CardContent className="pt-6">
              <ContactsImport tags={tags} onDone={onImportDone} />
            </CardContent>
          </Card>
        )}
        {tab === "paste" && (
          <Card>
            <CardContent className="pt-6">
              <ContactsPaste tags={tags} onDone={onImportDone} />
            </CardContent>
          </Card>
        )}
      </div>

      <TagsManager
        open={tagsManagerOpen}
        onOpenChange={setTagsManagerOpen}
        onChanged={loadTags}
      />
    </div>
  );
}

// Re-export tipos usados pelos filhos
export type { ContactRow, TagOption };
