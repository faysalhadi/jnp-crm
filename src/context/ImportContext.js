import React, { createContext, useContext, useState } from "react";

const ImportContext = createContext(null);

export function ImportProvider({ children }) {
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importingMultiple, setImportingMultiple] = useState(false);
  const [importMultipleProgress, setImportMultipleProgress] = useState({ current: 0, total: 0 });
  const [importMultipleResult, setImportMultipleResult] = useState(null);
  const [exporting, setExporting] = useState(false);

  return (
    <ImportContext.Provider value={{
      importText, setImportText,
      importing, setImporting,
      importResult, setImportResult,
      importingMultiple, setImportingMultiple,
      importMultipleProgress, setImportMultipleProgress,
      importMultipleResult, setImportMultipleResult,
      exporting, setExporting,
    }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImportContext() {
  const context = useContext(ImportContext);
  if (!context) throw new Error(
    "useImportContext must be used within ImportProvider"
  );
  return context;
}
