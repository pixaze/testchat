// Import dan konfigurasi Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// Konfigurasi Firebase (Ganti dengan konfigurasi proyekmu)
const firebaseConfig = {
    apiKey: "AIzaSyDTOeU-9s8Ope48ce7QtcYKTYl0dwONZiQ",
    authDomain: "tosha-lup.firebaseapp.com",
    projectId: "tosha-lup",
    storageBucket: "tosha-lup.firebasestorage.app",
    messagingSenderId: "516568752534",
    appId: "1:516568752534:web:02096798fe8d2c5bac3db7"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
