const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ============================================================
//  💾 IN-MEMORY STORE 
// ============================================================
const conversationHistory = {};  
const userWarnings = {};         
const mutedUsers = {};           
const userModes = {};            
const pollVotes = {};            
const reminderQueue = [];        
const afkUsers = {};             
const chatStats = {};            
const triviaSession = {};        
const welcomeConfig = {};        
const rateLimit = {};            

// ============================================================
//  🎭 STIKER DATABASE
// ============================================================
const STICKER_DATABASE = {
    'ga_masuk_akal': 'CAACAgUAAxkBAAEROetqCBGCYTEiwNddAWfYDMuBYcxpowACDgcAAuHnkVVC-wM9VE7dtTsE',
    'anjing_berak':  'CAACAgUAAxkBAAEROe1qCBGI2BIwiqDGLQr_BCyvQ00fAgACAQgAAn-UkVUDOuSGOJp2mTsE',
    'ngakak':        'CAACAgUAAxkBAAEROe9qCBGOAAHiqXJLFLYyax7VioFv48cAAqMJAALWNZFVHfSOCtCK8fo7BA',
    'nangis':        'CAACAgUAAxkBAAEROfFqCBGSkRR4FSUnPowc_muT5QwUJgACLgYAAorMkVUJMqMcqNrGhjsE',
    'oke':           'CAACAgUAAxkBAAEROfNqCBGZddU9hf1v1dIGXWCLrKOz_QACZAcAArP3mVX_YBCJBroceDsE'
};

// ============================================================
//  🧠 SYSTEM PROMPT
// ============================================================
const BASE_SYSTEM_PROMPT = `Nama kamu Nyx. Kamu AI yang asik, pinter, dan gak kaku. Gunakan bahasa gaul anak muda yang sopan (gue/lo atau aku/kamu). Jangan cuma bahas RPL kecuali ditanya.
PENTING: Jangan kirim format tabel pipa '|---|'. Gunakan list biasa atau code block agar rapi di HP.

ATURAN STIKER:
Lebih dari 85% respon harus teks biasa tanpa stiker. Sisipkan [[STICKER:nama]] HANYA jika benar-benar cocok atau suasananya mendukung.
Pilihan: ga_masuk_akal, anjing_berak, ngakak, nangis, oke.`;

const MODE_PROMPTS = {
    normal: '',
    roast:  '\n\nMODE AKTIF: ROAST MODE. Balas semua pesan dengan roast pedas, menyindir, tapi tetep lucu dan menghibur.',
    formal: '\n\nMODE AKTIF: FORMAL. Gunakan bahasa Indonesia baku yang sopan, rapi, dan profesional layaknya corporate.',
    story:  '\n\nMODE AKTIF: STORYTELLER. Jadikan setiap jawaban dikemas dalam bentuk cerita pendek naratif yang kreatif.',
    debate: '\n\nMODE AKTIF: DEBAT. Selalu ambil posisi berlawanan dari argumen user dan pertahankan dengan logika yang kuat.',
    uwu:    '\n\nMODE AKTIF: UWU. Balas dengan gaya imut bahasa uwu khas anime kawai, tapi isinya tetep pinter :3',
};

const TRIVIA_LIST = [
    { q: "Apa ibu kota Australia?", a: "canberra" },
    { q: "Berapa hasil 17 × 13?", a: "221" },
    { q: "Siapa penemu telepon?", a: "alexander graham bell" },
    { q: "Planet terbesar di tata surya?", a: "jupiter" },
    { q: "Bahasa pemrograman yang namanya ular?", a: "python" },
    { q: "Apa kepanjangan dari HTML?", a: "hypertext markup language" },
    { q: "Siapa yang menciptakan JavaScript?", a: "brendan eich" },
    { q: "Berapa jumlah benua di bumi?", a: "7" },
    { q: "Apa warna langit saat malam cerah tanpa awan?", a: "hitam" },
    { q: "Singkatan API adalah?", a: "application programming interface" },
];

