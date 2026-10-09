# Customer assistant (AI chat bubble)

A small chat bubble on the website (`/`) that answers the questions the salon gets over and over: prices, durations, opening hours, where we are, what a treatment feels like, aftercare, whether men can come. It replies in the customer's language and script (Mongolian in Cyrillic or Latin letters, or English). Anything it doesn't know goes to the phone.

Each visitor's chat is **saved**: they can close the page and come back to it, and staff can open it in **Админ → 💬 Чат** and reply themselves (see "Website chat" below).

It is **off by default**. The owner turns it on in **Админ → ⚙️ Тохиргоо → 🤖 Туслах (AI)**.

## How it works

1. A customer types a question in the bubble. The website sends just that message to `POST /api/assistant`; the server adds it to the visitor's saved conversation and takes the last few turns from there (the browser can't send a made-up history).
2. The server checks the switch, the rate limits and the message, then builds the **salon information** fresh from the database:
   - salon name, slogans, address, phones, email, Facebook/Instagram, map link, salon opening hours, weekly closed days, closed dates in the next 30 days, cancellation hours
   - active services (names, descriptions, duration, price)
   - active FAQ answers for the current wallet setting
   - active products, tools and machines (Админ → 🛍 Бүтээгдэхүүн)
   - the owner's notes (pasted Facebook posts, new treatments and products, parking, holiday hours…)
3. It reserves the worst-case cost of the call in the spending ledger, calls the model, then replaces the reservation with the real cost.
4. The reply is shown in the bubble as plain text.

**What the model never sees:** customers, staff, staff hours, bookings, blocks, machines, reviews, app chat messages, other visitors' website chats, notes, photos, transactions, gift cards, promo codes, any other setting, `config.json` secrets, or anything in `.env`. It sees only the current visitor's own conversation. These are not "hidden by the prompt": they are never put into the request, so they cannot leak however the model is asked. The instructions to the model are only a second layer.

Because prices come straight from the database, editing a price in Админ → Үйлчилгээ changes the assistant's answer immediately.

## Turning it on and off

Админ → ⚙️ Тохиргоо → 🤖 Туслах (AI) → tick **Асаах** → Хадгалах. Untick to turn it off; the bubble disappears from the website at once.

Before turning it on, check that services, prices, FAQ and products are real (see `docs/INFO-TO-FILL-IN.md`); the assistant quotes them exactly. The same card shows this month's and today's spend, the number of questions, the model, whether the API key and Telegram are set up, the last error, and a **Туршиж асуух** box to try questions (it works while the switch is off; its cost counts toward the month).

## The spending cap

- **Monthly cap**: `monthlyCapUsd` in `config.json` (default $3). The owner can set their own in the admin card (0.01–100 USD); leaving the field empty goes back to the config value.
- **Daily cap**: `dailyCapUsd` in `config.json` (default $0.50), so one bad day can't use up the month.
- Before every call the server reserves the worst case: input tokens × input price + `maxOutputTokens` × output price. Input tokens are counted pessimistically: the salon's own text (instructions and salon information) as UTF-8 bytes ÷ 2, and everything the customer's browser sends (question and history) as one token per byte, so no crafted message can cost more than its reservation. If the reservation would pass either cap, the call is **not made** and the customer sees "please call us" with the phone and booking buttons. After the call the real cost replaces the reservation.
- If OpenAI gives no usage back (timeout, network error, 5xx), the whole reservation stays charged, because OpenAI may still have billed it. A 401/429/400 is not billed, so nothing is charged.
- The ledger lives in `data/db.json`, so it survives restarts and deploys. Months and days are Ulaanbaatar time, and they only move forward: a server clock stepping back cannot reopen a used-up month.
- **Telegram alerts** go out at 80% and 100% of the monthly cap, when the daily cap is hit, and on API errors (bad key, no credit, timeouts…), at most one error alert an hour. A threshold alert whose Telegram send fails is tried again on the next question. The admin card shows the latest alert and whether it arrived; without Telegram set up, it is shown there only.
- OpenAI's own prepaid credit with auto-recharge off is the second, independent ceiling.

Typical cost: about **$0.0025 at most per short question** on gpt-5.4-nano with today's data (the real cost is lower, especially with prompt caching; a long conversation reserves more). The admin card shows the current worst case.

**Owner notes** (Админ → Тохиргоо → 🤖 Туслах, up to 12,000 characters) are where new information goes: paste a Facebook post about a new treatment or product and press Хадгалах. Where the notes disagree with older data, the assistant follows the notes, and it never makes up a price that isn't written anywhere (it says to call instead). The notes are sent with every question, so customers can get anything written there out of the assistant: never put private information in them. Longer notes make each question a little dearer; the card shows the current worst case per question, and the salon information as a whole is capped at 48 KB (the notes are cut first if it is over).

**Rate limits** count each visitor's IP address as Caddy reports it (IPv6 addresses by /64). This relies on Caddy replacing any `X-Forwarded-For` a visitor sends, which is its default; keep `trusted_proxies` out of the `Caddyfile`, and never expose the app container without Caddy in front. If an IPv6 (AAAA) record is ever added for bguasha.com, check first that Caddy sees real IPv6 addresses (Docker's proxy can make them all look the same, which would put every IPv6 visitor in one bucket).

