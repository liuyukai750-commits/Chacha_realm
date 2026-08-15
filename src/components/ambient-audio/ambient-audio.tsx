"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ambient-audio.module.css";

const AUDIO_PREFERENCE_KEY = "chacha-street:ambient-audio";
const AMBIENT_VOLUME = 0.16;

type AudioPreference = "on" | "off";

function readPreference(): AudioPreference {
  try {
    return window.localStorage.getItem(AUDIO_PREFERENCE_KEY) === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

function writePreference(preference: AudioPreference) {
  try {
    window.localStorage.setItem(AUDIO_PREFERENCE_KEY, preference);
  } catch {
    // Storage can be unavailable in private browsing. Playback still works for this visit.
  }
}

export function AmbientAudio() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [preference, setPreference] = useState<AudioPreference>("off");
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreference(readPreference());
      setPreferenceReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = AMBIENT_VOLUME;
    try {
      await audio.play();
      setPlaying(true);
      setFeedback("");
    } catch {
      setPlaying(false);
      setFeedback("音乐没有响起来，点一下再试。");
    }
  }, []);

  useEffect(() => {
    if (!preferenceReady || preference !== "on" || playing) return;

    const resumeAfterGesture = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-ambient-audio-control]")) return;
      void play();
    };

    document.addEventListener("pointerdown", resumeAfterGesture, { capture: true });
    document.addEventListener("keydown", resumeAfterGesture, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", resumeAfterGesture, { capture: true });
      document.removeEventListener("keydown", resumeAfterGesture, { capture: true });
    };
  }, [play, playing, preference, preferenceReady]);

  useEffect(() => {
    const handleVisibility = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) {
        audio.pause();
        return;
      }
      if (preference === "on") void play();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [play, preference]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (preference === "on" && playing) {
      audio.pause();
      setPlaying(false);
      setPreference("off");
      setFeedback("");
      writePreference("off");
      return;
    }

    setPreference("on");
    writePreference("on");
    await play();
  };

  const label = playing ? "音乐中" : preference === "on" ? "继续音乐" : "音乐";

  return (
    <aside className={styles.audioControl} data-playing={playing ? "true" : "false"}>
      {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
      <button
        type="button"
        data-ambient-audio-control
        aria-label={playing ? "关闭背景音乐" : "播放背景音乐"}
        aria-pressed={preference === "on"}
        onClick={() => void toggle()}
      >
        <span className={styles.radio} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{label}</span>
      </button>
      <audio
        ref={audioRef}
        loop
        playsInline
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setPreference("off");
          setFeedback("音乐暂时没接上，稍后再试。");
          writePreference("off");
        }}
      >
        <source src="/audio/chacha-street-sneaky-blues.mp3" type="audio/mpeg" />
      </audio>
    </aside>
  );
}
