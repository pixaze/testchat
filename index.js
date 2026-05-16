const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// === [DATABASE STIKER RESMI NYX] ===
const STICKER_DATABASE = {
    'ga_masuk_akal': 'CAACAgUAAxkBAAEROetqCBGCYTEiwNddAWfYDMuBYcxpowACDgcAAuHnkVVC-wM9VE7dtTsE',
    'anjing_berak': 'CAACAgUAAxkBAAEROe1qCBGI2BIwiqDGLQr_BCyvQ00fAgACAQgAAn-UkVUDOuSGOJp2mTsE',
    'ngakak': 'CAACAgUAAxkBAAEROe9qCBGOAAHiqXJLFLYyax7VioFv48cAAqMJAALWNZFVHfSOCtCK8fo7BA',
    'nangis': 'CAACAgUAAxkBAAEROfFqCBGSkRR4FSUnPowc_muT5QwUJgACLgYAAorMkVUJMqMcqNrGhjsE',
    'oke': 'CAACAgUAAxkBAAEROfNqCBGZddU9hf1v1dIGXWCLrKOz_QACZAcAArP3mVX_YBCJBroceDsE'
};

// SYSTEM PROMPT: Mengajari AI cara menggunakan 5 stiker baru sesuai konteks obrolan
const SYSTEM_PROMPT = `Nama kamu Nyx. Kamu AI yang asik, pinter, dan gak kaku. Gunakan bahasa gaul anak muda yang sopan (gue/lo atau aku/kamu). Jangan cuma bahas RPL kecuali ditanya.
PENTING: Jangan kirim format tabel pipa '|---|'.

FITUR STIKER AUTOMATIS:
Jika ingin mengekspresikan perasaan lewat stiker, sisipkan kode [[STICKER:nama_stiker]] di dalam jawabanmu.
Gunakan stiker yang cocok dengan kondisi berikut:
1. ga_masuk_akal -> saat user nanya hal aneh, membingungkan, atau gak logis.
2. anjing_berak -> saat merespon hal yang buruk, apes, situasi kocak/sarkas, atau hal yang bikin kesel ("tai lah").
3. ngakak -> saat merespon hal lucu atau bercandaan.
4. nangis -> saat sedih, kecewa, kasihan, atau pas dapet kabar buruk.
5. oke -> saat setuju, konfirmasi, paham, atau mengiyakan sesuatu.

Contoh pemakaian: "Siaapp, aman itu mah nanti gue bantu! [[STICKER:oke]]"`;

app.post('/api', async (req, res) => {
    const update = req.body;
    if (!update.message) return res.status(200).send('OK');

    const chatId = update.message.chat.id;
    let userText = update.message.text || update.message.caption || "";
    let imageUrl = null;
    let modelToUse = "openai/gpt-oss-120b"; // Model andalan teks lo

    try {
        // 1. FILTER STIKER MASUK (Biar gak looping)
        if (update.message.sticker) {
            await sendMessage(chatId, "Wih, stikernya boleh juga! Tapi gue lebih jago bales chat teks atau liat foto nih. [[STICKER:oke]]");
            return res.status(200).send('OK');
        } 

        // 2. HANDLER COMMAND /menu
        if (userText === '/menu') {
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

        // 3. JALUR FOTO
        if (update.message.photo) {
            modelToUse = "meta-llama/llama-4-scout-17b-16e-instruct"; // Model vision di Groq server lo
            const photo = update.message.photo[update.message.photo.length - 1];
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`);
            const fileData = await fileRes.json();
            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            if (!userText) userText = "Coba jelasin gambar ini.";
        }

        if (!update.message.text && !update.message.photo && !update.message.caption) {
            await sendMessage(chatId, "Gue baru bisa paham teks sama foto aja nih untuk sekarang. 🙏");
            return res.status(200).send('OK');
        }

        let contentPayload = imageUrl 
            ? [{ type: "text", text: userText }, { type: "image_url", image_url: { url: imageUrl } }]
            : userText;

        // 4. TEMBAK API GROQ
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: contentPayload }
                ],
                temperature: 0.7
            })
        });

        if (!groqRes.ok) {
            const errorText = await groqRes.text();
            await sendMessage(chatId, `⚠️ **API Error:**\nStatus: ${groqRes.status}\nRespon: \`${errorText.slice(0, 100)}\``);
            return res.status(200).send('OK');
        }

        const groqData = await groqRes.json();
        const rawAiReply = groqData.choices?.[0]?.message?.content || "Duh, otak gue lagi kosong nih...";

        // === [PARSING LOGIKA STIKER OTOMATIS] ===
        const stickerMatch = rawAiReply.match(/\[\[STICKER:(.*?)\]\]/);
        let finalReply = rawAiReply;

        if (stickerMatch) {
            const stickerName = stickerMatch[1]; 
            const stickerFileId = STICKER_DATABASE[stickerName]; 

            if (stickerFileId) {
                // Kirim stikernya dulu
                await sendSticker(chatId, stickerFileId);
                // Bersihin kode tag stiker dari teks biar ga risih dibaca user
                finalReply = rawAiReply.replace(/\[\[STICKER:(.*?)\]\]/g, '').trim();
            }
        }

        // Kirim teks jawabannya
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
