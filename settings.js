import { auth, db, storage } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// Apply stored preferences on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    const savedFontSize = localStorage.getItem('fontSize') || 'medium';
    applyTheme(savedTheme);
    applyFontSize(savedFontSize);
});

// Initialize settings page
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            window.location.href = "users.html";
            return;
        }

        const userData = userDoc.data();

        // Load profile info
        document.getElementById("username").value = userData.username;
        document.getElementById("current-avatar").src = userData.avatar;
        document.getElementById("bio").value = userData.bio || '';

        // Show appropriate badges
        document.getElementById("veriduck-badge").style.display = userData.veriduck ? "inline-flex" : "none";
        document.getElementById("verifiedvip-badge").style.display = userData.verifiedvip ? "inline-flex" : "none";

        // Load theme settings
        const savedTheme = localStorage.getItem('theme') || 'system';
        document.getElementById("theme-selector").value = savedTheme;
        applyTheme(savedTheme);

        // Load font size
        const savedFontSize = localStorage.getItem('fontSize') || 'medium';
        document.getElementById("font-size").value = savedFontSize;
        applyFontSize(savedFontSize);

        // Load notification settings
        document.getElementById("push-notifications").checked = userData.notifications?.push || false;
        document.getElementById("email-notifications").checked = userData.notifications?.email || false;
        document.getElementById("sound-effects").checked = userData.notifications?.sound || false;

        // Load privacy settings
        document.getElementById("show-online-status").checked = userData.privacy?.showOnline || false;
        document.getElementById("show-read-receipts").checked = userData.privacy?.showReadReceipts || false;
        document.getElementById("private-account").checked = userData.privacy?.privateAccount || false;
    } else {
        window.location.href = "/";
    }
});

// Handle profile photo upload
document.getElementById("photo-upload").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showNotification("File size must be less than 5MB", true);
        return;
    }

    if (!file.type.startsWith('image/')) {
        showNotification("Please upload an image file", true);
        return;
    }

    try {
        const timestamp = Date.now();
        const filename = `${timestamp}-${file.name}`;
        const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${filename}`);

        // Show loading state
        const uploadButton = document.querySelector('.photo-upload-btn');
        uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        // Upload file
        await uploadBytes(storageRef, file);
        const photoURL = await getDownloadURL(storageRef);

        // Update avatar preview
        document.getElementById("current-avatar").src = photoURL;

        // Update user profile in Firestore
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            avatar: photoURL
        });

        // Reset upload button
        uploadButton.innerHTML = '<i class="fas fa-camera"></i>';

        showNotification("Profile photo updated successfully!");
    } catch (error) {
        console.error("Error uploading photo:", error);
        const uploadButton = document.querySelector('.photo-upload-btn');
        uploadButton.innerHTML = '<i class="fas fa-camera"></i>';

        if (error.code === 'storage/unauthorized') {
            showNotification("Permission denied. Please try logging in again.", true);
        } else {
            showNotification("Error updating profile photo", true);
        }
    }
});

// Save all settings
window.saveSettings = async () => {
    try {
        const newUsername = document.getElementById("username").value.trim();
        const newBio = document.getElementById("bio").value.trim();

        if (!newUsername) {
            showNotification("Username cannot be empty", true);
            return;
        }

        // Save and apply theme preference
        const theme = document.getElementById("theme-selector").value;
        localStorage.setItem('theme', theme);
        applyTheme(theme);

        // Save and apply font size
        const fontSize = document.getElementById("font-size").value;
        localStorage.setItem('fontSize', fontSize);
        applyFontSize(fontSize);

        // Prepare notification settings
        const notifications = {
            push: document.getElementById("push-notifications").checked,
            email: document.getElementById("email-notifications").checked,
            sound: document.getElementById("sound-effects").checked
        };

        // Prepare privacy settings
        const privacy = {
            showOnline: document.getElementById("show-online-status").checked,
            showReadReceipts: document.getElementById("show-read-receipts").checked,
            privateAccount: document.getElementById("private-account").checked
        };

        // Update user profile in Firestore
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            username: newUsername,
            bio: newBio,
            notifications,
            privacy,
            theme_preference: theme,
            font_size: fontSize,
            updatedAt: new Date()
        });

        showNotification("Settings saved successfully!");
    } catch (error) {
        console.error("Error saving settings:", error);
        showNotification("Error saving settings", true);
    }
};

// Apply theme globally
function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', theme);
    }
    // Store the theme preference
    localStorage.setItem('theme', theme);
}

// Apply font size globally
function applyFontSize(size) {
    document.documentElement.style.fontSize = {
        small: '14px',
        medium: '16px',
        large: '18px'
    }[size] || '16px';
    // Store the font size preference
    localStorage.setItem('fontSize', size);
}

// Request verification
window.requestVerification = async () => {
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            verificationRequested: true,
            verificationRequestedAt: new Date()
        });
        showNotification("Verification request submitted successfully!");
    } catch (error) {
        console.error("Error requesting verification:", error);
        showNotification("Error submitting verification request", true);
    }
};

// Export user data
window.exportData = async () => {
    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userData = userDoc.data();

        const exportData = {
            profile: {
                username: userData.username,
                email: userData.email,
                bio: userData.bio,
                createdAt: userData.createdAt,
                updatedAt: userData.updatedAt
            },
            settings: {
                notifications: userData.notifications,
                privacy: userData.privacy,
                theme: localStorage.getItem('theme'),
                fontSize: localStorage.getItem('fontSize')
            }
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

        const exportFileDefaultName = 'my_account_data.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();

        showNotification("Data exported successfully!");
    } catch (error) {
        console.error("Error exporting data:", error);
        showNotification("Error exporting data", true);
    }
};

// Delete account
window.deleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
        return;
    }

    try {
        // Mark account for deletion
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            deletionRequested: true,
            deletionRequestedAt: new Date()
        });

        // Sign out
        await auth.signOut();
        window.location.href = "/";

        showNotification("Account deletion request submitted. You will be signed out now.");
    } catch (error) {
        console.error("Error deleting account:", error);
        showNotification("Error deleting account", true);
    }
};

// Show notification
function showNotification(message, isError = false) {
    const notification = document.createElement("div");
    notification.className = `notification ${isError ? "error" : "success"}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Listen for theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (document.getElementById("theme-selector").value === 'system') {
        applyTheme('system');
    }
});

// Apply theme and font size changes immediately when selected
document.getElementById("theme-selector").addEventListener('change', (e) => {
    applyTheme(e.target.value);
});

document.getElementById("font-size").addEventListener('change', (e) => {
    applyFontSize(e.target.value);
});

// Logout function
window.logout = async () => {
    try {
        await auth.signOut();
        window.location.href = "/";
    } catch (error) {
        console.error("Error signing out:", error);
        showNotification("Error signing out", true);
    }
};
