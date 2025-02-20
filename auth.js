import { auth, db } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { 
    doc,
    setDoc,
    getDoc,
    updateDoc 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let currentMode = 'login';

// Hide loading screen after page loads
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        document.querySelector('.auth-container').style.display = 'flex';
    }, 2000);
});

// Handle authentication state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        updateUserStatus(user.uid, true);
    }
});

// Expose logout function globally
window.logout = async () => {
    try {
        if (auth.currentUser) {
            await updateUserStatus(auth.currentUser.uid, false);
            await auth.signOut();
        }
        window.location.href = "/";
    } catch (error) {
        console.error("Error signing out:", error);
    }
};


// Toggle between modes (login, signup, reset)
window.toggleMode = (mode) => {
    currentMode = mode;
    const loginToggle = document.getElementById('login-toggle');
    const signupToggle = document.getElementById('signup-toggle');
    const resetToggle = document.getElementById('reset-toggle');
    const submitBtn = document.getElementById('submit-btn');
    const subtitle = document.querySelector('.auth-subtitle');
    const errorElement = document.getElementById('error-message');
    const usernameGroup = document.getElementById('username-group');
    const passwordGroup = document.getElementById('password-group');

    // Reset error message when switching modes
    errorElement.textContent = '';
    errorElement.classList.remove('show');

    // Update toggle buttons
    [loginToggle, signupToggle, resetToggle].forEach(btn => {
        btn.className = 'toggle-btn';
    });
    document.getElementById(`${mode}-toggle`).classList.add('active');

    // Show/hide form fields based on mode
    usernameGroup.style.display = mode === 'signup' ? 'block' : 'none';
    passwordGroup.style.display = mode === 'reset' ? 'none' : 'block';

    // Update submit button and subtitle
    let buttonText, subtitleText;
    switch (mode) {
        case 'login':
            buttonText = '<i class="fas fa-sign-in-alt"></i> Login';
            subtitleText = 'Sign in to continue chatting';
            break;
        case 'signup':
            buttonText = '<i class="fas fa-user-plus"></i> Sign Up';
            subtitleText = 'Create your account';
            break;
        case 'reset':
            buttonText = '<i class="fas fa-key"></i> Reset Password';
            subtitleText = 'Reset your password';
            break;
    }
    submitBtn.innerHTML = buttonText;
    subtitle.textContent = subtitleText;
};

// Handle form submission
window.submitForm = async () => {
    const email = document.getElementById("email").value;
    const errorElement = document.getElementById("error-message");

    if (!email) {
        errorElement.textContent = "Please enter your email address";
        errorElement.classList.add("show");
        return;
    }

    try {
        switch (currentMode) {
            case 'signup':
                const username = document.getElementById("username").value;
                const password = document.getElementById("password").value;

                if (!username || !password) {
                    throw new Error("Please fill in all fields");
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await setDoc(doc(db, "users", user.uid), {
                    username: username,
                    email: email,
                    verified: false,
                    online: true,
                    isAdmin: false,
                    avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${username}`,
                    typingTo: ""
                });

                window.location.href = "/users";
                break;

            case 'login':
                const loginPassword = document.getElementById("password").value;
                if (!loginPassword) {
                    throw new Error("Please enter your password");
                }

                const loginCredential = await signInWithEmailAndPassword(auth, email, loginPassword);
                const userDoc = await getDoc(doc(db, "users", loginCredential.user.uid));

                if (userDoc.data().isAdmin) {
                    window.location.href = "/admin";
                } else {
                    window.location.href = "/users";
                }
                break;

            case 'reset':
                await sendPasswordResetEmail(auth, email);
                errorElement.textContent = "Password reset email sent. Please check your inbox.";
                errorElement.style.color = "var(--secondary-color)";
                errorElement.classList.add("show");
                break;
        }
    } catch (error) {
        let errorMessage;
        switch (currentMode) {
            case 'login':
                errorMessage = "Invalid email or password";
                break;
            case 'signup':
                errorMessage = "Error creating account. Email might be taken.";
                break;
            case 'reset':
                errorMessage = "Error sending reset email. Please try again.";
                break;
            default:
                errorMessage = error.message;
        }
        errorElement.textContent = errorMessage;
        errorElement.classList.add("show");
    }
};

// Update user online status
async function updateUserStatus(userId, status) {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
        online: status
    });
}

// Add beforeunload event listener
window.addEventListener("beforeunload", () => {
    if (auth.currentUser) {
        updateUserStatus(auth.currentUser.uid, false);
    }
});