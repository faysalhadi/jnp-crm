import React, { createContext, useContext, useState } from "react";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [outreachMode, setOutreachMode] = useState(false);
  const [outreachCustom, setOutreachCustom] = useState("");
  const [showSupplierReply, setShowSupplierReply] = useState(false);
  const [supplierReplyCtx, setSupplierReplyCtx] = useState("");
  const [supplierReplyGmail, setSupplierReplyGmail] = useState("");
  const [supplierReplyWA, setSupplierReplyWA] = useState("");
  const [supplierReplyLoading, setSupplierReplyLoading] = useState(false);
  const [copiedSupGmail, setCopiedSupGmail] = useState(false);
  const [copiedSupWA, setCopiedSupWA] = useState(false);

  return (
    <ChatContext.Provider value={{
      editingName, setEditingName,
      nameInput, setNameInput,
      editingNumber, setEditingNumber,
      numberInput, setNumberInput,
      outreachMode, setOutreachMode,
      outreachCustom, setOutreachCustom,
      showSupplierReply, setShowSupplierReply,
      supplierReplyCtx, setSupplierReplyCtx,
      supplierReplyGmail, setSupplierReplyGmail,
      supplierReplyWA, setSupplierReplyWA,
      supplierReplyLoading, setSupplierReplyLoading,
      copiedSupGmail, setCopiedSupGmail,
      copiedSupWA, setCopiedSupWA,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
}
