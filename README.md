# SmartNest Backend

A Node.js backend server for IoT home automation, enabling remote door control through WhatsApp messaging and a web interface backed by Firebase Firestore.

## Features

- **WhatsApp** control for opening and closing the door via Twilio webhook.
- **Persistent** door state stored in Firebase Firestore under `doors/mainDoor`.
- **REST API** endpoints for health check and door state retrieval.
- **Static UI** serving from the `public` directory for a simple web dashboard.
- **Environment-based** configuration using dotenv and Express middleware.

## Tech Stack

- **Runtime**: Node.js with CommonJS modules.
- **Framework**: Express.js for HTTP server and routing.
- **Database**: Firebase Firestore via `firebase-admin`.
- **Messaging**: Twilio WhatsApp API client.
- **Config**: dotenv for environment variables.

## Prerequisites

- Node.js (v14 or higher).
- Firebase project with Firestore enabled and a service account key.
- Twilio account with WhatsApp sandbox or a registered WhatsApp sender.
- Basic understanding of environment variables and webhooks.

## Installation

```bash
git clone https://github.com/darshan-regmi/smartnest-backend.git
cd smartnest-backend
npm install
```

Create a `.env` file in the project root:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
TWILIO_SID=your_twilio_account_sid
TWILIO_TOKEN=your_twilio_auth_token
WHATSAPP_NUMBER=whatsapp:+1234567890
PORT=3000
```

> Note: `FIREBASE_SERVICE_ACCOUNT_JSON` must be a single-line JSON string of your service account credentials.

## Running the Server

```bash
npm start
```

- The server listens on `PORT` (defaults to `3000` if not set).
- On startup it initializes Firebase Admin using the provided service account JSON.

## API Endpoints

### `GET /health`

Health check endpoint for uptime monitoring.

**Response:**

```json
{
  "status": "ok"
}
```

---

### `GET /door-state`

Reads the current door state from Firestore document `doors/mainDoor`.

**Successful response (document exists):**

```json
{
  "exists": true,
  "isOpen": false,
  "lastUpdated": "2024-01-01T12:00:00.000Z",
  "source": "whatsapp"
}
```

**Response when document does not exist:**

```json
{
  "exists": false,
  "isOpen": false,
  "lastUpdated": null,
  "source": null
}
```

---

### `POST /whatsapp/webhook`

Twilio WhatsApp webhook endpoint to control the door via incoming messages.

- Accepts `application/x-www-form-urlencoded` or JSON body.
- Uses `From` and `Body` fields from Twilio’s payload.

**Commands:**

- `open` → sets `isOpen` to `true`.
- `close` → sets `isOpen` to `false`.

On valid command:

- Updates Firestore `doors/mainDoor` with:
  - `isOpen`
  - `lastUpdated` (server timestamp)
  - `source` (`"whatsapp"` or `"web-ui"`)
  - `from` (sender identifier)
- Sends a confirmation message back via WhatsApp:
  - `"The door is now open."` or `"The door is now closed."`

On invalid command:

- Optionally sends a help message:
  - `"Send 'open' or 'close' to control the door."`

## Firestore Schema

Document path: `doors/mainDoor`

```js
{
  isOpen: boolean,
  lastUpdated: Timestamp,
  source: "whatsapp" | "web-ui" | null,
  from: string
}
```

## Static UI

The server serves static files from the `public` directory at the root.

```js
app.use(express.static(path.join(__dirname, "public")));
```

You can place an HTML/JS dashboard there to visualize and control the door state.

## Error Handling

- If `FIREBASE_SERVICE_ACCOUNT_JSON` is missing, the server logs an error and exits.
- Unknown routes return a JSON 404:
  
```json
{
  "error": "not_found"
}
```

- Internal errors in routes return HTTP 500 with a simple error payload.

## License

This project is licensed under the MIT License.

## Author

**Darshan Regmi** – `regmidarshan545@gmail.com`
