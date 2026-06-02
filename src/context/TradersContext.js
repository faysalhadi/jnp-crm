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

export function TradersProvider({ children, anthropicKey }) {
  const [traderListings, setTraderListings] = useState([]);
  const [traderListingsLoading, setTraderListingsLoading] = useState(false);
  const [traderSection, setTraderSection] = useState("inventory");
  const [traderSearch, setTraderSearch] = useState("");
  const [traderCategoryFilter, setTraderCategoryFilter] = useState("all");
  const [traderFilter, setTraderFilter] = useState("all");
  const [showImportTrader, setShowImportTrader] = useState(false);
  const [traderGroup, setTraderGroup] = useState("");
  const [traderChatText, setTraderChatText] = useState("");
  const [traderImportLoading, setTraderImportLoading] = useState(false);
  const [traderImportPreview, setTraderImportPreview] = useState(null);
  const [savingTraderListings, setSavingTraderListings] = useState(false);
  const [traderImportResult, setTraderImportResult] = useState(null);
  const [showTraderMatches, setShowTraderMatches] = useState(false);
  const [lastImportTimes, setLastImportTimes] = useState({});

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

    const { data: importTimes } = await supabase
      .from("trader_inventory")
      .select("source_group, created_at")
      .order("created_at", { ascending: false });

    if (importTimes) {
      const times = {};
      for (const row of importTimes) {
        if (!times[row.source_group]) {
          times[row.source_group] = row.created_at;
        }
      }
      setLastImportTimes(times);
    }

    setTraderListingsLoading(false);
  }, []);

  async function extractTraderListings() {
    if (!traderChatText.trim() || !anthropicKey) return;
    setTraderImportLoading(true);
    setTraderImportResult(null);
    setTraderImportPreview(null);

    const cleanedText = cleanText(traderChatText);

    // Get last import time for this group to skip old messages
    const lastImport = lastImportTimes[traderGroup || "Other"];
    const lastImportDate = lastImport ? new Date(lastImport) : null;

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
    const buySignals = ['wtb', 'want to buy', 'looking for', 'need',
      'chahiye', 'koi hai', 'kisi ke pass', 'required', 'requirement',
      'buying', 'anyone have', 'any one have', 'kya kisi', 'mil sakta'];
    const laptopBrands = ['dell', 'hp', 'lenovo', 'thinkpad',
      'elitebook', 'latitude', 'surface', 'macbook', '840', '850',
      '5420', '7420', '640', '830', '845', '835'];

    const relevantLines = mergedLines.filter(line => {
      // Skip messages older than last import for this group
      if (lastImportDate) {
        const dateMatch = line.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*([\d:]+\s*(?:AM|PM|am|pm))\]/);
        if (dateMatch) {
          const [, day, month, year, time] = dateMatch;
          const msgDate = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')} ${time}`);
          if (msgDate <= lastImportDate) return false;
        }
      }
      const lower = line.toLowerCase();
      if (skipContent.some(s => lower.includes(s))) return false;
      if (skipSenders.some(s =>
        line.includes('] ' + s + ':') ||
        line.includes('] ~' + s + ':'))) return false;
      const hasSellSignal = sellSignals.some(s => lower.includes(s));
      const hasBuySignal = buySignals.some(s => lower.includes(s));
      const hasLaptop = laptopBrands.some(b => lower.includes(b));
      return hasSellSignal || hasBuySignal || (hasLaptop && lower.includes('|'));
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
      `Extract laptop listings and buying requests from this WhatsApp group chat.
Return ONLY a JSON array, no markdown.

SELLING signals: WTS, Want to Sell, Available, New Shipment, For Sale
BUYING signals: WTB, Want to Buy, Looking for, Need, Chahiye, Koi hai, Required, Anyone have

Return format - use type "selling" or "buying":
[{"type":"selling","category":"laptop","brand":"HP",
"model":"EliteBook 840 G8","processor":"Core i7 11th Gen",
"ram":"8GB","storage":"256GB","condition":"Used",
"quantity":null,"price":null,"currency":"AED",
"charger":"unknown","notes":"","trader_name":"sender name",
"trader_number":""},
{"type":"buying","category":"laptop","brand":"MacBook",
"model":"Air M2","processor":"Apple M2",
"ram":"8GB","storage":"256GB","condition":"any",
"quantity":1,"price":null,"currency":"AED",
"charger":"unknown","notes":"urgent","trader_name":"sender name",
"trader_number":""}]

RULES:
- SELLING: trader has stock available for sale
- BUYING: trader is looking to purchase something
- SKIP: RAM only, SSD only, phones, desktops, greetings, off-topic
- Include both selling and buying in the same output array
- If no listings found return []

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

  async function extractBatchFiles(files) {
    const allListings = [];

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const { groupName, text } = files[fileIdx];
      setTraderImportResult({ success: false, message: `⏳ Processing group ${fileIdx + 1}/${files.length}: ${groupName}` });

      const cleanedText = cleanText(text);
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

      const skipContent = [
        'end-to-end encrypted', 'added you', 'created this group', 'omitted',
        'sticker', 'document omitted', 'changed their phone', 'changed this group',
        'disappearing messages', 'waiting for this message', 'you were added',
        'missed voice call', 'missed video call', 'added ~', 'added +',
        'left', 'removed', 'joined using', 'security code changed',
        'changed the subject', 'pinned a message', 'turned on', 'turned off',
        'no longer', 'new number', 'tap to message', 'image omitted',
        'video omitted', 'audio omitted', 'gif omitted', 'contact card omitted',
        'location omitted', 'this message was deleted', 'null',
      ];
      const skipSenders = ['JNP', 'JNP Laptop Market', 'JNP With'];
      const sellSignals = ['wts', 'want to sale', 'want to sell', 'available',
        'shipment', 'w.t.sal', 'for sale', 'selling', 'i want to sale',
        'i want to sell', 'w t s'];
      const buySignals = ['wtb', 'want to buy', 'looking for', 'need', 'chahiye',
        'koi hai', 'kisi ke pass', 'required', 'buying', 'anyone have',
        'any one have', 'mil sakta', 'chahie', 'lena hai', 'i need', 'w t b',
        'wanted', 'needed'];
      const laptopBrands = ['dell', 'hp', 'lenovo', 'thinkpad', 'elitebook',
        'latitude', 'surface', 'macbook', '840', '850', '5420', '7420', '640',
        '830', '845', '835', 'probook', 'zbook', 'pavilion', 'inspiron', 'vostro',
        'xps', 'precision', 'ideapad', 'thinkbook', 'yoga', 'omen', 'spectre',
        'envy', 'carbon', 'firefly', '7490', '7400', '7390', '5400', '5410',
        '5430', '5500', '5520', '830', '840', '1040', '1030'];
      const gamingBrands = ['asus', 'rog', 'alienware', 'msi', 'razer',
        'gigabyte', 'aorus', 'legion', 'g15', 'g16', 'g14', 'g7', 'g5'];
      const allBrands = [...laptopBrands, ...gamingBrands];
      const specSignals = ['i3', 'i5', 'i7', 'i9', 'gen', 'gb', 'ssd', 'ram',
        'core', 'ryzen', 'celeron', 'm1', 'm2', 'm3', '8gb', '16gb', '256', '512',
        '1tb', 'pcs', 'qty', 'units', 'available'];
      const priceSignals = ['aed', 'price', 'offer', 'rate'];

      const relevantLines = mergedLines.filter(line => {
        const lower = line.toLowerCase();
        if (skipContent.some(s => lower.includes(s))) return false;
        if (skipSenders.some(s =>
          line.includes('] ' + s + ':') || line.includes('] ~' + s + ':'))) return false;
        const hasBrand = allBrands.some(b => lower.includes(b));
        if (!hasBrand) return false;
        const hasSell = sellSignals.some(s => lower.includes(s));
        const hasBuy = buySignals.some(s => lower.includes(s));
        const hasSpec = specSignals.some(s => lower.includes(s));
        const hasPrice = priceSignals.some(s => lower.includes(s));
        return hasSell || hasBuy || hasSpec || hasPrice;
      });

      if (relevantLines.length === 0) continue;

      const chunkSize = 30;
      const totalChunks = Math.ceil(relevantLines.length / chunkSize);

      const extractionPrompt = (chunkText) =>
        `Extract laptop listings and buying requests from this WhatsApp group chat.
Return ONLY a JSON array, no markdown.

SELLING signals: WTS, Want to Sell, Available, New Shipment, For Sale
BUYING signals: WTB, Want to Buy, Looking for, Need, Chahiye, Koi hai, Required

Return format:
[{"type":"selling","category":"laptop","brand":"HP","model":"EliteBook 840 G8",
"processor":"Core i7 11th Gen","ram":"8GB","storage":"256GB","condition":"Used",
"quantity":null,"price":null,"currency":"AED","charger":"unknown","notes":"",
"trader_name":"sender name","trader_number":""},
{"type":"buying","category":"laptop","brand":"MacBook","model":"Air M2",
"processor":"Apple M2","ram":"8GB","storage":"256GB","condition":"any",
"quantity":1,"price":null,"currency":"AED","charger":"unknown","notes":"urgent",
"trader_name":"sender name","trader_number":""}]

RULES:
- SELLING: trader has stock for sale
- BUYING: trader wants to purchase
- Include gaming laptops (Asus ROG, Alienware, MSI, Legion gaming models)
- SKIP: RAM/SSD only, phones, desktops, monitors, batteries, keyboards, greetings
- If no listings found return []

Chat:
${chunkText}`;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = relevantLines.slice(i * chunkSize, (i + 1) * chunkSize);
        setTraderImportResult({
          success: false,
          message: `⏳ Group ${fileIdx + 1}/${files.length}: ${groupName}\nChunk ${i + 1}/${totalChunks}...`
        });

        try {
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
              messages: [{ role: "user", content: extractionPrompt(chunk.join('\n')) }],
            }),
          });
          const data = await res.json();
          if (data.error) continue;
          const raw = data?.content?.[0]?.text || "[]";
          const jsonMatch = raw.match(/\[[\s\S]*\]/);
          const clean = jsonMatch ? jsonMatch[0] : raw.replace(/```json|```/g, "").trim();
          let chunkListings = [];
          try { chunkListings = JSON.parse(clean); } catch {}
          if (Array.isArray(chunkListings)) {
            chunkListings.forEach(l => { l.source_group = groupName; });
            allListings.push(...chunkListings);
          }
        } catch { continue; }
      }
    }

    const seen = new Set();
    const deduped = allListings.filter(l => {
      const key = `${l.trader_name}|${l.brand}|${l.model}|${l.ram}|${l.storage}|${l.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setTraderImportPreview(deduped);
    if (deduped.length === 0) {
      setTraderImportResult({ success: false, message: "No laptop listings found in any of the files." });
    } else {
      const savedCount = allListings.length - deduped.length;
      setTraderImportResult({
        success: false,
        message: `✅ Found ${deduped.length} listings${savedCount > 0 ? ` (${savedCount} duplicates removed)` : ''}. Confirm to save.`
      });
    }
  }

  async function saveTraderListings() {
    if (!traderImportPreview?.length) return;
    setSavingTraderListings(true);
    const groups = [...new Set((traderImportPreview || []).map(l => l.source_group).filter(Boolean))];
    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();
    for (const group of groups) {
      await supabase.from("trader_inventory")
        .delete()
        .eq("source_group", group)
        .lt("created_at", oneHourAgo);
    }
    const rows = traderImportPreview.map(l => ({
      ...l, status: "active"
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

  const updateTraderProfile = async (traderId, updates) => {
    const { error } = await supabase.from("customers").update(updates).eq("id", traderId);
    if (error) console.error("updateTraderProfile error:", error);
    // Refresh customers list
    try { window.dispatchEvent(new Event("jnp_refresh_customers")); } catch {}
  };

  return (
    <TradersContext.Provider value={{
      traderListings, setTraderListings,
      traderListingsLoading,
      traderSection, setTraderSection,
      traderSearch, setTraderSearch,
      traderCategoryFilter, setTraderCategoryFilter,
      updateTraderProfile,
      traderFilter, setTraderFilter,
      showImportTrader, setShowImportTrader,
      traderGroup, setTraderGroup,
      traderChatText, setTraderChatText,
      traderImportLoading, setTraderImportLoading,
      traderImportPreview, setTraderImportPreview,
      savingTraderListings, setSavingTraderListings,
      traderImportResult, setTraderImportResult,
      showTraderMatches, setShowTraderMatches,
      lastImportTimes, setLastImportTimes,
      loadTraderListings,
      extractTraderListings,
      extractBatchFiles,
      saveTraderListings,
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
