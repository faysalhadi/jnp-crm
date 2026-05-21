import React, { createContext, useContext, useState } from "react";

const BroadcastContext = createContext(null);

export function BroadcastProvider({ children }) {
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastItem, setBroadcastItem] = useState(null);
  const [broadcastClients, setBroadcastClients] = useState([]);
  const [broadcastSelected, setBroadcastSelected] = useState(new Set());
  const [broadcastMessages, setBroadcastMessages] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastStep, setBroadcastStep] = useState("clients");
  const [broadcastSent, setBroadcastSent] = useState(new Set());

  return (
    <BroadcastContext.Provider value={{
      showBroadcast, setShowBroadcast,
      broadcastItem, setBroadcastItem,
      broadcastClients, setBroadcastClients,
      broadcastSelected, setBroadcastSelected,
      broadcastMessages, setBroadcastMessages,
      broadcastLoading, setBroadcastLoading,
      broadcastStep, setBroadcastStep,
      broadcastSent, setBroadcastSent,
    }}>
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcastCtx() {
  const context = useContext(BroadcastContext);
  if (!context) throw new Error("useBroadcastCtx must be used within BroadcastProvider");
  return context;
}
