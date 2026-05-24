import React, { useRef, useState, useEffect } from "react";

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);
  const THRESHOLD = 70;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      if (el.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    };

    const handleTouchMove = (e) => {
      if (startY.current === null) return;
      const deltaY = e.touches[0].clientY - startY.current;
      if (deltaY > 0 && el.scrollTop === 0) {
        setPullDistance(Math.min(deltaY * 0.5, THRESHOLD + 20));
      } else {
        startY.current = null;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (startY.current === null) return;
      if (pullDistance >= THRESHOLD) {
        setRefreshing(true);
        setPullDistance(0);
        try { await onRefresh(); } catch (e) {}
        setRefreshing(false);
      } else {
        setPullDistance(0);
      }
      startY.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullDistance, onRefresh]);

  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
      {(pullDistance > 0 || refreshing) && (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: "#EEF2FF", border: "1px solid #C7D2FE", fontSize: 12, color: "#6366F1", fontWeight: 600 }}>
            {refreshing ? "Refreshing..." : pullDistance >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
