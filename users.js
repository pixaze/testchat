import { auth, db } from "./firebase-config.js";
import { 
    collection, 
    query, 
    onSnapshot, 
    getDoc, 
    doc, 
    where,
    orderBy,
    serverTimestamp,
    updateDoc,
    addDoc // Ditambahkan untuk mengirim pesan
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

let currentUser = null;
let contextMenuUser = null;
let showOnlineOnly = false;
let searchTerm = '';
let unreadCounts = {}; // Ditambahkan untuk melacak pesan yang belum dibaca

// Check authentication status
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            updateOnlineStatus(true);
            initializeUsers();
            setupSearch();
            loadUnreadMessages(); // Ditambahkan untuk memuat pesan yang belum dibaca
        } else {
            window.location.href = "/";
        }
    } else {
        window.location.href = "/";
    }
});

// Initialize users display
function initializeUsers() {
    loadActiveUsers();
    loadAllUsers();
    setupContextMenu();
}

// Load active users (users with recent messages)
function loadActiveUsers() {
    const activeUsersDiv = document.getElementById("active-users");
    const q = query(
        collection(db, "messages"),
        where("receiver", "==", currentUser.uid), // Diganti dari participants ke receiver
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, async (snapshot) => {
        const activeUsers = new Set();
        const activeUserPromises = [];

        snapshot.forEach(doc => {
            const message = doc.data();
            const otherUserId = message.sender; // Menggunakan sender sebagai pengganti otherUserId
            if (otherUserId && !activeUsers.has(otherUserId)) {
                activeUsers.add(otherUserId);
                activeUserPromises.push(getDoc(doc(db, "users", otherUserId)));
            }
        });

        const activeUserDocs = await Promise.all(activeUserPromises);
        activeUsersDiv.innerHTML = "";

        activeUserDocs.forEach(userDoc => {
            if (userDoc.exists()) {
                const user = userDoc.data();
                createUserElement(user, userDoc.id, activeUsersDiv);
            }
        });

        document.getElementById("active-count").textContent = activeUsers.size;
    }, (error) => {
        console.error("Error loading active users:", error); // Debugging
    });
}

// Load and display all users
function loadAllUsers() {
    const userList = document.getElementById("user-list");
    const q = query(collection(db, "users"));

    onSnapshot(q, (snapshot) => {
        userList.innerHTML = "";
        let totalCount = 0;

        // Add AI user first
        const aiUser = {
            username: "SPOVA AI",
            bio: "Your AI Assistant",
            online: true,
            verified: true,
            isAI: true
        };
        createUserElement(aiUser, "ai-user", userList);
        totalCount++;

        snapshot.forEach((doc) => {
            const user = doc.data();
            if (user.email !== currentUser.email) {
                if (shouldShowUser(user)) {
                    createUserElement(user, doc.id, userList);
                    totalCount++;
                }
            }
        });

        document.getElementById("total-count").textContent = totalCount;
    }, (error) => {
        console.error("Error loading all users:", error); // Debugging
    });
}

// Load unread messages count
function loadUnreadMessages() {
    const q = query(
        collection(db, "messages"),
        where("receiver", "==", currentUser.uid) // Hanya pesan yang diterima oleh pengguna saat ini
    );

    onSnapshot(q, (snapshot) => {
        unreadCounts = {}; // Reset hitungan
        snapshot.forEach(doc => {
            const message = doc.data();
            const senderId = message.sender;
            const isUnread = message.read === undefined || message.read === false; // Fleksibel untuk data lama
            if (senderId !== currentUser.uid && isUnread) {
                unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
            }
        });
        console.log("Unread Counts:", unreadCounts); // Debugging
        loadActiveUsers(); // Perbarui tampilan
        loadAllUsers();
    }, (error) => {
        console.error("Error loading unread messages:", error); // Debugging
    });
}

