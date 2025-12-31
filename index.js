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

// ---------- Twilio (optional) ----------
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

// Twilio WhatsApp webhook
app.post("/whatsapp/webhook", async (req, res) => {
  console.log("Incoming body:", req.body);

  const from = (req.body.From || "").toString().trim();
  const body = (req.body.Body || "").toString().trim().toLowerCase();

  try {
    let newState = null;

    if (body === "open") newState = true;
    else if (body === "close") newState = false;

    if (newState === null) {
      console.log("Unknown command from", from, "body:", body);

      // Optional help reply
      if (twilioClient && from.startsWith("whatsapp:")) {
        await twilioClient.messages.create({
          from: WHATSAPP_NUMBER,
          to: from,
          body: "Send 'open' or 'close' to control the door.",
        });
      }
    } else {
      await db.doc("doors/mainDoor").set(
        {
          isOpen: newState,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          source: from.startsWith("whatsapp:") ? "whatsapp" : "web-ui",
          from,
        },
        { merge: true }
      );
      console.log("Updated Firestore isOpen to", newState);

      // Confirmation reply back to WhatsApp only
      if (twilioClient && from.startsWith("whatsapp:")) {
        await twilioClient.messages.create({
          from: WHATSAPP_NUMBER,
          to: from,
          body: newState
            ? "The door is now open."
            : "The door is now closed.",
        });
      }
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("error");
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
