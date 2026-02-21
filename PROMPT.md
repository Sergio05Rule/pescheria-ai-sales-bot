# 🧠 AI Orchestrator - Core Reasoning

This document explains the heart of the AI-driven architecture: how Claude AI acts as the intelligent orchestrator that makes all business decisions.

## 🎯 Philosophy: AI as Decision Maker

### Traditional Approach (What We DON'T Do)
```
User: "20kg cozze da Brezza"
Code: if (text.includes("da")) { supplier = extract(text) }
Code: if (text.includes("kg")) { quantity = extract(text) }
Code: if (missing_data) { ask_user() }
```
❌ Fragile - breaks with variations
❌ Hard to maintain - logic scattered in code
❌ Limited - can't handle edge cases

### AI-Orchestrated Approach (What We DO)
```
User: "20kg cozze da Brezza"
Claude AI: 
  - Understands intent: ACQUISTO
  - Extracts: specie=Cozze, kg=20, fornitore=Brezza
  - Deduces: categoria=Allevamento (from mapping)
  - Checks context: purchases exist today? → reuse weather/pescheria
  - Validates: all required data present
  - Decides: action=acquisto with complete data
Code: executeAcquisto(data) // just writes to Sheet
```
✅ Flexible - understands natural language
✅ Easy to maintain - logic in prompt
✅ Robust - handles edge cases automatically

## 🧩 Core Components

### 1. Context Awareness
Claude receives rich context with EVERY message:

```javascript
// Today's purchases (for data reuse)
📊 PURCHASES ALREADY REGISTERED TODAY:
  • Cozze: 20kg da pescherie, 2kg venduti a ristoranti → disponibile: 18kg
✅ Weather today: Sole
✅ Pescheria today: Grassano

// Yesterday's remainders (for validation)
📦 REMAINDERS FROM YESTERDAY:
Orate (5kg), Gamberi (3kg)

// Future remainders (for smart restaurant sales)
🔮 FUTURE REMAINDERS:
  • Cozze: 20kg → 22/02/2026 (Grassano)

// Historical data (for pattern recognition)
📈 HISTORICAL CONTEXT (last 7 days):
21/02: 45.5kg (8 types), 20/02: 52.3kg (9 types)...
```

This context enables Claude to:
- **Reuse data**: "Already have weather=Sole today, don't ask again"
- **Validate**: "User wants 25kg remainder but only 18kg available → reject"
- **Optimize**: "Restaurant sale? Check future remainders first"
- **Detect anomalies**: "Excess request for fish with remainders? Impossible!"

### 2. Intent Recognition
Claude analyzes user message and decides which action to execute:

| User Says | Claude Thinks | Action |
|-----------|---------------|--------|
| "comprato 20kg cozze da Brezza" | Purchase registration | ACQUISTO |
| "sono rimaste 5kg orate" | Leftover fish to move | RIMANENZE |
| "venduto 3kg a Brigante" | Restaurant sale | VENDITA_RISTORANTI |
| "richieste in eccesso: 2kg gamberi" | Unsatisfied requests | ECCESSO |
| "no, oggi piove non sole" | Conversational correction | CONVERSAZIONE (no action) |
| "modifica cozze, prezzo 15€" | Explicit update | AGGIORNAMENTO |
| "cancella tutto di oggi" | Bulk deletion | CANCELLAZIONE_MULTIPLA |

### 3. Data Extraction & Normalization
Claude extracts data and normalizes it automatically:

```
User: "COZZE da brezza 20 kg"
Claude extracts:
  - specie: "Cozze" (normalized: first letter uppercase)
  - fornitore: "Brezza" (matched from list, handles typos)
  - kg: 20 (parsed from text)
  - categoria: "Allevamento" (deduced from fish type)
```

### 4. Validation Logic
Claude validates BEFORE executing:

**Example: Remainder Validation**
```
User: "sono rimaste 25kg di cozze"

Claude's reasoning:
1. Check context: Cozze purchased today?
   → YES: 20kg from pescherie
2. Check restaurant sales: any sold?
   → YES: 2kg to Brigante
3. Calculate available: 20kg - 2kg = 18kg
4. Validate: 25kg > 18kg → INVALID
5. Respond: "⚠️ Errore! Hai 20kg acquistati, 2kg venduti = 18kg disponibili.
   Non puoi avere rimanenze di 25kg."
```

