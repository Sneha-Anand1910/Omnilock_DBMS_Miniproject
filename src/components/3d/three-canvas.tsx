"use client";

import { useEffect, useRef, useState } from "react";

export function ThreeCanvas({
  children,
  className = "",
  aspectRatio = "16 / 9",
  minHeight = "360px",
  fallbackMessage = "Initializing 3D Spatial Engine…",
}: {
  children: (container: HTMLDivElement) => () => void;
  className?: string;
  aspectRatio?: string;
  minHeight?: string;
  fallbackMessage?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted] = useState(() => typeof window !== "undefined");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;
    try {
      cleanup = children(container);
    } catch (err) {
      console.error("ThreeCanvas WebGL initialization error:", err);
      queueMicrotask(() => setError("WebGL initialization unavailable on this device."));
    }

    return () => {
      if (cleanup) {
        try {
          cleanup();
        } catch (e) {
          console.error("ThreeCanvas cleanup error:", e);
        }
      }
    };
  }, [children]);

  return (
    <div
      className={`three-canvas-root ${className}`}
      style={{
        position: "relative",
        width: "100%",
        minHeight,
        aspectRatio,
        overflow: "hidden",
        borderRadius: "16px",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
        }}
      />
      {!mounted && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(6, 12, 24, 0.8)",
            color: "var(--cyan)",
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          <span>{fallbackMessage}</span>
        </div>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 18, 34, 0.95)",
            color: "#f87171",
            fontSize: "12px",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
