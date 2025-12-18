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
  const text = msg?.text || "";

  if (!chatId) return res.end();

  // Telegram helper
  const tg = async (method, data) => {
    return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  };

  // /start
  if (text === "/start") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "🤖 Video Downloader Bot\n👑 Kingboss\n\nSend FB / YT / TikTok link"
    });
    return res.end();
  }

  let apiUrl = "";
  let platform = "";

  // ✅ CORRECT DETECTION
  if (text.includes("facebook.com") || text.includes("fb.watch")) {
    apiUrl = API_FB + encodeURIComponent(text);
    platform = "fb";
  }
  else if (text.includes("youtube.com") || text.includes("youtu.be")) {
    apiUrl = API_YT + encodeURIComponent(text);
    platform = "yt";
  }
  else if (text.includes("tiktok.com")) {
    apiUrl = API_TT + encodeURIComponent(text);
    platform = "tt";
  }
  else {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Invalid video link"
    });
    return res.end();
  }

  try {
    const r = await fetch(apiUrl);
    const data = await r.json();

    let videoUrl = null;

    // ✅ FACEBOOK
    if (platform === "fb") {
      videoUrl = data?.download_links?.[0];
    }

    // ✅ YOUTUBE (360p mp4 with audio)
    if (platform === "yt") {
      const items = data?.data?.data?.items || [];
      const v = items.find(
        x => x.ext === "mp4" && x.height === 360
      );
      videoUrl = v?.url;
    }

    // ✅ TIKTOK (no watermark)
    if (platform === "tt") {
      videoUrl = data?.download_url;
    }

    if (!videoUrl) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "⚠️ Video not found"
      });
      return res.end();
    }

    // ✅ FINAL SEND VIDEO
    await tg("sendVideo", {
      chat_id: chatId,
      video: videoUrl
    });

  } catch (e) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Error downloading video"
    });
  }

  res.end();
}
