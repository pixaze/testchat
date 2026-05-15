const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Mengambil token dari Environment Variables (Aman & Rahasia)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Endpoint Webhook untuk menerima pesan dari Telegram
app.post('/webhook', async (req, res) => {
    const update = req.body;

    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const userText = update.message.text;

        try {
            // 1. Oper teks user ke Gemini API
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userText }] }]
                })
            });
            const geminiData = await geminiResponse.json();
            const aiReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Aduh, otakku lagi ngeblank...";

            // 2. Kirim balik jawaban AI ke Telegram
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: aiReply
                })
            });

        } catch (error) {
            console.error("Terjadi error:", error);
        }
    }

    // Beritahu Telegram kalau pesan sudah sukses diterima
    res.sendStatus(200);
});

// Cek halaman utama di browser
app.get('/', (req, res) => {
    res.send('Bot AI Telegram berjalan lancar!');
});

app.listen(PORT, () => {
    console.log(`Server aktif di port ${PORT}`);
});
