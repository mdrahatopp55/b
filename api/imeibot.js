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
    const firstName = ctx.from.first_name || 'বন্ধু';
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
    ]).resize();

    await ctx.replyWithMarkdown(welcomeMessage, keyboard);
});

// IMEI Button
bot.hears('🔍 IMEI চেক করুন', async (ctx) => {
    await ctx.replyWithMarkdown(`
📱 *IMEI নম্বরটি পাঠান:*
উদাহরণ: \`358879090123456\`
    `);
});

// Help Button
bot.hears('ℹ️ সাহায্য', async (ctx) => {
    await ctx.replyWithMarkdown(`
🆘 *সাহায্য:*

IMEI কিভাবে পাবেন?
👉 ফোনে *#06#* ডায়াল করুন।

*সাপোর্ট:* ${OWNER_USERNAME}
    `);
});

// Channel Button
bot.hears('⭐ চ্যানেল জয়েন করুন', async (ctx) => {
    await ctx.replyWithMarkdown(`
📢 আমাদের চ্যানেল:
${CHANNEL_USERNAME}
    `);
});

// Contact Button
bot.hears('📞 যোগাযোগ', async (ctx) => {
    await ctx.replyWithMarkdown(`
📞 যোগাযোগ: ${OWNER_USERNAME}
    `);
});

// Owner Button
bot.hears('👑 Owner', async (ctx) => {
    await ctx.replyWithMarkdown(`
👑 মালিক: ${OWNER_USERNAME}
📢 চ্যানেল: ${CHANNEL_USERNAME}
    `);
});

// IMEI Check Message Handler
bot.on('text', async (ctx) => {
    const imei = ctx.message.text.trim();

    if (/^\d{15}$/.test(imei)) {
        return await checkIMEI(ctx, imei);
    } else if (!imei.startsWith('/')) {
        await ctx.replyWithMarkdown(`
❌ *সঠিক নয়!*
দয়া করে 15 ডিজিটের সঠিক IMEI পাঠান।
        `);
    }
});

// IMEI Check Function
async function checkIMEI(ctx, imei) {
    await ctx.sendChatAction('typing');

    const loadingMsg = await ctx.reply('🔍 চেক করা হচ্ছে...');

    try {
        const response = await axios.post(
            'https://neir.btrc.gov.bd/services/NEIRPortalService/api/imei-status-check',
            { imei },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );

        const msg = response.data?.replyMessage?.msg;
        let result = '';

        if (msg === 'WL') {
            result = '🟢 নিবন্ধিত IMEI ✔';
        } else if (msg === 'NF') {
            result = '🔴 নিবন্ধিত নয় ❌';
        } else {
            result = '🟡 স্ট্যাটাস পাওয়া যায়নি ⚠';
        }

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            null,
            `
📋 *IMEI Report*
IMEI: \`${imei}\`

স্ট্যাটাস: ${result}

📢 ${CHANNEL_USERNAME}
👑 ${OWNER_USERNAME}
            `,
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            null,
            '❌ সার্ভার সমস্যা!! দয়া করে আবার চেষ্টা করুন।',
            { parse_mode: 'Markdown' }
        );
    }
}

// Inline action
bot.action('check_another', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('নতুন IMEI পাঠান:');
});

// Error handler
bot.catch((err) => {
    console.error('Bot Error:', err);
});

// Webhook for Vercel
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            await bot.handleUpdate(update);
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(500).send('Error');
    }
};
