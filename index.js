const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// KITA UBAH BIAR GAK BAHAS RPL MULU
const SYSTEM_PROMPT = "Nama kamu Nyx. Kamu AI yang asik, pinter, dan gak kaku. Kamu bisa bahas apa aja dari curhat sampe teknologi. Jangan cuma bahas RPL kecuali ditanya. Gunakan bahasa gaul yang sopan (gue/lo atau aku/kamu).";

app.post('/api', async (req, res) => {
    const update = req.body;
    if (!update.message) return res.sendStatus(200);

    const chatId = update.message.chat.id;
    let userText = update.message.text || update.message.caption || "";
    let imageUrl = null;
    let modelToUse = "llama-3.3-70b-versatile"; // Model default untuk teks (super cerdas)

    try {
        // 1. DETEKSI TIPE PESAN
        if (update.message.sticker) {
            return sendMessage(chatId, "Stikernya lucu, tapi gue lebih jago bales chat atau liat foto nih! 😎");
        } 

        if (update.message.photo) {
            // Jika ada foto, kita beralih ke model Vision
            modelToUse = "llama-3.2-11b-vision-preview";
            const photo = update.message.photo[update.message.photo.length - 1];
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`);
            const fileData = await fileRes.json();
            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            if (!userText) userText = "Coba jelasin gambar ini.";
        }

        // 2. KONSTRUKSI PESAN UNTUK GROQ
        let contentPayload;
        if (imageUrl) {
            contentPayload = [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: imageUrl } }
            ];
        } else {
            contentPayload = userText;
        }

        // 3. PANGGIL API GROQ
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

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "Duh, otak gue lagi nge-hang sebentar...";

        await sendMessage(chatId, aiReply);

    } catch (error) {
        console.error(error);
        await sendMessage(chatId, "Lagi ada gangguan teknis nih, coba chat lagi ya!");
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
