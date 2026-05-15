const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Endpoint ini akan jadi: https://domain-kamu.vercel.app/api
app.post('/api', async (req, res) => {
    const update = req.body;
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const userText = update.message.text;

        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: userText }] }] })
            });
            const geminiData = await geminiResponse.json();
            const aiReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Aduh, otakku lagi ngeblank...";

            const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: aiReply })
            });
        } catch (error) { console.error(error); }
    }
    res.status(200).send('OK');
});

module.exports = app;