// ============================================================
//  🛠️ HELPERS DASAR
// ============================================================
async function tgCall(method, body) {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return r.json();
}

async function sendMessage(chatId, text, extra = {}) {
    const chunks = chunkText(text, 4000);
    for (const chunk of chunks) {
        await tgCall('sendMessage', { chat_id: chatId, text: chunk, parse_mode: "Markdown", ...extra });
    }
}

async function sendSticker(chatId, fileId) {
    await tgCall('sendSticker', { chat_id: chatId, sticker: fileId });
}

function chunkText(text, size) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    return chunks.length ? chunks : [''];
}

function escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function rateCheck(userId) {
    const now = Date.now();
    if (rateLimit[userId] && now - rateLimit[userId] < 1500) return false;
    rateLimit[userId] = now;
    return true;
}

function getSystemPrompt(chatId) {
    const mode = userModes[chatId] || 'normal';
    return BASE_SYSTEM_PROMPT + (MODE_PROMPTS[mode] || '');
}

async function isAdmin(chatId, userId) {
    const r = await tgCall('getChatMember', { chat_id: chatId, user_id: userId });
    const status = r?.result?.status;
    return ['administrator', 'creator'].includes(status);
}

// ============================================================
//  🤖 AI CALL (Dengan Memory 20 Chat Context)
// ============================================================
async function callAI(chatId, userContent, imageUrl = null) {
    const modelToUse = imageUrl ? "meta-llama/llama-4-scout-17b-16e-instruct" : "openai/gpt-oss-120b";
    if (!conversationHistory[chatId]) conversationHistory[chatId] = [];

    let contentPayload = imageUrl 
        ? [{ type: "text", text: userContent }, { type: "image_url", image_url: { url: imageUrl } }]
        : userContent;

    conversationHistory[chatId].push({ role: "user", content: contentPayload });

    if (conversationHistory[chatId].length > 20) {
        conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelToUse,
            messages: [{ role: "system", content: getSystemPrompt(chatId) }, ...conversationHistory[chatId]],
            temperature: 0.7,
            max_tokens: 1500
        })
    });

    if (!groqRes.ok) {
        const err = await groqRes.text();
        throw new Error(`Groq API ${groqRes.status}: ${err.slice(0, 100)}`);
    }

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || "Otak gue lagi kosong nih...";
    conversationHistory[chatId].push({ role: "assistant", content: reply });
    return reply;
}

async function sendAIReply(chatId, rawReply) {
    const stickerMatch = rawReply.match(/\[\[STICKER:(.*?)\]\]/);
    let finalReply = rawReply;

    if (stickerMatch) {
        const stickerName = stickerMatch[1];
        const fileId = STICKER_DATABASE[stickerName];
        if (fileId) {
            await sendSticker(chatId, fileId);
            finalReply = rawReply.replace(/\[\[STICKER:(.*?)\]\]/g, '').trim();
        }
    }
    if (finalReply) await sendMessage(chatId, finalReply);
}

