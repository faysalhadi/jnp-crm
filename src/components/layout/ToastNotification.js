import React from "react";
import { useUI } from "../../context/UIContext";

export default function ToastNotification() {
  const { toast, isMobile } = useUI();
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: isMobile ? 90 : 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 999,
      padding: "12px 24px",
      borderRadius: 12,
      background: toast.type === "success" ? "#10B981"
        : toast.type === "error" ? "#EF4444"
        : "#6366F1",
      color: "#fff",
      fontSize: 13,
      fontWeight: 700,
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      whiteSpace: "nowrap",
      animation: "slideUp 0.3s ease",
    }}>
      {toast.type === "success" ? "✅ " : toast.type === "error" ? "❌ " : "ℹ️ "}
      {toast.message}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
