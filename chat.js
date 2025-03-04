import { auth, db, storage } from "./firebase-config.js";
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    addDoc, 
    doc, 
    getDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

let selectedUserId = null;
let mediaRecorder = null;
let audioChunks = [];
let isGeminiChat = false;

// Initialize chat interface
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            window.location.href = "/";
            return;
        }

        // Get user ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('user');
        if (userId) {
            const targetUserDoc = await getDoc(doc(db, "users", userId));
            if (targetUserDoc.exists()) {
                const targetUser = targetUserDoc.data();
                startChat(userId, targetUser);
            }
        }
    } else {
        window.location.href = "/";
    }
});

// Start chat with selected user
function startChat(userId, userData) {
    selectedUserId = userId;
    isGeminiChat = userId === 'gemini';

    // Update header with user info
    document.getElementById("recipient-avatar").src = isGeminiChat 
        ? 'https://seeklogo.com/images/G/google-gemini-logo-6D598FC0E1-seeklogo.com.png' 
        : userData.avatar;
    document.getElementById("recipient-name").textContent = isGeminiChat 
        ? 'SpovaAI' 
        : userData.username;

    // Show appropriate badges
    document.getElementById("veriduck-badge").style.display = userData.veriduck ? "inline-flex" : "none";
    document.getElementById("verifiedvip-badge").style.display = userData.verifiedvip ? "inline-flex" : "none";
    document.getElementById("verified-badge").style.display = userData.verified ? "inline-flex" : "none";
    updateOnlineStatus(true);

    // Listen for online status changes
    onSnapshot(doc(db, "users", userId), (doc) => {
        if (doc.exists()) {
            updateOnlineStatus(doc.data().online);
        }
    });

    loadMessages();
    setupMediaHandlers();
}

// Update online status display
function updateOnlineStatus(isOnline) {
    const statusIcon = document.querySelector('.status-icon');
    const statusText = document.querySelector('.status-text');
    
    if (statusIcon && statusText) {
        statusIcon.style.color = isOnline ? 'var(--online)' : 'var(--offline)';
        statusText.textContent = isOnline ? 'Online' : 'Offline';
    }
}

// Load and display messages
function loadMessages() {
    const messagesDiv = document.getElementById("messages");
    const q = query(
        collection(db, "messages"),
        orderBy("timestamp")
    );

    // Mark messages as read
    const markAsRead = async (messageDoc) => {
        if (messageDoc.data().receiver === auth.currentUser.uid && !messageDoc.data().read) {
            await updateDoc(doc(db, "messages", messageDoc.id), {
                read: true
            });
        }
    };

    onSnapshot(q, (snapshot) => {
        messagesDiv.innerHTML = "";
        snapshot.forEach((doc) => {
            const msg = doc.data();
            if ((msg.sender === auth.currentUser.uid && msg.receiver === selectedUserId) ||
                (msg.sender === selectedUserId && msg.receiver === auth.currentUser.uid)) {
                displayMessage(msg);
            }
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

// Display a message
function displayMessage(msg) {
    const messagesDiv = document.getElementById("messages");
    const div = document.createElement("div");
    div.className = `message ${msg.sender === auth.currentUser.uid ? "sent" : "received"}`;

    if (msg.text) {
        div.textContent = msg.text;
    } else if (msg.image) {
        div.innerHTML = `<img src="${msg.image}" alt="Image" style="max-width: 200px; border-radius: 8px;">`;
    } else if (msg.file) {
        div.innerHTML = `<a href="${msg.file}" target="_blank" style="color: inherit;"><i class="fas fa-file"></i> ${msg.fileName}</a>`;
    } else if (msg.audio) {
        div.innerHTML = `
            <audio controls style="max-width: 200px;">
                <source src="${msg.audio}" type="audio/webm">
            </audio>`;
    }

    messagesDiv.appendChild(div);
}

// Setup media handlers
function setupMediaHandlers() {
    // Voice recording
    const voiceBtn = document.getElementById('voice-btn');
    voiceBtn.addEventListener('mousedown', startRecording);
    voiceBtn.addEventListener('mouseup', stopRecording);
    voiceBtn.addEventListener('mouseleave', stopRecording);

    // File upload
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', handleFileUpload);

    // Image upload
    const imageInput = document.getElementById('image-input');
    imageInput.addEventListener('change', handleImageUpload);
}

// Voice recording functions
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        audioChunks = [];

        mediaRecorder.addEventListener("dataavailable", event => {
            audioChunks.push(event.data);
        });

        document.getElementById('voice-btn').style.color = 'var(--primary-color)';
    } catch (error) {
        console.error("Error starting recording:", error);
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        document.getElementById('voice-btn').style.color = 'var(--text-secondary)';

        mediaRecorder.addEventListener("stop", async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`);
            await uploadMedia(audioFile, 'audio');
        });
    }
}

// File upload handler
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        await uploadMedia(file, 'file');
        e.target.value = '';
    }
}

// Image upload handler
async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        await uploadMedia(file, 'image');
        e.target.value = '';
    }
}

// Generic media upload function
async function uploadMedia(file, type) {
    try {
        const storageRef = ref(storage, `${type}s/${Date.now()}-${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const messageData = {
            sender: auth.currentUser.uid,
            receiver: selectedUserId,
            timestamp: serverTimestamp()
        };

        if (type === 'audio') {
            messageData.audio = url;
        } else if (type === 'image') {
            messageData.image = url;
        } else {
            messageData.file = url;
            messageData.fileName = file.name;
        }

        await addDoc(collection(db, "messages"), messageData);
    } catch (error) {
        console.error(`Error uploading ${type}:`, error);
    }
}

// Send text message
window.sendMessage = async () => {
    const messageInput = document.getElementById("message");
    const text = messageInput.value.trim();

    if (text && (selectedUserId || isGeminiChat)) {
        try {
            if (isGeminiChat) {
                // Display user message
                displayMessage({
                    sender: auth.currentUser.uid,
                    text: text,
                    timestamp: serverTimestamp()
                });

                // Show typing indicator
                const typingDiv = document.createElement('div');
                typingDiv.className = 'message received typing';
                typingDiv.textContent = 'Gemini is typing...';
                document.getElementById('messages').appendChild(typingDiv);

                // Call Gemini API and display response
                try {
                    const response = await fetch('/gemini/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ message: text })
                    });

                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }

                    const data = await response.json();

                    // Remove typing indicator
                    document.querySelector('.typing')?.remove();

                    if (data.error) {
                        throw new Error(data.error);
                    }

                    // Display Gemini's response
                    displayMessage({
                        sender: 'gemini',
                        text: data.response,
                        timestamp: serverTimestamp()
                    });
                } catch (error) {
                    console.error('Gemini API error:', error);
                    document.querySelector('.typing')?.remove();
                    displayMessage({
                        sender: 'gemini',
                        text: 'Sorry, I encountered an error. Please try again.',
                        timestamp: serverTimestamp()
                    });
                }
            } else {
                await addDoc(collection(db, "messages"), {
                    sender: auth.currentUser.uid,
                    receiver: selectedUserId,
                    text: text,
                    timestamp: serverTimestamp()
                });
            }
            messageInput.value = "";
        } catch (error) {
            console.error("Error sending message:", error);
        }
    }
};

// Navigation
window.closeChat = () => {
    window.location.href = "users.html";
};

// Add event listener for Enter key
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById("message");
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            window.sendMessage();
        }
    });
});
