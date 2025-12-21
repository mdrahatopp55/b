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
  groups: {},     // Format: {chatId: {title, admins: [], addedDate}}
  pendingPrompts: new Map() // For admin promotion prompts
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

  async sendMessage(chatId, text, replyMarkup = null) {
    const data = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyMarkup) data.reply_markup = replyMarkup;
    return this.sendRequest("sendMessage", data);
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

  async promoteChatMember(chatId, userId, permissions) {
    return this.sendRequest("promoteChatMember", {
      chat_id: chatId,
      user_id: userId,
      ...permissions
    });
  }

  async answerCallbackQuery(callbackQueryId, text = "", showAlert = false) {
    return this.sendRequest("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  }
}

const bot = new BotAPI(CONFIG.BOT_TOKEN);

// ================= ADMIN MANAGEMENT =================
class AdminManager {
  static groupAdmins = {}; // {chatId: [adminUserIds]}
  static requiredPermissions = {
    can_delete_messages: true,
    can_restrict_members: true,
    can_pin_messages: true,
    can_invite_users: true,
    can_promote_members: false,
    can_change_info: true,
    can_post_messages: true,
    can_edit_messages: true,
    can_manage_chat: true,
    can_manage_video_chats: true
  };

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

  // Request admin permissions automatically
  static async requestAdminPermissions(chatId, userId, chatTitle) {
    try {
      const promotionMessage = await bot.sendMessage(
        chatId,
        `🔔 <b>ADMIN PERMISSION REQUEST</b>\n\n` +
        `To function properly, I need the following permissions:\n\n` +
        `✅ <b>Delete Messages</b> - To remove links\n` +
        `✅ <b>Restrict Members</b> - To mute violators\n` +
        `✅ <b>Ban Users</b> - For serious violations\n` +
        `✅ <b>Pin Messages</b> - For important notices\n` +
        `✅ <b>Invite Users</b> - To manage group\n\n` +
        `Please promote me with full permissions by clicking the button below:`,
        {
          inline_keyboard: [[
            {
              text: "🚀 PROMOTE TO ADMIN",
              url: `https://t.me/${(await bot.getMe()).result.username}?startgroup=admin`
            }
          ]]
        }
      );

      // Store callback data for later
      DB.pendingPrompts.set(`${chatId}_${userId}`, {
        messageId: promotionMessage.result.message_id,
        timestamp: Date.now(),
        chatTitle
      });

      // Auto-delete promotion message after 1 minute
      setTimeout(async () => {
        try {
          await bot.deleteMessage(chatId, promotionMessage.result.message_id);
          DB.pendingPrompts.delete(`${chatId}_${userId}`);
        } catch (e) {
          console.error("Failed to delete promotion message:", e);
        }
      }, 60000);

      // Notify owner
      await bot.sendMessage(
        CONFIG.OWNER_ID,
        `📢 <b>Admin Permission Requested</b>\n\n` +
        `• Group: ${chatTitle}\n` +
        `• Group ID: <code>${chatId}</code>\n` +
        `• Requested by: <code>${userId}</code>\n` +
        `• Time: ${new Date().toLocaleString()}`
      );

    } catch (error) {
      console.error("Failed to request admin permissions:", error);
    }
  }

  // Clear cache for a specific group
  static clearCache(chatId) {
    delete this.groupAdmins[chatId];
  }
}

// ================= INLINE KEYBOARDS =================
class Keyboards {
  static mainMenu() {
    return {
      inline_keyboard: [
        [
          { text: "🛡️ Protection Panel", callback_data: "panel" },
          { text: "📊 Stats", callback_data: "stats" }
        ],
        [
          { text: "👥 Groups", callback_data: "groups" },
          { text: "📝 Mute Logs", callback_data: "mutes" }
        ],
        [
          { text: "✅ Enable", callback_data: "enable" },
          { text: "❌ Disable", callback_data: "disable" }
        ],
        [
          { text: "➕ Add Admin to Group", callback_data: "add_admin" }
        ]
      ]
    };
  }

  static adminPromotion(chatId, chatTitle) {
    return {
      inline_keyboard: [[
        {
          text: `🚀 Promote in ${chatTitle.substring(0, 15)}...`,
          url: `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?startgroup=admin&admin=`
        }
      ]]
    };
  }

  static backButton() {
    return {
      inline_keyboard: [[{ text: "🔙 Back", callback_data: "back" }]]
    };
  }
}

// ================= MESSAGE HANDLERS =================
class MessageHandlers {
  static async handleHelp(chatId) {
    const helpText = `<b>🤖 LINK PROTECTION BOT</b>

<b>👥 GROUP PROTECTION</b>
• Links & Mentions → Auto Delete (Non-Admins Only)
• Offenders → 2 Minute Mute (Non-Admins Only)
• Group Admins & Owner → Allowed to Post Links
• /groupid → Admin Only Command

<b>👑 OWNER COMMANDS</b> (Private Only)
• /panel → Interactive Control Panel
• /on /off → Toggle Protection
• /stats → Protection Statistics
• /mutes → Recent Mute Records
• /groups → Protected Groups List

<b>➕ ADD ADMIN FEATURE</b>
Use the "Add Admin" button in panel to automatically request full admin permissions in any group.

<b>⚙️ REQUIRED PERMISSIONS</b>
✅ Delete Messages
✅ Restrict Members
✅ Ban Users
✅ Pin Messages
✅ Invite Users

<b>📝 NOTE:</b> 
✅ Group Admins & Owner can post links
❌ Regular members cannot post links
🛡️ Bot automatically requests full permissions when added`;

    await bot.sendMessage(chatId, helpText);
  }

  static async handleGroupInfo(chatId, chat) {
    // First, refresh admin list for this group
    await AdminManager.refreshGroupAdmins(chatId);
    const adminCount = AdminManager.groupAdmins[chatId]?.length || 0;

    const message = await bot.sendMessage(chatId,
      `<b>👥 GROUP INFORMATION</b>

<b>• Name:</b> ${chat.title}
<b>• ID:</b> <code>${chatId}</code>
<b>• Type:</b> ${chat.type}
<b>• Admins:</b> ${adminCount} users
<b>• Protection:</b> ${DB.enabled ? "Active 🟢" : "Inactive 🔴"}

<i>⚠️ This message will auto-delete in 10 seconds.</i>`
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

  static async handleOwnerPanel(chatId, userId, isCallback = false, callbackQueryId = null) {
    const panelText = `<b>🧑‍💼 OWNER CONTROL PANEL</b>

<b>• Protection:</b> ${DB.enabled ? "🟢 ACTIVE" : "🔴 DISABLED"}
<b>• Messages Deleted:</b> ${DB.stats.deletes}
<b>• Users Muted:</b> ${DB.stats.mutes}
<b>• Groups Protected:</b> ${Object.keys(DB.groups).length}

<b>📋 Admin Protection:</b> ENABLED
✅ Group admins can post links
✅ Bot owner can post links
❌ Regular members restricted

<b>🔄 Auto Admin Request:</b> ENABLED
Bot automatically requests full permissions when added to groups.`;

    if (isCallback && callbackQueryId) {
      await bot.answerCallbackQuery(callbackQueryId);
      await bot.sendMessage(chatId, panelText, Keyboards.mainMenu());
    } else {
      await bot.sendMessage(chatId, panelText, Keyboards.mainMenu());
    }
  }

  static async handleAdminAdded(chat, ownerId) {
    DB.groups[chat.id] = {
      title: chat.title || "Unnamed Group",
      admins: [],
      addedDate: new Date().toISOString()
    };

    // Refresh admin list for this new group
    await AdminManager.refreshGroupAdmins(chat.id);

    // Auto-request admin permissions
    await AdminManager.requestAdminPermissions(
      chat.id,
      ownerId,
      chat.title || "Unnamed Group"
    );

    const notification = `<b>🟢 BOT ADDED TO GROUP</b>

<b>• Group:</b> ${chat.title}
<b>• ID:</b> <code>${chat.id}</code>
<b>• Type:</b> ${chat.type}
<b>• Admins:</b> ${AdminManager.groupAdmins[chat.id]?.length || 0} users
<b>• Time:</b> ${new Date().toLocaleString()}

✅ <b>Admin Protection Active:</b>
• Group admins can post links
• Regular members restricted

🚀 <b>Auto Admin Request Sent:</b>
I've automatically requested full admin permissions in the group.`;

    await bot.sendMessage(ownerId, notification);
  }

  static async handleCallbackQuery(callbackQuery, chatId, userId) {
    const { id: callbackId, data } = callbackQuery;
    const message = callbackQuery.message;

    try {
      switch (data) {
        case "panel":
          await bot.answerCallbackQuery(callbackId);
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>🧑‍💼 OWNER CONTROL PANEL</b>\n\nUse the buttons below:`,
            parse_mode: "HTML",
            reply_markup: Keyboards.mainMenu()
          });
          break;

        case "stats":
          await bot.answerCallbackQuery(callbackId);
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>📊 PROTECTION STATISTICS</b>\n\n` +
                  `<b>• Total Deletes:</b> ${DB.stats.deletes}\n` +
                  `<b>• Total Mutes:</b> ${DB.stats.mutes}\n` +
                  `<b>• Recent Mutes:</b> ${DB.muteLogs.length} (last 24h)\n` +
                  `<b>• Active Groups:</b> ${Object.keys(DB.groups).length}\n` +
                  `<b>• Cached Admins:</b> ${Object.keys(AdminManager.groupAdmins).length} groups`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "groups":
          await bot.answerCallbackQuery(callbackId);
          const groupsText = Object.entries(DB.groups)
            .map(([id, group], index) => {
              const adminCount = AdminManager.groupAdmins[id]?.length || "?";
              return `${index + 1}. ${group.title} (<code>${id}</code>) - ${adminCount} admins`;
            })
            .join("\n") || "No groups added yet.";

          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>🛡️ PROTECTED GROUPS</b>\n\n${groupsText}`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "mutes":
          await bot.answerCallbackQuery(callbackId);
          const mutesText = DB.muteLogs
            .slice(-10)
            .reverse()
            .map((m, i) =>
              `<b>${i + 1}. ${m.user}</b>\n` +
              `• Group: ${m.chat}\n` +
              `• Muted: ${m.start}\n` +
              `• Until: ${m.end}\n` +
              `• User ID: ${m.userId}`
            ).join("\n\n") || "No mute records found.";

          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>📋 RECENT MUTE RECORDS</b>\n\n${mutesText}`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "enable":
          DB.enabled = true;
          await bot.answerCallbackQuery(callbackId, "✅ Protection Enabled!");
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>✅ PROTECTION ENABLED</b>\n\nProtection is now active in all groups.`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "disable":
          DB.enabled = false;
          await bot.answerCallbackQuery(callbackId, "❌ Protection Disabled!");
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>❌ PROTECTION DISABLED</b>\n\nProtection is now inactive in all groups.`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "add_admin":
          await bot.answerCallbackQuery(callbackId);
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>➕ ADD ADMIN TO GROUP</b>\n\n` +
                  `To add me as admin in a group:\n\n` +
                  `1. Add me to any group\n` +
                  `2. I'll automatically request full admin permissions\n` +
                  `3. Promote me with all permissions\n\n` +
                  `Required permissions:\n` +
                  `✅ Delete Messages\n` +
                  `✅ Restrict Members\n` +
                  `✅ Ban Users\n` +
                  `✅ Pin Messages\n` +
                  `✅ Invite Users`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "back":
          await bot.answerCallbackQuery(callbackId);
          await this.handleOwnerPanel(chatId, userId, true, callbackId);
          break;
      }
    } catch (error) {
      console.error("Callback handling error:", error);
      await bot.answerCallbackQuery(callbackId, "❌ Error processing request");
    }
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

    // Handle callback queries (inline keyboard buttons)
    if (update.callback_query) {
      const { callback_query: callbackQuery } = update;
      const { message, from } = callbackQuery;
      const chatId = message.chat.id;
      const userId = from.id;

      // Only allow owner to use callback buttons
      if (String(userId) === String(CONFIG.OWNER_ID)) {
        await MessageHandlers.handleCallbackQuery(callbackQuery, chatId, userId);
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, "❌ Unauthorized access!");
      }
      return res.status(200).end();
    }

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
      if (command === "/panel") {
        await MessageHandlers.handleOwnerPanel(chatId, userId);
        return res.status(200).end();
      }

      if (command === "/on") {
        DB.enabled = true;
        await bot.sendMessage(chatId, 
          "<b>✅ PROTECTION ENABLED</b>\n\n" +
          "Link protection is now active in all groups.\n" +
          "Group admins can post links, regular members cannot.",
          Keyboards.mainMenu()
        );
        return res.status(200).end();
      }

      if (command === "/off") {
        DB.enabled = false;
        await bot.sendMessage(chatId,
          "<b>❌ PROTECTION DISABLED</b>\n\n" +
          "Link protection is now inactive in all groups.\n" +
          "Everyone can post links.",
          Keyboards.mainMenu()
        );
        return res.status(200).end();
      }

      if (command === "/stats") {
        const statsText = `<b>📊 PROTECTION STATISTICS</b>\n\n` +
          `<b>• Total Deletes:</b> ${DB.stats.deletes}\n` +
          `<b>• Total Mutes:</b> ${DB.stats.mutes}\n` +
          `<b>• Recent Mutes:</b> ${DB.muteLogs.length} (last 24h)\n` +
          `<b>• Active Groups:</b> ${Object.keys(DB.groups).length}`;
        await bot.sendMessage(chatId, statsText);
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