**Example: Pescheria Alternation for Remainders**
```
User: "sono rimaste 5kg di orate"
Context: Today's pescheria = Grassano

Claude's reasoning:
1. Fish exists? YES ✅
2. Quantity valid? YES ✅
3. Ask date: "Quando le sposti? (domani = 22/02/2026)"
4. Suggest pescheria with alternation logic:
   "Di solito si alterna: oggi Grassano, domani suggerisco Grottole. Va bene?"
5. User confirms or changes
```

**Example: Pre-Validation (Efficiency)**
```
User: "sono rimaste 10kg di branzino"

Claude's reasoning:
1. Check context: Branzino in today's purchases?
   → NO
2. Don't waste time asking date/pescheria
3. Respond immediately: "⚠️ Branzino non trovato negli acquisti di oggi.
   Registra prima l'acquisto."
```

### 5. Conversational Intelligence
Claude distinguishes between corrections and new data:

**Scenario A: Correction for NEXT Entry (No Action)**
```
User: "20kg cozze da Brezza"
Bot: "Che meteo c'è?"
User: "sole"
Bot: [registers purchase with meteo=Sole]
User: "no, oggi piove non sole"

Claude thinks:
- This is a CORRECTION of what I just asked
- User wants me to use "Pioggia" for NEXT purchase
- NOT an update to existing Sheet row
- Action: CONVERSAZIONE (just acknowledge)

Bot: "✅ Corretto! Userò Pioggia per i prossimi acquisti."
```

**Scenario B: Correction of JUST CREATED Entry (Action Needed)**
```
User: "sono rimaste 10kg cozze"
Bot: "Quando e dove?"
User: "domani, Grassano"
Bot: [creates remainder row]
User: "no, non domani ma 23/02"

Claude thinks:
- This is a CORRECTION of entry I JUST created
- User wants to UPDATE the remainder row
- Action: AGGIORNAMENTO (update Sheet)

Bot: [updates remainder date to 23/02]
```

### 6. Smart Decision Making

**Example: Restaurant Sales Priority**
```
User: "venduto 5kg cozze a Brigante"

Claude's reasoning:
1. Check future remainders: Cozze scheduled for tomorrow?
   → YES: 20kg remainder for 22/02
2. Smart decision: subtract from FUTURE remainder, not today's purchase
3. Why? User already planned to keep that fish, selling it now means less remainder
4. Action: Update future remainder (20kg → 15kg) + create restaurant row

Result: Intelligent inventory management!
```

**Example: Logical Consistency Check**
```
User: "richieste in eccesso: 5kg cozze"

Claude's reasoning:
1. Check yesterday's remainders: Cozze moved to today?
   → YES: 10kg remainder from yesterday
2. Logical check: Fish can't be BOTH leftover AND insufficient
3. This is IMPOSSIBLE scenario
4. Action: WARN user about inconsistency

Bot: "⚠️ Attenzione! Hai rimanenze di Cozze da ieri (10kg spostate a oggi),
ma ora segni eccesso per lo stesso pesce. Questo è incoerente. Verifica i dati."
```

## 📋 Decision Tree

