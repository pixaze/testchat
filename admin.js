import { auth, db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Cek apakah user adalah admin
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().isAdmin) {
            loadUsers(); // Jika admin, load daftar user
        } else {
            alert("Anda bukan admin!");
            window.location.href = "index.html"; // Redirect jika bukan admin
        }
    } else {
        window.location.href = "login.html"; // Redirect jika belum login
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
