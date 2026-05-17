import React from "react";

export default function Badge({ color, bg, children, small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: small ? "1px 7px" : "3px 10px", borderRadius: 20, fontSize: small ? 10 : 11, fontWeight: 700, color, background: bg, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