// Create user element with enhanced display and unread notification
function createUserElement(user, userId, container) {
    const div = document.createElement("div");
    div.className = "user";
    div.dataset.userId = userId;

    const badgesHtml = getVerificationBadges(user);
    const unreadCount = unreadCounts[userId] || 0;
    const notificationHtml = unreadCount > 0 ? `<span class="unread-notification">${unreadCount}</span>` : '';

    div.innerHTML = `
        <div class="user-avatar">
            <img src="${user.avatar || 'https://dl.dropboxusercontent.com/scl/fi/mwl69ngw90cpfjeu0vi0s/7bf0ecf8-65b2-459c-bce6-8a954d7d1685.png?rlkey=zfy328bggvbmrnvewfpgtlc01&st=rmkvj68e&dl=0'}" alt="avatar" class="avatar">
            <span class="status-indicator ${user.online ? 'online' : 'offline'}"></span>
            ${notificationHtml} <!-- Ditambahkan untuk notifikasi -->
        </div>
        <div class="user-info">
            <div class="username-container">
                <span class="username">${user.username}</span>
                ${badgesHtml}
            </div>
            <div class="user-status">
                <span class="status-text">
                    ${user.online ? 'Online' : 'Last seen ' + formatLastSeen(user.lastSeen)}
                </span>
            </div>
            ${user.bio ? `<div class="user-bio">${user.bio}</div>` : ''}
        </div>
    `;

    div.addEventListener('click', () => {
        if (userId === "ai-user") {
            window.open("https://spovaai.github.io/spova", "_blank");
        } else {
            startChat(userId);
        }
    });
    container.appendChild(div);
}

