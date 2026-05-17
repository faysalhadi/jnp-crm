import React from "react";
import Badge from "./Badge";
import { STAGES } from "../../constants";

export default function StageBar({ stageId }) {
  const idx = STAGES.findIndex(s => s.id === stageId);
  const stage = STAGES[idx] || STAGES[0];
  const pct = Math.max(5, Math.round((idx / (STAGES.length - 2)) * 100));
  if (stageId === "lost") return <Badge color="#EF4444" bg="#FEF2F2" small>Lost</Badge>;
  if (stageId === "closed") return <Badge color="#10B981" bg="#ECFDF5" small>✓ Closed</Badge>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 4, background: "#E2E8F0" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: stage.color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color: stage.color, fontWeight: 700, whiteSpace: "nowrap" }}>{stage.label}</span>
    </div>
  );
}