## Website chat (saved conversations)

- **One conversation per visitor.** The browser keeps a random token; the server keeps the messages (`db.webchats`) and only a hash of the token. "Шинэ яриа" in the bubble starts a fresh one. A visitor signed in on the site is linked to their account, so staff see their name and phone.
- **The AI answers automatically**, through exactly the same knowledge, spending cap and rate limits as before.
- **Staff answer in Админ → 💬 Чат** (owner and staff alike). Website chats are marked 🌐 next to the app chats, with an unread count and "хүлээж байна" when a visitor is waiting for a person.
- **No talking over each other:**
  - a staff reply pauses the AI in that conversation for 2 hours (counted from the last staff reply);
  - **✋ Би хариулъя** pauses it before you start typing, and **🤖 AI-д буцааж өгөх** hands back early;
  - if the AI was still writing when staff answered, its reply is dropped;
  - the visitor sees who wrote what ("AI туслах" or the staff member's first name) and a "staff are answering" line;
  - when the AI resumes it knows what staff said and won't contradict it.
- **When the AI can't answer** (paused, cap reached, no key, an error), the visitor's question is still saved, the visitor is told staff will reply here or to call, and staff get a Telegram message ("a visitor is waiting", no message text; at most once per conversation per 30 minutes and 10 an hour).
- **Polling:** the open bubble checks for new messages every 8 s, a closed one every 60 s (for the unread badge).
- **Storage limits:** conversations idle for 90 days are deleted; one conversation keeps its last 200 messages; all website chats together are capped at about 2 million characters (oldest go first). The owner can delete a conversation (🗑). Conversations are personal data: they are in the admin backup, and the switch turning off closes the bubble but keeps them for staff.

## Changing the model

Edit the `assistant` block in `config.json`: change `model` **and** `priceUsdPerMTok` together (input, cached input and output, in USD per 1 million tokens, from https://developers.openai.com/api/docs/pricing). Wrong prices make the cap wrong. Set `reasoningEffort` to the lowest value the model supports (`none` for gpt-5.4-nano and gpt-5.4-mini) or `null` to leave it out. Then deploy:

```bash
git pull && docker compose up -d --build
```

Other settings in the block: `maxOutputTokens` (reply length, 400), `maxMessageChars` (500), `historyTurns` (6), `perIpPerHour` (20), `globalPerMinute` (30).

## Environment variables (`.env` on the server, never in git)

| Variable | What |
|---|---|
| `OPENAI_API_KEY` | API key from a separate OpenAI project for the salon. Without it the bubble shows "call us". |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather, for alerts. |
| `TELEGRAM_CHAT_ID` | Your chat ID with that bot. |
| `ASSISTANT_MOCK` | `1` = canned answers, no OpenAI calls (testing only). Leave unset in production. |
| `OPENAI_BASE_URL`, `TELEGRAM_API_BASE`, `ASSISTANT_TIMEOUT_MS` | Used by the tests to point at a fake server. Leave unset. |

After editing `.env`, recreate the container (a plain restart does not reload `.env`): `docker compose up -d --build`.

## Reply language

The server decides the reply language from the customer's message: Mongolian, whether typed in Cyrillic or in Latin letters ("une hed ve", "heden tsagt haah ve"), is answered in **Cyrillic Mongolian**; English is answered in English. The detection uses word lists in `assistant.js` (`detectLanguage`); a Latin-letter message with no clear English or Mongolian words counts as Mongolian when it has double vowels (uu, ii, aa, oo).

The instructions in `assistant.js` (`INSTRUCTIONS`) also contain five example spellings so the model understands Latin-letter questions. **They are made up.** Replace them with real spellings copied from the salon's Facebook messages, then run the eval again.

## The eval

`scripts/assistant-eval.json` holds about 45 test questions (prices in Cyrillic, the same in messy Latin letters, English, things not in the data, medical, off-topic, prompt injection), each with what a good answer does. The script sends them through the running server (same budget and caps, so the spend counts toward the month) and writes a report to `data/eval/`:

```bash
docker compose exec app node scripts/assistant-eval.js
docker compose exec app node scripts/assistant-eval.js --only latin_mongolian,injection
```

It refuses to start if the worst-case estimate for the chosen questions is over $0.20, and prints the real cost at the end. On gpt-5.4-nano the full set's worst case is about $0.11; on gpt-5.4-mini it is about $0.42, so the mini run has to be split into parts with `--only <category>`.

## Tests

`npm test` covers the whitelist (planted private data must never reach the model), cost accounting, the caps (including parallel requests and restarts), alerts, rate limits, input checks, error handling and access rights. The tests use a fake OpenAI/Telegram server and strip real keys from the environment, so they never call the real APIs.

## Last error codes in the admin card

| Code | Meaning |
|---|---|
| `401 invalid_api_key` | The key in `.env` is wrong or revoked. |
| `429 insufficient_quota` | OpenAI credit is used up: top up, or wait for the next month. |
| `429 …` | OpenAI rate limit; usually passes by itself. |
| `5xx`, `timeout`, `network` | OpenAI or the connection had a problem. |
| `max_output_tokens` | A reply was cut off; raise `maxOutputTokens` a little if this repeats. |
| `4xx` other | The request was refused, often a wrong model name in `config.json`. |
