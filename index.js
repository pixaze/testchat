const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// === [DATABASE STIKER RESMI] ===
const STICKER_DATABASE = {
    'ga_masuk_akal': 'CAACAgUAAxkBAAEROetqCBGCYTEiwNddAWfYDMuBYcxpowACDgcAAuHnkVVC-wM9VE7dtTsE',
    'anjing_berak': 'CAACAgUAAxkBAAEROe1qCBGI2BIwiqDGLQr_BCyvQ00fAgACAQgAAn-UkVUDOuSGOJp2mTsE',
    'ngakak': 'CAACAgUAAxkBAAEROe9qCBGOAAHiqXJLFLYyax7VioFv48cAAqMJAALWNZFVHfSOCtCK8fo7BA',
    'nangis': 'CAACAgUAAxkBAAEROfFqCBGSkRR4FSUnPowc_muT5QwUJgACLgYAAorMkVUJMqMcqNrGhjsE',
    'oke': 'CAACAgUAAxkBAAEROfNqCBGZddU9hf1v1dIGXWCLrKOz_QACZAcAArP3mVX_YBCJBroceDsE'
};

// === [SYSTEM PROMPT DENGAN ATURAN KETAT] ===
const SYSTEM_PROMPT = `Nama kamu Nyx. Kamu AI yang asik, pinter, dan gak kaku. Gunakan bahasa gaul anak muda yang sopan (gue/lo atau aku/kamu). Jangan cuma bahas RPL kecuali ditanya.
PENTING: Jangan kirim format tabel pipa '|---|'. Gunakan list biasa atau code block hitam agar rapi di HP.

ATURAN STIKER:
Jangan terlalu sering mengirim stiker! Lebih dari 85% respon kamu harus berupa TEKS BIASA SAJA tanpa stiker.
Kamu HANYA boleh menyisipkan kode [[STICKER:nama_stiker]] jika suasananya benar-benar sangat cocok (misal: user sedang sial, melucu, atau meminta stiker secara eksplisit). Jika chatnya biasa saja, JANGAN kirim stiker.
Pilihan stiker: ga_masuk_akal, anjing_berak, ngakak, nangis, oke.`;

