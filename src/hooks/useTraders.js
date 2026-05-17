import { useState, useCallback } from "react";
import { supabase } from "../supabase";
import { cleanWhatsAppText } from "../utils/helpers";

export function useTraders(anthropicKey, activeDeal) {
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("trader_inventory").select("*")
      .eq("status", "active")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });
    setTraderListings(data || []);
    setTraderListingsLoading(false);
  }, []);

  async function extractTraderListings() {
    if (!traderChatText.trim() || !anthropicKey) return;
    setTraderImportLoading(true); setTraderImportResult(null);
    setTraderImportPreview(null);

    const cleanedTraderText = cleanWhatsAppText(traderChatText);
    const lineRegexForMerge = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*([\d:]+\s*(?:AM|PM|am|pm))\]/;
    const rawLines = cleanedTraderText.split('\n');
    const mergedLines = [];
    for (const line of rawLines) {
      if (lineRegexForMerge.test(line.trim())) {
        mergedLines.push(line);
      } else if (line.trim() && mergedLines.length > 0) {
        mergedLines[mergedLines.length - 1] += ' | ' + line.trim();
      }
    }

    const skipSenders = ['JNP', 'JNP Laptop Market'];
    const skipContent = ['end-to-end encrypted', 'added you', 'created this group', 'omitted', 'sticker', 'document omitted'];
    const sellSignals = ['wts', 'want to sale', 'want to sell', 'available', 'shipment', 'w.t.sal', 'for sale', 'selling'];
    const laptopBrands = ['dell', 'hp', 'lenovo', 'thinkpad', 'elitebook', 'latitude', 'surface', 'macbook', '840', '850', '5420', '7420', '640', '830', '845', '835'];

    const relevantLines = mergedLines.filter(line => {
      const lower = line.toLowerCase();
      if (skipContent.some(s => lower.includes(s))) return false;
      if (skipSenders.some(s => line.includes('] ' + s + ':') || line.includes('] ~' + s + ':'))) return false;
      const hasSellSignal = sellSignals.some(s => lower.includes(s));
      const hasLaptop = laptopBrands.some(b => lower.includes(b));
      return hasSellSignal || (hasLaptop && lower.includes('|'));
    });

    console.log('Total lines:', mergedLines.length, 'Relevant lines:', relevantLines.length);
    setTraderImportResult({ success: false, message: `⏳ Processing ${relevantLines.length} relevant messages...` });

    if (relevantLines.length === 0) {
      setTraderImportResult({ success: false, message: 'No laptop listings found. Make sure you pasted a group chat with laptop listings.' });
      setTraderImportLoading(false);
      return;
    }

    const chunkSize = 30;
    const allListings = [];
    const totalChunks = Math.ceil(relevantLines.length / chunkSize);

    const extractionPrompt = (chunkText) => `Extract laptop listings from this WhatsApp group chat. Return ONLY a JSON array, no markdown.

SELLING signals: WTS, Want to Sell, Want to Sale, Available, New Shipment, W.T.SAL
SKIP: RAM only, SSD only, HDD only, phones, LCD papers, screen papers, desktop towers, buying requests

BRAND DECODER:
- 640/650/840/850/830/835/845/1030/1040/EliteBook/firefly/ProBook = HP laptop
- 3301/3390/3480/5290/5400/5410/5420/5490/5511/7320/7390/7400/7410/7420/7430/7490/XPS/Precision/Latitude = Dell laptop
- T14/T14s/X13/ThinkPad/T480/T490/L380 = Lenovo laptop
- Surface = Microsoft laptop
- MacBook = Apple laptop

SPEC DECODER:
- "CI5.11TH.8.256" = Core i5 11th Gen, 8GB RAM, 256GB SSD
- "i5/11th Gen 8/256Gb" = Core i5 11th Gen, 8GB, 256GB
- "840g8 Ci711th 16gb 512" = HP EliteBook 840 G8, Core i7 11th, 16GB, 512GB
- "645g4 AMD 7 -1pc" = HP 645 G4, AMD Ryzen 7, qty 1

Return format:
[{"type":"selling","category":"laptop","brand":"HP","model":"EliteBook 840 G8","processor":"Core i7 11th Gen","ram":"8GB","storage":"256GB","condition":"Used","quantity":null,"price":null,"currency":"AED","charger":"unknown","notes":"","trader_name":"sender name","trader_number":"phone if visible in message"}]

If no laptop listings found return [].

Chat:
${chunkText}`;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = relevantLines.slice(i * chunkSize, (i + 1) * chunkSize);
        const chunkText = chunk.join('\n');
        setTraderImportResult({ success: false, message: `⏳ Processing chunk ${i + 1} of ${totalChunks}...` });

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
            system: "You extract laptop inventory listings from WhatsApp group chats for a UAE laptop reseller. Return only valid JSON arrays.",
            messages: [{ role: "user", content: extractionPrompt(chunkText) }],
          }),
        });

        const data = await res.json();
        if (data.error) { console.error('API error chunk', i, data.error); continue; }
        const raw = data?.content?.[0]?.text || "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const clean = jsonMatch ? jsonMatch[0] : raw.replace(/```json|```/g, "").trim();
        let chunkListings = [];
        try { chunkListings = JSON.parse(clean); } catch(e) { console.error('Parse error chunk', i, e.message, clean.slice(0, 100)); }
        if (Array.isArray(chunkListings)) allListings.push(...chunkListings);
        console.log(`Chunk ${i+1}/${totalChunks}: ${chunkListings.length} listings`);
      }

      const seen = new Set();
      const deduped = allListings.filter(l => {
        const key = `${l.trader_name}|${l.brand}|${l.model}|${l.ram}|${l.storage}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log('Total listings:', allListings.length, 'After dedup:', deduped.length);
      setTraderImportPreview(deduped);
      if (deduped.length === 0) {
        setTraderImportResult({ success: false, message: "No laptop listings found. This group chat may not have laptop listings, or try a different section." });
      } else {
        setTraderImportResult({ success: false, message: `✅ Found ${deduped.length} listings from ${new Set(deduped.map(l => l.trader_name)).size} traders. Confirm to save.` });
      }
    } catch(e) {
      console.error("Extraction error:", e);
      setTraderImportResult({ success: false, message: "Extraction failed. Check API key." });
    }
    setTraderImportLoading(false);
  }

  async function saveTraderListings() {
    if (!traderImportPreview?.length) return;
    setSavingTraderListings(true);
    const group = traderGroup || "Other";
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase.from("trader_inventory").delete()
      .eq("source_group", group)
      .lt("created_at", oneHourAgo);
    const rows = traderImportPreview.map(l => ({ ...l, source_group: group, status: "active" }));
    const { error } = await supabase.from("trader_inventory").insert(rows);
    if (!error) {
      await loadTraderListings();
      setTraderImportResult({ success: true, count: rows.length });
      setTimeout(() => { setShowImportTrader(false); setTraderImportPreview(null); setTraderChatText(""); setTraderGroup(""); setTraderImportResult(null); }, 1800);
    } else { setTraderImportResult({ success: false, message: error.message }); }
    setSavingTraderListings(false);
  }

  async function checkTradersForDeal() {
    setCheckTradersLoading(true);
    if (!traderListings.length) {
      const { data } = await supabase.from("trader_inventory").select("*").eq("type", "selling").eq("status", "active").order("created_at", { ascending: false });
      const results = (data || []).filter(t => {
        const brand = activeDeal?.brand || ""; const model = activeDeal?.model || "";
        return (!brand || !t.brand || t.brand.toLowerCase().includes(brand.toLowerCase()) || brand.toLowerCase().includes((t.brand || "").toLowerCase()));
      });
      setCheckTradersResults(results);
    } else {
      const brand = activeDeal?.brand || ""; const model = activeDeal?.model || "";
      setCheckTradersResults(traderListings.filter(t => t.type === "selling" && (!brand || !t.brand || t.brand.toLowerCase().includes(brand.toLowerCase()))));
    }
    setCheckTradersLoading(false); setShowCheckTraders(true);
  }

  return {
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
  };
}
