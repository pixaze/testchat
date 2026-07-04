const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const RAPIDAPI_KEY    = process.env.RAPIDAPI_KEY || '9197f7ec2amsh186baf09ebbb499p191ecajsn0f3dd396564a';

// ============================================================
//  💾 IN-MEMORY STORE (ganti Redis/DB buat produksi)
// ============================================================
const conversationHistory = {};  // { chatId: [ {role, content}, ... ] }
const userWarnings = {};         // { `${chatId}_${userId}`: count }
const mutedUsers = {};           // { `${chatId}_${userId}`: true }
const userModes = {};            // { chatId: 'normal' | 'roast' | 'formal' | 'story' }
const pollVotes = {};            // { chatId: { question, options: [{text, voters:[]}] } }
const reminderQueue = [];        // [{ chatId, text, fireAt }]
const afkUsers = {};             // { `${chatId}_${userId}`: { reason, since } }
const chatStats = {};            // { chatId: { userId: { name, count } } }
const triviaSession = {};        // { chatId: { q, answer, active } }
const welcomeConfig = {};        // { chatId: { enabled, message } }
const rateLimit = {};            // { userId: lastTimestamp }

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
Lebih dari 85% respon harus teks biasa tanpa stiker. Sisipkan [[STICKER:nama]] HANYA jika benar-benar cocok.
Pilihan: ga_masuk_akal, anjing_berak, ngakak, nangis, oke.

RIWAYAT PERCAKAPAN: Kamu bisa mengingat konteks percakapan sebelumnya dalam satu sesi.`;

const MODE_PROMPTS = {
    normal: '',
    roast:  '\n\nMODE AKTIF: ROAST MODE. Balas semua pesan dengan roast pedas tapi lucu, gak serius.',
    formal: '\n\nMODE AKTIF: FORMAL. Gunakan bahasa Indonesia baku yang sopan dan profesional.',
    story:  '\n\nMODE AKTIF: STORYTELLER. Jadikan setiap jawaban sebagai narasi cerita pendek yang kreatif.',
    debate: '\n\nMODE AKTIF: DEBAT. Selalu ambil posisi berlawanan dari user dan pertahankan dengan argumen logis.',
    uwu:    '\n\nMODE AKTIF: UWU. Balas dengan bahasa uwu imut khas anime, tapi tetap informatif :3',
};

// ============================================================
//  🎲 DATA TRIVIA
// ============================================================
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
    try {
        const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!r.ok) {
            const errText = await r.text();
            console.error(`[tgCall] ${method} failed ${r.status}:`, errText.slice(0, 200));
            return { ok: false, error: errText };
        }
        return r.json();
    } catch (err) {
        console.error(`[tgCall] ${method} exception:`, err.message);
        return { ok: false, error: err.message };
    }
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

async function sendPhoto(chatId, url, caption = '') {
    await tgCall('sendPhoto', { chat_id: chatId, photo: url, caption, parse_mode: "Markdown" });
}

async function deleteMessage(chatId, messageId) {
    await tgCall('deleteMessage', { chat_id: chatId, message_id: messageId });
}

async function pinMessage(chatId, messageId) {
    await tgCall('pinChatMessage', { chat_id: chatId, message_id: messageId });
}

async function getMemberStatus(chatId, userId) {
    const r = await tgCall('getChatMember', { chat_id: chatId, user_id: userId });
    return r?.result?.status;
}

async function isAdmin(chatId, userId) {
    const status = await getMemberStatus(chatId, userId);
    return ['administrator', 'creator'].includes(status);
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

// ============================================================
//  🤖 AI CALL (dengan memory)
// ============================================================
async function callAI(chatId, userContent, imageUrl = null) {
    const modelToUse = imageUrl
        ? "meta-llama/llama-4-scout-17b-16e-instruct"
        : "openai/gpt-oss-120b";

    if (!conversationHistory[chatId]) conversationHistory[chatId] = [];

    let contentPayload = imageUrl
        ? [{ type: "text", text: userContent }, { type: "image_url", image_url: { url: imageUrl } }]
        : userContent;

    conversationHistory[chatId].push({ role: "user", content: contentPayload });

    // Batasi history ke 20 pesan terakhir agar token hemat
    if (conversationHistory[chatId].length > 20) {
        conversationHistory[chatId] = conversationHistory[chatId].slice(-20);
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelToUse,
            messages: [
                { role: "system", content: getSystemPrompt(chatId) },
                ...conversationHistory[chatId]
            ],
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

// ============================================================
//  📤 KIRIM BALASAN AI (parsing stiker)
// ============================================================
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
//  ⏰ REMINDER CHECKER (cek tiap 30 detik)
// ============================================================
setInterval(async () => {
    const now = Date.now();
    for (let i = reminderQueue.length - 1; i >= 0; i--) {
        const r = reminderQueue[i];
        if (now >= r.fireAt) {
            await sendMessage(r.chatId, `⏰ *Reminder:* ${r.text}`);
            reminderQueue.splice(i, 1);
        }
    }
}, 30000);

// ============================================================
//  📊 FUNGSI POLLING
// ============================================================
async function sendPoll(chatId, question, options) {
    await tgCall('sendPoll', {
        chat_id: chatId,
        question,
        options,
        is_anonymous: false,
        allows_multiple_answers: false
    });
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
            await sendMessage(chatId, "⛔ Command ini khusus admin grup.");
            return false;
        }
        return true;
    };

    // ── /start ─────────────────────────────────────────────
    if (cmd === '/start') {
        await sendMessage(chatId,
`🤖 *Halo! Gue Nyx, AI Bot Telegram lo!*

