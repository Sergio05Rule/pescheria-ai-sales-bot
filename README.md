# 🐟 Pescheria Abascia Bot

AI-powered Telegram bot for fish shop inventory management — natural language to Google Sheets via Claude Haiku on Cloudflare Workers.

## 🎯 Features

- **Natural Language Input** — speak Italian naturally, AI understands intent and extracts data
- **Purchase Registration** — auto-deduces category, reuses weather/pescheria from same day
- **Remainder Management** — validates against available stock (FIFO: remainder rows consumed first, then purchases), suggests alternating pescheria; remainders from previous days count as today's inventory
- **Restaurant Sales** — if remainders have been declared (shop closed), takes from remainder stock first and auto-adjusts the future remainder row + col I; if no remainders yet (shop still open), takes from today's inventory. Supports multi-row FIFO distribution
- **Excess Requests** — tracks unsatisfied demand, warns if inconsistent with remainders
- **Updates & Deletes** — conversational corrections or explicit edits, single or bulk deletion
- **Multi-Action Support** — AI can execute multiple operations in a single message (batch updates, deletes, etc.)
- **Daily Reports** — flexible reports by date (any date, even future), via `/report` command or natural language; margins account for waste (scarto) on applicable fish
- **Smart Validation** — AI checks all data against real sheet state before executing (today + next 20 days context)
- **Double Message Protection** — concurrency lock in KV: while processing, all incoming messages are dropped with a "⏳" notification
- **Single-Message Responses** — multi-item operations (purchases, updates, deletes) produce one consolidated message, not one per item
- **Daily Session Reset** — conversation history resets each day, AI re-reads sheet fresh on first interaction
- **Real-Time Writes** — all operations write directly to Google Sheets, no batching or queuing
- **Cost Efficient** — ~$1/month with Claude Haiku 4.5, further reduced by prompt caching

## 🏗️ Architecture

```
User Message (Italian, natural language)
    ↓
Concurrency Guard (KV lock per chat — drops messages while busy)
    ↓
Claude Haiku 4.5 (Orchestrator)
  - Reads full sheet state (real-time)
  - Validates data
  - Decides action (single or multi)
  - Prompt caching: static rules cached 5min, dynamic sheet context sent fresh
    ↓
Simple Executor Functions (no business logic)
    ↓
Google Sheets (direct write, no batching)
```

All business logic lives in the AI prompt. Functions are dumb executors — they just write/update/delete rows. Change behavior by editing the prompt, not the code.

## 🚀 Quick Start

```bash
cd pescheria-bot
npm install
npm run deploy
```

Set environment variables in Cloudflare Workers dashboard:
```
TELEGRAM_TOKEN=...
ANTHROPIC_API_KEY=...
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
SHEET_ID=...
SHEET_NAME=AIPescheriaBot
```

## 🔧 Key Functions

| Function | Purpose |
|----------|---------|
| `callClaudeOrchestrator()` | Reads full sheet, builds context, calls Claude AI |
| `executePurchase()` | Writes purchase rows to Sheet |
| `executeRemainders()` | FIFO distribution across inventory (remainder rows first, then purchases); updates col I + creates new remainder row |
| `executeRestaurantSale()` | FIFO distribution: subtracts from future remainders → today's remainders → purchases; creates restaurant row |
| `executeExcess()` | Updates excess requests column K |
| `executeUpdate()` | Updates any field by PRIMARY KEY (data, pescheria, pesce) |
| `executeDeletion()` | Deletes single row by PRIMARY KEY |
| `executeBulkDeletion()` | Bulk delete with mandatory confirmation |
| `executeReport()` | Generates report for one or more dates (reads sheet in real time, accounts for waste/scarto in margins) |

## 📊 Report & Waste Calculation

Reports (`/report` or natural language) read the sheet in real time and split data into two categories:

- `🐟 Acquisti` — new purchases for that date. Capital is counted, margins calculated with waste deducted.
- `♻️ Rimanenze` — leftover fish moved from a previous day. No capital cost (already paid), only expected revenue shown.

Waste (scarto) is applied to both: `kgVendibili = kg - scarto`. For purchases, remainders (col I) are also subtracted. Rows with identical fish/category/prices are consolidated. The summary shows capital spent (purchases only), total expected revenue (purchases + remainders), remainder value as a separate line, and net margin.

## 📊 Sheet Structure

Columns A-N (O-AB are auto-calculated formulas):

