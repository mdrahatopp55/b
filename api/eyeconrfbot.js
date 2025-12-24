import fetch from "node-fetch";

// ================== ENV CONFIG ==================
const BOT_TOKEN = process.env.BOT_TOKEN;      // set in Vercel
const ADMIN_ID = Number(process.env.ADMIN_ID);

// ================== TELEGRAM HELPER ==================
const tg = (method, data) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(r => r.json());

// ================== NUMBER NORMALIZE ==================
function normalizeNumber(num) {
  if (num.startsWith("880")) return "0" + num.slice(3);
  return num;
}

// ================== CARRIER DETECT ==================
function getCarrier(num) {
  if (num.startsWith("019")) return "Banglalink";
  if (num.startsWith("018")) return "Robi";
  if (num.startsWith("016")) return "Airtel";
  if (num.startsWith("017")) return "Grameenphone";
  if (num.startsWith("013")) return "Grameenphone";
  if (num.startsWith("015")) return "Teletalk";
  return "Unknown";
}

// ================== VERCEL HANDLER ==================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("🤖 Bot is running");
  }

  try {
    const update = req.body;
    const msg = update?.message;
    if (!msg || !msg.text) return res.end();

    const chatId = msg.chat.id;
    const chatType = msg.chat.type;
    const text = msg.text.trim();
    const from = msg.from;

    // /start
    if (text === "/start") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "🤖 Bot ON ✅\n\n📌 শুধু নাম্বার পাঠাও",
      });
      return res.end();
    }

    // only number allow
    if (!/^\d{10,15}$/.test(text)) return res.end();

    // admin only (private)
    if (chatType === "private" && from.id !== ADMIN_ID) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "⛔ Only admin can use this bot",
      });
      return res.end();
    }

    const number = normalizeNumber(text);
    const carrier = getCarrier(number);

    // ================== API CALL ==================
    const apiUrl = `https://ball-livid.vercel.app/api/eyacon?number=88${number}`;
    const apiRes = await fetch(apiUrl);
    const apiJson = await apiRes.json();

    const name = apiJson?.data?.length
      ? apiJson.data.map(x => x.name).join(", ")
      : "Not Found";

    const waLink = `https://wa.me/+880${number.slice(1)}`;
    const tgLink = `https://t.me/+88${number}`;

    // ================== USER REPLY ==================
    await tg("sendMessage", {
      chat_id: chatId,
      parse_mode: "Markdown",
      text: `
📞 *Phone Number Information*
━━━━━━━━━━━━━━━━━━
📱 *Number:* ${number}
🌍 *Country:* Bangladesh
📡 *Operator:* ${carrier}
━━━━━━━━━━━━━━━━━━
👁️ *Eyecon*
└─ *Name:* ${name}
━━━━━━━━━━━━━━━━━━
✨ *Credit*
• @bdkingboss
• @topnormalperson
• https://t.me/Rfcyberteam
`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📲 WhatsApp", url: waLink },
            { text: "✈️ Telegram", url: tgLink },
          ],
        ],
      },
    });

    // ================== ADMIN LOG ==================
    await tg("sendMessage", {
      chat_id: ADMIN_ID,
      parse_mode: "Markdown",
      text: `
📡 *API LOG*
━━━━━━━━━━━━
📱 ${number}
📡 ${carrier}
👁️ ${name}
👤 ${from.first_name} (${from.id})
💬 ${chatType}
`,
    });

    return res.end("OK");
  } catch (err) {
    console.log("BOT ERROR:", err.message);
    return res.end();
  }
}
