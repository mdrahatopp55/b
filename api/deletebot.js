// ================= MEMORY DB =================
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
`🔔 BOT ADMIN ADDED

• Group: ${chat.title}
• Group ID: ${chat.id}
• Time: ${new Date().toLocaleString()}`
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

  // ================= /start -> /help (ALL CHAT) =================
  let cmd = text;
  if (cmd === "/start" || cmd.startsWith("/start@")) {
    cmd = "/help";
  }

  // ================= HELP (ALL CHAT) =================
  if (cmd === "/help" || cmd.startsWith("/help@")) {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
`🤖 BOT HELP

👥 GROUP
• Link / @mention → delete
• Member → 2 min mute
• Admin → ignore
• /groupid (admin)

🧑‍💼 OWNER
• /panel /on /off
• /stats /mutes /groups

ℹ️ Note
• Bot must be admin
• BotFather → Privacy OFF`
      })
    });
    return res.end();
  }

  // ================= OWNER PANEL =================
  if (chat.type === "private" && String(userId) === String(OWNER_ID)) {
    let reply = null;

    if (cmd === "/panel") {
      reply =
`🧑‍💼 PANEL

• Protection: ${DB.enabled ? "ON ✅" : "OFF ❌"}
• Deletes: ${DB.deletes}
• Mutes: ${DB.mutes}`;
    }

    if (cmd === "/on") reply = (DB.enabled = true, "✅ Protection ON");
    if (cmd === "/off") reply = (DB.enabled = false, "❌ Protection OFF");

    if (cmd === "/stats") {
      reply =
`📊 STATS
• Deletes: ${DB.deletes}
• Mutes: ${DB.mutes}`;
    }

    if (cmd === "/groups") {
      reply = Object.entries(DB.groups)
        .map(([id, name]) => `• ${name} (${id})`)
        .join("\n") || "No groups";
    }

    if (cmd === "/mutes") {
      reply = DB.muteLogs.slice(-10).map(m =>
`👤 ${m.user}
• Group: ${m.chat}
• Start: ${m.start}
• End: ${m.end}`).join("\n\n") || "No mute data";
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

  // ================= GROUP ONLY =================
  if (!DB.enabled) return res.end();
  if (!["group", "supergroup"].includes(chat.type)) return res.end();

  // ================= /groupid =================
  if (cmd === "/groupid" || cmd.startsWith("/groupid@")) {
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

  // ================= BLOCK (LINK + @MENTION) =================
  const blockRegex = /(https?:\/\/|www\.|t\.me\/|@[a-zA-Z0-9_]{3,})/i;
  if (!blockRegex.test(text)) return res.end();

  // ================= ADMIN CHECK =================
  const member = await fetch(`${API}/getChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: userId })
  }).then(r => r.json());

  if (["administrator", "creator"].includes(member?.result?.status)) {
    return res.end();
  }

  // ================= DELETE MESSAGE =================
  await fetch(`${API}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: msg.message_id
    })
  });
  DB.deletes++;

  // ================= MUTE 2 MIN =================
  const start = new Date();
  const end = new Date(Date.now() + 120000);
  const until = Math.floor(end.getTime() / 1000);

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