| Col | Field | Required |
|-----|-------|----------|
| A | Date (DD/MM/YYYY) | ✅ |
| B | Pescheria / Restaurant | ✅ |
| C | Fish (normalized) | ✅ |
| D | Supplier | ✅ |
| E | Category | ✅ |
| F | Kg | ✅ |
| G | Purchase price €/kg | ✅ |
| H | Sale price €/kg | ✅ |
| I | Remainder kg | |
| J | Discarded kg | |
| K | Excess requests kg | |
| L | Weather | ✅* |
| M | Notes | |
| N | Waste per kg | |

\* Required for pescherie, empty for remainder rows (auto-filled when purchases registered).

## 💰 Cost

| Messages/day | Monthly | Annual |
|-------------|---------|--------|
| 10 (typical) | ~$1 | ~$13 |
| 30 (busy) | ~$3 | ~$38 |
| 50 (heavy) | ~$5 | ~$63 |

### Comparison with Alternatives

| Solution | Monthly | Annual | Notes |
|----------|---------|--------|-------|
| **This Bot** | ~$1 | ~$13 | Fully automated, AI-powered |
| Manual Google Sheets | $0 | $0 | 1-2 hours/day manual data entry |
| Custom Software | $0 | $0 | $10k-20k development + maintenance |
| SaaS Inventory Tool | $50-200 | $600-2,400 | Limited customization |

Cloudflare Workers, Google Sheets API, and Telegram Bot API are all free tier.

## 🎓 Lessons Learned

1. **AI as Orchestrator works** — complex business logic in a prompt is easier to maintain than scattered if/else chains
2. **Prompt must match model capability** — Haiku needs explicit JSON templates and clear rules; over-compressed prompts lose robustness
3. **Inject real data, not summaries** — AI makes better decisions seeing raw sheet rows vs pre-processed summaries
4. **Functions should be dumb** — executor functions with zero business logic are more reliable and easier to debug
5. **Single API call for context** — one sheet read beats four separate helpers (fewer calls, consistent data)
6. **Parse European numbers** — Google Sheets returns `€ 2,70` format; always strip symbols and convert commas before parsing
7. **Bounded context window** — AI sees today + next 20 days, not the entire sheet history; keeps token usage predictable
8. **Concurrency lock, not dedup** — KV lock per chat drops all messages while one is processing; simpler and more robust than timestamp-based dedup
9. **Reset session daily** — stale conversation history causes AI to hallucinate; daily reset keeps context aligned with real sheet state
10. **Write directly, don't batch** — Google Sheets API is free; batching adds complexity for zero benefit
11. **Prompt caching saves tokens** — static system prompt (rules, actions, formats) is cached for 5 minutes via Anthropic's prompt caching; only the dynamic sheet context is sent fresh each call. During active sessions (multiple messages within 5 min), cached input tokens cost 90% less
12. **Never compare DD/MM/YYYY strings lexicographically** — `"10/3/2026" > "3/3/2026"` is `false` because `"1" < "3"`. Always parse to `Date` objects first. This bug silently broke future remainder detection for dates with day or month ≥ 10
13. **FIFO distribution is mechanical, not decisional** — the AI validates availability and decides the action; executor functions handle the mechanical distribution across multiple rows. This is acceptable "plumbing logic" in dumb executors, not business logic

## 🔮 Next Steps

The bot currently handles day-to-day operations: purchase registration, remainders, restaurant sales, and short-term future orders (20-day window).

Planned: an advanced `/analytics` mode where the AI reads from a separate historical sheet (much larger dataset, full year+) and answers data analytics questions via natural language. Examples:

- "Qual è il pesce più avanzato dell'anno scorso?"
- "Ricavi per pescheria negli ultimi 6 mesi"
- "Mese più forte/debole per margine netto quest'anno"
- "Confronto vendite nette gennaio vs febbraio"
- "Top 5 pesci per profittabilità nel 2025"

This requires a different approach: chunked reads of large sheets, summarization strategies to fit within token limits, and a dedicated analytics prompt optimized for aggregation and comparison queries.

## 📚 Additional Docs

- [PROMPT.md](PROMPT.md) — Deep dive into AI reasoning and decision-making
- [DEPLOY-AND-TEST.md](DEPLOY-AND-TEST.md) — Deployment and testing guide

## 👤 Author

**Sergio Abascia** — [@Sergio05Rule](https://github.com/Sergio05Rule)

## 📄 License

Private project for Pescheria Abascia.
