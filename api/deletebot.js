// ================= CONFIGURATION =================
const CONFIG = {
  BOT_TOKEN: "8303975726:AAGZiiWDhDreypBMP8F5U2mA88sGB0411co",
  OWNER_ID: "8160406698",
  MUTE_DURATION: 2 * 60 * 1000, // 2 minutes in milliseconds
  DELETE_NOTICE_DELAY: 10000, // 10 seconds
  BLOCKED_PATTERNS: [
    "https?://",
    "www\\.",
    "t\\.me/",
    "@[a-zA-Z0-9_]{3,}"
  ]
};

// ================= MEMORY DATABASE =================
const DB = {
  enabled: true,
  stats: {
    deletes: 0,
    mutes: 0
  },
  muteLogs: [],   // Format: {user, chat, start, end, userId}
  groups: {}      // Format: {chatId: chatTitle}
};

// ================= UTILITY FUNCTIONS =================
class BotAPI {
  constructor(token) {
    this.baseURL = `https://api.telegram.org/bot${token}`;
  }

  async sendRequest(endpoint, data) {
    return fetch(`${this.baseURL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(r => r.json());
  }

  async sendMessage(chatId, text) {
    return this.sendRequest("sendMessage", { chat_id: chatId, text });
  }

  async deleteMessage(chatId, messageId) {
    return this.sendRequest("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  async restrictUser(chatId, userId, untilDate) {
    return this.sendRequest("restrictChatMember", {
      chat_id: chatId,
      user_id: userId,
      permissions: { can_send_messages: false },
      until_date: untilDate
    });
  }

  async getChatMember(chatId, userId) {
    return this.sendRequest("getChatMember", { chat_id: chatId, user_id: userId });
  }

  async getChatAdministrators(chatId) {
    return this.sendRequest("getChatAdministrators", { chat_id: chatId });
  }
}

const bot = new BotAPI(CONFIG.BOT_TOKEN);

// ================= ADMIN MANAGEMENT =================
class AdminManager {
  static groupAdmins = {}; // {chatId: [adminUserIds]}

  // Fetch and cache group administrators
  static async refreshGroupAdmins(chatId) {
    try {
      const response = await bot.getChatAdministrators(chatId);
      if (response.ok) {
        const adminIds = response.result.map(admin => admin.user.id);
        this.groupAdmins[chatId] = adminIds;
        console.log(`Refreshed admins for group ${chatId}: ${adminIds.join(', ')}`);
        return adminIds;
      }
    } catch (error) {
      console.error(`Failed to fetch admins for group ${chatId}:`, error);
    }
    return [];
  }

  // Check if user is group admin (with caching)
  static async isGroupAdmin(chatId, userId) {
    // Always check owner (global admin)
    if (String(userId) === String(CONFIG.OWNER_ID)) {
      return true;
    }

    // Check cached admins
    if (this.groupAdmins[chatId] && this.groupAdmins[chatId].includes(userId)) {
      return true;
    }

    // If not in cache, fetch fresh data
    const admins = await this.refreshGroupAdmins(chatId);
    return admins.includes(userId);
  }

  // Clear cache for a specific group
  static clearCache(chatId) {
    delete this.groupAdmins[chatId];
  }

  // Periodically refresh admin cache (optional)
  static startAutoRefresh(intervalMinutes = 5) {
    setInterval(() => {
      console.log("Auto-refreshing admin caches...");
      this.groupAdmins = {};
    }, intervalMinutes * 60 * 1000);
  }
}

// Start auto-refresh (uncomment if needed)
// AdminManager.startAutoRefresh(5);

// ================= MESSAGE HANDLERS =================
class MessageHandlers {
  static async handleHelp(chatId) {
    const helpText = `🤖 **BOT HELP MENU**

👥 **GROUP PROTECTION**
• Links & Mentions → Auto Delete (Non-Admins Only)
• Offenders → 2 Minute Mute (Non-Admins Only)
• Group Admins & Owner → Allowed to Post Links
• /groupid → Admin Only Command

👑 **OWNER COMMANDS** (Private Only)
• /panel → Bot Status Dashboard
• /on /off → Toggle Protection
• /stats → Protection Statistics
• /mutes → Recent Mute Records
• /groups → Protected Groups List

⚙️ **REQUIREMENTS**
• Bot must be Administrator
• Set Privacy to OFF in BotFather
• Grant Delete Messages permission

📝 **NOTE:** 
✅ Group Admins & Owner can post links
❌ Regular members cannot post links
🛡️ Bot respects group hierarchy`;

    await bot.sendMessage(chatId, helpText);
  }

  static async handleGroupInfo(chatId, chat) {
    // First, refresh admin list for this group
    await AdminManager.refreshGroupAdmins(chatId);
    const adminCount = AdminManager.groupAdmins[chatId]?.length || 0;

    const message = await bot.sendMessage(chatId,
      `👥 **GROUP INFORMATION**
• **Name:** ${chat.title}
• **ID:** \`${chatId}\`
• **Type:** ${chat.type}
• **Admins:** ${adminCount} users
• **Protection:** ${DB.enabled ? "Active" : "Inactive"}

⚠️ This message will auto-delete in 10 seconds.`
    );

    // Auto-delete after delay
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, message.result.message_id);
      } catch (error) {
        console.error("Failed to delete group info:", error);
      }
    }, CONFIG.DELETE_NOTICE_DELAY);
  }

  static async handleOwnerPanel(chatId, userId, cmd) {
    const panels = {
      "/panel": `🧑‍💼 **OWNER CONTROL PANEL**

• **Protection:** ${DB.enabled ? "🟢 ACTIVE" : "🔴 DISABLED"}
• **Messages Deleted:** ${DB.stats.deletes}
• **Users Muted:** ${DB.stats.mutes}
• **Groups Protected:** ${Object.keys(DB.groups).length}

📋 **Admin Protection:** ENABLED
✅ Group admins can post links
✅ Bot owner can post links
❌ Regular members restricted

Use /on or /off to toggle protection.`,

      "/stats": `📊 **PROTECTION STATISTICS**

• **Total Deletes:** ${DB.stats.deletes}
• **Total Mutes:** ${DB.stats.mutes}
• **Recent Mutes:** ${DB.muteLogs.length} (last 24h)
• **Active Groups:** ${Object.keys(DB.groups).length}
• **Cached Admins:** ${Object.keys(AdminManager.groupAdmins).length} groups`,

      "/groups": `🛡️ **PROTECTED GROUPS**\n\n${
        Object.entries(DB.groups)
          .map(([id, name], index) => {
            const adminCount = AdminManager.groupAdmins[id]?.length || "?";
            return `${index + 1}. ${name} (\`${id}\`) - ${adminCount} admins`;
          })
          .join("\n") || "No groups added yet."
      }`,

      "/mutes": `📋 **RECENT MUTE RECORDS**\n\n${
        DB.muteLogs
          .slice(-10)
          .reverse()
          .map((m, i) =>
            `**${i + 1}. ${m.user}**
• Group: ${m.chat}
• Muted: ${m.start}
• Until: ${m.end}
• User ID: ${m.userId}
• Duration: 2 minutes`
          ).join("\n\n") || "No mute records found."
      }`
    };

    if (panels[cmd]) {
      await bot.sendMessage(chatId, panels[cmd]);
    }
  }

  static async handleAdminAdded(chat, ownerId) {
    DB.groups[chat.id] = chat.title || "Unnamed Group";

    // Refresh admin list for this new group
    await AdminManager.refreshGroupAdmins(chat.id);

    const notification = `🟢 **BOT ADDED AS ADMINISTRATOR**

