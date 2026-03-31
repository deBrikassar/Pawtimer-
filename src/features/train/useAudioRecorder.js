import { useCallback, useEffect, useRef } from "react";

const isRecorderSupported = () => (
  typeof window !== "undefined"
  && typeof navigator !== "undefined"
  && Boolean(navigator.mediaDevices?.getUserMedia)
  && typeof window.MediaRecorder !== "undefined"
);

export function useAudioRecorder() {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    startedAtRef.current = null;
    stopTracks();
  }, [stopTracks]);

  const start = useCallback(async () => {
    if (!isRecorderSupported()) return { ok: false, reason: "unsupported" };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start();
      return { ok: true };
    } catch {
      reset();
      return { ok: false, reason: "permission_or_start_failed" };
    }
  }, [reset]);

  const stop = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    const startedAt = startedAtRef.current;

    if (!recorder || recorder.state === "inactive") {
      return { ok: false, reason: "not_recording" };
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
        reset();
        resolve({ ok: true, blob, durationSeconds });
      };

      try {
        recorder.stop();
      } catch {
        reset();
        resolve({ ok: false, reason: "stop_failed" });
      }
    });
  }, [reset]);

  useEffect(() => () => {
    reset();
  }, [reset]);

  return {
    isSupported: isRecorderSupported(),
    start,
    stop,
    reset,
  };
}
