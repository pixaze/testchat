const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.post('/api', async (req, res) => {
    const update = req.body;
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const userText = update.message.text;

        try {
            // Panggil API Groq
            const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content: userText }],
                    model: "llama-3.3-70b-versatile", // Model kencang milik Groq
                })
            });

            const groqData = await groqResponse.json();
            const aiReply = groqData.choices?.[0]?.message?.content || "Aduh, Groq lagi pusing...";

            // Kirim balik ke Telegram
            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: aiReply })
            });

        } catch (error) {
            console.error("Error Groq:", error);
        }
    }
    res.status(200).send('OK');
});

// Halaman utama biar gak 404
app.get('/', (req, res) => {
    res.send('Bot AI Groq sudah online!');
});

module.exports = app;
