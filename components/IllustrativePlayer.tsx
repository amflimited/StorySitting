"use client";

import { useEffect, useRef, useState } from "react";
import { StoryWave } from "@/components/StoryWave";

const SAMPLE = "She was working the pie table for her church. Lorraine. She had a little tin cash box, and she would not make change until you said please. I bought a slice of cherry pie I did not want. Then I bought another one.";

export function IllustrativePlayer() {
  const [playing, setPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function toggle() {
    if (!("speechSynthesis" in window)) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(SAMPLE);
    utterance.rate = .84;
    utterance.pitch = .92;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    utteranceRef.current = utterance;
    setPlaying(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="demo-player">
      <button type="button" className="demo-play" onClick={toggle} aria-label={playing ? "Stop illustrative narration" : "Play illustrative narration"}>{playing ? "■" : "▶"}</button>
      <div><StoryWave active={playing} /><span>{playing ? "Playing narrated sample…" : "0:00 / 0:22 · illustrative narration"}</span></div>
      <small>Source view ↗</small>
    </div>
  );
}
