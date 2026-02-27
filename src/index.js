// ============================================================
// Pescheria Bot v2 — AI-Driven Architecture
// ============================================================
// Complete restructuring: Claude AI as central orchestrator
// Functions are simple executors with no business logic
// ============================================================

// ── Master Data (extracted from historical data) ────────────
const CATEGORIES = ['Allevamento', 'Mare', 'Decongelato', 'Congelato'];
const SUPPLIERS = ['Brezza', 'Franco', 'Meridional', 'Ottavio', 'Pinuccio', 'Rimanenza'];
const FISH_SHOPS = ['Grassano', 'Grottole'];
const RESTAURANTS = ['Brigante'];
const WEATHER = ['Sole', 'Nuvoloso', 'Pioggia', 'Neve'];

// Fixed waste per kg (only these two have non-zero values)
const WASTE_PER_KG = {
  'calamari': 0.12,
  'salmone': 0.138,
};

// Fish → Category mapping (derived from historical data)
const FISH_CATEGORY = {
  'alici': 'Mare', 'sarde': 'Mare', 'sgombro': 'Mare', 'triglie': 'Mare',
  'paranza': 'Mare', 'gallinella': 'Mare', 'palombo': 'Mare', 'cefalo': 'Mare',
  'persico': 'Mare', 'ricciola': 'Mare', 'tonno': 'Mare', 'pesce spada': 'Mare',
  'serra': 'Mare', 'cicala': 'Mare',
  'orata': 'Allevamento', 'orate': 'Allevamento', 'spigola': 'Allevamento',
  'spigole': 'Allevamento', 'salmone': 'Allevamento', 'lupini': 'Allevamento',
  'cozze': 'Allevamento', 'datterino': 'Allevamento', 'vongole': 'Allevamento',
  'trote': 'Allevamento', 'trota': 'Allevamento',
  'calamari': 'Decongelato', 'seppie': 'Decongelato', 'seppia': 'Decongelato',
  'polpo': 'Decongelato', 'gamberi': 'Decongelato', 'scampi': 'Decongelato',
  'code di rospo': 'Decongelato', 'raya': 'Decongelato', 'sogliola': 'Decongelato',
  'pancasio': 'Decongelato', 'merluzzo': 'Decongelato',
  'baccala': 'Congelato', 'baccalà': 'Congelato', 'ricomposto': 'Congelato',
  'l1 argentino': 'Congelato', 'gamberi salipci': 'Congelato',
};

// ── Configuration ────────────────────────────────────────────
const SESSION_TTL = 7200;
const MAX_HISTORY = 20;
const AUTHORIZED_USERS = [449768582, 5041769858, 752410978];

// ── Entry Point ──────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('OK');

    let body;
    try { body = await request.json(); } catch { return new Response('OK'); }

    const msg = body.message || body.edited_message;
    if (!msg?.text) return new Response('OK');

    const chatId = msg.chat.id.toString();
    const userId = msg.from?.id;
    const text = msg.text.trim();

    // Authorization check
    if (!AUTHORIZED_USERS.includes(userId)) {
      await sendTelegram(chatId, 
        `⛔ Accesso non autorizzato.\n\nQuesto bot è riservato agli utenti autorizzati.\n\nIl tuo ID: ${userId}`, env);
      return new Response('OK');
    }

    // Concurrency guard: drop message if bot is already processing for this chat
    const lockKey = `__lock__${chatId}`;
    const lock = await env.SESSIONS.get(lockKey);
    if (lock) {
      await sendTelegram(chatId, `⏳ Sto ancora elaborando il messaggio precedente. Attendi...`, env);
      return new Response('OK');
    }
    await env.SESSIONS.put(lockKey, '1', { expirationTtl: 60 });

    await loadCustomLists(env);

    ctx.waitUntil(
      (text.startsWith('/')
        ? handleCommand(chatId, text, env)
        : handleMessage(chatId, text, env)
      ).finally(() => env.SESSIONS.delete(lockKey))
    );

    return new Response('OK');
  }
};

// ── Commands ─────────────────────────────────────────────────
async function handleCommand(chatId, text, env) {
  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase().split('@')[0];

  switch (cmd) {
    case '/start':
    case '/help':
      await sendTelegram(chatId, `👋 *Bot Pescheria Abascia v2*

Parla naturalmente con il bot, capisce tutto:
_"15kg spigole da Pinuccio a 8.80€, vendo a 13€ a Grassano, sole"_
_"sono rimaste 5kg di orate"_
_"venduto 3kg cozze a Brigante"_
_"richieste in eccesso: 2kg gamberi"_

📋 *Comandi rapidi:*
/report — riepilogo giornata
/lista — mostra valori disponibili
/aggiungi — aggiungi fornitore/pescheria/meteo
/reset — azzera sessione`, env);
      break;

    case '/lista':
      const pesciCustom = Object.keys(FISH_CATEGORY).slice(0, 10).join(', ');
      await sendTelegram(chatId,
        `📋 *Valori disponibili:*\n\n` +
        `*Fornitori:* ${SUPPLIERS.filter(f => f !== 'Rimanenza').join(', ')}\n\n` +
        `*Pescherie:* ${FISH_SHOPS.join(', ')}\n\n` +
        `*Ristoranti:* ${RESTAURANTS.join(', ')}\n\n` +
        `*Categorie:* ${CATEGORIES.join(', ')}\n\n` +
        `*Meteo:* ${WEATHER.join(', ')}\n\n` +
        `*Pesci (primi 10):* ${pesciCustom}...\n\n` +
        `Per aggiungere:\n` +
        `/aggiungi fornitore Mario\n` +
        `/aggiungi pesce Branzino:Allevamento`, env);
      break;

    case '/aggiungi': {
      const args = parts.slice(1);
      const tipo = args[0]?.toLowerCase();
      const valore = args.slice(1).join(' ').trim();
      if (!tipo || !valore) {
        await sendTelegram(chatId, `Uso: /aggiungi fornitore|pescheria|meteo|pesce [valore]\nEs: /aggiungi fornitore Mario\nEs: /aggiungi pesce Branzino:Allevamento`, env);
        break;
      }
      
      // Handle fish addition (format: "pesce Nome:Categoria")
      if (tipo === 'pesce') {
        const [nomePesce, categoria] = valore.split(':').map(s => s.trim());
        if (!nomePesce || !categoria) {
          await sendTelegram(chatId, `Formato pesce: /aggiungi pesce Nome:Categoria\nEs: /aggiungi pesce Branzino:Allevamento\nCategorie: ${CATEGORIES.join(', ')}`, env);
          break;
        }
        if (!CATEGORIES.includes(categoria)) {
          await sendTelegram(chatId, `Categoria non valida. Usa: ${CATEGORIES.join(', ')}`, env);
          break;
        }
        const nomePesceNorm = normalizeFishName(nomePesce);
        FISH_CATEGORY[nomePesceNorm.toLowerCase()] = categoria;
        await env.SESSIONS.put('__custom_pesce__', JSON.stringify(FISH_CATEGORY), { expirationTtl: 365 * 86400 });
        await sendTelegram(chatId, `✅ *${nomePesceNorm}* aggiunto come *${categoria}*`, env);
        break;
      }
      
      const listaMap = { fornitore: SUPPLIERS, pescheria: FISH_SHOPS, meteo: WEATHER };
      const lista = listaMap[tipo];
      if (!lista) {
        await sendTelegram(chatId, `Tipo non valido. Usa: fornitore, pescheria, meteo, pesce`, env);
        break;
      }
      const esistente = findClosestMatch(valore, lista);
      if (esistente) {
        await sendTelegram(chatId, `⚠️ Esiste già un valore simile: *${esistente}*\nUsalo per evitare duplicati.`, env);
        break;
      }
      const valoreNorm = valore.charAt(0).toUpperCase() + valore.slice(1).toLowerCase();
      lista.push(valoreNorm);
      await env.SESSIONS.put(`__custom_${tipo}__`, JSON.stringify(lista), { expirationTtl: 365 * 86400 });
      await sendTelegram(chatId, `✅ *${valoreNorm}* aggiunto ai ${tipo}i.`, env);
      break;
    }

    case '/reset':
      await env.SESSIONS.delete(chatId);
      await sendTelegram(chatId, `🔄 Sessione resettata. I dati già su Sheet sono intatti.`, env);
      break;

    case '/report': {
      await sendTelegram(chatId, `📊 Recupero dati di oggi...`, env);
      try {
        const report = await buildReport(env);
        await sendTelegram(chatId, report, env);
      } catch (e) {
        await sendTelegram(chatId, `⚠️ Errore report: ${e.message}`, env);
      }
      break;
    }

    default:
      await sendTelegram(chatId, `Comando non riconosciuto. Scrivi /help.`, env);
  }
}