Gue bisa nemenin lo ngobrol, jawab pertanyaan, analisis foto, moderasi grup, dan banyak lagi.

Ketik /help buat liat semua fitur lengkapnya. 🚀`
        );
        return;
    }

    // ── /help ─────────────────────────────────────────────
    if (cmd === '/help') {
        await sendMessage(chatId,
`📖 *Daftar Lengkap Perintah Nyx*

*🤖 AI & Chat*
/clear — Reset memori percakapan
/mode [normal|roast|formal|story|debate|uwu] — Ganti gaya bicara Nyx
/tanya [pertanyaan] — Tanya AI langsung
/ringkas [teks] — Ringkas teks panjang
/translate [lang] [teks] — Terjemahkan teks
/code [bahasa] [deskripsi] — Generate kode
/roast [@user] — Roast seseorang (for fun)

*🛠️ Tools*
/cuaca [kota] — Info cuaca kota (simulasi)
/kalkulator [ekspresi] — Hitung ekspresi matematika
/reminder [menit] [pesan] — Set pengingat
/poll [pertanyaan] | [op1] | [op2] | ... — Buat polling

*🎮 Games & Fun*
/trivia — Tebak pertanyaan random
/tebak [jawaban] — Jawab trivia aktif
/kata — Game tebak kata (coming soon)
/dice [sisi] — Lempar dadu (default 6)
/coinflip — Lempar koin
/quote — Kutipan inspiratif random
/zodiak [tanda] — Ramalan zodiak hari ini

*👥 Grup & Moderasi (Admin)*
/ban — Ban user (reply pesan targetnya)
/kick — Kick user (reply)
/mute — Mute user (reply)
/unmute — Unmute user (reply)
/warn — Beri peringatan (reply) — 3x = kick
/warnings — Lihat peringatan user (reply)
/pin — Pin pesan (reply)
/delete — Hapus pesan (reply)
/settopic [topik] — Ubah deskripsi grup
/setwelcome [pesan] — Set pesan sambutan
/stats — Statistik aktivitas chat
/afk [alasan] — Set status AFK

*📺 Channel*
/broadcast [pesan] — Kirim pesan ke channel (admin)

