import React, { createContext, useContext, useState } from "react";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [incomingText, setIncomingText] = useState("");
  const [replyMode, setReplyMode] = useState(null);
  const [replyingToId, setReplyingToId] = useState(null);
  const [directReplyText, setDirectReplyText] = useState("");
  const [generatedReply, setGeneratedReply] = useState("");
  const [generatedReplyLoading, setGeneratedReplyLoading] = useState(false);
  const [editingGenerated, setEditingGenerated] = useState(false);
  const [copied, setCopied] = useState(null);
  const [editSent, setEditSent] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [outreachMode, setOutreachMode] = useState(false);
  const [outreachReason, setOutreachReason] = useState("");
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
      messages, setMessages,
      msgLoading, setMsgLoading,
      msgInput, setMsgInput,
      incomingText, setIncomingText,
      replyMode, setReplyMode,
      replyingToId, setReplyingToId,
      directReplyText, setDirectReplyText,
      generatedReply, setGeneratedReply,
      generatedReplyLoading, setGeneratedReplyLoading,
      editingGenerated, setEditingGenerated,
      copied, setCopied,
      editSent, setEditSent,
      editingName, setEditingName,
      nameInput, setNameInput,
      editingNumber, setEditingNumber,
      numberInput, setNumberInput,
      outreachMode, setOutreachMode,
      outreachReason, setOutreachReason,
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
  if (!context) throw new Error(
    "useChat must be used within ChatProvider"
  );
  return context;
}
