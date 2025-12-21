// ================= MEMORY DB =================
let DB = {
  enabled: true,
  deletes: 0,
  mutes: 0,
  muteLogs: [],
  groups: {}
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  // ========== CONFIG ==========
  const BOT_TOKEN = "8303975726:AAGZiiWDhDreypBMP8F5U2mA88sGB0411co";
  const OWNER_ID = "8160406698";
  const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const upd = req.body;

  // ================= BOT ADMIN ADD NOTIFY =================
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
`🔔 BOT ADDED AS ADMIN

👥 Group: ${chat.title}
🆔 ID: ${chat.id}
⏰ Time: ${new Date().toLocaleString()}`
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
  const username = user.username ? `@${user.username}` : "User";

  // ================= START -> HELP =================
  let cmd = text;
  if (cmd === "/start" || cmd.startsWith("/start@")) cmd = "/help";

  // ================= HELP =================
  if (cmd === "/help" || cmd.startsWith("/help@")) {
    await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
`🤖 BOT HELP

🚫 Link / @mention → Warn + Delete + 2 min mute  
👮 Admin → Ignore  
🆔 /groupid → Group info (admin only)

🧑‍💼 OWNER COMMANDS  
/panel /on /off  
/stats /groups /mutes

⚠️ Bot must be admin  
⚙️ Privacy → OFF`
      })
    });
    return res.end();
  }

  // ================= OWNER PANEL =================
  if (chat.type === "private" && String(userId) === String(OWNER_ID)) {
    let reply = null;

    if (cmd === "/panel") {
      reply =
`🧑‍💼 OWNER CONTROL PANEL

🛡 Protection : ${DB.enabled ? "ON ✅" : "OFF ❌"}

📊 Stats
• Deletes : ${DB.deletes}
• Mutes   : ${DB.mutes}

⚙ Commands
/on   → Enable
/off  → Disable
/stats
/groups
/mutes`;
    }

    if (cmd === "/on") reply = "✅ Protection ENABLED";
    if (cmd === "/off") reply = "❌ Protection DISABLED";

    if (cmd === "/stats") {
      reply =
`📊 BOT STATS

🗑 Deleted : ${DB.deletes}
🔇 Muted  : ${DB.mutes}`;
    }

    if (cmd === "/groups") {
      reply = Object.entries(DB.groups)
        .map(([id, name]) => `• ${name}\n  └ ${id}`)
        .join("\n\n") || "No groups found";
    }

    if (cmd === "/mutes") {
      reply = DB.muteLogs.slice(-10).map(m =>
`👤 ${m.user}
🏷 ${m.chat}
🕒 ${m.start} → ${m.end}`).join("\n\n") || "No mute history";
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

  // ================= BLOCK LINK / @ =================
  const blockRegex = /(https?:\/\/|www\.|t\.me\/|@[a-zA-Z0-9_]{3,})/i;
  if (!blockRegex.test(text)) return res.end();

  // ================= ADMIN CHECK =================
  const member = await fetch(`${API}/getChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, user_id: userId })
  }).then(r => r.json());

  if (["administrator", "creator"].includes(member?.result?.status)) return res.end();

  // ================= WARNING MESSAGE =================
  const warn = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `⚠️ ${username}\n❌ লিংক দিলে আর চুদে দিবো!`
    })
  }).then(r => r.json());

  setTimeout(() => {
    fetch(`${API}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: warn.result.message_id
      })
    });
  }, 5000);

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
  const end = Math.floor(Date.now() / 1000) + 120;

  await fetch(`${API}/restrictChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: userId,
      permissions: { can_send_messages: false },
      until_date: end
    })
  });
  DB.mutes++;

  DB.muteLogs.push({
    user: username,
    chat: chat.title,
    start: new Date().toLocaleString(),
    end: new Date(Date.now() + 120000).toLocaleString()
  });

  res.end();
}
