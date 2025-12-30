require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ---- Firebase Admin ----
// Service account JSON comes from env: FIREBASE_SERVICE_ACCOUNT_JSON
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  ),
});

const db = admin.firestore();

// ---- Twilio ----
// from env (.env locally, dashboard vars in hosting)
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER; // e.g. "whatsapp:+14155238886"

console.log("Twilio SID set:", !!accountSid);
console.log("WhatsApp number:", WHATSAPP_NUMBER);

const twilioClient = twilio(accountSid, authToken);

// Twilio WhatsApp webhook
app.post("/whatsapp/webhook", async (req, res) => {
  console.log("Incoming body:", req.body);

  const from = (req.body.From || "").trim();
  const body = (req.body.Body || "").trim().toLowerCase();

  try {
    let newState = null;

    if (body === "open") newState = true;
    else if (body === "close") newState = false;

    if (newState === null) {
      console.log("Unknown command from", from, "body:", body);
      // You can optionally send a Twilio reply here later
    } else {
      await db.doc("doors/mainDoor").set(
        {
          isOpen: newState,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          source: "whatsapp",
          from,
        },
        { merge: true }
      );
      console.log("Updated Firestore isOpen to", newState);

      // Optional Twilio confirmation reply (uncomment after Twilio is fully set):
      // await twilioClient.messages.create({
      //   from: WHATSAPP_NUMBER,
      //   to: from,
      //   body: newState ? "Door opened ✅" : "Door closed 🔒",
      // });
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
