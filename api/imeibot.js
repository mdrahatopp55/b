const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN_HERE";
const bot = new Telegraf(BOT_TOKEN);

// Disable polling because webhook only
bot.telegram.setWebhook(`https://imei-lemon.vercel.app/api/imeibot`);

bot.start((ctx) => ctx.reply("Welcome! Send me IMEI number"));

// IMEI Handler
bot.on("text", async (ctx) => {
  const imei = ctx.message.text.trim();
  if (!/^\d{15}$/.test(imei)) {
    return ctx.reply("❌ Send valid 15 digit IMEI!");
  }

  await ctx.reply("⏳ Checking IMEI...");

  try {
    const res = await axios.post(
      "https://neir.btrc.gov.bd/services/NEIRPortalService/api/imei-status-check",
      { imei },
      { headers: { "Content-Type": "application/json" }, timeout: 20000 }
    );

    const msg = res.data?.replyMessage?.msg;
    const status =
      msg === "WL"
        ? "🟢 Registered"
        : msg === "NF"
        ? "🔴 Not Registered"
        : "🟡 Unknown";

    return ctx.reply(`IMEI: ${imei}\nStatus: ${status}`);

  } catch (e) {
    return ctx.reply("Server error! Try again later ❌");
  }
});

// ————— Webhook Handler —————
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    await bot.handleUpdate(body);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook Error:", err);
    return res.status(200).send("OK"); // IMPORTANT: always return 200 to Telegram
  }
};
