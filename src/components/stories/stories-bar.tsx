"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Story {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  modelProfile: {
    id: string;
    name: string;
    slug: string;
    referenceImages: { imageUrl: string }[];
  };
}

interface GroupedStories {
  modelId: string;
  modelName: string;
  modelSlug: string;
  avatar: string | null;
  stories: Story[];
}

export function StoriesBar() {
  const [groups, setGroups] = useState<GroupedStories[]>([]);
  const [viewing, setViewing] = useState<{ group: GroupedStories; index: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/stories")
      .then((r) => r.json())
      .then((stories: Story[]) => {
        const map = new Map<string, GroupedStories>();
        for (const s of stories) {
          const key = s.modelProfile.id;
          if (!map.has(key)) {
            map.set(key, {
              modelId: key,
              modelName: s.modelProfile.name,
              modelSlug: s.modelProfile.slug,
              avatar: s.modelProfile.referenceImages[0]?.imageUrl || null,
              stories: [],
            });
          }
          map.get(key)!.stories.push(s);
        }
        setGroups(Array.from(map.values()));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || groups.length === 0) return null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto px-4 py-3 no-scrollbar">
        {groups.map((g) => (
          <button
            key={g.modelId}
            onClick={() => setViewing({ group: g, index: 0 })}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div className="rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 p-[2px]">
              <Avatar className="h-16 w-16 border-2 border-background">
                {g.avatar && <AvatarImage src={g.avatar} />}
                <AvatarFallback className="bg-pink-500/10 text-pink-500 font-semibold">
                  {g.modelName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-xs text-muted-foreground max-w-[72px] truncate">
              {g.modelName}
            </span>
          </button>
        ))}
      </div>

      {viewing && (
        <StoryViewer
          group={viewing.group}
          startIndex={viewing.index}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

function StoryViewer({
  group,
  startIndex,
  onClose,
}: {
  group: GroupedStories;
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const story = group.stories[index];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (index < group.stories.length - 1) {
        setIndex((i) => i + 1);
      } else {
        onClose();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [index, group.stories.length, onClose]);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      {/* Progress bars */}
      <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
        {group.stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className={`h-full bg-white rounded-full ${
                i < index ? "w-full" : i === index ? "w-full animate-[grow_5s_linear]" : "w-0"
              }`}
              style={i === index ? { animation: "grow 5s linear forwards" } : undefined}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            {group.avatar && <AvatarImage src={group.avatar} />}
            <AvatarFallback className="bg-pink-500/10 text-pink-500 text-xs">
              {group.modelName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="text-white text-sm font-medium">{group.modelName}</span>
          <span className="text-white/50 text-xs">
            {new Date(story.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <button onClick={onClose} className="text-white p-1">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={story.imageUrl}
        alt=""
        className="max-h-[85vh] max-w-full object-contain"
      />

      {/* Caption */}
      {story.caption && (
        <div className="absolute bottom-8 left-4 right-4 z-10">
          <p className="text-white text-sm bg-black/40 rounded-xl px-4 py-2 backdrop-blur-sm">
            {story.caption}
          </p>
        </div>
      )}

      {/* Navigation */}
      {index > 0 && (
        <button
          onClick={() => setIndex((i) => i - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white p-2"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}
      {index < group.stories.length - 1 && (
        <button
          onClick={() => setIndex((i) => i + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white p-2"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      <style>{`
        @keyframes grow {
          from { width: 0; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