// ══════════════════════════════════════════════════════════════
// CORE: Message Handler - Claude AI as Central Orchestrator
// ══════════════════════════════════════════════════════════════

async function handleMessage(chatId, text, env) {
  const session = await loadSession(chatId, env);
  const todayStr = new Date().toLocaleDateString('it-IT');

  // Daily session reset: clear history if day changed (keeps sheet context fresh)
  if (session.sessionDate && session.sessionDate !== todayStr) {
    session.messages = [];
    session.lastProcessedText = null;
  }
  session.sessionDate = todayStr;

  // Add user message to conversation history
  session.messages = session.messages || [];
  session.messages.push({ role: 'user', content: text });

  let aiResponse;
  try {
    aiResponse = await callClaudeOrchestrator(session.messages, chatId, env);
  } catch (e) {
    session.messages.pop(); // Remove failed user message from history
    await saveSession(chatId, session, env);
    await sendTelegram(chatId, `⚠️ Errore AI: ${e.message}\n\nRiprova.`, env);
    return;
  }

  // Add AI response to history and save
  session.messages.push({ role: 'assistant', content: aiResponse.rawText });
  session.lastProcessedText = text;
  await saveSession(chatId, session, env);

  // Execute action based on AI decision
  if (aiResponse.actions) {
    // Multi-action: execute all silently, send one summary at the end
    const results = [];
    for (const act of aiResponse.actions) {
      try {
        await executeAction(chatId, act, env, true); // silent mode
        if (act.message) results.push(act.message);
      } catch (e) {
        results.push(`⚠️ Errore: ${e.message}`);
      }
    }
    const summary = aiResponse.message || results.join('\n');
    await sendTelegram(chatId, summary, env);
  } else if (aiResponse.action) {
    await executeAction(chatId, aiResponse, env, false);
  } else {
    await sendTelegram(chatId, aiResponse.text, env);
  }
}

// ══════════════════════════════════════════════════════════════
// CLAUDE ORCHESTRATOR - The Brain of the System
// ══════════════════════════════════════════════════════════════