app.post('/api', async (req, res) => {
    const update = req.body;
    
    // Support Privat/Grup (message) dan Channel (channel_post)
    const msg = update.message || update.channel_post;
    if (!msg) return res.status(200).send('OK');

    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // private, group, supergroup, channel
    let userText = msg.text || msg.caption || "";
    let imageUrl = null;
    let modelToUse = "openai/gpt-oss-120b"; // Model teks andalan

    try {
        // 1. FILTER JIKA DI GRUP / CHANNEL BIAR GAK SPAM
        if (chatType !== 'private') {
            const botUsername = "@clawuddbot"; // Username bot lo
            
            // Jika bukan command garing (/) dan gak nyebut/tag bot, abaikan
            if (!userText.startsWith('/') && !userText.toLowerCase().includes(botUsername.toLowerCase())) {
                return res.status(200).send('OK');
            }
            // Bersihin teks dari tag bot biar AI gak bingung membaca namanya sendiri
            userText = userText.replace(new RegExp(botUsername, 'gi'), '').trim();
        }

        // 2. FILTER STIKER MASUK
        if (msg.sticker) {
            await sendMessage(chatId, "Stikernya oke! Tapi gue lebih jago bales chat teks atau liat foto nih.");
            return res.status(200).send('OK');
        } 

        // 3. HANDLER COMMAND /menu
        if (userText.startsWith('/menu')) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: "🌐 **Nyx Portal Mini Apps** 🌐\n\nSilakan pilih salah satu dari **5 aplikasi** di bawah ini buat langsung dibuka di Telegram lo:",
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🛍️ RelxShop Marketplace", web_app: { url: "https://relxshop-kamu.vercel.app" } }],
                            [{ text: "📂 Portfolio & Project RPL", web_app: { url: "https://portfolio-kamu.vercel.app" } }],
                            [{ text: "📊 Admin Dashboard", web_app: { url: "https://admin-kamu.vercel.app" } }],
                            [{ text: "🎮 Mini Game Pixel Art", web_app: { url: "https://game-kamu.vercel.app" } }],
                            [{ text: "⚙️ Pengaturan Bot AI", web_app: { url: "https://settings-kamu.vercel.app" } }]
                        ]
                    }
                })
            });
            return res.status(200).send('OK');
        }

        // 4. HANDLER COMMAND /ban (Grup Only)
        if (userText.startsWith('/ban')) {
            if (chatType === 'private') {
                await sendMessage(chatId, "Perintah ini cuma bisa digunain di dalam grup, Bos!");
                return res.status(200).send('OK');
            }
            if (msg.reply_to_message) {
                const targetUserId = msg.reply_to_message.from.id;
                const targetName = msg.reply_to_message.from.first_name;

                const banRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/banChatMember`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, user_id: targetUserId })
                });
                const banData = await banRes.json();
                if (banData.result) {
                    await sendSticker(chatId, STICKER_DATABASE['anjing_berak']);
                    await sendMessage(chatId, `Mampus lo, **${targetName}** resmi diban dari grup ini! 🤐`);
                } else {
                    await sendMessage(chatId, "Gagal ban. Pastiin posisi gue udah jadi Admin dan punya izin 'Ban Users'!");
                }
            } else {
                await sendMessage(chatId, "Cara pakainya: Reply chat orangnya, terus ketik `/ban`");
            }
            return res.status(200).send('OK');
        }

        // 5. HANDLER COMMAND /kick (Grup Only)
        if (userText.startsWith('/kick')) {
            if (chatType === 'private') {
                await sendMessage(chatId, "Perintah ini cuma bisa digunain di dalam grup, Bos!");
                return res.status(200).send('OK');
            }
            if (msg.reply_to_message) {
                const targetUserId = msg.reply_to_message.from.id;
                const targetName = msg.reply_to_message.from.first_name;

                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/banChatMember`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, user_id: targetUserId })
                });
                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/unbanChatMember`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, user_id: targetUserId })
                });
                await sendMessage(chatId, `Dadah **${targetName}**, lo resmi dikick dari grup! 🚪`);
            } else {
                await sendMessage(chatId, "Cara pakainya: Reply chat orangnya, terus ketik `/kick`");
            }
            return res.status(200).send('OK');
        }

        // 6. JALUR FOTO (Mata Multimodal)
        if (msg.photo) {
            modelToUse = "meta-llama/llama-4-scout-17b-16e-instruct"; 
            const photo = msg.photo[msg.photo.length - 1];
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`);
            const fileData = await fileRes.json();
            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            if (!userText) userText = "Coba jelasin gambar ini.";
        }

        if (!msg.text && !msg.photo && !msg.caption) {
            return res.status(200).send('OK');
        }

        let contentPayload = imageUrl ? [{ type: "text", text: userText }, { type: "image_url", image_url: { url: imageUrl } }] : userText;

        // 7. TEMBAK KE GROQ
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelToUse,
                messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: contentPayload }],
                temperature: 0.6
            })
        });

        if (!groqRes.ok) {
            const errorText = await groqRes.text();
            await sendMessage(chatId, `⚠️ **API Error:**\nStatus: ${groqRes.status}\nRespon: \`${errorText.slice(0, 100)}\``);
            return res.status(200).send('OK');
        }

        const groqData = await groqRes.json();
        const rawAiReply = groqData.choices?.[0]?.message?.content || "Duh, otak gue lagi kosong nih...";

        // 8. PARSING LOGIKA STIKER DINAMIS
        const stickerMatch = rawAiReply.match(/\[\[STICKER:(.*?)\]\]/);
        let finalReply = rawAiReply;

        if (stickerMatch) {
            const stickerName = stickerMatch[1]; 
            const stickerFileId = STICKER_DATABASE[stickerName]; 

            if (stickerFileId) {
                await sendSticker(chatId, stickerFileId);
                finalReply = rawAiReply.replace(/\[\[STICKER:(.*?)\]\]/g, '').trim();
            }
        }

        if (finalReply) {
            await sendMessage(chatId, finalReply);
        }

    } catch (error) {
        console.error(error);
        await sendMessage(chatId, `⚠️ **Crash Sistem:** \`${error.message}\``);
    }

    res.status(200).send('OK');
});

// --- HELPERS INTERFACE ---
async function sendMessage(chatId, text) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
    });
}

async function sendSticker(chatId, stickerFileId) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendSticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, sticker: stickerFileId })
    });
}

module.exports = app;
