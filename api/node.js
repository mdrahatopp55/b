export default async function handler(req, res) {

  // Browser open করলে
  if (req.method === "GET") {
    return res.status(200).send("👑 Kingboss");
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).send("BOT_TOKEN missing");
  }

  const API_FB = "https://ball-livid.vercel.app/api/fbd?id=";
  const API_YT = "https://ball-livid.vercel.app/api/ytd?url=";
  const API_TT = "https://ball-livid.vercel.app/api/tiktokd?id=";

  const update = req.body;
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = msg?.text?.trim() || "";

  if (!chatId) return res.end();

  // Telegram helper
  const tg = (method, data) =>
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

  // /start
  if (text === "/start") {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
`🤖 Video Downloader Bot
👑 Kingboss

✔️ Facebook → video
✔️ TikTok → no watermark
✔️ YouTube → 360p

📌 ≤20MB → Video sent
📌 >20MB → Download link

Send video link`
    });
    return res.end();
  }

  // ===== Detect platform =====
  let platform = "";
  let apiUrl = "";

  if (text.includes("facebook.com") || text.includes("fb.watch")) {
    platform = "fb";
    apiUrl = API_FB + encodeURIComponent(text);
  }
  else if (text.includes("youtube.com") || text.includes("youtu.be")) {
    platform = "yt";
    apiUrl = API_YT + encodeURIComponent(text);
  }
  else if (text.includes("tiktok.com")) {
    platform = "tt";
    apiUrl = API_TT + encodeURIComponent(text);
  }
  else {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Invalid link"
    });
    return res.end();
  }

  // ===== Download animation =====
  const prog = await tg("sendMessage", {
    chat_id: chatId,
    text: "⬇️ Downloading... 0%"
  }).then(r => r.json());

  const steps = ["25%", "50%", "75%", "100%"];
  for (const p of steps) {
    await new Promise(r => setTimeout(r, 500));
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: prog.result.message_id,
      text: `⬇️ Downloading... ${p}`
    });
  }

  try {
    const r = await fetch(apiUrl);
    const data = await r.json();

    // helper: send video or link
    const sendSmart = async (url, caption, sizeBytes) => {
      const MAX = 20 * 1024 * 1024; // 20MB

      if (sizeBytes && sizeBytes <= MAX) {
        await tg("sendVideo", {
          chat_id: chatId,
          video: url,
          caption
        });
      } else {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `${caption}\n\n🔗 Download link:\n${url}`
        });
      }
    };

    // ================= FACEBOOK =================
    if (platform === "fb") {
      const v = data?.download_links?.[0];
      if (!v?.url) throw "FB error";

      await sendSmart(
        v.url,
        "✅ Facebook Video\n👑 Kingboss",
        v.filesize || v.size
      );
      return res.end();
    }

    // ================= TIKTOK =================
    if (platform === "tt") {
      const url = data?.download_url;
      if (!url) throw "TT error";

      await sendSmart(
        url,
        "✅ TikTok No Watermark\n👑 Kingboss",
        data?.size
      );
      return res.end();
    }

    // ================= YOUTUBE =================
    if (platform === "yt") {
      const items = data?.data?.data?.items || [];
      const v = items.find(x => x.ext === "mp4" && x.height === 360);
      if (!v?.url) throw "YT error";

      await sendSmart(
        v.url,
        "✅ YouTube 360p\n👑 Kingboss",
        v.filesize || v.size
      );
      return res.end();
    }

  } catch (e) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "⚠️ Download failed. Try another link."
    });
  }

  res.end();
}