async function callClaudeOrchestrator(messages, chatId, env) {
  const oggi = new Date();
  const oggiStr = oggi.toLocaleDateString('it-IT');
  const oggiLong = oggi.toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Build FULL sheet snapshot for AI context (raw data, not just summary)
  let contextSection = '';
  
  // Get ALL today's rows (purchases + restaurants + remainders)
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetRange = encodeURIComponent(`'${sheetName}'!A:N`);
  
  let allSheetRows = [];
  try {
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${sheetRange}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (sheetRes.ok) {
      const sheetJson = await sheetRes.json();
      allSheetRows = sheetJson.values || [];
    }
  } catch (e) { /* continue without sheet data */ }
  
  // Filter today's rows
  const todayRows = allSheetRows.filter((r, i) => i > 0 && r[0] === oggiStr);
  const hasPurchasesToday = todayRows.some(r => r[3] !== 'Rimanenza' && !RESTAURANTS.includes(r[1]));
  
  // Build compact table of today's data
  if (todayRows.length > 0) {
    const todayTable = todayRows.map(r => 
      `${r[1]}|${r[2]}|${r[3]}|${r[5]}kg|€${r[6]}→€${r[7]}|rim:${r[8]||'-'}|meteo:${r[11]||'-'}`
    ).join('\n');
    
    // Extract meteo and pescheria from first non-remainder pescheria row
    const firstPurchase = todayRows.find(r => r[3] !== 'Rimanenza' && !RESTAURANTS.includes(r[1]));
    const todayMeteo = firstPurchase?.[11] || '';
    const todayPescheria = firstPurchase?.[1] || '';
    
    // Fish availability summary
    const fishAvail = {};
    todayRows.forEach(r => {
      const fish = r[2];
      const kg = parseNum(r[5]);
      if (!fishAvail[fish]) fishAvail[fish] = { pescherie: 0, ristoranti: 0 };
      if (FISH_SHOPS.includes(r[1])) fishAvail[fish].pescherie += kg;
      if (RESTAURANTS.includes(r[1])) fishAvail[fish].ristoranti += kg;
    });
    const availSummary = Object.entries(fishAvail).map(([f, d]) => 
      `${f}:${d.pescherie}kg pesc,${d.ristoranti}kg rist→disp:${d.pescherie - d.ristoranti}kg`
    ).join(' | ');
    
    contextSection = `\n\nSHEET TODAY (${oggiStr}):\n${todayTable}\nAVAILABLE: ${availSummary}\nMeteo=${todayMeteo||'NOT SET'} Pescheria=${todayPescheria||'NOT SET'}`;
    if (hasPurchasesToday) {
      contextSection += `\nREUSE meteo="${todayMeteo}" pescheria="${todayPescheria}" for new purchases.`;
    }
  } else {
    contextSection = `\n\nSHEET TODAY: empty. MUST ask meteo+pescheria for first purchase.`;
  }
  
  // Future remainders (raw rows)
  const futureRows = allSheetRows.filter((r, i) => 
    i > 0 && r[3] === 'Rimanenza' && r[0] > oggiStr
  );
  if (futureRows.length > 0) {
    const futureTable = futureRows.map(r => 
      `${r[0]}|${r[1]}|${r[2]}|${r[5]}kg`
    ).join('\n');
    contextSection += `\n\nFUTURE REMAINDERS:\n${futureTable}\nIf selling to restaurant, function will subtract from these first.`;
  }
  
  // Yesterday's remainders (moved to today)
  const ieri = new Date(Date.now() - 86400000).toLocaleDateString('it-IT');
  const yesterdayRemRows = allSheetRows.filter((r, i) => 
    i > 0 && r[0] === oggiStr && r[3] === 'Rimanenza'
  );
  if (yesterdayRemRows.length > 0) {
    const yestSummary = yesterdayRemRows.map(r => `${r[2]}:${r[5]}kg`).join(', ');
    contextSection += `\n\nREMAINDERS IN TODAY: ${yestSummary}`;
  }

  // Sheet data for next 20 days (today + future context window)
  const maxFutureMs = oggi.getTime() + 20 * 86400000;
  const nearFutureRows = allSheetRows.filter((r, i) => {
    if (i === 0 || r[0] === oggiStr) return false;
    const parts = (r[0] || '').split('/');
    if (parts.length !== 3) return false;
    const rowDate = new Date(parts[2], parts[1] - 1, parts[0]);
    return rowDate >= oggi && rowDate.getTime() <= maxFutureMs;
  });
  if (nearFutureRows.length > 0) {
    const byDate = {};
    nearFutureRows.forEach(r => {
      const d = r[0] || '?';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(`${r[1]}|${r[2]}|${r[3]}|${r[5]}kg|€${r[6]}→€${r[7]}|rim:${r[8]||'-'}`);
    });
    const futureLines = Object.entries(byDate).map(([d, rows]) => 
      `[${d}] ${rows.join(' ; ')}`
    ).join('\n');
    contextSection += `\n\nSHEET NEXT 20 DAYS:\n${futureLines}`;
  }

  const staticPrompt = `Pescheria Abascia assistant. Today: ${oggiLong}. Speak Italian.
STYLE: Be CONCISE. Short confirmations. No emojis in JSON messages. Max 1-2 sentences for questions/confirmations.

SHEET COLS: A=Data B=Pescheria C=Pesce D=Fornitore E=Categoria F=Kg G=€Acq/kg H=€Vend/kg I=Rimanenza(kg spostati) J=Scartato K=Eccesso L=Meteo M=Note N=Scarto/kg. O-AB=formulas(don't touch).
VALID: Pescherie=[${FISH_SHOPS.join(',')}] Ristoranti=[${RESTAURANTS.join(',')}] Fornitori=[${SUPPLIERS.filter(f => f !== 'Rimanenza').join(',')}] Categorie=[${CATEGORIES.join(',')}] Meteo=[${WEATHER.join(',')}]

CONTEXT: The SHEET data below is the REAL current state of the file. Base ALL decisions on this data. If something looks wrong, check the data first.

ACTIONS:

1.ACQUISTO ("comprato","da [fornitore]","preso")
  Required: specie,kg,prezzo_acquisto,prezzo_vendita,pescheria,fornitore,meteo
  Optional: note (ONLY if user explicitly says "nota:", "annota", "scrivi nelle note" — NEVER auto-generate notes from fish descriptions like "salato","grande" etc.)
  - If purchases exist today in context → REUSE meteo+pescheria, don't ask
  - If NO purchases today → MUST ask meteo AND pescheria
  - Deduce categoria from fish type. Normalize: "cozze"→"Cozze". Date=today(${oggiStr})
  - Ask ONLY for missing prices, deduce everything else

2.RIMANENZE ("rimaste","avanzato","rimanenze")
  STEP 1 PRE-CHECK: is fish in today's pescherie purchases in context? No→reject immediately: "⚠️ [Pesce] non trovato negli acquisti di oggi."
  STEP 2 VALIDATE: requested kg ≤ available (purchased - sold to restaurants, shown in context as "disponibile per rimanenze")
  STEP 3 ASK: destination date (default=tomorrow, Monday if Friday) AND destination pescheria
  PESCHERIA LOGIC: Pescherie are usually ALTERNATED day by day. If today is Grassano, suggest Grottole for tomorrow (and vice versa). Ask user to confirm: "Di solito si alterna: oggi ${'{'}pescheria{'}'}, domani suggerisco ${'{'}altra{'}'}. Va bene?"
  Remainders ONLY from pescherie, NEVER from restaurants.
  The function handles: OLD row col I = kg moved, NEW row col I = 0, meteo auto-copied.

3.VENDITA_RISTORANTI ("venduto a [rist]","dato al ristorante")
  ${RESTAURANTS.length === 1 ? `Only 1 restaurant (${RESTAURANTS[0]}), use automatically, don't ask` : 'Multiple restaurants: ask which one'}
  CRITICAL: Check future remainders in context FIRST. If fish has future remainders → the function will SUBTRACT from those (reducing col F of remainder row AND col I of original purchase row). If no future remainders → subtract from today's purchases.
  Validate: qty ≤ available. Ask if sale price changes (default=same).
  The function handles: meteo auto-copied from today, row creation, subtraction.

4.ECCESSO ("richieste in eccesso","non soddisfatte")
  Update col K of today's row. If fish has remainders from yesterday in context → warn: "Incoerente! Pesce avanzato ieri ma insufficiente oggi?"

5.AGGIORNAMENTO ("modifica","cambia","no è [diverso]")
  MODE A - Conversational correction: user corrects what you just discussed ("no, piove non sole")
    → Just acknowledge: "✅ Corretto! Userò Pioggia." NO JSON action needed.
  MODE B - Explicit update: user wants to change existing entry ("modifica cozze, prezzo 15€")
    → Need PRIMARY KEY (data,pescheria,pesce) + campo + nuovo_valore → return JSON action
  For remainder corrections: add tipo:"rimanenza", pesce:"Nome", data_originale:"${oggiStr}"
  UNCLEAR INPUT ("scusami 5 kg" without context): ALWAYS ask clarification first! Never proceed with missing data.

6.CANCELLAZIONE ("cancella","elimina","rimuovi")
  Single: need PRIMARY KEY (data,pescheria,pesce) → action="cancellazione"
  Bulk ("cancella tutto","cancella tutte le righe"): ALWAYS ask confirmation first! "⚠️ ATTENZIONE! Operazione IRREVERSIBILE. Confermi?"
  If confirmed → action="cancellazione_multipla" with {filtro:"all"} or {filtro:"data",data:"DD/MM/YYYY"}

7.REPORT ("report","riepilogo","come è andata","riassunto")
  User asks for a report of a specific date or date range. Default=today.
  Parse date(s) from user message. Can be: "report di ieri", "report 20/02", "report da lunedì a mercoledì", "come è andata oggi?"
  Return action="report" with dates array (DD/MM/YYYY format).
  For date ranges, include ALL dates in the array.

8.CONVERSAZIONE: greetings, questions → just respond, no JSON action

RULES:
- Normalize fish names: first letter uppercase, rest lowercase
- Ask max 1 question at a time. Be assertive: deduce what you can.
- Validate BEFORE returning action. YOU validate, functions execute blindly.
- Conversational corrections = just text response, NO action
- PRIMARY KEY = (data, pescheria, pesce) for updates/deletions
- Never create duplicate rows for corrections

RESPONSE FORMAT — return JSON when ALL data ready:
For ACQUISTO: {"action":"acquisto","data":{"items":[{"specie":"Cozze","kg":20,"prezzo_acquisto":2,"prezzo_vendita":10,"pescheria":"Grassano","fornitore":"Brezza","meteo":"Sole","categoria":"Allevamento","data_acquisto":"${oggiStr}","note":""}]},"message":"✅ Registrato!"}
For RIMANENZE: {"action":"rimanenze","data":{"items":[{"specie":"Orate","kg":5}],"data_destinazione":"22/02/2026","pescheria_destinazione":"Grottole"},"message":"✅ Rimanenze registrate!"}
For VENDITA: {"action":"vendita_ristoranti","data":{"items":[{"specie":"Cozze","kg":3}],"ristorante":"${RESTAURANTS[0]}","prezzo_vendita_nuovo":null},"message":"✅ Vendita registrata!"}
For ECCESSO: {"action":"eccesso","data":{"items":[{"specie":"Gamberi","kg":2}]},"message":"✅ Eccesso registrato!"}
For AGGIORNAMENTO: {"action":"aggiornamento","data":{"data":"${oggiStr}","pescheria":"Grassano","pesce":"Cozze","campo":"prezzo_vendita","nuovo_valore":15},"message":"✅ Aggiornato!"}
For CANCELLAZIONE: {"action":"cancellazione","data":{"data":"${oggiStr}","pescheria":"Grassano","pesce":"Cozze"},"message":"✅ Cancellato!"}
For BULK DELETE: {"action":"cancellazione_multipla","data":{"filtro":"all"},"message":"✅ Tutto cancellato!"}
For REPORT: {"action":"report","data":{"date":["${oggiStr}"]},"message":""}
MULTI-ACTION (when user requests multiple operations at once):
{"actions":[{"action":"aggiornamento","data":{...},"message":"..."},{"action":"aggiornamento","data":{...},"message":"..."}],"message":"✅ Tutto aggiornato!"}
Use "actions" array when user asks to update/delete/modify MULTIPLE rows in one message. Each element has its own action+data+message.
IMPORTANT: For ACQUISTO with multiple items (even from different suppliers), ALWAYS use a SINGLE action with items array, NOT an "actions" array of individual acquisto actions. The items array supports multiple suppliers in one action.
If need more info → respond with text only (no JSON).`;

  const dynamicContext = contextSection;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: [
        { type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicContext }
      ],
      messages
    })
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rawText = data.content[0].text;

  // Try to parse JSON response
  const parsed = extractJSON(rawText);
  if (parsed?.actions && Array.isArray(parsed.actions)) {
    // Multi-action response
    return { actions: parsed.actions, message: parsed.message, rawText };
  }
  if (parsed?.action) {
    return { action: parsed.action, data: parsed.data, message: parsed.message, rawText };
  }
  
  // Plain text response
  return { action: null, text: rawText, rawText };
}

// ══════════════════════════════════════════════════════════════
// ACTION EXECUTOR - Routes to simple executor functions
// ══════════════════════════════════════════════════════════════

async function executeAction(chatId, aiResponse, env, silent = false) {
  try {
    switch (aiResponse.action) {
      case 'acquisto':
        await executePurchase(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'rimanenze':
        await executeRemainders(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'vendita_ristoranti':
        await executeRestaurantSale(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'eccesso':
        await executeExcess(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'aggiornamento':
        await executeUpdate(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'cancellazione':
        await executeDeletion(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'cancellazione_multipla':
        await executeBulkDeletion(chatId, aiResponse.data, aiResponse.message, env, silent);
        break;
      
      case 'report':
        await executeReport(chatId, aiResponse.data, env);
        break;
      
      default:
        if (!silent) await sendTelegram(chatId, `⚠️ Azione sconosciuta: ${aiResponse.action}`, env);
    }
  } catch (e) {
    if (!silent) await sendTelegram(chatId, `⚠️ Errore esecuzione: ${e.message}`, env);
    else throw e;
  }
}

// ══════════════════════════════════════════════════════════════
// SIMPLE EXECUTOR FUNCTIONS - No business logic, just write
// ══════════════════════════════════════════════════════════════

async function executePurchase(chatId, data, message, env, silent = false) {
  const items = data.items.map(item => ({
    ...item,
    specie: normalizeFishName(item.specie),  // Ensure normalization
    categoria: item.categoria || categorizeFish(item.specie) || 'Da definire',
    fornitore: deduplicateValue(item.fornitore, SUPPLIERS),
    pescheria: deduplicateValue(item.pescheria, FISH_SHOPS),
    meteo: deduplicateValue(item.meteo, WEATHER),
  }));

  // Write to sheet
  const rows = items.map(item => [
    item.data_acquisto, item.pescheria, item.specie, item.fornitore,
    item.categoria, item.kg, item.prezzo_acquisto, item.prezzo_vendita,
    '', '', '', item.meteo, item.note || '', getWastePerKg(item.specie),
  ]);
  await writeRowsToSheet(rows, env);

  // Update weather for all rows of today
  if (items.length > 0 && items[0].meteo) {
    await updateWeatherForToday(items[0].meteo, items[0].data_acquisto, env);
  }

  if (!silent) {
    // Send single confirmation with summary + report
    let response = `✅ ${message}\n\n${formatSummary(items)}`;
    try {
      const report = await buildReport(env);
      response += `\n\n${report}`;
    } catch (e) {
      console.error('Report error:', e);
    }
    await sendTelegram(chatId, response, env);
  }
}

async function executeRemainders(chatId, data, message, env, silent = false) {
  const oggi = new Date().toLocaleDateString('it-IT');
  
  // Parse flexible date if needed
  let dataDestinazione = data.data_destinazione;
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dataDestinazione)) {
    dataDestinazione = await parseFlexibleDate(dataDestinazione, env) || dataDestinazione;
  }

  // Simple executor: Claude already validated everything
  // Just get today's data to copy prices/category/scarto and update remainder column
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;
  const range = encodeURIComponent(`'${sheetName}'!A:N`);
  
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Sheets GET ${res.status}`);
  const sheetData = await res.json();
  const allRows = sheetData.values || [];
  
  // Find today's purchases from pescherie (to copy data and update remainder column)
  const todayPescheriePurchases = allRows.filter((r, idx) => 
    idx > 0 && 
    r[0] === oggi && 
    r[3] !== 'Rimanenza' && 
    !RESTAURANTS.includes(r[1]) &&  // Exclude all restaurants
    FISH_SHOPS.includes(r[1]) &&    // Only pescherie
    r[5]
  );

  // Build map: normalized species → original purchase data + row number
  const acquisti = {};
  todayPescheriePurchases.forEach((r) => {
    const specie = normalize(r[2] || '');
    const rowNumber = allRows.indexOf(r) + 1; // 1-based
    
    if (!acquisti[specie]) {
      acquisti[specie] = {
        rowNumber,
        specieOriginale: r[2] || '',
        fornitore: r[3] || '',
        categoria: r[4] || '',
        prezzo_acquisto: parseNum(r[6]),
        prezzo_vendita: parseNum(r[7]),
        meteo: r[11] || '',
        scarto: parseNum(r[13])
      };
    }
  });

  // Build rows for destination date AND update today's rows
  const newRows = [];
  const updates = [];
  
  for (const item of data.items) {
    const specieNorm = normalize(item.specie);
    const originalData = acquisti[specieNorm];
    
    if (!originalData) {
      if (!silent) await sendTelegram(chatId, `⚠️ ${item.specie} non trovato negli acquisti di pescherie oggi. Ignoro.`, env);
      continue;
    }
    
    // Update OLD ROW (today): set remainder column to kg being moved
    updates.push({
      range: `'${sheetName}'!I${originalData.rowNumber}`,
      values: [[item.kg]]
    });
    
    // Create NEW ROW (destination date): remainder column = 0
    newRows.push([
      dataDestinazione,
      data.pescheria_destinazione,
      originalData.specieOriginale,  // Use original capitalization
      'Rimanenza',
      originalData.categoria,
      item.kg,  // Qty Purchased = remainder kg
      originalData.prezzo_acquisto,
      originalData.prezzo_vendita,
      0,  // Remainder = 0 (will be filled when actually remains)
      '', '', '',  // Discarded, Additional requests, Weather (empty)
      `Rimanenza da ${oggi}`,
      originalData.scarto,
    ]);
  }

  if (newRows.length === 0) {
    if (!silent) await sendTelegram(chatId, `⚠️ Nessuna rimanenza valida da salvare.`, env);
    return;
  }

  // Apply updates to old rows
  if (updates.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates })
      }
    );
  }

  // Write new rows
  await writeRowsToSheet(newRows, env);

  if (!silent) await sendTelegram(chatId, `✅ ${message}`, env);
}