// Get verification badges HTML (Tidak diubah)
function getVerificationBadges(user) {
    let badges = '';
    if (user.veriai) {
        badges += `<span class="verified-badge">
            <svg id="veriai" width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/>
                <path d="M20 30 C12 22, 6 16, 10 10 C14 5, 20 8, 20 12 C20 8, 26 5, 30 10 C34 16, 28 22, 20 30" fill="white"/>
            </svg>
        </span>`;
    }

    if (user.verifiedvip) {
        badges += `<span class="verified-badge"><svg id="verifiedvip" width="16" height="16" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gold-gradient" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#f4e72a"/>
                    <stop offset="50%" stop-color="#cd8105"/>
                    <stop offset="100%" stop-color="#f4e72a"/>
                </linearGradient>
            </defs>
            <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="url(#gold-gradient)"/>
            <path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="black"/>
        </svg></span>`;
    } else if (user.veriduck) {
        badges += `<span class="verified-badge"><svg id="veriduck" width="22" height="22" viewBox="0 0 900 900"><path d="M436 33.9c-25 2-54.3 11.7-72.7 24.2-2.4 1.6-4.7 2.9-5 2.9s-3.5 2.3-7.2 5.2c-16.9 13.3-28.7 26-39.5 42.7-6.3 9.6-15.6 27.7-15.6 30.3 0 .8-.4 1.8-.9 2.3-.6.6-1.4 2.8-2 5s-2 7.4-3.1 11.5c-4.9 18.1-6.3 44-3.5 63 1.8 12.2 4 22.1 5.4 24.8.6 1.1 1.1 2.9 1.1 3.9s.7 3.1 1.5 4.7c.8 1.5 1.5 3.3 1.5 3.8 0 1.6 9.1 20 12.1 24.6 1.6 2.4 2.9 4.5 2.9 4.8s3.3 4.9 7.4 10.2c17.3 22.9 41.4 41.7 67.1 52.4 23.6 9.7 40.6 13.3 64 13.3 17.8 0 34.5-2.5 50.4-7.6 6.8-2.2 23.1-9.2 24.1-10.4s1.6-87.3.6-88.3c-.4-.3-4.5 3.3-9.4 7.9-12.2 12-25.4 19.5-41.7 24-10 2.7-29.7 3.7-38.8 1.9-30.6-6-55.1-24.2-68.2-50.8-2.3-4.8-5-11-5.8-13.7-2.2-6.9-4.7-21.7-4.7-28s2.5-21.1 4.7-28c8.4-26.5 30.2-49.8 55.3-59.3 11.9-4.5 18.5-5.6 33.5-5.6 16.8-.1 24.4 1.3 36.9 6.8 12.1 5.3 18.8 9.7 27.8 18.4 16.1 15.6 25 32.7 28.3 54.4 1.3 8.7 1.5 30.7 1.5 157.3 0 141.3-.1 147.3-1.8 148.8-1 1-2.8 1.7-4 1.7-3.8 0-22.5 7.2-33.7 13-13 6.7-22.1 12.7-31.5 20.7-7.4 6.2-8.3 8.4-5.2 12.4 6.9 8.8 13.9 20.2 19.8 31.9 2.9 5.8 8.9 20.7 9.8 24.5.8 3.1 2.3 5.5 3.6 5.5.3 0 2.2-2.1 4-4.7 8.2-11.5 25.3-24.7 39.4-30.3 9.7-3.9 25.3-7 35-7 8.2 0 21.8 2.2 28.4 4.6 2.3.9 4.9 1.3 5.8 1 1.3-.5 1.4-23.3 1.1-194.8-.3-192.6-.3-194.4-2.4-202.8-1.1-4.7-2.8-11-3.6-14-13.2-46.9-48.5-87-93.5-106.3-7.3-3.1-12.6-4.9-24.4-8.2-15.3-4.2-36.7-6-54.8-4.6"/><path d="M285 388.9c0 109.9.3 104.1-5.4 104.1-7.1 0-36.4 13.1-50.6 22.6-10.5 7.1-25.2 19.6-30.5 26-2.2 2.7-5.4 6.4-7.1 8.4-4.9 5.5-13.9 19.8-19.3 30.6-11 22.3-16.5 45.9-16.6 71.4-.1 43.7 16.1 84.1 46.4 115.3 24.6 25.4 54 41.2 90.1 48.3 13.8 2.7 45.4 2.5 59.5-.4 22.6-4.7 42.5-13.1 61-25.5 9.9-6.6 20.1-15 21.5-17.7.7-1.3-.3-3.3-4.1-8.5-4.6-6.4-16.9-26-16.9-27 0-.3-1.3-3.3-2.8-6.7-3.8-8.3-5.7-13.2-7.7-19.6-.9-2.8-2.2-5.2-3-5.2-.7 0-2.5 1.7-4.1 3.7-12.2 16.2-29.1 28-49.4 34.4-6.7 2.1-9.4 2.4-25.5 2.4-17.6 0-18.2-.1-27.6-3.3-10.8-3.6-18.7-7.6-26.9-13.5-42.7-30.9-51.7-90.3-20.1-132 11.5-15.1 27.5-26.8 44.6-32.6 8.4-2.8 21.5-5.1 29.4-5.1 7.8 0 24.1 2.6 29 4.6 1.8.8 4.2 1.4 5.2 1.4 1.8 0 1.9-2.9 1.9-102.5V360.1l-5.7-4.2c-16.2-11.8-21.6-16.3-31.4-25.9-10.1-10-21.4-24.3-28.8-36.4-1.9-3.1-3.9-5.6-4.3-5.6s-.8 45.4-.8 100.9"/><path d="M374.6 499.6c-.3.9-.6 18.2-.6 38.6v37l5.8 5.2c12 10.7 16.9 16.7 23.9 29.6 6.6 12.1 10.3 27.8 10.3 44.5 0 22.5 6 47.1 17.1 70.4 8.6 18.2 18.7 31.9 34.7 47.2 23.2 22.3 49.7 36 82.9 43 15.5 3.3 45.8 3.3 61.5 0 34.5-7.2 61.1-21.4 85.4-45.5 15.6-15.5 24.2-27.7 33.7-47.6 5.9-12.6 7.2-16.4 12.3-37 2.8-11 2.8-52.8 0-64.5-7.1-30.4-20.4-57.2-37.3-75.3-1.4-1.5-3.2-3.7-4.1-5-2.3-3.5-21.1-19.4-29.4-24.8-9-6-28.5-16-32.8-16.9-2.3-.5-3.5-.3-4.1.6-.5.8-.9 18.2-.9 38.8v37.4l4.2 3.6c19.9 17.2 30.2 34.7 34.4 58.5 2.9 16.8 1.2 32.6-5.8 51.7-7.1 19.4-31.4 43.3-51.2 50.5-16.2 5.8-16.2 5.9-35.1 5.8-16.9 0-18.5-.1-26.7-2.7-25.6-8.2-45.6-25.2-57.6-49.3-6.5-12.9-8.8-23.7-9.7-45.4-1.1-26.2-5.6-44.1-17.3-69-11-23.4-33.1-48.3-56.5-63.7-9.5-6.3-31.4-17.3-34.2-17.3-1.3 0-2.6.7-2.9 1.6"/></svg></span>`;
    } else if (user.verified) {
        badges += `<span class="verified-badge"><svg id="verified" width="16" height="16" viewBox="0 0 40 40">
            <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/>
            <path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="white"/>
        </svg></span>`;
    }

    return badges;
}

