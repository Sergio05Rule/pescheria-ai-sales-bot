# 🚀 Deploy and Test Guide

## ⚡ Quick Deploy

### Deploy to Cloudflare Workers
```bash
cd pescheria-bot
npm run deploy
```

### Verify Deployment
```bash
curl https://your-worker.workers.dev/
```

## 📱 Testing on Telegram

### 1. Basic Commands
```
/start
```
Should respond with v2 menu.

### 2. Test First Purchase (MUST ask for weather/pescheria)
```
20kg sogliole da Brezza a 1€, vendo a 10€
```

Expected:
- ✅ Bot asks: "Mi serve ancora: che meteo c'è oggi? E a quale pescheria vanno?"
- ❌ Should NOT assume weather/pescheria
- ❌ Should NOT register without asking

### 3. Test Second Purchase (MUST reuse weather/pescheria)
```
First: "20kg sogliole da Brezza a 1€, vendo a 10€, sole, Grassano"
Second: "10kg cozze da Franco a 5€, vendo a 8€"
```

Expected:
- ✅ Second purchase automatically uses weather="Sole" and pescheria="Grassano"
- ✅ Doesn't ask again
- ✅ Confirms with reused values

### 4. Test Correction (MUST NOT create duplicate)
```
First: "20kg sogliole da Brezza a 1€, vendo a 10€, sole, Grassano"
Then: "oggi piove non sole"
```

Expected:
- ✅ Bot responds: "✅ Corretto! Userò Pioggia per i prossimi acquisti."
- ❌ Should NOT create duplicate purchase
- ❌ Should NOT register as new action
- ✅ Next purchase should use "Pioggia"

### 5. Test Weather/Pescheria Reuse
```
First: "15kg orate da Franco a 10€, vendo a 15€, pioggia, Grottole"
Second: "10kg cozze da Brezza a 5€, vendo a 8€"
```

Expected:
- ✅ Second purchase reuses weather="Pioggia" and pescheria="Grottole"
- ✅ Doesn't ask again

### 4. Test Remainders with Correct Column Logic
```
Purchase: "20kg cozze da Brezza a 5€, vendo a 8€, sole, Grassano"
Remainder: "sono rimaste 10kg di cozze"
```

Expected:
- ✅ OLD ROW (today): Column I (Remainder) = 10kg
- ✅ NEW ROW (tomorrow): Column I (Remainder) = 0
- ✅ NEW ROW: Column F (Qty Purchased) = 10kg
- ✅ Validates: 10kg ≤ purchased
- ✅ Asks destination date and pescheria

### 5. Test Remainder After Restaurant Sale
```
Purchase: "20kg cozze da Brezza a 5€, vendo a 8€, sole, Grassano"
Restaurant: "venduto 2kg cozze a brigante"
Remainder: "sono rimaste 10kg di cozze"
```

Expected:
- ✅ Validates: 10kg ≤ (20kg purchased - 2kg sold) = 18kg available
- ✅ OLD ROW: Column I = 10kg
- ✅ NEW ROW: Column I = 0, Column F = 10kg

### 6. Test Remainder Correction (NOT duplicate)
```
Remainder: "sono rimaste 10kg di cozze"
Bot asks: date and pescheria
User: "domani, Grassano"
Bot: Registers
User: "no, non domani ma 23/02 e Grottole"
```

Expected:
- ✅ Bot recognizes correction
- ✅ Updates existing remainder row (date and pescheria)
- ❌ Should NOT create duplicate remainder
- ✅ Confirms: "✅ Corretto! Aggiornato..."
```
"sono rimaste 5kg di orate"
```

Expected:
- ✅ Validates: 5kg ≤ today's purchases
- ✅ Asks destination date (suggests tomorrow)
- ✅ Asks destination pescheria
- ✅ Uses original name "Orate" (not "orate")
- ✅ Copies prices/category from purchase
- ✅ Supplier = "Rimanenza"
- ✅ Remainder column = 5kg (NOT empty!)
- ✅ Weather column = empty (will be filled when registering purchases for that day)

### 5. Test Flexible Dates
```
When asked for remainder date: "lunedì prossimo"
```

Expected:
- ✅ Converts to DD/MM/YYYY format
- ✅ Correctly calculates next Monday

### 6. Test Restaurant Sales
```
"venduto 3kg cozze a brigante, stesso prezzo"
```

Expected:
- ✅ Subtracts 3kg from original row
- ✅ Creates new row with pescheria="Brigante"
- ✅ Maintains same sale price
- ✅ If future remainders exist, subtracts from there

### 7. Test Excess Requests
```
"richieste in eccesso: 2kg gamberi"
```

Expected:
- ✅ Updates column K (Additional requests)
- ✅ Doesn't create new rows

### 8. Test Excess vs Remainders Validation
```
Day 1: Register purchase "10kg orate"
Day 1: Register remainder "5kg orate" (moved to Day 2)
Day 2: Try to register excess "3kg orate"
```

Expected:
- ✅ Bot warns about logical inconsistency
- ✅ Explains: fish can't be both leftover AND insufficient
- ✅ Asks for clarification

### 9. Test Remainder Validation
```
"rimanenze 50kg orate" (but only purchased 15kg)
```

Expected:
- ✅ Validation error
- ✅ Explains: remainder 50kg > purchase 15kg
- ✅ Asks for correction