async function executeRestaurantSale(chatId, data, message, env, silent = false) {
  const oggi = new Date().toLocaleDateString('it-IT');
  const domani = new Date(Date.now() + 86400000).toLocaleDateString('it-IT');
  
  // Get restaurant name from data (Claude decided which one)
  const ristorante = data.ristorante || RESTAURANTS[0];  // Default to first if not specified
  
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;
  
  // Read all rows to find source purchases and future remainders
  const range = encodeURIComponent(`'${sheetName}'!A:N`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Sheets GET ${res.status}`);
  const sheetData = await res.json();
  const allRows = sheetData.values || [];
  
  const updates = [];
  const newRows = [];
  
  for (const item of data.items) {
    const specieNorm = normalize(item.specie);
    let found = false;
    
    // First, check for future remainders
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row[3] === 'Rimanenza' && 
          normalize(row[2] || '') === specieNorm &&
          row[0] >= domani) {
        
        const kgRimanenza = parseNum(row[5]);
        if (kgRimanenza >= item.kg) {
          // Subtract from remainder: update col F (qty), leave col I as-is (stays 0)
          const rowNumber = i + 1;
          const newKg = kgRimanenza - item.kg;
          updates.push({
            range: `'${sheetName}'!F${rowNumber}`,
            values: [[newKg]]
          });
          
          // Also update col I of the ORIGINAL purchase row (the one that generated this remainder)
          // Find it by looking at today's pescherie purchases for same fish
          for (let j = 1; j < allRows.length; j++) {
            const origRow = allRows[j];
            if (origRow[0] === oggi && 
                normalize(origRow[2] || '') === specieNorm &&
                origRow[3] !== 'Rimanenza' &&
                !RESTAURANTS.includes(origRow[1])) {
              const origI = parseNum(origRow[8]);
              if (origI > 0) {
                updates.push({
                  range: `'${sheetName}'!I${j + 1}`,
                  values: [[Math.max(0, origI - item.kg)]]
                });
              }
              break;
            }
          }
          
          // Get today's weather for the restaurant row
          let todayMeteo = '';
          for (let j = 1; j < allRows.length; j++) {
            if (allRows[j][0] === oggi && allRows[j][11]) {
              todayMeteo = allRows[j][11];
              break;
            }
          }
          
          // Create restaurant row
          const prezzoVendita = data.prezzo_vendita_nuovo !== null && data.prezzo_vendita_nuovo !== undefined 
            ? data.prezzo_vendita_nuovo : parseNum(row[7]);
          newRows.push([
            oggi,                    // A - Date
            ristorante,              // B - Pescheria (restaurant name)
            row[2] || '',            // C - Fish
            row[3] || '',            // D - Supplier (KEEP ORIGINAL - "Rimanenza")
            row[4] || '',            // E - Category
            item.kg,                 // F - Qty
            parseNum(row[6]),        // G - Purchase price
            prezzoVendita,           // H - Sale price
            '',                      // I - Remainder (empty for restaurant rows)
            '',                      // J - Discarded
            '',                      // K - Additional requests
            todayMeteo,              // L - Weather (from today, NOT from remainder row)
            `Vendita ristorante da rimanenza ${row[0]}`,  // M - Notes
            parseNum(row[13])        // N - Waste per Kg
          ]);
          
          found = true;
          break;
        }
      }
    }
    
    // If not found in remainders, check today's purchases
    if (!found) {
      // Get today's weather
      let todayMeteo = '';
      for (let j = 1; j < allRows.length; j++) {
        if (allRows[j][0] === oggi && allRows[j][11]) {
          todayMeteo = allRows[j][11];
          break;
        }
      }
      
      for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (row[0] === oggi && 
            normalize(row[2] || '') === specieNorm &&
            row[3] !== 'Rimanenza' &&
            !RESTAURANTS.includes(row[1])) {  // Exclude all restaurants
          
          const kgOriginale = parseNum(row[5]);
          if (kgOriginale >= item.kg) {
            // Subtract from today
            const rowNumber = i + 1;
            updates.push({
              range: `'${sheetName}'!F${rowNumber}`,
              values: [[kgOriginale - item.kg]]
            });
            
            // Create restaurant row
            const prezzoVendita = data.prezzo_vendita_nuovo !== null && data.prezzo_vendita_nuovo !== undefined
              ? data.prezzo_vendita_nuovo : parseNum(row[7]);
            newRows.push([
              oggi,                    // A - Date
              ristorante,              // B - Pescheria (restaurant name)
              row[2] || '',            // C - Fish
              row[3] || '',            // D - Supplier (KEEP ORIGINAL!)
              row[4] || '',            // E - Category
              item.kg,                 // F - Qty
              parseNum(row[6]),        // G - Purchase price
              prezzoVendita,           // H - Sale price
              '',                      // I - Remainder (empty for restaurant rows)
              '',                      // J - Discarded
              '',                      // K - Additional requests
              todayMeteo,              // L - Weather (always from today)
              `Vendita ristorante da ${row[1]}`,  // M - Notes
              parseNum(row[13])        // N - Waste per Kg
            ]);
            
            found = true;
            break;
          }
        }
      }
    }
    
    if (!found) {
      if (!silent) await sendTelegram(chatId, `⚠️ ${item.specie}: quantità non disponibile. Ignoro.`, env);
    }
  }
  
  // Apply updates
  if (updates.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates })
      }
    );
  }
  
  // Write new restaurant rows
  if (newRows.length > 0) {
    await writeRowsToSheet(newRows, env);
  }
  
  if (!silent) await sendTelegram(chatId, `✅ ${message}`, env);
}

async function executeExcess(chatId, data, message, env, silent = false) {
  const oggi = new Date().toLocaleDateString('it-IT');
  
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;
  
  // Read today's rows
  const range = encodeURIComponent(`'${sheetName}'!A:K`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Sheets GET ${res.status}`);
  const sheetData = await res.json();
  const allRows = sheetData.values || [];
  
  const updates = [];
  for (const item of data.items) {
    const specieNorm = normalize(item.specie);
    
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row[0] === oggi && normalize(row[2] || '') === specieNorm) {
        const rowNumber = i + 1;
        updates.push({
          range: `'${sheetName}'!K${rowNumber}`,
          values: [[item.kg]]
        });
        break;
      }
    }
  }
  
  if (updates.length === 0) {
    if (!silent) await sendTelegram(chatId, `⚠️ Nessuna riga trovata per oggi. Registra prima gli acquisti.`, env);
    return;
  }
  
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates })
    }
  );
  
  if (!silent) await sendTelegram(chatId, `✅ ${message}`, env);
}