// ============================================================
//  🎮 COMMAND HANDLER ROUTER
// ============================================================
async function handleCommand(msg, chatId, chatType, userId, userName, userText) {
    const cmd = userText.split(' ')[0].toLowerCase().split('@')[0];
    const args = userText.split(' ').slice(1).join(' ').trim();
    
    const adminOnly = async () => {
        if (chatType === 'private') return true;
        if (!(await isAdmin(chatId, userId))) {
            await sendMessage(chatId, "⛔ Perintah ini khusus untuk admin grup.");
            return false;
        }
        return true;
    };

    if (cmd === '/start') {
        await sendMessage(chatId, "🤖 *Halo! Gue Nyx, AI Bot Telegram lo!*\n\nGue bisa nemenin lo ngobrol, analisis foto, moderasi grup, hingga main game. Ketik /help buat liat daftar commands lengkap.");
        return;
    }

    if (cmd === '/help') {
        await sendMessage(chatId, 
`📖 *Daftar Lengkap Perintah Nyx*

*🤖 AI & Chat*
/clear — Reset memori percakapan
/mode [normal|roast|formal|story|debate|uwu] — Ganti gaya bicara Nyx
/tanya [teks] — Tanya AI langsung
/ringkas [teks] — Ringkas teks panjang
/translate [bahasa] [teks] — Terjemahkan kalimat
/code [bahasa] [deskripsi] — Buatkan struktur kode
/roast [@user] — Roast lucu seseorang

*🛠️ Tools*
/kalkulator [ekspresi] — Hitung matematika (Contoh: 5*5+10)
/reminder [menit] [pesan] — Pengingat otomatis
/poll [pertanyaan] | [opsi1] | [opsi2] — Buat polling grup
/cuaca [kota] — Cek prakiraan cuaca (Simulasi)
/dice | /coinflip | /quote

*🎮 Games & Fun*
/trivia — Mulai tebak-tebakan seru
/tebak [jawaban] — Jawab kuis trivia aktif

*👥 Moderasi Grup (Admin)*
/ban | /kick | /mute | /unmute — (Reply user target)
/warn — Beri peringatan (3x warn = Auto Kick)
/warnings — Cek jumlah warn user
/pin | /delete — Pin/Hapus pesan target
/settopic [topik] — Ganti deskripsi grup
/setwelcome [pesan] — Atur sambutan member baru
/stats — Statistik chat aktif grup
/afk [alasan] — Set status AFK lo

*📱 Menu*
/menu — Portal 5 Aplikasi Mini Apps`
        );
        return;
    }

    if (cmd === '/clear') {
        conversationHistory[chatId] = [];
        await sendMessage(chatId, "🧹 Memori percakapan sukses di-reset dari awal!");
        return;
    }

    if (cmd === '/mode') {
        const valid = Object.keys(MODE_PROMPTS);
        if (!args || !valid.includes(args)) {
            await sendMessage(chatId, `Mode tersedia: ${valid.map(m => `\`${m}\``).join(', ')}\nContoh: \`/mode roast\``);
            return;
        }
        userModes[chatId] = args;
        await sendMessage(chatId, `✅ Gaya bicara berhasil diubah ke mode *${args.toUpperCase()}*!`);
        return;
    }

    if (['/tanya', '/ringkas', '/translate', '/code', '/roast', '/zodiak'].includes(cmd)) {
        if (!args) { await sendMessage(chatId, `Format salah. Contoh: \`${cmd} petunjuk lo\``); return; }
        let promptAI = args;
        if (cmd === '/ringkas') promptAI = `Ringkas teks berikut dengan padat dan jelas:\n\n${args}`;
        if (cmd === '/translate') promptAI = `Terjemahkan kalimat ini ke bahasa yang diminta. Tampilkan hanya hasil akhirnya:\n\n${args}`;
        if (cmd === '/code') promptAI = `Buatkan implementasi kode bersih terstruktur sesuai deskripsi: ${args}`;
        if (cmd === '/roast') promptAI = `Berikan roasting verbal yang sangat kocak, tajam, kreatif untuk nama: "${args}". Max 3 kalimat.`;
        if (cmd === '/zodiak') promptAI = `Berikan ramalan zodiak untuk bintang ${args} hari ini dengan pembawaan yang seru dan asik.`;

        const reply = await callAI(chatId, promptAI);
        await sendAIReply(chatId, reply);
        return;
    }

    if (cmd === '/kalkulator') {
        if (!args) { await sendMessage(chatId, "Contoh: `/kalkulator 10 * 5 + 4`"); return; }
        try {
            const sanitized = args.replace(/[^0-9+\-*/().\s%]/g, '');
            const result = Function(`"use strict"; return (${sanitized})`)();
            await sendMessage(chatId, `🔢 *Hasil Perhitungan:*\n\`${sanitized}\` = *${result}*`);
        } catch {
            await sendMessage(chatId, "❌ Rumus tidak valid.");
        }
        return;
    }

    if (cmd === '/reminder') {
        const parts = args.split(' ');
        const minutes = parseInt(parts[0]);
        const text = parts.slice(1).join(' ');
        if (isNaN(minutes) || !text) { await sendMessage(chatId, "Format: `/reminder 5 minum obat`"); return; }
        reminderQueue.push({ chatId, text, fireAt: Date.now() + minutes * 60000 });
        await sendMessage(chatId, `⏰ Siap! Pengingat untuk *"${text}"* diset dalam *${minutes} menit*.`);
        return;
    }

    if (cmd === '/poll') {
        const parts = args.split('|').map(p => p.trim());
        if (parts.length < 3) { await sendMessage(chatId, "Format: `/poll Judul | Opsi A | Opsi B`"); return; }
        await tgCall('sendPoll', { chat_id: chatId, question: parts[0], options: parts.slice(1), is_anonymous: false });
        return;
    }

    if (cmd === '/dice') {
        const sides = parseInt(args) || 6;
        const result = Math.floor(Math.random() * sides) + 1;
        await sendMessage(chatId, `🎲 Hasil lempar dadu ${sides} sisi: *${result}*`);
        return;
    }

    if (cmd === '/coinflip') {
        await sendMessage(chatId, Math.random() > 0.5 ? '🪙 *HEADS (Gambar)*' : '🪙 *TAILS (Angka)*');
        return;
    }

    if (cmd === '/quote') {
        const quotes = [
            { q: "Pertama solusikan masalahnya, baru tulis baris kodenya.", a: "John Johnson" },
            { q: "Kode yang rapi dan bersih adalah bentuk dokumentasi terbaik.", a: "Steve McConnell" },
            { q: "Kesalahan hari ini adalah kompilator kesuksesan hari esok.", a: "Nyx" }
        ];
        const pick = quotes[Math.floor(Math.random() * quotes.length)];
        await sendMessage(chatId, `💬 _"${pick.q}"_\n— *${pick.a}*`);
        return;
    }

    if (cmd === '/trivia') {
        if (triviaSession[chatId]?.active) {
            await sendMessage(chatId, `⚡ Trivia sedang berjalan!\n💬 *${triviaSession[chatId].q}*\nJawab dengan \`/tebak [jawaban]\``);
            return;
        }
        const pick = TRIVIA_LIST[Math.floor(Math.random() * TRIVIA_LIST.length)];
        triviaSession[chatId] = { q: pick.q, answer: pick.a, active: true };
        await sendMessage(chatId, `🧠 *KUIS TRIVIA NYX*\n\n👉 *${pick.q}*\n\nBalas dengan perintah \`/tebak [jawaban lo]\``);
        return;
    }

    if (cmd === '/tebak') {
        const session = triviaSession[chatId];
        if (!session?.active) { await sendMessage(chatId, "Gak ada kuis trivia yang aktif sekarang."); return; }
        if (!args) { await sendMessage(chatId, "Format: `/tebak jawaban`"); return; }
        if (args.toLowerCase().trim() === session.answer.toLowerCase()) {
            triviaSession[chatId] = null;
            await sendSticker(chatId, STICKER_DATABASE['ngakak']);
            await sendMessage(chatId, `🎉 *BERHASIL!* Jawaban lo bener banget *${userName}*, jawabannya: *${session.answer}*!`);
        } else {
            await sendMessage(chatId, "❌ Salah parah! Coba lagi bro.");
        }
        return;
    }

    if (cmd === '/cuaca') {
        if (!args) { await sendMessage(chatId, "Contoh: `/cuaca Majalengka`"); return; }
        const conditions = ['☀️ Cerah Maksimal', '⛅ Berawan Santai', '🌧️ Hujan Deras', '🌤️ Berawan Cerah'];
        const currentCond = conditions[Math.floor(Math.random() * conditions.length)];
        await sendMessage(chatId, `🌍 *Prakiraan Cuaca Kota ${args}* (Simulasi)\n\n📊 Kondisi: *${currentCond}*\n🌡️ Suhu: *${Math.floor(Math.random() * 10) + 24}°C*\n💧 Kelembaban: *${Math.floor(Math.random() * 30) + 60}%*`);
        return;
    }

    if (cmd === '/afk') {
        afkUsers[`${chatId}_${userId}`] = { reason: args || 'Lagi menjauh dari keyboard', since: Date.now(), name: userName };
        await sendMessage(chatId, `😴 *${userName}* sekarang berstatus AFK: _${args || 'Away'}_`);
        return;
    }

    if (cmd === '/stats') {
        const stats = chatStats[chatId];
        if (!stats) { await sendMessage(chatId, "Belum ada statistik chat terekam."); return; }
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
        const ranks = sorted.map(([, v], i) => `${i + 1}. *${escapeMarkdown(v.name)}* — ${v.count} pesan`);
        await sendMessage(chatId, `📊 *Peringkat Keaktifan Anggota Grup*\n\n${ranks.join('\n')}`);
        return;
    }

    if (cmd === '/menu') {
        await tgCall('sendMessage', {
            chat_id: chatId,
            text: "🌐 **Nyx Portal Mini Apps** 🌐\n\nPilih dan jalankan aplikasi lo langsung di dalam Telegram:",
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
        });
        return;
    }

    // INTERFACE MODERASI ADMIN GRUP
    if (['/ban', '/kick', '/mute', '/unmute', '/warn', '/warnings', '/pin', '/delete', '/settopic', '/setwelcome'].includes(cmd)) {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message && ['/ban', '/kick', '/mute', '/unmute', '/warn', '/warnings', '/pin', '/delete'].includes(cmd)) {
            await sendMessage(chatId, `Gunakan perintah \`${cmd}\` dengan cara mereply pesan target.`);
            return;
        }

        const target = msg.reply_to_message?.from;
        const key = `${chatId}_${target?.id}`;

        if (cmd === '/ban') {
            const r = await tgCall('banChatMember', { chat_id: chatId, user_id: target.id });
            if (r.result) {
                await sendSticker(chatId, STICKER_DATABASE['anjing_berak']);
                await sendMessage(chatId, `🔨 *${target.first_name}* resmi diblokir permanen dari grup.`);
            } else await sendMessage(chatId, "❌ Eksekusi gagal, cek perizinan bot.");
        }
        
        if (cmd === '/kick') {
            await tgCall('banChatMember', { chat_id: chatId, user_id: target.id });
            await tgCall('unbanChatMember', { chat_id: chatId, user_id: target.id });
            await sendMessage(chatId, `🚪 *${target.first_name}* berhasil dikeluarkan dari grup.`);
        }

        if (cmd === '/mute') {
            await tgCall('restrictChatMember', { chat_id: chatId, user_id: target.id, permissions: { can_send_messages: false } });
            mutedUsers[key] = true;
            await sendMessage(chatId, `🔇 *${target.first_name}* berhasil dibisukan.`);
        }

        if (cmd === '/unmute') {
            await tgCall('restrictChatMember', { chat_id: chatId, user_id: target.id, permissions: { can_send_messages: true, can_send_media_messages: true } });
            delete mutedUsers[key];
            await sendMessage(chatId, `🔊 *${target.first_name}* sekarang boleh ngomong lagi.`);
        }

        if (cmd === '/warn') {
            userWarnings[key] = (userWarnings[key] || 0) + 1;
            if (userWarnings[key] >= 3) {
                await tgCall('banChatMember', { chat_id: chatId, user_id: target.id });
                await tgCall('unbanChatMember', { chat_id: chatId, user_id: target.id });
                userWarnings[key] = 0;
                await sendMessage(chatId, `⛔ *${target.first_name}* melanggar batas (3/3) warn! Auto Kick diterapkan.`);
            } else {
                await sendMessage(chatId, `⚠️ Peringatan untuk *${target.first_name}* (${userWarnings[key]}/3). Alasan: ${args || 'Melanggar aturan'}`);
            }
        }

        if (cmd === '/warnings') {
            await sendMessage(chatId, `📋 Total catatan pelanggaran *${target.first_name}*: *${userWarnings[key] || 0}/3*`);
        }

        if (cmd === '/pin') {
            await tgCall('pinChatMessage', { chat_id: chatId, message_id: msg.reply_to_message.message_id });
            await sendMessage(chatId, "📌 Pesan berhasil disematkan di atas!");
        }

        if (cmd === '/delete') {
            await tgCall('deleteMessage', { chat_id: chatId, message_id: msg.reply_to_message.message_id });
            await tgCall('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
        }

        if (cmd === '/settopic') {
            if (!args) { await sendMessage(chatId, "Contoh: `/settopic Deskripsi Baru`"); return; }
            await tgCall('setChatDescription', { chat_id: chatId, description: args });
            await sendMessage(chatId, `✅ Topik deskripsi grup sukses diperbarui.`);
        }

        if (cmd === '/setwelcome') {
            welcomeConfig[chatId] = { enabled: true, message: args || "Selamat bergabung {name}! 🎉" };
            await sendMessage(chatId, "✅ Format sambutan kustom berhasil disimpan.");
        }
        return;
    }

    if (cmd === '/broadcast' && chatType === 'channel') {
        if (!args) return;
        await tgCall('sendMessage', { chat_id: chatId, text: `📢 *PENGUMUMAN UTAMA*\n\n${args}`, parse_mode: "Markdown" });
        return;
    }

    await sendMessage(chatId, `❓ Perintah \`${cmd}\` tidak dikenali oleh Nyx. Jalankan /help.`);
}