### 10. Test Natural Conversation
```
"ciao, come va?"
```

Expected:
- ✅ Responds normally
- ✅ Doesn't attempt to register data

### 11. Test Name Normalization
```
Various messages:
- "COZZE" → "Cozze"
- "cozza" → "Cozze"
- "orate" → "Orate"
```

Expected:
- ✅ All normalized: first letter uppercase

### 12. Test Report
```
/report
```

Expected:
- ✅ Shows all today's purchases
- ✅ Calculates margins per fish
- ✅ Totals: kg, expenses, revenue, margin %

### 13. Test Add Custom Values
```
/aggiungi fornitore Mario
/aggiungi pesce Branzino:Allevamento
/aggiungi pescheria Potenza
/aggiungi meteo Tempesta
```

Expected:
- ✅ Adds to respective lists
- ✅ Fish added with category mapping
- ✅ Confirms addition

## ✅ Complete Checklist

- [ ] Basic purchase works
- [ ] Weather/pescheria reuse works
- [ ] Remainders with validation work
- [ ] Remainder column NOT empty
- [ ] Fish names normalized correctly
- [ ] Flexible dates work
- [ ] Restaurant sales work
- [ ] Excess requests work
- [ ] Excess vs remainders validation works
- [ ] Report works
- [ ] 13:00 reminder works
- [ ] Natural conversations work
- [ ] Custom values (fish, suppliers, etc.) work

## 🐛 Critical Fixes in This Version

### ✅ First Purchase Must Ask for Weather/Pescheria
**Problem:** Bot assumed weather/pescheria even on first purchase
**Solution:** 
- Checks if purchases exist today
- If NO purchases → MUST ask for weather and pescheria
- If purchases exist → Reuses their values
- Clear context message to Claude about this logic

### ✅ Corrections Don't Create Duplicates
**Problem:** When user corrects weather ("oggi piove non sole"), bot created duplicate purchase
**Solution:**
- New action type: "correzione"
- Bot recognizes correction phrases
- Responds conversationally without creating new rows
- Remembers correction for next purchase

### ✅ Empty Remainder Column
**Before:** Column I (Remainders) was empty when moving remainders
**After:** Column I = kg remainders (correct!)

### ✅ Fish Names Not Normalized
**Before:** "cozza" remained "cozza" instead of "Cozze"
**After:** Uses original name from purchase (normalized)

### ✅ Weather Column for Remainders
**Before:** Weather not updated when registering purchases
**After:** Automatically updates weather for all rows of that date, including remainders

### ✅ Excess vs Remainders Logic
**Before:** Could register both remainder and excess for same fish
**After:** Validates logical consistency and warns user

## 📊 What to Check After Deploy

1. **Bot responds?** → Send `/start`
2. **Purchases work?** → Try registering purchase
3. **Sheet updated?** → Check Google Sheet
4. **Names normalized?** → Verify "Cozze" not "cozze"
5. **Remainder column filled?** → Verify not empty
6. **Weather updated?** → Check remainders get weather when registering purchases
7. **Report works?** → Send `/report`
8. **Validations work?** → Try invalid data

## 🎯 First Complete Test Flow

```
1. Purchase:
   "15kg orate da Franco a 10€, vendo a 15€, sole, Grassano"
   
2. Second purchase (reuses weather/pescheria):
   "10kg cozze da Brezza a 5€, vendo a 8€"
   
3. Remainders:
   "sono rimaste 3kg di orate"
   → Bot asks: destination date?
   → You: "domani"
   → Bot asks: pescheria?
   → You: "Grassano"
   
4. Next day - Register purchases:
   "5kg gamberi da Ottavio a 12€, vendo a 18€, pioggia"
   → Check: remainder weather updated to "pioggia"
   
5. Try excess (should warn):
   "eccesso orate 2kg"
   → Bot warns: logical inconsistency (remainders exist)
   
6. Report:
   "/report"
   
7. Verify Sheet:
   - Names: "Orate", "Cozze" (capitalized)
   - Remainders: column I filled
   - Weather: updated for remainders
   - Formulas: working
```

## 🆘 Troubleshooting

### Common Errors

**Error: "Anthropic API"**
→ Verify `ANTHROPIC_API_KEY` is configured

**Error: "Google Sheets"**
→ Verify `GOOGLE_SERVICE_ACCOUNT_JSON` and `SHEET_ID`

**Bot doesn't respond**
→ Verify `TELEGRAM_TOKEN`

**Claude doesn't understand**
→ Prompt too ambiguous, add details

### Useful Logs
```bash
# View all logs
wrangler tail

# Filter errors only
wrangler tail | grep ERROR
```

## 🔧 Environment Variables Required

```
TELEGRAM_TOKEN=your_telegram_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
SHEET_ID=your_google_sheet_id
SHEET_NAME=AIPescheriaBot
```

## 📝 Architecture Notes

### AI-Driven Design
- Claude AI as central orchestrator
- All business logic in prompt
- Simple executor functions
- No manual keyword detection

### Key Features
- Natural language understanding
- Intelligent validation (remainders ≤ purchases)
- Automatic normalization (cozze → Cozze)
- Flexible dates (lunedì prossimo → DD/MM/YYYY)
- Smart data reuse (weather/pescheria)
- Logical consistency checks (excess vs remainders)

---

**Ready for production!** 🎉
