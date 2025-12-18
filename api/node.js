export default async function handler(req, res) {

  // Browser open করলে
  if (req.method === "GET") {
    return res.status(200).send("👑 Kingboss");
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).send("BOT_TOKEN missing");
  }

  // APIs
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
✔️ TikTok → video (no watermark)
✔️ YouTube → download link (360p)

Send video link`
    });
    return res.end();
  }

  let platform = "";
  let apiUrl = "";

  // Platform detect (SAFE)
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
      text: "❌ Invalid link\nSend FB / YT / TikTok link only"
    });
    return res.end();
  }

  try {
    const r = await fetch(apiUrl);
    const data = await r.json();

    // ================= FACEBOOK =================
    if (platform === "fb") {
      const video = data?.download_links?.[0];
      if (!video) throw "FB error";

      await tg("sendVideo", {
        chat_id: chatId,
        video,
        caption: "✅ Facebook Video\n👑 Kingboss"
      });
      return res.end();
    }

    // ================= TIKTOK =================
    if (platform === "tt") {
      const video = data?.download_url;
      if (!video) throw "TT error";

      await tg("sendVideo", {
        chat_id: chatId,
        video,
        caption: "✅ TikTok No Watermark\n👑 Kingboss"
      });
      return res.end();
    }

    // ================= YOUTUBE (LINK ONLY) =================
    if (platform === "yt") {
      const items = data?.data?.data?.items || [];
      const v = items.find(x => x.ext === "mp4" && x.height === 360);

      if (!v?.url) throw "YT error";

      await tg("sendMessage", {
        chat_id: chatId,
        text: `🎬 YouTube 360p Download Link:\n\n${v.url}`
      });
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
