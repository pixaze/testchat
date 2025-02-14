import { auth, db } from "./firebase-config.js";
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Cek apakah user adalah admin
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const adminEmail = "admin@email.com"; // Ganti dengan email admin asli
        if (user.email === adminEmail) {
            loadUsers();
        } else {
            alert("Anda bukan admin!");
            window.location.href = "index.html";
        }
    } else {
        window.location.href = "login.html";
    }
});

// Memuat daftar user
async function loadUsers() {
    const userList = document.getElementById("user-list");
    userList.innerHTML = "";

    const querySnapshot = await getDocs(collection(db, "users"));
    querySnapshot.forEach((doc) => {
        const user = doc.data();
        const div = document.createElement("div");
        div.innerHTML = `
            <p>${user.username} ${user.verified ? "✔️" : ""}</p>
            <button onclick="verifyUser('${doc.id}')">Verifikasi</button>
        `;
        userList.appendChild(div);
    });
}

// Fungsi untuk memverifikasi user
async function verifyUser(userId) {
    const userDocRef = doc(db, "users", userId);
    await updateDoc(userDocRef, { verified: true });
    alert("User berhasil diverifikasi!");
    loadUsers();
}
