# 🐟 Pescheria Abascia Bot

AI-powered Telegram bot for fish shop inventory management — natural language to Google Sheets via Claude Haiku on Cloudflare Workers.

## Architecture

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

All business logic lives in the AI prompt. Functions are dumb executors — they just write/update/delete rows. This makes the system easy to maintain: change behavior by editing the prompt, not the code.

## What It Does

- **Purchases** — "20kg spigole da Pinuccio a 8.80€, vendo a 13€" → registers with auto-deduced category, reuses weather/pescheria from same day
- **Remainders** — "sono rimaste 5kg di orate" → validates against available stock, suggests alternating pescheria, creates tomorrow's row
- **Restaurant Sales** — "venduto 3kg cozze a Brigante" → subtracts from future remainders first, then today's stock
- **Excess Requests** — "richieste in eccesso: 2kg gamberi" → updates column, warns if inconsistent with remainders
- **Updates & Deletes** — conversational corrections ("no, piove") or explicit ("modifica prezzo cozze a 15€"), single or bulk deletion with confirmation

## Quick Start

```bash
cd pescheria-bot
npm install
npm run deploy
```

Environment variables (Cloudflare Workers dashboard):
```
TELEGRAM_TOKEN=...
ANTHROPIC_API_KEY=...
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
SHEET_ID=...
SHEET_NAME=...
```

## Sheet Structure

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

## Cost

~$1/month at 10 messages/day with Claude Haiku 4.5. Everything else is free (Cloudflare Workers, Google Sheets API, Telegram).

| Messages/day | Monthly | Annual |
|-------------|---------|--------|
| 10 | $1 | $13 |
| 30 | $3 | $38 |
| 50 | $5 | $63 |

## Lessons Learned

1. **AI as Orchestrator works** — complex business logic in a prompt is easier to maintain than scattered if/else chains
2. **Prompt needs to match model capability** — Haiku needs explicit JSON templates and clear rules; compressed prompts lose robustness
3. **Inject real data, not summaries** — AI makes better decisions when it sees raw sheet rows vs pre-processed summaries
4. **Functions should be dumb** — executor functions with zero business logic are more reliable and easier to debug
5. **Single API call for context** — one sheet read beats four separate helper functions (fewer API calls, consistent data)
6. **Concise output saves money** — max_tokens=512 + "be concise" instruction cuts output costs ~75%

## Author

**Sergio Abascia** — [@Sergio05Rule](https://github.com/Sergio05Rule)

## License

Private project for Pescheria Abascia.
