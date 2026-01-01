const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const OWNER_USERNAME = '@Bdkingboss';
const CHANNEL_USERNAME = '@Rfcyberteam';

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Start command
bot.start(async (ctx) => {
    const firstName = ctx.from.first_name;
    const welcomeMessage = `
👋 *স্বাগতম ${firstName}*

*BTRC IMEI Checker Bot*
বাংলাদেশ টেলিযোগাযোগ নিয়ন্ত্রণ কমিশন (বিটিআরসি) এর অফিসিয়াল IMEI চেকার বট।

📱 *IMEI নম্বরটি পাঠান:*
IMEI টাইপ করে বা সার্চ করে পাঠাতে পারেন (15 ডিজিট)

⚡ *উদাহরণ:* \`358879090123456\`

📢 চ্যানেল: ${CHANNEL_USERNAME}
👑 বট মালিক: ${OWNER_USERNAME}
    `;

    const keyboard = Markup.keyboard([
        ['🔍 IMEI চেক করুন'],
        ['ℹ️ সাহায্য', '⭐ চ্যানেল জয়েন করুন'],
        ['📞 যোগাযোগ', '👑 Owner']
    ]).resize().oneTime(false);

    await ctx.replyWithMarkdown(welcomeMessage, keyboard);
});

// Button handlers
bot.hears('🔍 IMEI চেক করুন', async (ctx) => {
    const message = `
📱 *IMEI নম্বরটি পাঠান:*

দয়া করে 15 ডিজিটের IMEI নম্বরটি পাঠান।
উদাহরণ: \`358879090123456\`

IMEI নম্বর ফোনে *#06#* ডায়াল করে পাওয়া যায়।
    `;
    await ctx.replyWithMarkdown(message);
});

bot.hears('ℹ️ সাহায্য', async (ctx) => {
    const helpMessage = `
🆘 *সাহায্য কেন্দ্র*

*IMEI কি?*
IMEI (International Mobile Equipment Identity) হল মোবাইল ফোনের একটি ইউনিক আইডেন্টিফিকেশন নম্বর।

*IMEI কিভাবে পাবেন?*
১. ফোনে *#06#* ডায়াল করুন
২. সেটিংস > ফোন সম্পর্কে
৩. ফোনের বক্সে থাকা স্টিকারে

*বিঃদ্রঃ* IMEI সর্বদা 15 ডিজিটের হয়।

*সাপোর্ট:* ${OWNER_USERNAME}
    `;
    await ctx.replyWithMarkdown(helpMessage);
});

bot.hears('⭐ চ্যানেল জয়েন করুন', async (ctx) => {
    const channelMessage = `
📢 *আমাদের অফিসিয়াল চ্যানেল*

আপডেট ও নতুন টেকনোলজি সম্পর্কে জানতে আমাদের চ্যানেলে জয়েন করুন:

👉 ${CHANNEL_USERNAME}

ধন্যবাদান্তে,
${OWNER_USERNAME}
    `;
    await ctx.replyWithMarkdown(channelMessage);
});

bot.hears('📞 যোগাযোগ', async (ctx) => {
    const contactMessage = `
📞 *যোগাযোগ তথ্য*

*বট মালিক:* ${OWNER_USERNAME}
*চ্যানেল:* ${CHANNEL_USERNAME}

*বিঃদ্রঃ* বটটি শুধুমাত্র বাংলাদেশের জন্য প্রযোজ্য।
    `;
    await ctx.replyWithMarkdown(contactMessage);
});

bot.hears('👑 Owner', async (ctx) => {
    const ownerMessage = `
👑 *বট মালিক*

নামঃ সাইফুর রহমান
ইউজারনেমঃ ${OWNER_USERNAME}

*আমাদের চ্যানেলঃ* ${CHANNEL_USERNAME}

যেকোন সমস্যায় সরাসরি ম্যাসেজ করুন।
    `;
    await ctx.replyWithMarkdown(ownerMessage);
});

