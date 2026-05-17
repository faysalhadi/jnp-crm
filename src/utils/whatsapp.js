import { supabase } from "../supabase";

export async function saveImportedMessages(dealId, rawChatText) {
  if (!dealId || !rawChatText) return 0;

  const messages = [];
  const lines = rawChatText.split('\n');
  const lineRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*([\d:]+\s*(?:AM|PM|am|pm))\]\s*~?([^:]+):\s*(.*)/;

  const skipPhrases = [
    'omitted', 'end-to-end encrypted', 'deleted',
    'Voice call', 'No answer', 'is a contact',
    'This business is now using', 'Messages and calls are'
  ];

  let currentMsg = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    const match = trimmed.match(lineRegex);

    if (match) {
      if (currentMsg && currentMsg.content.trim()) {
        messages.push(currentMsg);
      }

      const [, date, time, rawSender, content] = match;
      const sender = rawSender.replace(/^~/, '').trim();
      const cleanContent = content.replace(/<This message was edited>/g, '').trim();

      if (!cleanContent || skipPhrases.some(p => cleanContent.includes(p))) {
        currentMsg = null;
        continue;
      }

      const [day, month, year] = date.split('/');
      let ts;
      try {
        const isPM = time.toLowerCase().includes('pm');
        const isAM = time.toLowerCase().includes('am');
        const timePart = time.replace(/\s*(am|pm)/gi, '').trim();
        const [h, m, s] = timePart.split(':');
        let hours = parseInt(h);
        if (isPM && hours !== 12) hours += 12;
        if (isAM && hours === 12) hours = 0;
        ts = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(hours).padStart(2,'0')}:${m || '00'}:${s || '00'}`).toISOString();
      } catch {
        ts = new Date().toISOString();
      }

      const isOwner = sender === 'Laptop For Less' || sender === 'Laptop for Less';

      currentMsg = {
        deal_id: dealId,
        role: isOwner ? 'assistant' : 'customer',
        content: cleanContent,
        sent: isOwner ? cleanContent : null,
        is_voice: false,
        ts: ts
      };

    } else if (currentMsg) {
      if (!skipPhrases.some(p => trimmed.includes(p))) {
        currentMsg.content += '\n' + trimmed;
        if (currentMsg.sent) currentMsg.sent += '\n' + trimmed;
      }
    }
  }

  if (currentMsg && currentMsg.content.trim()) {
    messages.push(currentMsg);
  }

  const validMessages = messages.filter(m =>
    m.content &&
    m.content.length > 1 &&
    !skipPhrases.some(p => m.content.includes(p))
  );

  if (validMessages.length === 0) return 0;

  const chunkSize = 50;
  for (let i = 0; i < validMessages.length; i += chunkSize) {
    const chunk = validMessages.slice(i, i + chunkSize);
    await supabase.from('messages').insert(chunk);
  }

  console.log('Saved messages:', validMessages.length);
  return validMessages.length;
}
