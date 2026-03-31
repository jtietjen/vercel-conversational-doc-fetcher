# Conversational Document Fetcher

A serverless WhatsApp bot that automatically requests, validates, and stores missing documents from customers — triggered by a single REST call.

Built with **Next.js**, **Twilio WhatsApp**, **Google Gemini Vision**, **Vercel Blob**, and **Upstash Redis**.

---

## How it works

```
Your system          WhatsApp Bot              Customer
    |                     |                       |
    |-- POST /api/trigger->|                       |
    |                     |-- "Hi! Please send --> |
    |                     |    your packing list"  |
    |                     |                       |
    |                     |<-- sends photo --------|
    |                     |                       |
    |                     | [Gemini validates]    |
    |                     |                       |
    |                     |-- "Got it, thanks!" -->|
    |                     |                       |
    |<- GET /api/status   |                       |
    |   returns blobUrl   |                       |
```

1. **Trigger** — your system POSTs a request with customer phone, order ID, and a tracking number
2. **Outreach** — Gemini generates a personalised WhatsApp message; Twilio delivers it
3. **Receive** — customer replies with a photo or PDF of their packing list
4. **Validate** — Gemini Vision checks the document (confidence ≥ 0.7 required)
5. **Store** — validated document is uploaded to Vercel Blob
6. **Poll** — your system fetches `/api/status/:trackingNumber` to get the blob URL and full conversation log

Up to **3 retry attempts** with AI-generated feedback if the document is invalid.

---

## API Reference

### `POST /api/trigger`

Start a conversation with a customer.

**Request body**
```json
{
  "phone": "+491727071518",
  "orderId": "ORD-001",
  "trackingNumber": "TRK-001",
  "customerName": "Max Müller",
  "language": "de"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `phone` | string | yes | Customer phone in E.164 format |
| `orderId` | string | yes | Your order identifier |
| `trackingNumber` | string | yes | Your technical ID for polling |
| `customerName` | string | yes | Used to personalise messages |
| `language` | string | no | BCP-47 language code (default: `en`) |

**Response `200`**
```json
{
  "success": true,
  "phone": "+491727071518",
  "orderId": "ORD-001",
  "trackingNumber": "TRK-001"
}
```

**Response `409`** — active conversation already exists for this phone

---

### `GET /api/status/:trackingNumber`

Poll for conversation status and retrieve the validated document.

**Response**
```json
{
  "trackingNumber": "TRK-001",
  "status": "COMPLETED",
  "orderId": "ORD-001",
  "attempts": 1,
  "triggeredAt": "2026-03-31T10:00:00Z",
  "lastMessageAt": "2026-03-31T10:05:00Z",
  "blobUrl": "https://abc.public.blob.vercel-storage.com/packing-lists/ORD-001/...",
  "conversation": [
    { "role": "system",   "content": "Hallo Max! ...", "timestamp": "..." },
    { "role": "customer", "content": "[document received]", "mediaType": "image/jpeg", "timestamp": "..." },
    { "role": "system",   "content": "Vielen Dank! ...", "timestamp": "..." }
  ]
}
```

| Status | Meaning |
|---|---|
| `PENDING_DOCUMENT` | Waiting for the customer to send a document |
| `COMPLETED` | Document validated and stored — `blobUrl` is set |
| `FAILED` | Customer exhausted all 3 attempts |

---

### `POST /api/webhook`

Twilio webhook endpoint — receives incoming WhatsApp messages. Configure this URL in the Twilio Console.

---

## Setup

### Prerequisites

- [Vercel](https://vercel.com) account
- [Twilio](https://twilio.com) account with WhatsApp sandbox enabled
- [Google AI Studio](https://aistudio.google.com) API key (free tier)

### 1. Clone and install

```bash
git clone https://github.com/jtietjen/vercel-conversational-doc-fetcher.git
cd vercel-conversational-doc-fetcher
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | From [Twilio Console](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | From Twilio Console dashboard |
| `TWILIO_WHATSAPP_FROM` | Sandbox: `whatsapp:+14155238886` |
| `WEBHOOK_URL` | Your deployed URL + `/api/webhook` |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `UPSTASH_REDIS_REST_URL` | Auto-set by Vercel after adding Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Auto-set by Vercel |
| `BLOB_READ_WRITE_TOKEN` | Auto-set by Vercel after adding Blob storage |

### 3. Deploy to Vercel

Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new).

In the Vercel Dashboard:
- **Storage tab** → add **Upstash Redis** and **Vercel Blob**
- **Settings → Environment Variables** → add the Twilio, Webhook, and Gemini vars
- Trigger a redeploy

### 4. Configure Twilio webhook

In [Twilio Console](https://console.twilio.com) → **Messaging → Try it out → Send a WhatsApp message → Sandbox settings**:

Set **"When a message comes in"** to:
```
https://your-app.vercel.app/api/webhook
```
Method: `HTTP POST`

---

## Local development

```bash
npm run dev           # Start dev server on http://localhost:3000
npm run type-check    # TypeScript check
npm run build         # Production build
```

---

## Architecture

```
app/
  api/
    trigger/route.ts          POST  — initiate conversation
    webhook/route.ts          POST  — incoming Twilio messages
    status/[trackingNumber]/  GET   — poll status + conversation log
lib/
  whatsapp.ts     Twilio REST API (send, download, signature verify)
  gemini.ts       Gemini 1.5 Flash (message generation + vision validation)
  storage.ts      Vercel Blob upload
  kv.ts           Upstash Redis — conversation state + tracking index
types/
  index.ts        Shared TypeScript interfaces
```

**Conversation state** is stored in Upstash Redis with a 7-day TTL using two keys per conversation:
- `conv:{phone}` — full state including message log
- `track:{trackingNumber}` → phone — secondary index for polling

---

## License

MIT