async function executeDeletion(chatId, data, message, env, silent = false) {
  // PRIMARY KEY: (data, pescheria, pesce)
  const targetData = data.data;
  const targetPescheria = data.pescheria;
  const targetPesce = normalize(data.pesce);
  
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;
  
  // Read all rows to find the target
  const range = encodeURIComponent(`'${sheetName}'!A:N`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Sheets GET ${res.status}`);
  const sheetData = await res.json();
  const allRows = sheetData.values || [];
  
  // Find row matching PRIMARY KEY
  let rowToDelete = -1;
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (row[0] === targetData && 
        normalize(row[1] || '') === normalize(targetPescheria) &&
        normalize(row[2] || '') === targetPesce) {
      rowToDelete = i + 1; // 1-based
      break;
    }
  }
  
  if (rowToDelete === -1) {
    if (!silent) await sendTelegram(chatId, 
      `⚠️ Entry non trovata!\nData: ${targetData}\nPescheria: ${targetPescheria}\nPesce: ${data.pesce}\n\nVerifica i dati.`, env);
    return;
  }
  
  // Delete row using Sheets API
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!metaRes.ok) throw new Error(`Sheets meta ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  const sheetIdNum = sheet.properties.sheetId;
  
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetIdNum,
              dimension: 'ROWS',
              startIndex: rowToDelete - 1,
              endIndex: rowToDelete
            }
          }
        }]
      })
    }
  );
  
  if (!silent) await sendTelegram(chatId, `✅ ${message}\n\nCancellata entry: ${targetData} | ${targetPescheria} | ${data.pesce}`, env);
}