• **Group:** ${chat.title}
• **ID:** \`${chat.id}\`
• **Type:** ${chat.type}
• **Admins:** ${AdminManager.groupAdmins[chat.id]?.length || 0} users
• **Time:** ${new Date().toLocaleString()}

✅ **Admin Protection Active:**
• Group admins can post links
• Regular members restricted
• Bot protection is now active in this group.`;

    await bot.sendMessage(ownerId, notification);
  }
}

// ================= SECURITY FUNCTIONS =================
class SecurityManager {
  static isBlockedContent(text) {
    const pattern = new RegExp(CONFIG.BLOCKED_PATTERNS.join("|"), "i");
    return pattern.test(text);
  }

  static async enforceRules(chatId, userId, messageId, username, chatTitle) {
    try {
      // Delete the violating message
      await bot.deleteMessage(chatId, messageId);
      DB.stats.deletes++;

      // Calculate mute expiration
      const muteStart = new Date();
      const muteEnd = new Date(Date.now() + CONFIG.MUTE_DURATION);
      const untilUnix = Math.floor(muteEnd.getTime() / 1000);

      // Apply mute restriction
      await bot.restrictUser(chatId, userId, untilUnix);
      DB.stats.mutes++;

      // Log the action
      DB.muteLogs.push({
        user: username,
        userId: userId,
        chat: chatTitle,
        start: muteStart.toLocaleString(),
        end: muteEnd.toLocaleString(),
        timestamp: Date.now(),
        note: "Regular member (non-admin)"
      });

      // Keep only last 100 logs to prevent memory issues
      if (DB.muteLogs.length > 100) {
        DB.muteLogs.shift();
      }

      console.log(`Protected: Deleted message from regular member ${username} in ${chatTitle}`);
    } catch (error) {
      console.error("Protection action failed:", error);
    }
  }
}

