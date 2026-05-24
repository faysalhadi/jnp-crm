import React, { useRef, useState, useEffect } from "react";

export default function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);
  const THRESHOLD = 70;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      // Only trigger if scrolled to top
      if (el.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (startY.current === null) return;
      const deltaY = e.touches[0].clientY - startY.current;
      if (deltaY > 0 && el.scrollTop === 0) {
        e.preventDefault();
        setPulling(true);
        setPullDistance(Math.min(deltaY * 0.5, THRESHOLD + 20));
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance >= THRESHOLD) {
        setRefreshing(true);
        setPullDistance(0);
        setPulling(false);
        try { await onRefresh(); } catch (e) {}
        setRefreshing(false);
      } else {
        setPullDistance(0);
        setPulling(false);
      }
      startY.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullDistance, onRefresh]); // eslint-disable-line

  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: "auto", position: "relative" }}>
      {/* Pull indicator */}
      {(pulling || refreshing) && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: refreshing ? 50 : pullDistance,
          zIndex: 10,
          transition: refreshing ? "none" : "height 0.1s",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 20,
            background: "#EEF2FF",
            border: "1px solid #C7D2FE",
            fontSize: 12,
            color: "#6366F1",
            fontWeight: 600,
          }}>
            {refreshing ? (
              <>
                <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>↻</span>
                Refreshing...
              </>
            ) : (
              <>
                <span style={{ transform: `rotate(${Math.min(pullDistance / THRESHOLD * 180, 180)}deg)`, display: "inline-block", transition: "transform 0.1s" }}>↓</span>
                {pullDistance >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
              </>
            )}
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <div style={{ transform: pulling ? `translateY(${pullDistance}px)` : "none", transition: pulling ? "none" : "transform 0.3s" }}>
        {children}
      </div>
    </div>
  );
}