// IMEI Check Handler
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    
    // Check if it's a 15-digit IMEI
    if (/^\d{15}$/.test(text)) {
        await checkIMEI(ctx, text);
    } else if (!text.startsWith('/') && ![
        '🔍 IMEI চেক করুন',
        'ℹ️ সাহায্য',
        '⭐ চ্যানেল জয়েন করুন',
        '📞 যোগাযোগ',
        '👑 Owner'
    ].includes(text)) {
        const errorMessage = `
❌ *ভুল IMEI নম্বর*

দয়া করে 15 ডিজিটের সঠিক IMEI নম্বর পাঠান।
উদাহরণ: \`358879090123456\`

*IMEI পাওয়ার উপায়:* ফোনে *#06#* ডায়াল করুন।
        `;
        await ctx.replyWithMarkdown(errorMessage);
    }
});

// IMEI Check Function
async function checkIMEI(ctx, imei) {
    // Send typing action
    await ctx.sendChatAction('typing');
    
    // Initial message
    const statusMessage = await ctx.replyWithMarkdown(`
🔍 *IMEI চেক করা হচ্ছে...*

IMEI: \`${imei}\`
দয়া করে অপেক্ষা করুন...
    `);
    
    try {
        // Call BTRC API
        const result = await checkBTRCAPI(imei);
        
        // Edit message with result
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            null,
            result,
            { parse_mode: 'Markdown' }
        );
        
        // Send inline buttons for another check
        const inlineKeyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('🔄 আরেকটি চেক করুন', 'check_another')
            ],
            [
                Markup.button.url('⭐ চ্যানেল জয়েন করুন', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`),
                Markup.button.url('👑 Owner', `https://t.me/${OWNER_USERNAME.replace('@', '')}`)
            ]
        ]);
        
        await ctx.reply('আরেকটি IMEI চেক করতে নিচের বাটন চাপুন:', inlineKeyboard);
        
    } catch (error) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            null,
            '❌ *সংযোগ ব্যর্থ*\n\nAPI সার্ভারে সমস্যা আছে। দয়া করে পরে চেষ্টা করুন।',
            { parse_mode: 'Markdown' }
        );
    }
}

// BTRC API Check Function
async function checkBTRCAPI(imei) {
    const url = 'https://neir.btrc.gov.bd/services/NEIRPortalService/api/imei-status-check';
    const data = { imei };
    
    const response = await axios.post(url, data, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        timeout: 30000
    });
    
    const result = response.data;
    const msg = result?.replyMessage?.msg || '';
    
    const now = new Date();
    const formattedDate = now.toLocaleString('bn-BD', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    
    let output = `
📋 *IMEI রিপোর্ট*

IMEI: \`${imei}\`
চেক করা হয়েছে: ${formattedDate}
সূত্র: বাংলাদেশ টেলিযোগাযোগ নিয়ন্ত্রণ কমিশন

────────────────────
    `;
    
    if (msg === "NF") {
        output += `
🔴 *স্ট্যাটাস: নিবন্ধিত নয়*

এই IMEI নম্বরটি বাংলাদেশের NEIR সিস্টেমে নিবন্ধিত নেই।

*সুপারিশ:* বাংলাদেশ থেকে ফোনটি ব্যবহার করা যাবে না।
        `;
    } else if (msg === "WL") {
        output += `
🟢 *স্ট্যাটাস: নিবন্ধিত*

এই IMEI নম্বরটি বাংলাদেশের NEIR সিস্টেমে নিবন্ধিত রয়েছে।

*সুপারিশ:* ফোনটি বাংলাদেশে ব্যবহার করা যাবে।
        `;
    } else {
        output += `
🟡 *স্ট্যাটাস: অনির্ধারিত*

IMEI স্ট্যাটাস নির্ধারণ করা সম্ভব হয়নি।

*সুপারিশ:* পুনরায় চেষ্টা করুন অথবা ম্যানুয়ালি চেক করুন।
        `;
    }
    
    output += `
────────────────────
*চ্যানেল:* ${CHANNEL_USERNAME}
*মালিক:* ${OWNER_USERNAME}
    `;
    
    return output.trim();
}

// Callback query handler
bot.action('check_another', async (ctx) => {
    await ctx.answerCbQuery('✅ প্রস্তুত');
    await ctx.replyWithMarkdown(`
📱 *নতুন IMEI চেক করুন*

দয়া করে নতুন 15 ডিজিটের IMEI নম্বর পাঠান।
উদাহরণ: \`358879090123456\`
    `);
});

// Error handling
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ কিছু একটা সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
});

// Webhook setup for Vercel
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
};