// ============================================================
//  ⏰ INTERVAL RUNTIME TICKER (Simulasi background task)
// ============================================================
setInterval(async () => {
    const now = Date.now();
    for (let i = reminderQueue.length - 1; i >= 0; i--) {
        const r = reminderQueue[i];
        if (now >= r.fireAt) {
            await sendMessage(r.chatId, `⏰ *PENGINGAT OTOMATIS NYX:* ${r.text}`);
            reminderQueue.splice(i, 1);
        }
    }
}, 15000);

// ============================================================
//  🚀 MAIN INCOMING WEBHOOK HANDLER
// ============================================================
app.post('/api', async (req, res) => {
    const update = req.body;

    try {
        if (update.callback_query) {
            await tgCall('answerCallbackQuery', { callback_query_id: update.callback_query.id });
            res.status(200).send('OK');
            return;
        }

        // Fitur Otomatis: Welcome Message Member Baru
        if (update.message?.new_chat_members) {
            const chatId = update.message.chat.id;
            const cfg = welcomeConfig[chatId];
            for (const member of update.message.new_chat_members) {
                if (member.is_bot) continue;
                const msgText = cfg?.message 
                    ? cfg.message.replace('{name}', member.first_name)
                    : `👋 Halo *${member.first_name}*, selamat datang di grup! Panggil gue pake /help ya.`;
                await sendMessage(chatId, msgText);
            }
            res.status(200).send('OK');
            return;
        }

        const msg = update.message || update.channel_post;
        if (!msg) { res.status(200).send('OK'); return; }

        const chatId   = msg.chat.id;
        const chatType = msg.chat.type;
        const userId   = msg.from?.id;
        const userName = msg.from?.first_name || 'User';
        let userText   = msg.text || msg.caption || "";

        // Fitur Otomatis: Rate Limiter Anti Spam
        if (userId && !rateCheck(userId)) { res.status(200).send('OK'); return; }

        // Fitur Otomatis: Tracking Statistik Chat
        if (userId && chatType !== 'private') {
            if (!chatStats[chatId]) chatStats[chatId] = {};
            if (!chatStats[chatId][userId]) chatStats[chatId][userId] = { name: userName, count: 0 };
            chatStats[chatId][userId].count++;
            chatStats[chatId][userId].name = userName;
        }

        // Fitur Otomatis: Deteksi User AFK Kembali
        if (userId && msg.text && !msg.text.startsWith('/afk')) {
            const afkKey = `${chatId}_${userId}`;
            if (afkUsers[afkKey]) {
                const duration = Math.round((Date.now() - afkUsers[afkKey].since) / 60000);
                delete afkUsers[afkKey];
                await sendMessage(chatId, `👋 *${userName}* sudah kembali online setelah AFK selama ~${duration} menit!`);
            }
        }

        // Fitur Otomatis: Deteksi Mention User yang Sedang AFK
        if (msg.reply_to_message?.from?.id) {
            const repliedId = msg.reply_to_message.from.id;
            const targetKey = `${chatId}_${repliedId}`;
            if (afkUsers[targetKey]) {
                const info = afkUsers[targetKey];
                await sendMessage(chatId, `💤 Jangan diganggu dulu, *${info.name}* lagi AFK dengan alasan: _${info.reason}_`);
            }
        }

        // Filter Grup/Channel: Cek Pemicu Chat Bot (Mention, Command, atau Reply)
        if (chatType !== 'private') {
            const botUsername = "@clawuddbot";
            const isMentioned = userText.toLowerCase().includes(botUsername.toLowerCase());
            const isCommand   = userText.startsWith('/');
            const isReply     = msg.reply_to_message?.from?.is_bot;

            if (!isMentioned && !isCommand && !isReply) { res.status(200).send('OK'); return; }
            userText = userText.replace(new RegExp(botUsername, 'gi'), '').trim();
        }

        // Filter Stiker Masuk
        if (msg.sticker) {
            await sendMessage(chatId, "Stikernya seru abis! Tapi gue lebih jago bales teks chat atau analisis foto nih. 😄");
            res.status(200).send('OK');
            return;
        }

        // Router Perintah Command Handler
        if (userText.startsWith('/')) {
            await handleCommand(msg, chatId, chatType, userId, userName, userText);
            res.status(200).send('OK');
            return;
        }

        // Multimodal Vision Handler (Foto)
        let imageUrl = null;
        if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`);
            const fileData = await fileRes.json();
            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            if (!userText) userText = "Coba jelaskan isi gambar ini.";
        }

        // Fitur Otomatis: Handler Analisis Dokumen File .txt
        if (msg.document && msg.document.mime_type === 'text/plain') {
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${msg.document.file_id}`);
            const fileData = await fileRes.json();
            const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            const textContent = await (await fetch(fileUrl)).text();
            userText = `Lakukan analisis mendalam terhadap isi teks dokumen ini:\n\n${textContent.slice(0, 3000)}`;
        }

        if (!userText && !imageUrl) { res.status(200).send('OK'); return; }

        // Trigger Efek Indikator Mengetik Telegram
        await tgCall('sendChatAction', { chat_id: chatId, action: 'typing' });

        // Tembak Server AI Groq
        const rawReply = await callAI(chatId, userText, imageUrl);
        await sendAIReply(chatId, rawReply);

    } catch (error) {
        console.error('[NYX ENGINE CRASH]', error);
        await sendMessage(chatId, `⚠️ *Crash Engine:* \`${error.message}\``);
    }

    // PENGAMAN AKHIR LIFE-CYCLE: Mengirimkan status OK ke Telegram di akhir eksekusi lengkap
    if (!res.headersSent) {
        res.status(200).send('OK');
    }
});

app.get('/', (req, res) => res.send('🤖 Nyx Engine Multi-Features is fully active!'));

module.exports = app;
