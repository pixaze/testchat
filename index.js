const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = "Nama kamu Nyx. Kamu AI yang asik, pinter, dan gak kaku. Jangan cuma bahas RPL kecuali ditanya. Gunakan bahasa gaul anak muda yang sopan (gue/lo atau aku/kamu). PENTING: Jangan kirim format tabel pipa '|---|'. Gunakan list poin atau code block hitam saja biar rapi di HP.";

app.post('/api', async (req, res) => {
    const update = req.body;
    if (!update.message) return res.status(200).send('OK');

    const chatId = update.message.chat.id;
    let userText = update.message.text || update.message.caption || "";
    let imageUrl = null;
    let modelToUse = "openai/gpt-oss-120b"; // Model utama andalan lo!

    try {
        // 1. FILTER STIKER
        if (update.message.sticker) {
            await sendMessage(chatId, "Stikernya lucu, tapi gue lebih jago bales chat atau liat foto nih! 😎");
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
            // Menggunakan Llama 4 Scout, model multimodal vision terbaru di Groq server
            modelToUse = "meta-llama/llama-4-scout-17b-16e-instruct"; 
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
            await sendMessage(chatId, `⚠️ **Server API Menolak:**\nStatus: ${groqRes.status}\nRespon: \`${errorText.slice(0, 100)}\``);
            return res.status(200).send('OK');
        }

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "Duh, otak gue lagi nge-hang sebentar...";
        await sendMessage(chatId, aiReply);

    } catch (error) {
        console.error(error);
        await sendMessage(chatId, `⚠️ **Crash Sistem:** \`${error.message}\``);
    }

    res.status(200).send('OK');
});

async function sendMessage(chatId, text) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "Markdown" })
    });
}

module.exports = app;
