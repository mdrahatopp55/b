// ================= GLOBAL STATE =================
let BOT_ENABLED = true;

// Dynamic API storage
let APIS = {
  fb: {
    name: "Facebook",
    url: "https://ball-livid.vercel.app/api/fbd?id=",
    enabled: true
  },
  yt: {
    name: "YouTube",
    url: "https://ball-livid.vercel.app/api/ytd?url=",
    enabled: true
  },
  tt: {
    name: "TikTok",
    url: "https://ball-livid.vercel.app/api/tiktokd?id=",
    enabled: true
  }
};

const USERS = new Set();
const CANCELLED = new Set();

// ================= HANDLER =================
export default async function handler(req, res) {

  // ===== Browser view =====
  if (req.method === "GET") {
    return res.status(200).send("👑 Kingboss");
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_ID = process.env.ADMIN_ID;
  if (!BOT_TOKEN || !ADMIN_ID) {
    return res.status(500).send("ENV missing");
  }

  const update = req.body;

  const tg = (method, data) =>
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

  // ================= CALLBACK (Cancel + Admin) =================
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const userId = cb.from.id;
    const data = cb.data;

    // ---- Cancel download ----
    if (data === "cancel") {
      CANCELLED.add(msgId);
      await tg("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: "❌ Download Cancelled"
      });
      await tg("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Cancelled"
      });
      return res.end();
    }

    // ---- Admin only ----
    if (String(userId) !== String(ADMIN_ID)) {
      await tg("answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "⛔ Admin only",
        show_alert: true
      });
      return res.end();
    }

    // ---- Bot ON/OFF ----
    if (data === "bot_on") BOT_ENABLED = true;
    if (data === "bot_off") BOT_ENABLED = false;

    // ---- Toggle API ----
    if (data.startsWith("toggle_")) {
      const k = data.replace("toggle_", "");
      if (APIS[k]) APIS[k].enabled = !APIS[k].enabled;
    }

    // ---- Delete API ----
    if (data.startsWith("del_")) {
      const k = data.replace("del_", "");
      delete APIS[k];
    }

    await tg("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "👑 Admin Panel – Full API Control",
      reply_markup: adminKeyboard()
    });

    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return res.end();
  }

  // ================= MESSAGE =================
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const userId = msg?.from?.id;
  const text = msg?.text?.trim() || "";
  if (!chatId) return res.end();

  USERS.add(userId);

  // ================= ADMIN PANEL =================
  if (text === "/admin") {
    if (String(userId) !== String(ADMIN_ID)) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ Admin only" });
      return res.end();
    }

    await tg("sendMessage", {
      chat_id: chatId,
      text: "👑 Admin Panel – Full API Control",
      reply_markup: adminKeyboard()
    });
    return res.end();
  }

  // ================= ADD / EDIT API =================
  // /addapi key Name https://apiurl?id=
  if (text.startsWith("/addapi") && String(userId) === String(ADMIN_ID)) {
    const [, key, name, url] = text.split(" ");
    if (!key || !name || !url) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Usage:\n/addapi key Name URL"
      });
      return res.end();
    }
    APIS[key] = { name, url, enabled: true };
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ API added: ${name}`
    });
    return res.end();
  }

  // /editapi key https://newurl?id=
  if (text.startsWith("/editapi") && String(userId) === String(ADMIN_ID)) {
    const [, key, url] = text.split(" ");
    if (!APIS[key]) {
      await tg("sendMessage", { chat_id: chatId, text: "❌ API not found" });
      return res.end();
    }
    APIS[key].url = url;
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✏️ API updated: ${APIS[key].name}`
    });
    return res.end();
  }

  // ================= BOT OFF =================
  if (!BOT_ENABLED) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⛔ Bot under maintenance"
    });
    return res.end();
  }

  // ================= START =================
  if (text === "/start") {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
`🤖 Video Downloader Bot
👑 Kingboss

Send Facebook / YouTube / TikTok link`
    });
    return res.end();
  }

  // ================= DETECT API =================
  let apiKey = null;
  for (const k in APIS) {
    if (text.toLowerCase().includes(k) && APIS[k].enabled) {
      apiKey = k;
      break;
    }
  }

  if (!apiKey) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Unsupported or disabled service"
    });
    return res.end();
  }

  // ================= PROGRESS =================
  const prog = await tg("sendMessage", {
    chat_id: chatId,
    text: "⬇️ Downloading... 0%",
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Cancel Download", callback_data: "cancel" }]]
    }
  }).then(r => r.json());

  const steps = ["15%", "40%", "65%", "85%", "100%"];
  for (const p of steps) {
    await new Promise(r => setTimeout(r, 500));
    if (CANCELLED.has(prog.result.message_id)) {
      CANCELLED.delete(prog.result.message_id);
      return res.end();
    }
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: prog.result.message_id,
      text: `⬇️ Downloading... ${p}`,
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel Download", callback_data: "cancel" }]]
      }
    });
  }

  // ================= DOWNLOAD =================
  const r = await fetch(APIS[apiKey].url + encodeURIComponent(text));
  const data = await r.json();

  let video =
    data?.download_links?.[0] ||
    data?.download_url ||
    data?.data?.data?.items?.find(v => v.ext === "mp4" && v.height === 360)?.url;

  if (!video) {
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: prog.result.message_id,
      text: "⚠️ Download failed"
    });
    return res.end();
  }

  await tg("sendVideo", {
    chat_id: chatId,
    video,
    caption: `✅ ${APIS[apiKey].name} Download\n👑 Kingboss`
  });

  await tg("deleteMessage", {
    chat_id: chatId,
    message_id: prog.result.message_id
  });

  res.end();

  // ================= ADMIN KEYBOARD =================
  function adminKeyboard() {
    return {
      inline_keyboard: [
        [{ text: `⚙️ Bot ${BOT_ENABLED ? "ON" : "OFF"}`, callback_data: BOT_ENABLED ? "bot_off" : "bot_on" }],
        ...Object.keys(APIS).map(k => ([
          { text: `${APIS[k].enabled ? "❌" : "✅"} ${APIS[k].name}`, callback_data: `toggle_${k}` },
          { text: "🗑️ Delete", callback_data: `del_${k}` }
        ]))
      ]
    };
  }
}