// Format last seen time (Tidak diubah)
function formatLastSeen(timestamp) {
    if (!timestamp) return 'a while ago';

    const now = new Date();
    const lastSeen = timestamp.toDate();
    const diff = now - lastSeen;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return lastSeen.toLocaleDateString();
}

// Update online status (Tidak diubah)
async function updateOnlineStatus(online) {
    if (!currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
        online,
        lastSeen: serverTimestamp()
    });
}

// Setup search functionality (Tidak diubah)
function setupSearch() {
    const searchInput = document.getElementById("user-search");
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        loadAllUsers();
    });
}

// Toggle online filter (Tidak diubah)
window.toggleOnlineFilter = () => {
    const filterBtn = document.getElementById("online-filter");
    showOnlineOnly = !showOnlineOnly;
    filterBtn.classList.toggle("active");
    loadAllUsers();
};

// Check if user should be shown based on filters (Tidak diubah)
function shouldShowUser(user) {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm) ||
                         (user.bio && user.bio.toLowerCase().includes(searchTerm));
    const matchesOnlineFilter = !showOnlineOnly || user.online;
    return matchesSearch && matchesOnlineFilter;
}

// Context menu functionality (Tidak diubah)
function setupContextMenu() {
    const menu = document.getElementById("user-context-menu");
    document.addEventListener('click', () => {
        menu.style.display = 'none';
    });
}

window.showContextMenu = (event, userId) => {
    event.preventDefault();
    event.stopPropagation();

    const menu = document.getElementById("user-context-menu");
    contextMenuUser = userId;

    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.display = 'block';
};

// Handle context menu actions (Tidak diubah)
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async () => {
        if (!contextMenuUser) return;

        const action = item.dataset.action;
        switch(action) {
            case 'message':
                startChat(contextMenuUser);
                break;
            case 'profile':
                // TODO: Implement profile view
                break;
            case 'block':
                // TODO: Implement blocking
                break;
        }
    });
});

// Start chat with selected user (Diperbarui dengan opsi pengiriman pesan)
window.startChat = (userId) => {
    window.location.href = `chat?user=${userId}`;
    // Untuk testing, uncomment baris berikut untuk mengirim pesan dummy
    // sendMessage(userId, "Hello, this is a test message!");
};

// Function to send a message with required fields
async function sendMessage(receiverId, text) {
    try {
        const messageData = {
            sender: currentUser.uid,
            receiver: receiverId,
            text: text,
            timestamp: serverTimestamp(),
            read: false, // Ditambahkan untuk status belum dibaca
            participants: [currentUser.uid, receiverId] // Ditambahkan untuk konsistensi
        };
        await addDoc(collection(db, "messages"), messageData);
        console.log("Message sent successfully:", messageData);
    } catch (error) {
        console.error("Error sending message:", error);
    }
}

// Logout functionality (Tidak diubah)
window.logout = async () => {
    try {
        await updateOnlineStatus(false);
        await auth.signOut();
        window.location.href = "/";
    } catch (error) {
        console.error("Logout error:", error);
    }
};

// Update online status when window closes (Tidak diubah)
window.addEventListener('beforeunload', () => {
    updateOnlineStatus(false);
});
