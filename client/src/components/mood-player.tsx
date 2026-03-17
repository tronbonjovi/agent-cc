import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const VIDEO_ID = "RjM8d0Csuk4";

interface MoodContextType {
  playing: boolean;
  ready: boolean;
  toggle: () => void;
}

const MoodContext = createContext<MoodContextType>({ playing: false, ready: false, toggle: () => {} });

export function useMoodPlayer() {
  return useContext(MoodContext);
}

/** Hidden iframe + context provider — lives in Layout so it persists across pages */
export function MoodPlayerProvider({ children }: { children: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const initPlayer = useCallback(() => {
    if (playerRef.current || !containerRef.current) return;
    playerRef.current = new window.YT.Player("mood-yt-player", {
      height: "1",
      width: "1",
      videoId: VIDEO_ID,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        loop: 1,
        playlist: VIDEO_ID,
      },
      events: {
        onReady: (event: any) => {
          event.target.setPlaybackQuality("small");
          setReady(true);
        },
        onStateChange: (event: any) => {
          if (event.data === 0) {
            event.target.seekTo(0);
            event.target.playVideo();
          }
        },
      },
    });
  }, []);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
    return () => {
      window.onYouTubeIframeAPIReady = () => {};
    };
  }, [initPlayer]);

  const toggle = useCallback(() => {
    if (!playerRef.current || !ready) return;
    if (playing) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
      playerRef.current.setPlaybackQuality("small");
    }
    setPlaying((p) => !p);
  }, [playing, ready]);

  return (
    <MoodContext.Provider value={{ playing, ready, toggle }}>
      {/* Hidden YouTube player */}
      <div
        ref={containerRef}
        style={{ position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none", top: 0, left: 0, zIndex: -1 }}
      >
        <div id="mood-yt-player" />
      </div>
      {children}
    </MoodContext.Provider>
  );
}

const MOOD_MESSAGES = [
  "Are you ready?",
  "Fasten your seat belt.",
  "Fix your eyes on the prize.",
  "Calm your mind.",
  "Steady your breath.",
  "Feel the tension.",
  "Embrace the pressure.",
  "Ignore the noise.",
  "Trust the process.",
  "Hold your ground.",
  "Move with precision.",
  "Stay relentless.",
  "Stay hungry.",
  "Nothing can stop you now.",
  "This moment is yours.",
  "Make it count.",
];

/** Visible play/pause control — used in the Dashboard header */
export function MoodPlayerButton() {
  const { playing, ready, toggle } = useMoodPlayer();
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playing) {
      setMsgIndex(0);
      setVisible(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Start first message immediately
    setVisible(true);
    let idx = 0;

    intervalRef.current = setInterval(() => {
      // Fade out
      setVisible(false);

      setTimeout(() => {
        idx++;
        if (idx >= MOOD_MESSAGES.length) {
          // Stay on last message, stop cycling
          idx = MOOD_MESSAGES.length - 1;
          setMsgIndex(idx);
          setVisible(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }
        setMsgIndex(idx);
        // Fade in
        setVisible(true);
      }, 800); // fade-out duration before switching
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing]);

  return (
    <button
      onClick={toggle}
      disabled={!ready}
      className={cn(
        "flex items-center gap-2.5 rounded-full px-4 py-2 text-sm transition-all duration-300 border",
        playing
          ? "bg-gradient-to-r from-purple-500/15 via-pink-500/10 to-transparent border-purple-500/40 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
          : "border-border/50 text-muted-foreground hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300",
        !ready && "opacity-40 cursor-not-allowed"
      )}
    >
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 shrink-0",
        playing
          ? "bg-purple-500/25 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
          : "bg-muted/30"
      )}>
        {playing ? (
          <Pause className="h-3.5 w-3.5 text-purple-400" />
        ) : (
          <Play className="h-3.5 w-3.5 ml-0.5 text-purple-400" />
        )}
      </div>
      <span
        className={cn(
          "font-medium text-xs whitespace-nowrap min-w-[160px] text-center transition-all duration-700",
          playing
            ? visible ? "opacity-100" : "opacity-0"
            : "opacity-100"
        )}
      >
        {playing ? MOOD_MESSAGES[msgIndex] : "Get In The Mood"}
      </span>
      {playing && (
        <div className="flex items-center gap-0.5 ml-1">
          <span className="w-0.5 h-2 bg-purple-400 rounded-full animate-[equalizer_0.8s_ease-in-out_infinite]" />
          <span className="w-0.5 h-3 bg-pink-400 rounded-full animate-[equalizer_0.6s_ease-in-out_infinite_0.2s]" />
          <span className="w-0.5 h-1.5 bg-purple-400 rounded-full animate-[equalizer_0.7s_ease-in-out_infinite_0.4s]" />
          <span className="w-0.5 h-2.5 bg-pink-400 rounded-full animate-[equalizer_0.9s_ease-in-out_infinite_0.1s]" />
          <span className="w-0.5 h-2 bg-purple-400 rounded-full animate-[equalizer_0.5s_ease-in-out_infinite_0.3s]" />
        </div>
      )}
    </button>
  );
}