```
User Message
    ↓
┌─────────────────────────────────────┐
│ Claude Analyzes Context             │
│ - Today's purchases                 │
│ - Yesterday's remainders            │
│ - Future remainders                 │
│ - Historical patterns               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Intent Recognition                  │
│ What does user want to do?          │
└─────────────────────────────────────┘
    ↓
    ├─→ ACQUISTO? → Check if first purchase today
    │               → If YES: ask weather/pescheria
    │               → If NO: reuse existing values
    │
    ├─→ RIMANENZE? → Pre-check: fish exists?
    │               → If NO: reject immediately
    │               → If YES: validate quantity ≤ available
    │
    ├─→ VENDITA_RISTORANTI? → Check future remainders first
    │                        → Then check today's purchases
    │                        → Validate quantity available
    │
    ├─→ ECCESSO? → Check for logical inconsistency
    │             → Warn if fish has remainders
    │
    ├─→ AGGIORNAMENTO? → Conversational or explicit?
    │                   → If conversational: just acknowledge
    │                   → If explicit: update Sheet
    │
    ├─→ CANCELLAZIONE? → Single or bulk?
    │                   → If bulk: ALWAYS ask confirmation
    │
    └─→ CONVERSAZIONE? → Just respond, no action
    ↓
┌─────────────────────────────────────┐
│ Data Extraction & Normalization     │
│ - Extract all fields                │
│ - Normalize names (Cozze, Brezza)   │
│ - Deduce missing data (category)    │
│ - Match against valid lists         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Validation                          │
│ - All required fields present?      │
│ - Quantities make sense?            │
│ - Logical consistency?              │
│ - Conflicts with existing data?     │
└─────────────────────────────────────┘
    ↓
    ├─→ Missing data? → Ask user (1 question at a time)
    ├─→ Invalid data? → Explain error, ask correction
    └─→ All valid? → Return action + data
    ↓
┌─────────────────────────────────────┐
│ Simple Executor Function            │
│ - executeAcquisto()                 │
│ - executeRimanenze()                │
│ - executeVenditaRistoranti()        │
│ - executeEccesso()                  │
│ - executeAggiornamento()            │
│ - executeCancellazione()            │
│ - executeCancellazioneMultipla()    │
└─────────────────────────────────────┘
    ↓
Google Sheets Updated
```

## 🎨 Prompt Engineering Techniques

### 1. Structured System Prompt
The prompt is organized in clear sections:
- **Sheet Structure** - Complete column mapping
- **Valid Values** - Lists of allowed values
- **Task Definition** - What Claude needs to do
- **Business Logic** - Detailed rules for each action
- **Communication Style** - How to interact with user
- **Examples** - Real scenarios with correct/incorrect approaches
- **Response Format** - JSON structure for actions

### 2. Rich Context Injection
Every message includes:
- Current date and time
- Today's purchases (full breakdown)
- Yesterday's remainders
- Future remainders
- Historical data (last 7 days)
- Weather and pescheria already set

### 3. Example-Driven Learning
The prompt includes 11 detailed examples showing:
- ✅ Correct approach
- ❌ Wrong approach
- Reasoning behind decisions

Example:
```
EXAMPLE 6 - Remainder Validation (YOU check context):
Context shows: "Cozze: 20kg da pescherie, 2kg venduti → disponibile: 18kg"
User: "sono rimaste 10kg di cozze"
YOU calculate: 10kg ≤ 18kg ✅ OK
You respond: Ask for date and pescheria, then register
✅ RIGHT: YOU validate using context data
```

### 4. Explicit Rules
Critical rules are stated explicitly:
- "METEO AUTO-COPY: Don't ask user, copy automatically"
- "BULK DELETIONS: ALWAYS ask confirmation FIRST!"
- "REMAINDER PRE-CHECK: Verify fish exists BEFORE asking details"

### 5. Response Format Specification
Claude knows exactly how to format responses:
```json
{
  "action": "acquisto",
  "data": {
    "items": [{"specie": "Cozze", "kg": 20, ...}]
  },
  "message": "Confirmation message for user"
}
```

## 🔄 Continuous Learning Loop

```
User Interaction
    ↓
Claude Decision
    ↓
Execution Result
    ↓
User Feedback (implicit or explicit)
    ↓
Conversation History Updated
    ↓
Next Decision Uses This Context
```

The bot maintains conversation history (last 20 messages), allowing Claude to:
- Remember what was just discussed
- Understand corrections in context
- Avoid asking for same data twice
- Build on previous interactions

## 💡 Why This Works

1. **Natural Language Understanding** - Claude is trained on vast amounts of text, understands intent naturally
2. **Context Awareness** - Rich context enables smart decisions
3. **Validation Before Execution** - Prevents 90%+ of errors
4. **Conversational Intelligence** - Distinguishes corrections from new data
5. **Flexibility** - Handles variations, typos, natural language
6. **Maintainability** - Business logic in prompt, easy to update
7. **Robustness** - Handles edge cases automatically

## 🚀 Result

A bot that feels intelligent because it IS intelligent. Claude makes all the hard decisions, code just executes them. This is the future of software: AI as the brain, code as the hands.

---

**Key Insight**: Don't try to code intelligence. Use AI for intelligence, use code for execution. This separation of concerns creates maintainable, robust, and truly intelligent systems.