// ================= MAIN HANDLER =================
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = req.body;

    // Handle bot being added as admin
    if (update.my_chat_member) {
      const { chat, new_chat_member } = update.my_chat_member;
      if (new_chat_member?.status === "administrator") {
        await MessageHandlers.handleAdminAdded(chat, CONFIG.OWNER_ID);
      }
      return res.status(200).end();
    }

    // Extract message data
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).end();

    const { chat, from: user, text = "" } = message;
    const chatId = chat.id;
    const userId = user.id;
    const username = user.username ? `@${user.username}` : `User ${userId}`;
    const isPrivateChat = chat.type === "private";

    // Normalize command (convert /start to /help)
    let command = text.trim();
    if (command === "/start" || command.startsWith("/start@")) {
      command = "/help";
    }

    // ================= COMMAND ROUTING =================

    // Help command (available everywhere)
    if (command === "/help" || command.startsWith("/help@")) {
      await MessageHandlers.handleHelp(chatId);
      return res.status(200).end();
    }

    // Owner commands (private chat only)
    if (isPrivateChat && String(userId) === String(CONFIG.OWNER_ID)) {
      const ownerCommands = ["/panel", "/on", "/off", "/stats", "/groups", "/mutes"];

      if (ownerCommands.includes(command.split(" ")[0])) {
        if (command === "/on") {
          DB.enabled = true;
          await bot.sendMessage(chatId, "✅ **Protection has been ENABLED**\n\nGroup admins can post links\nRegular members restricted");
        } else if (command === "/off") {
          DB.enabled = false;
          await bot.sendMessage(chatId, "❌ **Protection has been DISABLED**\n\nNo link restrictions for anyone");
        } else {
          await MessageHandlers.handleOwnerPanel(chatId, userId, command);
        }
        return res.status(200).end();
      }
    }

    // ================= GROUP PROTECTION LOGIC =================

    // Check if protection is active
    if (!DB.enabled) return res.status(200).end();

    // Only proceed for groups
    if (!["group", "supergroup"].includes(chat.type)) {
      return res.status(200).end();
    }

    // Group info command (admin only)
    if (command === "/groupid" || command.startsWith("/groupid@")) {
      const isAdmin = await AdminManager.isGroupAdmin(chatId, userId);
      if (isAdmin) {
        await MessageHandlers.handleGroupInfo(chatId, chat);
      }
      return res.status(200).end();
    }

    // Check for blocked content
    if (!SecurityManager.isBlockedContent(text)) {
      return res.status(200).end();
    }

    // ================= CRITICAL: CHECK IF USER IS ADMIN =================
    // This is the key change - admins can post links
    const isAdmin = await AdminManager.isGroupAdmin(chatId, userId);
    
    if (isAdmin) {
      console.log(`Allowed: Admin ${username} posted link in ${chat.title}`);
      return res.status(200).end(); // Allow admin to post links
    }

    // Apply protection measures only for non-admins
    await SecurityManager.enforceRules(
      chatId,
      userId,
      message.message_id,
      username,
      chat.title || "Unknown Group"
    );

    res.status(200).end();
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
