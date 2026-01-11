require("dotenv").config();

const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const twilio = require("twilio");

const app = express();

// ---------- Middleware ----------
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // serve UI

// ---------- Firebase Admin ----------
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  ),
});

const db = admin.firestore();

// ---------- Twilio ----------
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER;

const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

// ---------- Routes ----------

// Health check for UI
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Read current door state for UI
app.get("/door-state", async (req, res) => {
  try {
    const snap = await db.doc("doors/mainDoor").get();
    if (!snap.exists) {
      return res.status(200).json({
        exists: false,
        isOpen: false,
        lastUpdated: null,
        source: null,
      });
    }
    const data = snap.data();
    res.status(200).json({
      exists: true,
      isOpen: !!data.isOpen,
      lastUpdated: data.lastUpdated ? data.lastUpdated.toDate() : null,
      source: data.source || null,
    });
  } catch (err) {
    console.error("Error reading door state:", err);
    res.status(500).json({ error: "failed_to_read_state" });
  }
});

// Twilio WhatsApp webhook - FIXED VERSION
app.post("/whatsapp/webhook", async (req, res) => {
  console.log("Incoming body:", req.body);

  const rawFrom = req.body.From;
  console.log("Raw From:", JSON.stringify(rawFrom));

  const from = (rawFrom || "").toString().trim();
  const body = (req.body.Body || "").toString().trim().toLowerCase();

  console.log("twilioClient is", twilioClient ? "configured" : "null");

  try {
    let newState = null;

    if (body === "open") newState = true;
    else if (body === "close") newState = false;

    // Check if this is WhatsApp (works with sandbox)
    const isWhatsapp = from.toLowerCase().includes("whatsapp");

    if (newState === null) {
      console.log("Unknown command from", from, "body:", body);

      // Help reply
      if (twilioClient && isWhatsapp) {
        await twilioClient.messages.create({
          from: WHATSAPP_NUMBER,
          to: from,
          body: "Send 'open' or 'close' to control the door.",
        });
      }

      // Structured JSON error response to Twilio
      return res.status(400).json({
        ok: false,
        error: "unknown_command",
        message: "Send 'open' or 'close' to control the door.",
        currentState: null,
      });
    }

    // Update Firestore
    await db.doc("doors/mainDoor").set(
      {
        isOpen: newState,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        source: isWhatsapp ? "whatsapp" : "web-ui",
        from,
      },
      { merge: true }
    );
    console.log("Updated Firestore isOpen to", newState);

    // Confirmation reply back to WhatsApp
    const stateMsg = newState
      ? "The door is now open."
      : "The door is now closed.";

    if (twilioClient && isWhatsapp) {
      await twilioClient.messages.create({
        from: WHATSAPP_NUMBER,
        to: from,
        body: stateMsg,
      });
    }

    // Structured JSON success response to Twilio
    res.status(200).json({
      ok: true,
      isOpen: newState,
      message: stateMsg,
      currentState: newState,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({
      ok: false,
      error: "internal_error",
      message: "Something went wrong, please try again.",
    });
  }
});

// 404 for unknown API routes
app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
