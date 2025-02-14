import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

let currentUser;

// Cek status login
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUsers();
        listenForMessages();
    } else {
        window.location.href = "index.html";
    }
});

// Menampilkan daftar pengguna
function loadUsers() {
    const userList = document.getElementById("user-list");
    userList.innerHTML = "";

    onSnapshot(collection(db, "users"), (snapshot) => {
        snapshot.forEach((doc) => {
            const user = doc.data();
            if (user.email !== currentUser.email) {
                const div = document.createElement("div");
                div.classList.add("user");
                div.innerHTML = `
                    <img src="${user.avatar}" width="40">
                    <span>${user.username}</span>
                    <span>${user.online ? "🟢 Online" : "⚪ Offline"}</span>
                `;
                div.onclick = () => startChat(doc.id, user.username);
                userList.appendChild(div);
            }
        });
    });
}

// Memulai obrolan
let selectedUserId = null;
function startChat(userId, username) {
    selectedUserId = userId;
    document.getElementById("chat-header").textContent = `Chat with ${username}`;
    listenForMessages();
}

// Mengirim pesan teks
async function sendMessage() {
    const messageInput = document.getElementById("message");
    const text = messageInput.value;
    if (text.trim() === "" || !selectedUserId) return;

    await addDoc(collection(db, "messages"), {
        sender: currentUser.uid,
        receiver: selectedUserId,
        text: text,
        timestamp: serverTimestamp()
    });

    messageInput.value = "";
}

// Mendengarkan pesan
function listenForMessages() {
    if (!selectedUserId) return;
    
    const messagesDiv = document.getElementById("messages");
    messagesDiv.innerHTML = "";

    const q = query(collection(db, "messages"), orderBy("timestamp"));
    onSnapshot(q, (snapshot) => {
        snapshot.forEach((doc) => {
            const msg = doc.data();
            if ((msg.sender === currentUser.uid && msg.receiver === selectedUserId) ||
                (msg.sender === selectedUserId && msg.receiver === currentUser.uid)) {
                
                const div = document.createElement("div");
                div.classList.add("message", msg.sender === currentUser.uid ? "sent" : "received");
                div.textContent = msg.text;
                messagesDiv.appendChild(div);
            }
        });

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Upload file
async function uploadFile() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    if (!file || !selectedUserId) return;

    const storageRef = ref(storage, `uploads/${file.name}`);
    await uploadBytes(storageRef, file);

    const fileURL = await getDownloadURL(storageRef);
    await addDoc(collection(db, "messages"), {
        sender: currentUser.uid,
        receiver: selectedUserId,
        file: fileURL,
        fileName: file.name,
        timestamp: serverTimestamp()
    });

    alert("File berhasil dikirim!");
}

import { auth, db } from "./firebase-config.js";
import { doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let typingTimeout;

// Fungsi untuk mendeteksi saat user mengetik
function handleTyping() {
    if (!selectedUserId) return;

    const userDocRef = doc(db, "users", auth.currentUser.uid);
    updateDoc(userDocRef, { typingTo: selectedUserId });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        updateDoc(userDocRef, { typingTo: "" });
    }, 2000);
}

// Menampilkan indikator mengetik
function listenForTyping() {
    const typingIndicator = document.getElementById("typing-indicator");

    onSnapshot(doc(db, "users", selectedUserId), (doc) => {
        const userData = doc.data();
        if (userData.typingTo === auth.currentUser.uid) {
            typingIndicator.innerText = "Sedang mengetik...";
        } else {
            typingIndicator.innerText = "";
        }
    });
}

// Panggil fungsi saat user mulai mengetik
document.getElementById("message").addEventListener("input", handleTyping);

import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

let mediaRecorder;
let audioChunks = [];
const recordButton = document.getElementById("record-button");

recordButton.addEventListener("mousedown", startRecording);
recordButton.addEventListener("mouseup", stopRecording);

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
    });
}

function stopRecording() {
    mediaRecorder.stop();
    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const audioFile = new File([audioBlob], "voice-note.webm", { type: "audio/webm" });

        const storageRef = ref(storage, `voice_notes/${Date.now()}.webm`);
        await uploadBytes(storageRef, audioFile);
        const audioURL = await getDownloadURL(storageRef);

        await addDoc(collection(db, "messages"), {
            sender: auth.currentUser.uid,
            receiver: selectedUserId,
            voiceNote: audioURL,
            timestamp: serverTimestamp()
        });

        audioChunks = [];
    };
}

function loadUsers() {
    const userList = document.getElementById("user-list");
    userList.innerHTML = "";

    onSnapshot(collection(db, "users"), (snapshot) => {
        snapshot.forEach((doc) => {
            const user = doc.data();
            if (user.email !== auth.currentUser.email) {
                const div = document.createElement("div");
                div.classList.add("user");
                div.innerHTML = `
                    <img src="${user.avatar}" width="40">
                    <span>${user.username} ${user.verified ? "✔️" : ""}</span>
                    <span>${user.online ? "🟢 Online" : "⚪ Offline"}</span>
                `;
                div.onclick = () => startChat(doc.id, user.username);
                userList.appendChild(div);
            }
        });
    });
}