*📱 Menu*
/menu — Buka portal mini apps`
        );
        return;
    }

    // ── /clear ────────────────────────────────────────────
    if (cmd === '/clear') {
        conversationHistory[chatId] = [];
        await sendMessage(chatId, "🧹 Memori percakapan gue udah di-reset! Kita mulai dari awal ya.");
        return;
    }

    // ── /mode ─────────────────────────────────────────────
    if (cmd === '/mode') {
        const valid = Object.keys(MODE_PROMPTS);
        if (!args || !valid.includes(args)) {
            await sendMessage(chatId, `Mode yang tersedia: ${valid.map(m => `\`${m}\``).join(', ')}\nContoh: /mode roast`);
            return;
        }
        userModes[chatId] = args;
        await sendMessage(chatId, `✅ Mode berhasil diganti ke *${args.toUpperCase()}*! Cobain ngobrol sama gue sekarang.`);
        return;
    }

    // ── /tanya ────────────────────────────────────────────
    if (cmd === '/tanya') {
        if (!args) { await sendMessage(chatId, "Contoh: /tanya siapa itu Elon Musk?"); return; }
        const reply = await callAI(chatId, args);
        await sendAIReply(chatId, reply);
        return;
    }

    // ── /ringkas ──────────────────────────────────────────
    if (cmd === '/ringkas') {
        if (!args) { await sendMessage(chatId, "Contoh: /ringkas [teks panjang lo]"); return; }
        const reply = await callAI(chatId, `Ringkas teks ini dengan singkat dan jelas:\n\n${args}`);
        await sendAIReply(chatId, reply);
        return;
    }

    // ── /translate ────────────────────────────────────────
    if (cmd === '/translate') {
        const parts = args.split(' ');
        const lang = parts[0];
        const text = parts.slice(1).join(' ');
        if (!lang || !text) { await sendMessage(chatId, "Contoh: /translate english halo dunia"); return; }
        const reply = await callAI(chatId, `Terjemahkan teks berikut ke bahasa ${lang}. Balas HANYA hasil terjemahannya saja:\n\n${text}`);
        await sendAIReply(chatId, reply);
        return;
    }

    // ── /code ─────────────────────────────────────────────
    if (cmd === '/code') {
        const parts = args.split(' ');
        const lang = parts[0];
        const desc = parts.slice(1).join(' ');
        if (!lang || !desc) { await sendMessage(chatId, "Contoh: /code python fungsi fibonacci"); return; }
        const reply = await callAI(chatId, `Buatkan kode ${lang} untuk: ${desc}. Sertakan penjelasan singkat.`);
        await sendAIReply(chatId, reply);
        return;
    }

    // ── /roast ────────────────────────────────────────────
    if (cmd === '/roast') {
        const target = args || userName;
        const reply = await callAI(chatId, `Roast orang bernama "${target}" dengan gaya lucu dan kreatif, gak serius, gak menyinggung SARA. Max 3 kalimat.`);
        await sendAIReply(chatId, reply);
        return;
    }

    // ── /kalkulator ───────────────────────────────────────
    if (cmd === '/kalkulator' || cmd === '/calc') {
        if (!args) { await sendMessage(chatId, "Contoh: /kalkulator 25 * 4 + 10"); return; }
        try {
            // Evaluasi ekspresi matematika sederhana (aman — hanya angka & operator)
            const sanitized = args.replace(/[^0-9+\-*/().\s%]/g, '');
            // eslint-disable-next-line no-new-func
            const result = Function(`"use strict"; return (${sanitized})`)();
            await sendMessage(chatId, `🔢 *Hasil:*\n\`${sanitized}\` = *${result}*`);
        } catch {
            await sendMessage(chatId, "❌ Ekspresi gak valid. Contoh: \`25 * 4 + 10\`");
        }
        return;
    }

    // ── /reminder ─────────────────────────────────────────
    if (cmd === '/reminder') {
        const parts = args.split(' ');
        const minutes = parseInt(parts[0]);
        const text = parts.slice(1).join(' ');
        if (isNaN(minutes) || !text) {
            await sendMessage(chatId, "Contoh: /reminder 10 Minum air putih");
            return;
        }
        reminderQueue.push({ chatId, text, fireAt: Date.now() + minutes * 60000 });
        await sendMessage(chatId, `⏰ Oke! Gue bakal ingetin lo soal "*${text}*" dalam *${minutes} menit*.`);
        return;
    }

    // ── /poll ─────────────────────────────────────────────
    if (cmd === '/poll') {
        const parts = args.split('|').map(p => p.trim());
        if (parts.length < 3) {
            await sendMessage(chatId, "Contoh: /poll Pilih makanan? | Nasi Goreng | Mie Ayam | Soto");
            return;
        }
        const question = parts[0];
        const options = parts.slice(1);
        await sendPoll(chatId, question, options);
        return;
    }

    // ── /dice ─────────────────────────────────────────────
    if (cmd === '/dice') {
        const sides = parseInt(args) || 6;
        if (sides < 2 || sides > 100) { await sendMessage(chatId, "Sisi dadu harus antara 2–100."); return; }
        const result = Math.floor(Math.random() * sides) + 1;
        await sendMessage(chatId, `🎲 Dadu ${sides} sisi: *${result}*`);
        return;
    }

    // ── /coinflip ─────────────────────────────────────────
    if (cmd === '/coinflip') {
        const result = Math.random() > 0.5 ? '🪙 HEADS (Gambar)' : '🪙 TAILS (Angka)';
        await sendMessage(chatId, `Hasil lempar koin: *${result}*`);
        return;
    }

    // ── /quote ────────────────────────────────────────────
    if (cmd === '/quote') {
        const quotes = [
            { q: "Kode yang bagus adalah dokumentasi terbaiknya.", a: "Steve McConnell" },
            { q: "Pertama, selesaikan masalahnya. Kemudian, tulis kodenya.", a: "John Johnson" },
            { q: "Satu-satunya cara untuk melakukan pekerjaan hebat adalah mencintai apa yang kamu lakukan.", a: "Steve Jobs" },
            { q: "Jika debuggingnya adalah proses menghapus bug, maka programming adalah proses memasukkan bug.", a: "Edsger Dijkstra" },
            { q: "Belajar tidak pernah melelahkan pikiran.", a: "Leonardo da Vinci" },
            { q: "Kesalahan adalah bukti bahwa kamu sedang mencoba.", a: "Unknown" },
            { q: "Data beats opinions.", a: "Anonymous" },
            { q: "Kode seperti humor: kalau harus dijelaskan, maka itu jelek.", a: "Cory House" },
        ];
        const pick = quotes[Math.floor(Math.random() * quotes.length)];
        await sendMessage(chatId, `💬 _"${pick.q}"_\n— *${pick.a}*`);
        return;
    }

    // ── /zodiak ───────────────────────────────────────────
    if (cmd === '/zodiak') {
        if (!args) { await sendMessage(chatId, "Contoh: /zodiak scorpio"); return; }
        const reply = await callAI(chatId, `Berikan ramalan zodiak ${args} hari ini yang fun, singkat (max 3 kalimat), dan gak terlalu serius.`);
        await sendAIReply(chatId, reply);
        return;
    }

    // ── /trivia ───────────────────────────────────────────
    if (cmd === '/trivia') {
        if (triviaSession[chatId]?.active) {
            await sendMessage(chatId, `⚡ Trivia lagi aktif!\n\n*${triviaSession[chatId].q}*\n\nJawab dengan /tebak [jawaban]`);
            return;
        }
        const pick = TRIVIA_LIST[Math.floor(Math.random() * TRIVIA_LIST.length)];
        triviaSession[chatId] = { q: pick.q, answer: pick.a, active: true };
        await sendMessage(chatId, `🧠 *TRIVIA TIME!*\n\n${pick.q}\n\nKetik /tebak [jawaban] lo!`);
        return;
    }

    // ── /tebak ────────────────────────────────────────────
    if (cmd === '/tebak') {
        const session = triviaSession[chatId];
        if (!session?.active) { await sendMessage(chatId, "Belum ada trivia aktif. Mulai dulu dengan /trivia!"); return; }
        if (!args) { await sendMessage(chatId, "Contoh: /tebak Canberra"); return; }
        if (args.toLowerCase().trim() === session.answer.toLowerCase()) {
            triviaSession[chatId] = null;
            await sendSticker(chatId, STICKER_DATABASE['ngakak']);
            await sendMessage(chatId, `✅ *BENERRRR!* Mantap jiwa, *${userName}*! Jawabannya memang *${session.answer}*.`);
        } else {
            await sendMessage(chatId, `❌ Salah! Coba lagi atau ketik /trivia buat soal baru.`);
        }
        return;
    }

    // ── /cuaca ────────────────────────────────────────────
    if (cmd === '/cuaca') {
        if (!args) { await sendMessage(chatId, "Contoh: /cuaca Jakarta"); return; }
        // Simulasi cuaca (connect ke OpenWeatherMap API kalau mau real)
        const conditions = ['☀️ Cerah', '⛅ Berawan', '🌧️ Hujan Ringan', '⛈️ Badai', '🌤️ Partly Cloudy'];
        const temps = [26, 28, 30, 32, 24, 22, 29, 31];
        const cond = conditions[Math.floor(Math.random() * conditions.length)];
        const temp = temps[Math.floor(Math.random() * temps.length)];
        const humidity = Math.floor(Math.random() * 40) + 50;
        await sendMessage(chatId,
`🌍 *Cuaca ${args}* _(Simulasi)_

Kondisi: ${cond}
🌡️ Suhu: *${temp}°C*
💧 Kelembaban: *${humidity}%*
💨 Angin: ${Math.floor(Math.random() * 20) + 5} km/h

_Untuk data real, connect ke OpenWeatherMap API._`
        );
        return;
    }

    // ── /afk ─────────────────────────────────────────────
    if (cmd === '/afk') {
        const key = `${chatId}_${userId}`;
        afkUsers[key] = { reason: args || 'Lagi away', since: Date.now(), name: userName };
        await sendMessage(chatId, `😴 *${userName}* sekarang AFK: _${args || 'Lagi away'}_`);
        return;
    }

    // ── /stats ────────────────────────────────────────────
    if (cmd === '/stats') {
        const stats = chatStats[chatId];
        if (!stats || Object.keys(stats).length === 0) {
            await sendMessage(chatId, "Belum ada statistik chat. Mulai ngobrol dulu!");
            return;
        }
        const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
        const lines = sorted.map(([, v], i) => `${i + 1}. *${escapeMarkdown(v.name)}* — ${v.count} pesan`);
        await sendMessage(chatId, `📊 *Top 10 Paling Aktif*\n\n${lines.join('\n')}`);
        return;
    }

    // ── /menu ─────────────────────────────────────────────
    if (cmd === '/menu') {
        await tgCall('sendMessage', {
            chat_id: chatId,
            text: "🌐 *Nyx Portal Mini Apps* 🌐\n\nPilih salah satu aplikasi di bawah ini:",
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🛍️ RelxShop Marketplace",   web_app: { url: "https://relxshop-kamu.vercel.app" } }],
                    [{ text: "📂 Portfolio & Project RPL", web_app: { url: "https://portfolio-kamu.vercel.app" } }],
                    [{ text: "📊 Admin Dashboard",          web_app: { url: "https://admin-kamu.vercel.app" } }],
                    [{ text: "🎮 Mini Game Pixel Art",      web_app: { url: "https://game-kamu.vercel.app" } }],
                    [{ text: "⚙️ Pengaturan Bot AI",        web_app: { url: "https://settings-kamu.vercel.app" } }]
                ]
            }
        });
        return;
    }

    // ──────────────────────────────────────────────────────
    //  COMMAND KHUSUS GRUP / MODERASI
    // ──────────────────────────────────────────────────────
    if (['private', 'channel'].includes(chatType) && ['/ban','/kick','/mute','/unmute','/warn','/warnings','/pin','/delete','/settopic','/setwelcome','/broadcast'].includes(cmd)) {
        await sendMessage(chatId, "⛔ Command moderasi hanya bisa digunakan di grup.");
        return;
    }

    // ── /ban ─────────────────────────────────────────────
    if (cmd === '/ban') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan targetnya dulu, terus ketik /ban"); return; }
        const target = msg.reply_to_message.from;
        const r = await tgCall('banChatMember', { chat_id: chatId, user_id: target.id });
        if (r.result) {
            await sendSticker(chatId, STICKER_DATABASE['anjing_berak']);
            await sendMessage(chatId, `🔨 *${target.first_name}* resmi diban dari grup! Dadah~`);
        } else {
            await sendMessage(chatId, "❌ Gagal ban. Pastiin gue sudah jadi Admin dengan izin 'Ban Users'.");
        }
        return;
    }

    // ── /kick ─────────────────────────────────────────────
    if (cmd === '/kick') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan targetnya dulu, terus ketik /kick"); return; }
        const target = msg.reply_to_message.from;
        await tgCall('banChatMember', { chat_id: chatId, user_id: target.id });
        await tgCall('unbanChatMember', { chat_id: chatId, user_id: target.id });
        await sendMessage(chatId, `🚪 *${target.first_name}* dikick dari grup! Masih bisa balik kalau diundang.`);
        return;
    }

    // ── /mute ─────────────────────────────────────────────
    if (cmd === '/mute') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan targetnya dulu."); return; }
        const target = msg.reply_to_message.from;
        const key = `${chatId}_${target.id}`;
        const r = await tgCall('restrictChatMember', {
            chat_id: chatId, user_id: target.id,
            permissions: { can_send_messages: false, can_send_polls: false, can_send_other_messages: false }
        });
        if (r.result) {
            mutedUsers[key] = true;
            await sendMessage(chatId, `🔇 *${target.first_name}* di-mute. Diem lo dulu.`);
        } else {
            await sendMessage(chatId, "❌ Gagal mute. Periksa izin admin gue.");
        }
        return;
    }

    // ── /unmute ───────────────────────────────────────────
    if (cmd === '/unmute') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan targetnya dulu."); return; }
        const target = msg.reply_to_message.from;
        const key = `${chatId}_${target.id}`;
        const r = await tgCall('restrictChatMember', {
            chat_id: chatId, user_id: target.id,
            permissions: {
                can_send_messages: true, can_send_polls: true, can_send_other_messages: true,
                can_add_web_page_previews: true, can_send_media_messages: true
            }
        });
        if (r.result) {
            delete mutedUsers[key];
            await sendMessage(chatId, `🔊 *${target.first_name}* di-unmute. Silakan ngobrol lagi.`);
        } else {
            await sendMessage(chatId, "❌ Gagal unmute.");
        }
        return;
    }

    // ── /warn ─────────────────────────────────────────────
    if (cmd === '/warn') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan targetnya dulu."); return; }
        const target = msg.reply_to_message.from;
        const key = `${chatId}_${target.id}`;
        userWarnings[key] = (userWarnings[key] || 0) + 1;
        const count = userWarnings[key];
        if (count >= 3) {
            await tgCall('banChatMember', { chat_id: chatId, user_id: target.id });
            await tgCall('unbanChatMember', { chat_id: chatId, user_id: target.id });
            userWarnings[key] = 0;
            await sendMessage(chatId, `⛔ *${target.first_name}* udah dapat 3 peringatan → AUTO KICK!`);
        } else {
            await sendMessage(chatId, `⚠️ *${target.first_name}* dapat peringatan ke-*${count}/3*.\n${args ? `Alasan: _${args}_` : ''}`);
        }
        return;
    }

    // ── /warnings ─────────────────────────────────────────
    if (cmd === '/warnings') {
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan targetnya dulu."); return; }
        const target = msg.reply_to_message.from;
        const key = `${chatId}_${target.id}`;
        const count = userWarnings[key] || 0;
        await sendMessage(chatId, `📋 *${target.first_name}* punya *${count}/3* peringatan.`);
        return;
    }

    // ── /pin ─────────────────────────────────────────────
    if (cmd === '/pin') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan yang mau di-pin."); return; }
        const r = await tgCall('pinChatMessage', { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        if (r.result) await sendMessage(chatId, "📌 Pesan berhasil di-pin!");
        else await sendMessage(chatId, "❌ Gagal pin. Cek izin admin gue.");
        return;
    }

    // ── /delete ───────────────────────────────────────────
    if (cmd === '/delete') {
        if (!await adminOnly()) return;
        if (!msg.reply_to_message) { await sendMessage(chatId, "Reply pesan yang mau dihapus."); return; }
        await tgCall('deleteMessage', { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        await tgCall('deleteMessage', { chat_id: chatId, message_id: msg.message_id });
        return;
    }

    // ── /settopic ─────────────────────────────────────────
    if (cmd === '/settopic') {
        if (!await adminOnly()) return;
        if (!args) { await sendMessage(chatId, "Contoh: /settopic Grup Diskusi Teknologi"); return; }
        const r = await tgCall('setChatDescription', { chat_id: chatId, description: args });
        if (r.result) await sendMessage(chatId, `✅ Deskripsi grup diubah ke: _${args}_`);
        else await sendMessage(chatId, "❌ Gagal ubah deskripsi. Pastiin gue admin.");
        return;
    }

    // ── /setwelcome ───────────────────────────────────────
    if (cmd === '/setwelcome') {
        if (!await adminOnly()) return;
        welcomeConfig[chatId] = { enabled: true, message: args || "Selamat datang {name} di grup ini! 🎉" };
        await sendMessage(chatId, `✅ Pesan sambutan diset!\nPreview: _${welcomeConfig[chatId].message.replace('{name}', 'Member Baru')}_`);
        return;
    }

    // ── /broadcast ────────────────────────────────────────
    if (cmd === '/broadcast') {
        if (!await adminOnly()) return;
        if (!args) { await sendMessage(chatId, "Contoh: /broadcast Halo semua!"); return; }
        await tgCall('sendMessage', { chat_id: chatId, text: `📢 *BROADCAST*\n\n${args}`, parse_mode: "Markdown" });
        return;
    }

    // ── Command tidak dikenal ─────────────────────────────
    await sendMessage(chatId, `❓ Command \`${cmd}\` gak gue kenal. Ketik /help buat lihat semua perintah.`);
}

// ============================================================
//  🚀 MAIN WEBHOOK
// ============================================================
app.post('/api', async (req, res) => {
    const update = req.body;

    // ── Handle inline button callback ─────────────────────
    if (update.callback_query) {
        const cb = update.callback_query;
        await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
        return res.status(200).send('OK');
    }

    // ── Handle new_chat_members (welcome) ─────────────────
    if (update.message?.new_chat_members) {
        const chatId = update.message.chat.id;
        const cfg = welcomeConfig[chatId];
        for (const member of update.message.new_chat_members) {
            if (member.is_bot) continue;
            const wMsg = cfg?.message
                ? cfg.message.replace('{name}', member.first_name)
                : `👋 Halo *${member.first_name}*, selamat datang di *${update.message.chat.title}*! Ketik /help untuk info bot.`;
            await sendMessage(chatId, wMsg);
        }
        return res.status(200).send('OK');
    }

    const msg = update.message || update.channel_post;
    if (!msg) return res.status(200).send('OK');

    const chatId    = msg.chat.id;
    const chatType  = msg.chat.type;
    const userId    = msg.from?.id;
    const userName  = msg.from?.first_name || 'Pengguna';
    let userText    = msg.text || msg.caption || "";

    // ── Rate limiting ─────────────────────────────────────
    if (userId && !rateCheck(userId)) return res.status(200).send('OK');

    // ── Tracking statistik chat ───────────────────────────
    if (userId && chatType !== 'private') {
        if (!chatStats[chatId]) chatStats[chatId] = {};
        if (!chatStats[chatId][userId]) chatStats[chatId][userId] = { name: userName, count: 0 };
        chatStats[chatId][userId].count++;
        chatStats[chatId][userId].name = userName;
    }

    // ── Cek AFK user yang balik ───────────────────────────
    if (userId && msg.text && !msg.text.startsWith('/afk')) {
        const key = `${chatId}_${userId}`;
        if (afkUsers[key]) {
            const since = Math.round((Date.now() - afkUsers[key].since) / 60000);
            delete afkUsers[key];
            await sendMessage(chatId, `👋 *${userName}* sudah kembali! (AFK selama ~${since} menit)`);
        }
    }

    // ── Mention AFK user lain ─────────────────────────────
    if (msg.reply_to_message?.from?.id) {
        const repliedId = msg.reply_to_message.from.id;
        const afkKey = `${chatId}_${repliedId}`;
        if (afkUsers[afkKey]) {
            const info = afkUsers[afkKey];
            const since = Math.round((Date.now() - info.since) / 60000);
            await sendMessage(chatId, `💤 *${info.name}* lagi AFK: _${info.reason}_ (sudah ${since} menit)`);
        }
    }

    try {
        // ── Filter grup/channel: hanya respon jika disebut atau command ──
        if (chatType !== 'private') {
            const botUsername = "@clawuddbot";
            const isMentioned = userText.toLowerCase().includes(botUsername.toLowerCase());
            const isCommand   = userText.startsWith('/');
            const isReply     = msg.reply_to_message?.from?.is_bot;

            if (!isMentioned && !isCommand && !isReply) return res.status(200).send('OK');
            userText = userText.replace(new RegExp(botUsername, 'gi'), '').trim();
        }

        // ── Filter stiker masuk ───────────────────────────
        if (msg.sticker) {
            await sendMessage(chatId, "Stikernya keren! Tapi gue lebih jago bales teks atau analisis foto. 😄");
            return res.status(200).send('OK');
        }

        // ── Command handler ───────────────────────────────
        if (userText.startsWith('/')) {
            await handleCommand(msg, chatId, chatType, userId, userName, userText);
            return res.status(200).send('OK');
        }


        // ── Deteksi link TikTok otomatis ─────────────────
        const tikTokMatch = userText.match(TIKTOK_REGEX);
        if (tikTokMatch) {
            await handleTikTok(chatId, tikTokMatch[0]);
            return res.status(200).send('OK');
        }

        // ── Handler foto (vision) ─────────────────────────
        let imageUrl = null;
        if (msg.photo) {
            const photo   = msg.photo[msg.photo.length - 1];
            const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${photo.file_id}`);
            const fileData = await fileRes.json();
            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            if (!userText) userText = "Coba jelaskan gambar ini.";
        }

        // ── Handler dokumen teks ──────────────────────────
        if (msg.document && msg.document.mime_type === 'text/plain') {
            const fileRes  = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${msg.document.file_id}`);
            const fileData = await fileRes.json();
            const fileUrl  = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
            const content  = await (await fetch(fileUrl)).text();
            userText = `Analisis dokumen ini:\n\n${content.slice(0, 3000)}`;
        }

        // ── Kalau gak ada konten → skip ───────────────────
        if (!userText && !imageUrl) return res.status(200).send('OK');

        // ── Kirim "mengetik..." ───────────────────────────
        await tgCall('sendChatAction', { chat_id: chatId, action: 'typing' });

        // ── Call AI ───────────────────────────────────────
        const rawReply = await callAI(chatId, userText, imageUrl);
        await sendAIReply(chatId, rawReply);

    } catch (error) {
        console.error('[NYX ERROR]', error);
        try { await sendMessage(chatId, `⚠️ *Crash:* \`${error.message}\``); } catch {}
    }

    res.status(200).send('OK');
});

// ============================================================
//  🎵 TIKTOK DOWNLOADER
// ============================================================

/** Regex: cocok untuk vt.tiktok.com, vm.tiktok.com, tiktok.com/@.../video/... */
const TIKTOK_REGEX = /https?:\/\/(vt\.|vm\.)?tiktok\.com\/[^\s]+/i;

async function sendVideo(chatId, videoUrl, caption = '') {
    return tgCall('sendVideo', {
        chat_id:   chatId,
        video:     videoUrl,
        caption:   caption,
        parse_mode: 'Markdown',
        supports_streaming: true
    });
}

async function handleTikTok(chatId, tikTokUrl) {
    await tgCall('sendChatAction', { chat_id: chatId, action: 'upload_video' });
    await sendMessage(chatId, '⏳ Lagi proses download videonya, tunggu sebentar...');

    const apiUrl = `https://tiktok-max-quality.p.rapidapi.com/download/?url=${encodeURIComponent(tikTokUrl)}`;

    const apiRes = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Content-Type':    'application/json',
            'x-rapidapi-host': 'tiktok-max-quality.p.rapidapi.com',
            'x-rapidapi-key':  RAPIDAPI_KEY
        }
    });

    if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error('[TikTok API]', apiRes.status, errText.slice(0, 200));
        await sendMessage(chatId, `❌ TikTok API error (${apiRes.status}). Coba lagi bentar lagi.`);
        return;
    }

    const data = await apiRes.json();
    console.log('[TikTok RAW]', JSON.stringify(data).slice(0, 600));

    // ── Struktur API: { status, message, download_url } ──
    // Prioritas: download_url (root) → fallback path lain
    const video =
        data?.download_url             ||   // ✅ STRUKTUR UTAMA API INI
        data?.data?.play               ||   // fallback format lain
        data?.data?.hdplay             ||
        data?.data?.nwm_video_url      ||
        data?.data?.video?.play_addr?.url_list?.[0] ||
        data?.play                     ||
        data?.hdplay                   ||
        data?.nwm_video_url            ||
        data?.video_url                ||
        null;

    // ── Info kualitas dari field "message" ───────────────
    const quality = data?.message || '';   // contoh: "Original 4K (96MB)"
    const title   = data?.data?.title || data?.title || '';
    const author  = data?.data?.author?.nickname || '';

    if (!video) {
        await sendMessage(chatId,
            `⚠️ API berhasil dipanggil tapi URL video gak ditemukan.\nResponse:\n\`\`\`\n${JSON.stringify(data).slice(0, 400)}\n\`\`\``
        );
        return;
    }

    // ── Caption video ─────────────────────────────────────
    const captionParts = [];
    if (title)   captionParts.push(`🎬 *${title.slice(0, 100)}*`);
    if (author)  captionParts.push(`👤 ${author}`);
    if (quality) captionParts.push(`📦 ${quality}`);
    captionParts.push(`🔗 [Link TikTok](${tikTokUrl})`);
    const caption = captionParts.join('\n');

    // ── Kirim video ke Telegram ───────────────────────────
    const sendResult = await sendVideo(chatId, video, caption);

    if (!sendResult?.ok) {
        // Fallback: Telegram gak bisa fetch URL-nya (redirect/expired)
        // Kirim link langsung buat download manual
        console.error('[TikTok sendVideo fail]', JSON.stringify(sendResult).slice(0, 300));
        await sendMessage(chatId,
            `✅ *Video TikTok ketemu!*\n${quality ? `📦 Kualitas: ${quality}\n` : ''}` +
            `\nTelegram gak bisa auto-kirim filenya. Tap link di bawah buat download:\n\n` +
            `[⬇️ Download Video](${video})`
        );
    }
}

// ============================================================
//  📡 HEALTH CHECK
// ============================================================
app.get('/', (req, res) => res.send('🤖 Nyx Bot is running!'));

module.exports = app;
