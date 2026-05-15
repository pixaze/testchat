const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// SYSTEM PROMPT: Biar AI-nya pro di bidang RPL, PHP, dan Database
const SYSTEM_PROMPT = "Kamu adalah AI Senior Developer. Kamu ahli dalam RPL, PHP, MySQL, dan Tailwind CSS. Jawab setiap pertanyaan dengan sangat cerdas, teknis, dan sertakan contoh kode jika relevan.";

app.post('/api', async (req, res) => {
    const update = req.body;
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const userText = update.message.text;
        let replyText = "";

        // --- HANDLER COMMANDS ---
        if (userText === '/start') {
            replyText = "🚀 **Bot AI Pro Aktif!**\n\nModel: `openai/gpt-oss-120b`\n\nKirim pesan atau gunakan:\n/coding - Mode Senior Dev\n/status - Cek status server";
        } 
        else if (userText === '/status') {
            replyText = "✅ **Server Online** di Vercel.\n⚡ **Engine:** Groq API";
        }
        // --- LOGIKA CHAT AI ---
        else {
            try {
                const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "openai/gpt-oss-120b", // Model pesananmu
                        messages: [
                            { role: "system", content: SYSTEM_PROMPT },
                            { role: "user", content: userText }
                        ],
                        temperature: 0.6
                    })
                });

                const data = await response.json();
                
                // Jika model tidak ditemukan di Groq, dia akan kirim pesan error
                if (data.error) {
                    replyText = "❌ **Error dari API:** " + data.error.message;
                } else {
                    replyText = data.choices[0].message.content;
                }
            } catch (error) {
                replyText = "⚠️ Gagal menyambung ke otak AI. Cek logs Vercel!";
            }
        }

        // Kirim balik ke Telegram dengan parse_mode Markdown
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: replyText,
                parse_mode: "Markdown"
            })
        });
    }
    res.status(200).send('OK');
});

module.exports = app;
