
import { auth, db } from "./firebase-config.js";
import { 
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Check if user is admin
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().isAdmin) {
            loadUsers();
        } else {
            window.location.href = "/";
        }
    } else {
        window.location.href = "/login";
    }
});

// Load users
function loadUsers() {
    const userList = document.getElementById("user-list");
    
    onSnapshot(collection(db, "users"), (snapshot) => {
        userList.innerHTML = "";
        snapshot.forEach((doc) => {
            const user = doc.data();
            const div = document.createElement("div");
            div.className = "admin-user-item";
            div.innerHTML = `
                <div class="user-info">
                    <img src="${user.avatar || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=' + user.username}" alt="avatar" class="avatar">
                    <span>${user.username}</span>
                    <span>${user.email}</span>
                </div>
                <div class="verification-controls">
                    <label>
                        <input type="checkbox" ${user.verified ? 'checked' : ''} 
                        onchange="toggleVerification('${doc.id}', 'verified', this.checked)">
                        Verified
                    </label>
                    <label>
                        <input type="checkbox" ${user.veriduck ? 'checked' : ''} 
                        onchange="toggleVerification('${doc.id}', 'veriduck', this.checked)">
                        Veriduck
                    </label>
                    <label>
                        <input type="checkbox" ${user.verifiedvip ? 'checked' : ''} 
                        onchange="toggleVerification('${doc.id}', 'verifiedvip', this.checked)">
                        VIP
                    </label>
                </div>
                <button onclick="deleteUserAccount('${doc.id}')" class="delete-btn">
                    Delete Account
                </button>
            `;
            userList.appendChild(div);
        });
    });
}

// Toggle verification status
window.toggleVerification = async (userId, verificationType, status) => {
    try {
        const userRef = doc(db, "users", userId);
        const updateData = {};
        updateData[verificationType] = status;
        await updateDoc(userRef, updateData);
    } catch (error) {
        console.error("Error updating verification:", error);
        alert("Error updating verification status: " + error.message);
    }
};

// Delete user account
window.deleteUserAccount = async (userId) => {
    if (!confirm("Are you sure you want to delete this account? This action cannot be undone.")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "users", userId));
        alert("User account deleted successfully!");
    } catch (error) {
        console.error("Error deleting user:", error);
        alert("Error deleting user account: " + error.message);
    }
};

// Logout function
window.logout = () => {
    auth.signOut().then(() => {
        window.location.href = "/";
    });
};