async function executeBulkDeletion(chatId, data, message, env, silent = false) {
  // Bulk deletion: delete all rows or all rows of specific date
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;
  
  // Read all rows
  const range = encodeURIComponent(`'${sheetName}'!A:N`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Sheets GET ${res.status}`);
  const sheetData = await res.json();
  const allRows = sheetData.values || [];
  
  if (allRows.length <= 1) {
    if (!silent) await sendTelegram(chatId, `⚠️ Nessuna riga da cancellare (solo header presente).`, env);
    return;
  }
  
  // Get sheet metadata
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!metaRes.ok) throw new Error(`Sheets meta ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  const sheetIdNum = sheet.properties.sheetId;
  
  // Determine which rows to delete
  let rowsToDelete = [];
  
  if (data.filtro === 'all') {
    // Delete all rows except header (row 0)
    for (let i = 1; i < allRows.length; i++) {
      rowsToDelete.push(i);
    }
  } else if (data.filtro === 'data' && data.data) {
    // Delete all rows of specific date
    const targetData = data.data;
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row[0] === targetData) {
        rowsToDelete.push(i);
      }
    }
  }
  
  if (rowsToDelete.length === 0) {
    if (!silent) await sendTelegram(chatId, `⚠️ Nessuna riga trovata con i criteri specificati.`, env);
    return;
  }
  
  // Build delete requests (delete from bottom to top to avoid index shifting)
  const requests = [];
  rowsToDelete.reverse().forEach(rowIndex => {
    requests.push({
      deleteDimension: {
        range: {
          sheetId: sheetIdNum,
          dimension: 'ROWS',
          startIndex: rowIndex,
          endIndex: rowIndex + 1
        }
      }
    });
  });
  
  // Execute bulk deletion
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    }
  );
  
  const summary = data.filtro === 'all' 
    ? `Cancellate TUTTE le ${rowsToDelete.length} righe (tranne header)`
    : `Cancellate ${rowsToDelete.length} righe del ${data.data}`;
  
  if (!silent) await sendTelegram(chatId, `✅ ${message}\n\n${summary}`, env);
}

