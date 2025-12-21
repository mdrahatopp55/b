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
    mutes: 0,
    broadcasts: 0
  },
  muteLogs: [],   // Format: {user, chat, start, end, userId}
  groups: {},     // Format: {chatId: {title, admins: [], addedDate}}
  broadcastQueue: [], // For broadcasting messages
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

  async getMe() {
    return this.sendRequest("getMe", {});
  }
}

const bot = new BotAPI(CONFIG.BOT_TOKEN);

// ================= ADMIN MANAGEMENT =================
class AdminManager {
  static groupAdmins = {}; // {chatId: [adminUserIds]}
  static botUsername = null;

  // Get bot username
  static async getBotUsername() {
    if (!this.botUsername) {
      const me = await bot.getMe();
      this.botUsername = me.result.username;
    }
    return this.botUsername;
  }

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

  // Request FULL 100% admin permissions automatically
  static async requestFullAdminPermissions(chatId, userId, chatTitle) {
    try {
      const botUsername = await this.getBotUsername();
      
      const promotionMessage = await bot.sendMessage(
        chatId,
        `🔔 <b>ADMIN PERMISSION REQUEST - 100% FULL PERMISSIONS NEEDED</b>\n\n` +
        `⚠️ <b>I need FULL ADMIN PERMISSIONS to function:</b>\n\n` +
        `✅ <b>Delete Messages</b> - To remove spam links\n` +
        `✅ <b>Restrict Members</b> - To mute violators\n` +
        `✅ <b>Ban Users</b> - For serious violations\n` +
        `✅ <b>Pin Messages</b> - For important notices\n` +
        `✅ <b>Invite Users</b> - To manage group\n` +
        `✅ <b>Manage Chat</b> - Full chat control\n` +
        `✅ <b>Edit Messages</b> - For announcements\n` +
        `✅ <b>Post Messages</b> - For broadcasting\n` +
        `✅ <b>Change Info</b> - Update group info\n\n` +
        `<b>Click below to add me with FULL PERMISSIONS:</b>`,
        {
          inline_keyboard: [[
            {
              text: "🚀 ADD ME TO GROUP (FULL ADMIN)",
              url: `https://t.me/${botUsername}?startgroup=admin&admin=`
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

      // Auto-delete promotion message after 2 minutes
      setTimeout(async () => {
        try {
          await bot.deleteMessage(chatId, promotionMessage.result.message_id);
          DB.pendingPrompts.delete(`${chatId}_${userId}`);
        } catch (e) {
          console.error("Failed to delete promotion message:", e);
        }
      }, 120000);

      // Notify owner
      await bot.sendMessage(
        CONFIG.OWNER_ID,
        `📢 <b>Full Admin Permission Requested - 100%</b>\n\n` +
        `• Group: ${chatTitle}\n` +
        `• Group ID: <code>${chatId}</code>\n` +
        `• Requested by: <code>${userId}</code>\n` +
        `• Time: ${new Date().toLocaleString()}\n` +
        `• Status: FULL PERMISSION REQUEST SENT`
      );

      return promotionMessage;

    } catch (error) {
      console.error("Failed to request admin permissions:", error);
      return null;
    }
  }

  // Clear cache for a specific group
  static clearCache(chatId) {
    delete this.groupAdmins[chatId];
  }
}

// ================= BROADCAST SYSTEM =================
class BroadcastSystem {
  static async sendBroadcast(messageText, ownerId) {
    try {
      const groups = Object.keys(DB.groups);
      let success = 0;
      let failed = 0;
      let results = [];

      await bot.sendMessage(ownerId, 
        `📢 <b>BROADCAST STARTED</b>\n\n` +
        `• Total Groups: ${groups.length}\n` +
        `• Message: ${messageText.substring(0, 50)}...\n` +
        `• Status: SENDING...`
      );

      for (const chatId of groups) {
        try {
          await bot.sendMessage(chatId, messageText);
          success++;
          results.push({ chatId, status: "✅ Success" });
        } catch (error) {
          failed++;
          results.push({ chatId, status: "❌ Failed", error: error.message });
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      DB.stats.broadcasts++;

      // Send final report
      const reportText = 
        `📢 <b>BROADCAST COMPLETED</b>\n\n` +
        `• Total Groups: ${groups.length}\n` +
        `• ✅ Successful: ${success}\n` +
        `• ❌ Failed: ${failed}\n` +
        `• Total Broadcasts: ${DB.stats.broadcasts}\n\n` +
        `<b>Results:</b>\n` +
        results.slice(0, 10).map(r => 
          `• ${r.chatId}: ${r.status}`
        ).join("\n") +
        (results.length > 10 ? `\n\n...and ${results.length - 10} more` : "");

      await bot.sendMessage(ownerId, reportText);

      return { success, failed, total: groups.length };

    } catch (error) {
      console.error("Broadcast error:", error);
      await bot.sendMessage(ownerId, `❌ <b>BROADCAST FAILED</b>\n\nError: ${error.message}`);
      return null;
    }
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
          { text: "👥 Groups List", callback_data: "groups" },
          { text: "📝 Mute Logs", callback_data: "mutes" }
        ],
        [
          { text: "✅ Enable", callback_data: "enable" },
          { text: "❌ Disable", callback_data: "disable" }
        ],
        [
          { text: "📢 Send Broadcast", callback_data: "broadcast" }
        ],
        [
          { text: "➕ Add Me to Group", callback_data: "add_to_group" }
        ]
      ]
    };
  }

  static addToGroupButton() {
    return {
      inline_keyboard: [[
        {
          text: "➕ Add Me to Group",
          url: `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?startgroup=admin`
        }
      ]]
    };
  }

  static broadcastConfirm() {
    return {
      inline_keyboard: [
        [
          { text: "✅ Confirm Broadcast", callback_data: "confirm_broadcast" },
          { text: "❌ Cancel", callback_data: "cancel_broadcast" }
        ]
      ]
    };
  }

  static backButton() {
    return {
      inline_keyboard: [[{ text: "🔙 Back", callback_data: "back" }]]
    };
  }

  static cancelButton() {
    return {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel" }]]
    };
  }
}

// ================= MESSAGE HANDLERS =================
class MessageHandlers {
  static async handleStart(chatId, userId) {
    const startText = `<b>🤖 WELCOME TO LINK PROTECTION BOT</b>

✅ <b>Fully Automatic Link Protection</b>
✅ <b>Admin-Friendly (Admins can post links)</b>
✅ <b>Auto 100% Permission Request</b>
✅ <b>Broadcast System Included</b>

<b>Click the button below to add me to your group:</b>`;

    await bot.sendMessage(chatId, startText, Keyboards.addToGroupButton());
    
    // Also send help
    await this.handleHelp(chatId);
  }

  static async handleHelp(chatId) {
    const helpText = `<b>🤖 LINK PROTECTION BOT - FULL FEATURES</b>

<b>🔒 PROTECTION FEATURES:</b>
• Auto Delete Links (Non-Admins Only)
• 2 Minute Mute for Violators
• Admin Protection (Admins can post links)
• Full 100% Auto Permission Request

<b>🎯 COMMANDS:</b>
• /start - Start bot & get add button
• /help - Show this help
• /groupid - Show group info (Admin Only)

<b>👑 OWNER COMMANDS:</b>
• /panel - Control Panel with Buttons
• /on /off - Toggle Protection
• /stats - View Statistics
• /broadcast - Send message to all groups
• /groups - List all protected groups

<b>🚀 ADD TO GROUP:</b>
Use "Add Me to Group" button - I'll automatically request FULL 100% permissions!

<b>📢 BROADCAST SYSTEM:</b>
Send messages to all groups with one command.

<b>⚡ 100% AUTO SETUP:</b>
1. Add me to group
2. I request full permissions automatically
3. Promote me with ALL permissions
4. Protection starts immediately!`;

    await bot.sendMessage(chatId, helpText, Keyboards.addToGroupButton());
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
<b>• Broadcasts Sent:</b> ${DB.stats.broadcasts}

<b>📋 Admin Protection:</b> ENABLED
✅ Group admins can post links
✅ Bot owner can post links
❌ Regular members restricted

<b>🚀 Auto Setup:</b> 100% FULL PERMISSIONS
Bot automatically requests FULL permissions when added to groups.`;

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
      addedDate: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    // Refresh admin list for this new group
    await AdminManager.refreshGroupAdmins(chat.id);

    // Auto-request FULL 100% admin permissions
    await AdminManager.requestFullAdminPermissions(
      chat.id,
      ownerId,
      chat.title || "Unnamed Group"
    );

    const notification = `<b>🟢 BOT ADDED TO GROUP - AUTO SETUP STARTED</b>

<b>• Group:</b> ${chat.title}
<b>• ID:</b> <code>${chat.id}</code>
<b>• Type:</b> ${chat.type}
<b>• Admins:</b> ${AdminManager.groupAdmins[chat.id]?.length || 0} users
<b>• Time:</b> ${new Date().toLocaleString()}

✅ <b>Admin Protection Active:</b>
• Group admins can post links
• Regular members restricted

🚀 <b>FULL 100% PERMISSION REQUEST SENT:</b>
I've automatically requested FULL admin permissions in the group.

📢 <b>Next Step:</b>
1. Click the "Add Me to Group" button in chat
2. Promote me with ALL permissions
3. Protection will start automatically`;

    await bot.sendMessage(ownerId, notification, Keyboards.addToGroupButton());
  }

  static async handleBroadcastCommand(chatId, userId, text) {
    // Check if it's owner
    if (String(userId) !== String(CONFIG.OWNER_ID)) {
      await bot.sendMessage(chatId, "❌ <b>Unauthorized!</b>\nOnly owner can use broadcast.");
      return;
    }

    const message = text.replace("/broadcast", "").trim();
    
    if (!message) {
      await bot.sendMessage(
        chatId,
        `<b>📢 BROADCAST SYSTEM</b>\n\n` +
        `Usage: <code>/broadcast your message here</code>\n\n` +
        `Example: <code>/broadcast Hello all groups!</code>\n\n` +
        `Total Groups: ${Object.keys(DB.groups).length}`,
        Keyboards.backButton()
      );
      return;
    }

    // Store broadcast message temporarily
    DB.broadcastQueue.push({
      ownerId: userId,
      message: message,
      timestamp: Date.now()
    });

    await bot.sendMessage(
      chatId,
      `<b>📢 CONFIRM BROADCAST</b>\n\n` +
      `<b>Message:</b>\n${message}\n\n` +
      `<b>Will be sent to:</b> ${Object.keys(DB.groups).length} groups\n\n` +
      `<b>Are you sure?</b>`,
      Keyboards.broadcastConfirm()
    );
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
                  `<b>• Total Broadcasts:</b> ${DB.stats.broadcasts}\n` +
                  `<b>• Active Groups:</b> ${Object.keys(DB.groups).length}\n` +
                  `<b>• Protection:</b> ${DB.enabled ? "🟢 ON" : "🔴 OFF"}\n` +
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
            text: `<b>👥 PROTECTED GROUPS (${Object.keys(DB.groups).length})</b>\n\n${groupsText}`,
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
            text: `<b>📝 RECENT MUTE RECORDS</b>\n\n${mutesText}`,
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
            text: `<b>✅ PROTECTION ENABLED</b>\n\nProtection is now active in all ${Object.keys(DB.groups).length} groups.`,
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

        case "add_to_group":
          await bot.answerCallbackQuery(callbackId);
          const botUsername = await AdminManager.getBotUsername();
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>➕ ADD ME TO GROUP</b>\n\n` +
                  `<b>Click the button below to add me to any group:</b>\n\n` +
                  `<b>✅ Features:</b>\n` +
                  `• Auto 100% Permission Request\n` +
                  `• Admin-Friendly Protection\n` +
                  `• Link Protection System\n` +
                  `• Broadcast Support\n\n` +
                  `<b>I will automatically request FULL ADMIN permissions!</b>`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[
                {
                  text: "🚀 Add Me to Group (FULL ADMIN)",
                  url: `https://t.me/${botUsername}?startgroup=admin&admin=`
                }
              ]]
            }
          });
          break;

        case "broadcast":
          await bot.answerCallbackQuery(callbackId);
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>📢 BROADCAST SYSTEM</b>\n\n` +
                  `<b>Total Groups:</b> ${Object.keys(DB.groups).length}\n\n` +
                  `<b>Usage:</b> Send <code>/broadcast your message</code>\n\n` +
                  `<b>Example:</b>\n<code>/broadcast Hello everyone!</code>\n\n` +
                  `<b>Note:</b> Message will be sent to all protected groups.`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "confirm_broadcast":
          await bot.answerCallbackQuery(callbackId, "📢 Starting broadcast...");
          const broadcastData = DB.broadcastQueue.find(b => b.ownerId === userId);
          if (broadcastData) {
            await bot.editMessageText({
              chat_id: chatId,
              message_id: message.message_id,
              text: `<b>📢 BROADCAST IN PROGRESS</b>\n\nSending to ${Object.keys(DB.groups).length} groups...\n\nPlease wait...`,
              parse_mode: "HTML"
            });
            
            const result = await BroadcastSystem.sendBroadcast(broadcastData.message, userId);
            
            // Remove from queue
            DB.broadcastQueue = DB.broadcastQueue.filter(b => b.ownerId !== userId);
          }
          break;

        case "cancel_broadcast":
          await bot.answerCallbackQuery(callbackId, "❌ Broadcast cancelled");
          DB.broadcastQueue = DB.broadcastQueue.filter(b => b.ownerId !== userId);
          await bot.editMessageText({
            chat_id: chatId,
            message_id: message.message_id,
            text: `<b>❌ BROADCAST CANCELLED</b>\n\nNo message was sent to groups.`,
            parse_mode: "HTML",
            reply_markup: Keyboards.backButton()
          });
          break;

        case "back":
          await bot.answerCallbackQuery(callbackId);
          await this.handleOwnerPanel(chatId, userId, true, callbackId);
          break;

        case "cancel":
          await bot.answerCallbackQuery(callbackId);
          await bot.deleteMessage(chatId, message.message_id);
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

    // Normalize command
    let command = text.trim();
    
    // Handle /start command
    if (command === "/start" || command.startsWith("/start@")) {
      await MessageHandlers.handleStart(chatId, userId);
      return res.status(200).end();
    }

    // Handle /help command
    if (command === "/help" || command.startsWith("/help@")) {
      await MessageHandlers.handleHelp(chatId);
      return res.status(200).end();
    }

    // Handle /broadcast command
    if (command.startsWith("/broadcast")) {
      await MessageHandlers.handleBroadcastCommand(chatId, userId, command);
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
          "<b>✅ PROTECTION ENABLED - 100% ACTIVE</b>\n\n" +
          "Link protection is now active in all groups.\n" +
          `Total Groups: ${Object.keys(DB.groups).length}\n\n` +
          "✅ Group admins can post links\n" +
          "❌ Regular members restricted",
          Keyboards.mainMenu()
        );
        return res.status(200).end();
      }

      if (command === "/off") {
        DB.enabled = false;
        await bot.sendMessage(chatId,
          "<b>❌ PROTECTION DISABLED</b>\n\n" +
          "Link protection is now inactive in all groups.\n" +
          "Everyone can post links until re-enabled.",
          Keyboards.mainMenu()
        );
        return res.status(200).end();
      }

      if (command === "/stats") {
        const statsText = `<b>📊 PROTECTION STATISTICS - 100% ACTIVE</b>\n\n` +
          `<b>• Total Deletes:</b> ${DB.stats.deletes}\n` +
          `<b>• Total Mutes:</b> ${DB.stats.mutes}\n` +
          `<b>• Total Broadcasts:</b> ${DB.stats.broadcasts}\n` +
          `<b>• Active Groups:</b> ${Object.keys(DB.groups).length}\n` +
          `<b>• Protection:</b> ${DB.enabled ? "🟢 ON" : "🔴 OFF"}`;
        await bot.sendMessage(chatId, statsText, Keyboards.mainMenu());
        return res.status(200).end();
      }

      if (command === "/groups") {
        const groupsList = Object.entries(DB.groups)
          .map(([id, group], index) => 
            `${index + 1}. ${group.title} (<code>${id}</code>)`
          ).join("\n") || "No groups yet.";
        
        await bot.sendMessage(chatId,
          `<b>👥 PROTECTED GROUPS (${Object.keys(DB.groups).length})</b>\n\n${groupsList}`,
          Keyboards.addToGroupButton()
        );
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

    // ================= CHECK IF USER IS ADMIN =================
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
