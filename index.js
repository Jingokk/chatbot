//
const express = require("express");
const app = express();
const axios = require("axios");
const OpenAI = require("openai");
const dotenv = require("dotenv");
const morgan = require("morgan");
var cors = require("cors");
const bodyParser = require("body-parser");

dotenv.config({ path: "./config.env" });
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI client (Responses API recommended)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms")
);
// ------ 1) Webhook verification (GET) ------
app.get("/webhook", cors(), (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

// ------ 2) Webhook event handler (POST) ------
app.post("/webhook", cors(), async (req, res) => {
  try {
    const body = req.body;

    // Facebook may batch multiple events — iterate
    if (body.object === "page") {
      for (const entry of body.entry) {
        const events = entry.messaging;
        if (!events) continue;
        for (const event of events) {
          const senderId = event.sender?.id;

          // Received a message
          if (event.message && event.message.text && senderId) {
            const userText = event.message.text;

            // Build prompt: include VIOT context + user message
            const prompt = `
You are an assistant for VIOT (www.viot.mn). 
Company: VIOT provides IoT devices and automation services (smart home, office automation). Contact: 72722072.
When answering, be helpful, concise, and include product links from www.viot.mn when relevant.
User question: "${userText}"
Reply in Mongolian.
FAQ:
- Хүргэлт: Улаанбаатар хотод хүргэлт, суурилуулалт хийнэ.
- Баталгаат хугацаа: 6–12 сар (товчилсон).
- Хэрэглэгчээс утас авах үед утас 8 оронтой эсэхийг шалгаад зөрвөл дахин асуу.
`;

            // Call OpenAI Responses API (recommended) - using 'gpt-4o'/'gpt-4o-mini' or other available model
            const aiResp = await openai.responses.create({
              model: "gpt-4o-mini", // choose a model you have access to
              input: prompt,
              // max tokens, temperature, etc., can be added here
            });

            // Responses API often exposes output_text or output[0].content
            const aiText =
              aiResp.output_text ||
              (Array.isArray(aiResp.output) && aiResp.output.length > 0
                ? aiResp.output.map((o) => o.content).join(" ")
                : "Таны асуулт ойлгомжгүй байгаа тул дахин асууна уу.");

            // Send reply back to Facebook Messenger via Send API
            await sendTextMessage(senderId, aiText);
          }

          // (Optional) handle postbacks, quick replies, attachments...
        }
      }
      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// ------ helper: send message to user via Send API ------
async function sendTextMessage(recipientId, text) {
  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const body = {
    recipient: { id: recipientId },
    message: { text: text },
  };
  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Send API error:", resp.status, errText);
  }
}

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