async function executeUpdate(chatId, data, message, env, silent = false) {
  // Simple executor: Claude already validated everything
  // Just execute what Claude decided
  
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;
  
  // Read all rows to find the target
  const range = encodeURIComponent(`'${sheetName}'!A:N`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Sheets GET ${res.status}`);
  const sheetData = await res.json();
  const allRows = sheetData.values || [];
  
  // SPECIAL CASE: Remainder correction (tipo="rimanenza")
  if (data.tipo === 'rimanenza') {
    const dataOriginale = data.data_originale || new Date().toLocaleDateString('it-IT');
    const targetPesce = normalize(data.pesce || '');
    
    // Find most recent remainder with notes "da [dataOriginale]"
    let rowToUpdate = -1;
    let oldRowNumber = -1;
    
    // Find NEW row (remainder row)
    for (let i = allRows.length - 1; i >= 1; i--) {
      const row = allRows[i];
      if (row[3] === 'Rimanenza' && 
          normalize(row[2] || '') === targetPesce &&
          row[12] && row[12].includes(`da ${dataOriginale}`)) {
        rowToUpdate = i + 1; // 1-based
        break;
      }
    }
    
    // Find OLD row (original purchase from today)
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row[0] === dataOriginale && 
          normalize(row[2] || '') === targetPesce &&
          row[3] !== 'Rimanenza' &&
          !RESTAURANTS.includes(row[1])) {
        oldRowNumber = i + 1; // 1-based
        break;
      }
    }
    
    const updates = [];
    
    // Update based on campo
    if (data.campo === 'kg' || data.campo === 'quantita') {
      // Update quantity: both old row (column I) and new row (column F)
      const nuovoKg = parseFloat(data.nuovo_valore) || 0;
      if (oldRowNumber > 0) {
        updates.push({ range: `'${sheetName}'!I${oldRowNumber}`, values: [[nuovoKg]] });
      }
      if (rowToUpdate > 0) {
        updates.push({ range: `'${sheetName}'!F${rowToUpdate}`, values: [[nuovoKg]] });
      }
    } else if (data.data_destinazione && rowToUpdate > 0) {
      // Update date
      updates.push({ range: `'${sheetName}'!A${rowToUpdate}`, values: [[data.data_destinazione]] });
    }
    
    if (data.pescheria_destinazione && rowToUpdate > 0) {
      // Update pescheria
      updates.push({ range: `'${sheetName}'!B${rowToUpdate}`, values: [[data.pescheria_destinazione]] });
    }
    
    if (updates.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates })
        }
      );
    }
    
    if (!silent) await sendTelegram(chatId, `✅ ${message}`, env);
    return;
  }
  
  // NORMAL CASE: Explicit update with PRIMARY KEY
  const targetData = data.data;
  const targetPescheria = data.pescheria;
  const targetPesce = normalize(data.pesce || '');
  const campo = data.campo;
  const nuovoValore = data.nuovo_valore;
  
  // Find row matching PRIMARY KEY
  let rowToUpdate = -1;
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (row[0] === targetData && 
        normalize(row[1] || '') === normalize(targetPescheria) &&
        normalize(row[2] || '') === targetPesce) {
      rowToUpdate = i + 1; // 1-based
      break;
    }
  }
  
  // Map field name to column letter
  const fieldToColumn = {
    'data': 'A', 'pescheria': 'B', 'pesce': 'C', 'fornitore': 'D', 'categoria': 'E',
    'kg': 'F', 'quantita': 'F', 'qta': 'F',
    'prezzo_acquisto': 'G', 'prezzo_acq': 'G', 'acquisto': 'G',
    'prezzo_vendita': 'H', 'prezzo_vend': 'H', 'vendita': 'H',
    'rimanenza': 'I', 'rimanenze': 'I',
    'scartato': 'J', 'scarto_kg': 'J',
    'richieste_aggiuntive': 'K', 'eccesso': 'K',
    'meteo': 'L', 'tempo': 'L',
    'note': 'M',
    'scarto_per_kg': 'N'
  };
  
  const column = fieldToColumn[normalize(campo || '')];
  
  if (rowToUpdate > 0 && column) {
    // Update the cell
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [{
            range: `'${sheetName}'!${column}${rowToUpdate}`,
            values: [[nuovoValore]]
          }]
        })
      }
    );
  }
  
  if (!silent) await sendTelegram(chatId, `✅ ${message}`, env);
}

// ══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

// Parse numbers from European format: strips €, spaces, converts comma to dot
function parseNum(val) {
  if (val == null || val === '') return 0;
  const cleaned = String(val).replace(/[€\s]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function normalizeFishName(name) {
  if (!name) return name;
  // First letter uppercase, rest lowercase
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9àèéìòù]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findClosestMatch(input, lista) {
  if (!input) return null;
  const norm = normalize(input);
  for (const v of lista) {
    if (normalize(v) === norm) return v;
  }
  for (const v of lista) {
    const nv = normalize(v);
    if (nv.includes(norm) || norm.includes(nv)) return v;
  }
  return null;
}

function deduplicateValue(input, lista) {
  if (!input) return input;
  return findClosestMatch(input, lista) || input;
}

function categorizeFish(nomePesce) {
  const norm = normalize(nomePesce);
  for (const [keyword, cat] of Object.entries(FISH_CATEGORY)) {
    if (norm.includes(normalize(keyword))) return cat;
  }
  return null;
}

function getWastePerKg(nomePesce) {
  const norm = normalize(nomePesce);
  for (const [keyword, scarto] of Object.entries(WASTE_PER_KG)) {
    if (norm.includes(keyword)) return scarto;
  }
  return 0;
}

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch {}
        start = -1;
      }
    }
  }
  return null;
}

async function parseFlexibleDate(dateText, env) {
  const oggi = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  
  const systemPrompt = `Sei un assistente che converte date in formato DD/MM/YYYY. Oggi è ${oggi}.
Rispondi SOLO con la data in formato DD/MM/YYYY, nient'altro.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        system: systemPrompt,
        messages: [{ role: 'user', content: dateText }]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const parsedDate = data.content[0].text.trim();
    
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parsedDate)) {
      return parsedDate;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// GOOGLE SHEETS FUNCTIONS
// ══════════════════════════════════════════════════════════════

async function writeRowsToSheet(rows, env) {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const sheetId = env.SHEET_ID;

  // Find first empty row
  const rangeCheck = encodeURIComponent(`'${sheetName}'!A:A`);
  const checkRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeCheck}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!checkRes.ok) throw new Error(`Sheets GET ${checkRes.status}`);
  const checkData = await checkRes.json();
  const values = checkData.values || [];
  
  let firstEmptyRow = 2;
  for (let i = 1; i < values.length; i++) {
    if (!values[i] || !values[i][0] || values[i][0].trim() === '') {
      firstEmptyRow = i + 1;
      break;
    }
  }
  if (firstEmptyRow === 2 && values.length > 1) {
    firstEmptyRow = values.length + 1;
  }

  // Build rows with formulas
  const rowsConFormule = rows.map((row, idx) => {
    const r = firstEmptyRow + idx;
    return buildRowWithFormulas(row, r);
  });

  // Write to sheet
  const startRange = encodeURIComponent(`'${sheetName}'!A${firstEmptyRow}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${startRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rowsConFormule })
    }
  );
  if (!res.ok) throw new Error(`Sheets API ${res.status}`);

  // Apply formatting
  await formatColumns(sheetId, sheetName, token, firstEmptyRow, rowsConFormule.length);
}

function buildRowWithFormulas(row, r) {
  const scarto = row[13] ?? 0;
  return [
    row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7],
    row[8] ?? '', row[9] ?? '', row[10] ?? '', row[11] ?? '', row[12] ?? '', scarto,
    `=N${r}*(F${r}-I${r})`,
    `=F${r}*G${r}`,
    `=(F${r}-I${r}-J${r}-O${r})*H${r}`,
    `=Q${r}-P${r}`,
    `=Q${r}-P${r}`,
    `=SE(Q${r}=0;0;S${r}/Q${r})`,
    `=F${r}-I${r}-O${r}`,
    `=SE(F${r}=0;0;(I${r}+O${r})/F${r})`,
    `=(H${r}-G${r})/H${r}`,
    `=CONCATENA(A${r};B${r})`,
    `=I${r}*G${r}`,
    `=TESTO(A${r};"dddd")`,
    `=TESTO(A${r};"mm")`,
    `=TESTO(A${r};"yyyy")`,
  ];
}

async function formatColumns(sheetId, sheetName, token, startRow, numRows) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!metaRes.ok) return;
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === sheetName);
  if (!sheet) return;
  const sheetIdNum = sheet.properties.sheetId;

  const requests = [];
  const euroColumns = [6, 7, 15, 16, 17, 18, 24];
  for (const col of euroColumns) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: startRow - 1,
          endRowIndex: startRow - 1 + numRows,
          startColumnIndex: col,
          endColumnIndex: col + 1
        },
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '#,##0.00 "€"' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  const percentColumns = [19, 21, 22];
  for (const col of percentColumns) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: startRow - 1,
          endRowIndex: startRow - 1 + numRows,
          startColumnIndex: col,
          endColumnIndex: col + 1
        },
        cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.00%' } } },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  if (requests.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests })
      }
    );
  }
}

async function updateWeatherForToday(meteo, data, env) {
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const token = await getGoogleToken(sa);
    const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
    const sheetId = env.SHEET_ID;
    
    const range = encodeURIComponent(`'${sheetName}'!A:L`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    if (!res.ok) return;
    const resData = await res.json();
    const allRows = resData.values || [];
    
    const updates = [];
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row[0] === data) {
        const rowNumber = i + 1;
        updates.push({ range: `'${sheetName}'!L${rowNumber}`, values: [[meteo]] });
      }
    }
    
    if (updates.length === 0) return;
    
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates })
      }
    );
  } catch (e) {
    console.error('Error updating weather:', e);
  }
}

// ══════════════════════════════════════════════════════════════
// REPORT & REMINDER
// ══════════════════════════════════════════════════════════════

async function executeReport(chatId, data, env) {
  const dates = data.date || [new Date().toLocaleDateString('it-IT')];
  const reports = [];
  for (const d of dates) {
    // Parse flexible dates if needed
    let dateStr = d;
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
      dateStr = await parseFlexibleDate(dateStr, env) || dateStr;
    }
    try {
      reports.push(await buildReport(env, dateStr));
    } catch (e) {
      reports.push(`⚠️ Errore report ${dateStr}: ${e.message}`);
    }
  }
  await sendTelegram(chatId, reports.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n'), env);
}

async function buildReport(env, targetDate = null) {
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await getGoogleToken(sa);
  const sheetName = env.SHEET_NAME || 'AIPescheriaBot';
  const range = encodeURIComponent(`'${sheetName}'!A:AB`);
  
  const reportDate = targetDate || new Date().toLocaleDateString('it-IT');

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();

  // Split into purchases and remainders for this date
  const purchaseRows = (data.values || []).filter(r =>
    r[0] === reportDate && r[3] !== 'Rimanenza' && r[5]
  );
  const remainderRows = (data.values || []).filter(r =>
    r[0] === reportDate && r[3] === 'Rimanenza' && r[5]
  );

  if (!purchaseRows.length && !remainderRows.length) {
    return `📊 *Report ${reportDate}*\n\nNessun dato registrato.`;
  }

  // Consolidate purchase rows (same fish, category, prices)
  const consolidated = {};
  purchaseRows.forEach(r => {
    const pesce = r[2] || '';
    const categoria = r[4] || '';
    const kg = parseNum(r[5]);
    const pa = parseNum(r[6]);
    const pv = parseNum(r[7]);
    const rim = parseNum(r[8]);
    const scartoPerKg = parseNum(r[13]);
    const key = `${pesce}|${categoria}|${pa}|${pv}`;
    
    if (!consolidated[key]) {
      consolidated[key] = { pesce, categoria, kg: 0, pa, pv, rim: 0, scartoPerKg };
    }
    consolidated[key].kg += kg;
    consolidated[key].rim += rim;
  });

  // Consolidate remainder rows (same fish, category, prices)
  const consolidatedRem = {};
  remainderRows.forEach(r => {
    const pesce = r[2] || '';
    const categoria = r[4] || '';
    const kg = parseNum(r[5]);
    const pa = parseNum(r[6]);
    const pv = parseNum(r[7]);
    const scartoPerKg = parseNum(r[13]);
    const key = `${pesce}|${categoria}|${pv}`;
    
    if (!consolidatedRem[key]) {
      consolidatedRem[key] = { pesce, categoria, kg: 0, pa, pv, scartoPerKg };
    }
    consolidatedRem[key].kg += kg;
  });

  // Calculate purchase totals
  let totKg = 0, totSpesa = 0, totIncassoAcquisti = 0, totScarto = 0;
  const fishDetails = [];

  Object.values(consolidated).forEach(f => {
    const scartoKg = f.kg * f.scartoPerKg;
    const kgVendibili = f.kg - f.rim - scartoKg;
    const spesa = f.kg * f.pa;
    const incasso = Math.max(0, kgVendibili) * f.pv;
    const margineEuro = incasso - spesa;
    const marginePerc = incasso > 0 ? (margineEuro / incasso * 100) : 0;
    
    totKg += f.kg;
    totSpesa += spesa;
    totIncassoAcquisti += incasso;
    totScarto += scartoKg;
    
    fishDetails.push({ ...f, scartoKg, kgVendibili, margineEuro, marginePerc });
  });

  // Calculate remainder totals (no capital cost — already paid)
  let totKgRim = 0, totIncassoRim = 0, totScartoRim = 0;
  const remDetails = [];

  Object.values(consolidatedRem).forEach(f => {
    const scartoKg = f.kg * f.scartoPerKg;
    const kgVendibili = f.kg - scartoKg;
    const incasso = Math.max(0, kgVendibili) * f.pv;
    
    totKgRim += f.kg;
    totIncassoRim += incasso;
    totScartoRim += scartoKg;
    
    remDetails.push({ ...f, scartoKg, kgVendibili, incasso });
  });

  // Build output lines — purchases
  const lines = fishDetails.map(f => {
    let line = `🐟 *${f.pesce}* (${f.categoria})\n` +
      `   ${f.kg}kg | €${f.pa.toFixed(2)}/kg → €${f.pv.toFixed(2)}/kg\n` +
      `   Margine: €${f.margineEuro.toFixed(2)} (${f.marginePerc.toFixed(1)}%)`;
    if (f.rim) line += ` | Rim: ${f.rim}kg`;
    if (f.scartoKg > 0) line += ` | Scarto: ${f.scartoKg.toFixed(2)}kg`;
    return line;
  });

  // Build output lines — remainders
  const remLines = remDetails.map(f => {
    let line = `♻️ *${f.pesce}* (${f.categoria}) — Rimanenza\n` +
      `   ${f.kg}kg → €${f.pv.toFixed(2)}/kg\n` +
      `   Incasso previsto: €${f.incasso.toFixed(2)}`;
    if (f.scartoKg > 0) line += ` | Scarto: ${f.scartoKg.toFixed(2)}kg`;
    return line;
  });

  // Combined totals
  const allLines = [...lines, ...remLines];
  const totIncassoLordo = totIncassoAcquisti + totIncassoRim;
  const totMargineNetto = totIncassoLordo - totSpesa;
  const totMarginePerc = totIncassoLordo > 0 ? (totMargineNetto / totIncassoLordo * 100) : 0;
  const allScarto = totScarto + totScartoRim;

  let summary = `📊 *Report ${reportDate}*\n\n` +
    `${allLines.join('\n\n')}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Totale: *${(totKg + totKgRim).toFixed(1)}kg*`;
  if (totKgRim > 0) summary += ` (di cui ${totKgRim.toFixed(1)}kg rimanenze)`;
  if (allScarto > 0) summary += ` (scarto: ${allScarto.toFixed(2)}kg)`;
  summary += `\n💶 Capitale speso: *€${totSpesa.toFixed(2)}*`;
  if (totKgRim > 0) summary += ` (solo nuovi acquisti)`;
  summary += `\n💰 Incasso lordo previsto: *€${totIncassoLordo.toFixed(2)}*`;
  if (totIncassoRim > 0) summary += `\n♻️ Valore rimanenze: *€${totIncassoRim.toFixed(2)}*`;
  summary += `\n✅ Margine netto: *€${totMargineNetto.toFixed(2)}*\n` +
    `📈 Margine totale: *${totMarginePerc.toFixed(1)}%*\n\n` +
    `_Esclusi: benzine e sigarette (bonus aziendale)_`;

  return summary;
}

// ══════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ══════════════════════════════════════════════════════════════

async function loadSession(chatId, env) {
  try {
    const raw = await env.SESSIONS.get(chatId);
    return raw ? JSON.parse(raw) : { messages: [] };
  } catch { return { messages: [] }; }
}

async function saveSession(chatId, session, env) {
  if (session.messages?.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }
  await env.SESSIONS.put(chatId, JSON.stringify(session), { expirationTtl: SESSION_TTL });
}

async function loadCustomLists(env) {
  try {
    const [f, p, m, fish] = await Promise.all([
      env.SESSIONS.get('__custom_fornitore__'),
      env.SESSIONS.get('__custom_pescheria__'),
      env.SESSIONS.get('__custom_meteo__'),
      env.SESSIONS.get('__custom_pesce__'),
    ]);
    if (f) { const v = JSON.parse(f); SUPPLIERS.length = 0; SUPPLIERS.push(...v); }
    if (p) { const v = JSON.parse(p); FISH_SHOPS.length = 0; FISH_SHOPS.push(...v); }
    if (m) { const v = JSON.parse(m); WEATHER.length = 0; WEATHER.push(...v); }
    if (fish) { 
      const v = JSON.parse(fish); 
      Object.keys(FISH_CATEGORY).forEach(k => delete FISH_CATEGORY[k]);
      Object.assign(FISH_CATEGORY, v);
    }
  } catch {}
}

function formatSummary(items) {
  return items.map(i => {
    const margine = ((i.prezzo_vendita - i.prezzo_acquisto) * i.kg).toFixed(2);
    return `🐟 *${i.specie}* (${i.categoria})\n` +
      `   ${i.kg}kg | acq €${i.prezzo_acquisto}/kg → vend €${i.prezzo_vendita}/kg\n` +
      `   Margine: *€${margine}* | ${i.fornitore} → ${i.pescheria} | ${i.meteo}`;
  }).join('\n\n');
}

// ══════════════════════════════════════════════════════════════
// GOOGLE OAUTH2 JWT
// ══════════════════════════════════════════════════════════════

async function getGoogleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  }));
  const unsigned = `${hdr}.${pay}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  if (!res.ok) throw new Error(`Google token: ${await res.text()}`);
  const d = await res.json();
  if (!d.access_token) throw new Error('Nessun access_token da Google');
  return d.access_token;
}

function b64url(data) {
  const base64 = typeof data === 'string'
    ? btoa(unescape(encodeURIComponent(data)))
    : btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ══════════════════════════════════════════════════════════════
// TELEGRAM
// ══════════════════════════════════════════════════════════════

async function sendTelegram(chatId, text, env) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
  if (!res.ok) console.error('Telegram error:', await res.text());
}
