"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Story {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
}

interface StoryViewerProps {
  stories: Story[];
  modelName: string;
  modelAvatar?: string;
  onClose: () => void;
  startIndex?: number;
}

export function StoryViewer({ stories, modelName, modelAvatar, onClose, startIndex = 0 }: StoryViewerProps) {
  const [current, setCurrent] = useState(startIndex);
  const [progress, setProgress] = useState(0);

  const goNext = useCallback(() => {
    if (current < stories.length - 1) {
      setCurrent((p) => p + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [current, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (current > 0) {
      setCurrent((p) => p - 1);
      setProgress(0);
    }
  }, [current]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          goNext();
          return 0;
        }
        return p + 2;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [current, goNext]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    const storyId = stories[current]?.id;
    if (storyId) {
      fetch(`/api/stories/${storyId}/view`, { method: "POST" }).catch(() => {});
    }
  }, [current, stories]);

  const story = stories[current];
  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-[101] rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-6 w-6" />
      </button>

      {current > 0 && (
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-[101] rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {current < stories.length - 1 && (
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-[101] rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div className="absolute top-0 left-0 right-0 z-[101] flex gap-1 p-3">
        {stories.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-100"
              style={{
                width: i < current ? "100%" : i === current ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute top-6 left-3 z-[101] flex items-center gap-2">
        {modelAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={modelAvatar} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-pink-500" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-500 text-white text-sm font-bold">
            {modelName.charAt(0)}
          </div>
        )}
        <span className="text-white text-sm font-medium drop-shadow">{modelName}</span>
        <span className="text-white/50 text-xs">
          {new Date(story.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={story.imageUrl}
        alt=""
        className="max-h-[90vh] max-w-full object-contain"
        onClick={goNext}
      />

      {story.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16">
          <p className="text-white text-center text-sm">{story.caption}</p>
        </div>
      )}
    </div>
  );
}

export function StoryCircles({
  stories,
  modelName,
  modelAvatar,
}: {
  stories: Story[];
  modelName: string;
  modelAvatar?: string;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  if (stories.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setViewerOpen(true)}
        className="flex flex-col items-center gap-1 group"
      >
        <div className="rounded-full p-[3px] bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 group-hover:scale-105 transition-transform">
          {modelAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={modelAvatar}
              alt=""
              className="h-16 w-16 rounded-full object-cover border-2 border-background"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background border-2 border-background text-pink-500 text-xl font-bold">
              {modelName.charAt(0)}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{stories.length} stories</span>
      </button>

      {viewerOpen && (
        <StoryViewer
          stories={stories}
          modelName={modelName}
          modelAvatar={modelAvatar}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
