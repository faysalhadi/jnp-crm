import React, { createContext, useContext, useState, useEffect } from "react";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [activeTab, setActiveTab] = useState("home");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showSideDrawer, setShowSideDrawer] = useState(false);
  const [toast, setToast] = useState(null);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [activeMarketingTab, setActiveMarketingTab] = useState("today");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <UIContext.Provider value={{
      activeTab, setActiveTab,
      isMobile, setIsMobile,
      showSideDrawer, setShowSideDrawer,
      toast, setToast,
      showToast,
      installPromptEvent, setInstallPromptEvent,
      showInstallBanner, setShowInstallBanner,
      activeMarketingTab, setActiveMarketingTab,
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error(
    "useUI must be used within UIProvider"
  );
  return context;
}
