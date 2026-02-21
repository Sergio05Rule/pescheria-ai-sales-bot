# 🐟 Pescheria Abascia Bot

AI-powered Telegram bot for fish shop inventory management — natural language to Google Sheets via Claude Haiku on Cloudflare Workers.

## 🎯 Features

- **Natural Language Input** — speak Italian naturally, AI understands intent and extracts data
- **Purchase Registration** — auto-deduces category, reuses weather/pescheria from same day
- **Remainder Management** — validates against available stock, suggests alternating pescheria
- **Restaurant Sales** — subtracts from future remainders first, then today's stock
- **Excess Requests** — tracks unsatisfied demand, warns if inconsistent with remainders
- **Updates & Deletes** — conversational corrections or explicit edits, single or bulk deletion
- **Daily Reports** — flexible reports by date (any date, even future), via `/report` command or natural language
- **Smart Validation** — AI checks all data against real sheet state before executing (today + next 20 days context)
- **European Number Parsing** — handles `€ 2,70` and `5,00` formats from Google Sheets
- **Cost Efficient** — ~$1/month with Claude Haiku 4.5

## 🏗️ Architecture

```
User Message (Italian, natural language)
    ↓
Claude Haiku 4.5 (Orchestrator)
  - Understands intent
  - Reads full sheet state
  - Validates data
  - Decides action
    ↓
Simple Executor Functions (no business logic)
    ↓
Google Sheets
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
| `executeRemainders()` | Updates old row col I + creates new remainder row |
| `executeRestaurantSale()` | Subtracts from future remainders first, creates restaurant row |
| `executeExcess()` | Updates excess requests column K |
| `executeUpdate()` | Updates any field by PRIMARY KEY (data, pescheria, pesce) |
| `executeDeletion()` | Deletes single row by PRIMARY KEY |
| `executeBulkDeletion()` | Bulk delete with mandatory confirmation |
| `executeReport()` | Generates report for one or more dates (reads sheet in real time) |

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
