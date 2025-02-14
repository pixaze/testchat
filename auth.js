import { auth, db } from "./firebase-config.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Signup
async function signUp() {
    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            username: username,
            email: email,
            online: false,
            avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}` // Avatar acak
        });

        alert("Signup berhasil! Silakan login.");
        window.location.href = "chat.html";
    } catch (error) {
        alert(error.message);
    }
}

// Login
async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        alert("Login berhasil!");
        window.location.href = "chat.html";
    } catch (error) {
        alert(error.message);
    }
}

// Logout
function logout() {
    signOut(auth).then(() => {
        alert("Logout berhasil!");
        window.location.href = "index.html";
    });
}

// Cek status login
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User logged in:", user.email);
    } else {
        console.log("User logged out");
    }
});

async function verifyUser(userId) {
    const userDocRef = doc(db, "users", userId);
    await updateDoc(userDocRef, { verified: true });
    alert("User berhasil diverifikasi!");
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
