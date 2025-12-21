// ================== SIMPLE MEMORY DB ==================
let DB = {
  enabled: true,
  deletes: 0,
  mutes: 0,
  muteLogs: [],   // {user, chat, start, end}
  groups: {}
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  // ========== CONFIG ==========
  const BOT_TOKEN = "8303975726:AAGZiiWDhDreypBMP8F5U2mA88sGB0411co";
  const OWNER_ID = "8160406698";
  const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const upd = req.body;

  // ========== BOT ADMIN ADD NOTIFY ==========
  if (upd.my_chat_member) {
    const chat = upd.my_chat_member.chat;
    const newStatus = upd.my_chat_member.new_chat_member?.status;

    if (newStatus === "administrator") {
      DB.groups[chat.id] = chat.title || "No title";

      await fetch(`${API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: OWNER_ID,
          text:
            `🔔 BOT ADMIN ADDED\n\n` +
            `• Group: ${chat.title}\n` +
            `• Group ID: ${chat.id}\n` +
            `• Time: ${new Date().toLocaleString()}`
        })
      });
    }
    return res.end();
  }

  const msg = upd.message || upd.edited_message;
  if (!msg) return res.end();

  const chat = msg.chat;
  const chatId = chat.id;
  const text = msg.text || "";
  const user = msg.from;
  const userId = user.id;
  const username = user.username ? `@${user.username}` : "user";

  // ========== OWNER PANEL ==========
  if (chat.type === "private" && String(userId) === String(OWNER_ID)) {
    let reply = null;

    if (text === "/start") text = "/help";

    if (text === "/help") {
      reply =
`🤖 BOT HELP

👥 GROUP
• Link / @mention → delete
• Member → 2 min mute
• Admin → ignore
• /groupid (admin)

🧑‍💼 OWNER
• /panel
• /stats
• /mutes
• /groups
• /on /off`;
    }

    if (text === "/panel") {
      reply =
`🧑‍💼 PANEL

• Protection: ${DB.enabled ? "ON ✅" : "OFF ❌"}
• Deletes: ${DB.deletes}
• Mutes: ${DB.mutes}`;
    }

    if (text === "/on") {
      DB.enabled = true;
      reply = "✅ Protection ON";
    }

    if (text === "/off") {
      DB.enabled = false;
      reply = "❌ Protection OFF";
    }

    if (text === "/stats") {
      reply =
`📊 STATS

• Total Deletes: ${DB.deletes}
• Total Mutes: ${DB.mutes}`;
    }

    if (text === "/groups") {
      reply = Object.entries(DB.groups)
        .map(([id, name]) => `• ${name} (${id})`)
        .join("\n") || "No groups";
    }

    if (text === "/mutes") {
      reply = DB.muteLogs.slice(-10).map(m =>
        `👤 ${m.user}\n• Group: ${m.chat}\n• Start: ${m.start}\n• End: ${m.end}`
      ).join("\n\n") || "No mute data";
    }

    if (reply) {
      await fetch(`${API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply })
      });
    }
    return res.end();
  }

  // ========== GROUP ONLY ==========
  if (!DB.enabled) return res.end();
  if (!["group", "supergroup"].includes(chat.type)) return res.end();

  // ========== /groupid ==========
  if (text === "/groupid") {
    const m = await fetch(`${API}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    }).then(r => r.json());

    if (!["administrator", "creator"].includes(m?.result?.status)) {
      return res.end();
    }

    const r = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
`👥 GROUP INFO

• Name: ${chat.title}
• ID: ${chatId}
• Type: ${chat.type}`
      })
    }).then(r => r.json());

    setTimeout(() => {
      fetch(`${API}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: r.result.message_id
        })
      });
    }, 10000);

    return res.end();
  }

  // ========== BLOCK REGEX (link + @mention) ==========
  const blockRegex = /(https?:\/\/|www\.|t\.me\/|@[a-zA-Z0-9_]{3,})/i;
  if (!blockRegex.test(text)) return res.end();

  // ========== ADMIN CHECK ==========
  const member = await fetch(`${API}/getChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: userId })
  }).then(r => r.json());

  if (["administrator", "creator"].includes(member?.result?.status)) {
    return res.end();
  }

  // ========== DELETE MESSAGE ==========
  await fetch(`${API}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: msg.message_id
    })
  });
  DB.deletes++;

  // ========== MUTE 2 MIN ==========
  const start = new Date();
  const until = Math.floor(Date.now() / 1000) + 120;
  const end = new Date(Date.now() + 120000);

  await fetch(`${API}/restrictChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: userId,
      permissions: { can_send_messages: false },
      until_date: until
    })
  });
  DB.mutes++;

  DB.muteLogs.push({
    user: username,
    chat: chat.title,
    start: start.toLocaleString(),
    end: end.toLocaleString()
  });

  res.end();
}
