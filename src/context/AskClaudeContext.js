import React, { createContext, useContext, useState } from "react";

const AskClaudeContext = createContext(null);

export function AskClaudeProvider({ children }) {
  const [askMessages, setAskMessages] = useState([]);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [marketingDevices, setMarketingDevices] = useState([]);

  return (
    <AskClaudeContext.Provider value={{
      askMessages, setAskMessages,
      askInput, setAskInput,
      askLoading, setAskLoading,
      expandedSaleId, setExpandedSaleId,
      marketingDevices, setMarketingDevices,
    }}>
      {children}
    </AskClaudeContext.Provider>
  );
}

export function useAskClaudeContext() {
  const context = useContext(AskClaudeContext);
  if (!context) throw new Error(
    "useAskClaudeContext must be used within AskClaudeProvider"
  );
  return context;
}
