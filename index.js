const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.post('/api', async (req, res) => {
    const update = req.body;
    if (update.message) {
        const chatId = update.message.chat.id;
        let userText = update.message.text || update.message.caption || "Apa isi gambar ini?";
        let imageUrl = null;

        try {
            // 1. CEK JIKA ADA FOTO
            if (update.message.photo) {
                const photo = update.message.photo[update.message.photo.length - 1]; // Ambil kualitas terbaik
                const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`);
                const fileData = await fileRes.json();
                imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            }

            // 2. CEK JIKA ADA STIKER
            if (update.message.sticker) {
                return sendMessage(chatId, "Wih, stikernya oke juga! Tapi aku lebih jago baca foto atau teks nih.");
            }

            // 3. PROSES KE GROQ VISION
            const messages = [{
                role: "user",
                content: imageUrl 
                    ? [{ type: "text", text: userText }, { type: "image_url", image_url: { url: imageUrl } }]
                    : userText
            }];

            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "llama-3.2-11b-vision-preview", // WAJIB pakai model Vision
                    messages: messages
                })
            });

            const groqData = await groqRes.json();
            const aiReply = groqData.choices?.[0]?.message?.content || "Gagal baca gambar nih...";

            await sendMessage(chatId, aiReply);

        } catch (error) {
            console.error(error);
            await sendMessage(chatId, "Aduh, ada kendala pas mau liat fotonya.");
        }
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
