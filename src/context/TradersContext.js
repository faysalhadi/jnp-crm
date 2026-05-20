import React, { createContext, useContext, useState, useCallback } from "react";
import { supabase } from "../supabase";

const TradersContext = createContext(null);

function cleanText(text) {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp === 0x202F || cp === 0x00A0) { out += ' '; continue; }
    if (cp === 0x200E || cp === 0x200F || cp === 0x000D) continue;
    out += text[i];
  }
  return out;
}

export function TradersProvider({ children, anthropicKey, activeDeal }) {
  const [traderListings, setTraderListings] = useState([]);
  const [traderListingsLoading, setTraderListingsLoading] = useState(false);
  const [traderSection, setTraderSection] = useState("inventory");
  const [traderSearch, setTraderSearch] = useState("");
  const [traderFilter, setTraderFilter] = useState("all");
  const [showImportTrader, setShowImportTrader] = useState(false);
  const [traderGroup, setTraderGroup] = useState("");
  const [traderChatText, setTraderChatText] = useState("");
  const [traderImportLoading, setTraderImportLoading] = useState(false);
  const [traderImportPreview, setTraderImportPreview] = useState(null);
  const [savingTraderListings, setSavingTraderListings] = useState(false);
  const [traderImportResult, setTraderImportResult] = useState(null);
  const [showTraderMatches, setShowTraderMatches] = useState(false);
  const [showCheckTraders, setShowCheckTraders] = useState(false);
  const [checkTradersResults, setCheckTradersResults] = useState([]);
  const [checkTradersLoading, setCheckTradersLoading] = useState(false);

  const loadTraderListings = useCallback(async () => {
    setTraderListingsLoading(true);
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data } = await supabase
      .from("trader_inventory")
      .select("*")
      .eq("status", "active")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });
    setTraderListings(data || []);
    setTraderListingsLoading(false);
  }, []);

  async function extractTraderListings() {
    if (!traderChatText.trim() || !anthropicKey) return;
    setTraderImportLoading(true);
    setTraderImportResult(null);
    setTraderImportPreview(null);

    const cleanedText = cleanText(traderChatText);
    const lineRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*([\d:]+\s*(?:AM|PM|am|pm))\]/;
    const rawLines = cleanedText.split('\n');
    const mergedLines = [];
    for (const line of rawLines) {
      if (lineRegex.test(line.trim())) {
        mergedLines.push(line);
      } else if (line.trim() && mergedLines.length > 0) {
        mergedLines[mergedLines.length - 1] += ' | ' + line.trim();
      }
    }

    const skipSenders = ['JNP', 'JNP Laptop Market'];
    const skipContent = ['end-to-end encrypted', 'added you',
      'created this group', 'omitted', 'sticker', 'document omitted'];
    const sellSignals = ['wts', 'want to sale', 'want to sell',
      'available', 'shipment', 'w.t.sal', 'for sale', 'selling'];
    const laptopBrands = ['dell', 'hp', 'lenovo', 'thinkpad',
      'elitebook', 'latitude', 'surface', 'macbook', '840', '850',
      '5420', '7420', '640', '830', '845', '835'];

    const relevantLines = mergedLines.filter(line => {
      const lower = line.toLowerCase();
      if (skipContent.some(s => lower.includes(s))) return false;
      if (skipSenders.some(s =>
        line.includes('] ' + s + ':') ||
        line.includes('] ~' + s + ':'))) return false;
      const hasSellSignal = sellSignals.some(s => lower.includes(s));
      const hasLaptop = laptopBrands.some(b => lower.includes(b));
      return hasSellSignal || (hasLaptop && lower.includes('|'));
    });

    if (relevantLines.length === 0) {
      setTraderImportResult({
        success: false,
        message: 'No laptop listings found.'
      });
      setTraderImportLoading(false);
      return;
    }

    const chunkSize = 30;
    const allListings = [];
    const totalChunks = Math.ceil(relevantLines.length / chunkSize);

    const extractionPrompt = (chunkText) =>
      `Extract laptop listings from this WhatsApp group chat.
Return ONLY a JSON array, no markdown.

SELLING signals: WTS, Want to Sell, Available, New Shipment
SKIP: RAM only, SSD only, phones, desktops, buying requests

Return format:
[{"type":"selling","category":"laptop","brand":"HP",
"model":"EliteBook 840 G8","processor":"Core i7 11th Gen",
"ram":"8GB","storage":"256GB","condition":"Used",
"quantity":null,"price":null,"currency":"AED",
"charger":"unknown","notes":"","trader_name":"sender name",
"trader_number":""}]

If no listings found return [].

Chat:
${chunkText}`;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = relevantLines.slice(
          i * chunkSize, (i + 1) * chunkSize
        );
        setTraderImportResult({
          success: false,
          message: `⏳ Processing chunk ${i + 1} of ${totalChunks}...`
        });

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8000,
            system: "You extract laptop inventory listings from WhatsApp group chats. Return only valid JSON arrays.",
            messages: [{
              role: "user",
              content: extractionPrompt(chunk.join('\n'))
            }],
          }),
        });

        const data = await res.json();
        if (data.error) continue;
        const raw = data?.content?.[0]?.text || "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const clean = jsonMatch
          ? jsonMatch[0]
          : raw.replace(/```json|```/g, "").trim();
        let chunkListings = [];
        try { chunkListings = JSON.parse(clean); } catch {}
        if (Array.isArray(chunkListings)) {
          allListings.push(...chunkListings);
        }
      }

      const seen = new Set();
      const deduped = allListings.filter(l => {
        const key = `${l.trader_name}|${l.brand}|${l.model}|${l.ram}|${l.storage}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setTraderImportPreview(deduped);
      if (deduped.length === 0) {
        setTraderImportResult({
          success: false,
          message: "No laptop listings found."
        });
      } else {
        setTraderImportResult({
          success: false,
          message: `✅ Found ${deduped.length} listings. Confirm to save.`
        });
      }
    } catch {
      setTraderImportResult({
        success: false,
        message: "Extraction failed. Check API key."
      });
    }
    setTraderImportLoading(false);
  }

  async function saveTraderListings() {
    if (!traderImportPreview?.length) return;
    setSavingTraderListings(true);
    const group = traderGroup || "Other";
    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();
    await supabase.from("trader_inventory")
      .delete()
      .eq("source_group", group)
      .lt("created_at", oneHourAgo);
    const rows = traderImportPreview.map(l => ({
      ...l, source_group: group, status: "active"
    }));
    const { error } = await supabase
      .from("trader_inventory").insert(rows);
    if (!error) {
      await loadTraderListings();
      setTraderImportResult({
        success: true,
        count: rows.length
      });
      setTimeout(() => {
        setShowImportTrader(false);
        setTraderImportPreview(null);
        setTraderChatText("");
        setTraderGroup("");
        setTraderImportResult(null);
      }, 1800);
    } else {
      setTraderImportResult({
        success: false,
        message: error.message
      });
    }
    setSavingTraderListings(false);
  }

  async function checkTradersForDeal() {
    setCheckTradersLoading(true);
    if (!traderListings.length) {
      const { data } = await supabase
        .from("trader_inventory")
        .select("*")
        .eq("type", "selling")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      const brand = activeDeal?.brand || "";
      const results = (data || []).filter(t =>
        !brand || !t.brand ||
        t.brand.toLowerCase().includes(brand.toLowerCase()) ||
        brand.toLowerCase().includes((t.brand || "").toLowerCase())
      );
      setCheckTradersResults(results);
    } else {
      const brand = activeDeal?.brand || "";
      setCheckTradersResults(
        traderListings.filter(t =>
          t.type === "selling" && (
            !brand || !t.brand ||
            t.brand.toLowerCase().includes(brand.toLowerCase())
          )
        )
      );
    }
    setCheckTradersLoading(false);
    setShowCheckTraders(true);
  }

  return (
    <TradersContext.Provider value={{
      traderListings, setTraderListings,
      traderListingsLoading,
      traderSection, setTraderSection,
      traderSearch, setTraderSearch,
      traderFilter, setTraderFilter,
      showImportTrader, setShowImportTrader,
      traderGroup, setTraderGroup,
      traderChatText, setTraderChatText,
      traderImportLoading, setTraderImportLoading,
      traderImportPreview, setTraderImportPreview,
      savingTraderListings, setSavingTraderListings,
      traderImportResult, setTraderImportResult,
      showTraderMatches, setShowTraderMatches,
      showCheckTraders, setShowCheckTraders,
      checkTradersResults, setCheckTradersResults,
      checkTradersLoading, setCheckTradersLoading,
      loadTraderListings,
      extractTraderListings,
      saveTraderListings,
      checkTradersForDeal,
    }}>
      {children}
    </TradersContext.Provider>
  );
}

export function useTraders() {
  const context = useContext(TradersContext);
  if (!context) throw new Error(
    "useTraders must be used within TradersProvider"
  );
  return context;
}
