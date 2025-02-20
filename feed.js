import { auth, db } from "./firebase-config.js";
import { 
    collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, getDocs, limit, startAfter,
    updateDoc, arrayUnion, arrayRemove, where, getDoc
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ImgBB API Settings
const IMGBB_API_KEY = "{{{{ os.environ.get('IMGBB_API_KEY') }}}}";

// State Management
let lastVisiblePost = null;
const POSTS_PER_PAGE = 5;
let isLoading = false;

// Authentication check and initial load
auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            await loadInitialPosts();
            setupPostCreation();
            setupInfiniteScroll();
        } catch (error) {
            console.error("Error initializing feed:", error);
            showNotification("Error initializing feed. Please try again.", true);
        }
    } else {
        window.location.href = "/";
    }
});

// Load Initial Posts
async function loadInitialPosts() {
    if (isLoading) return;
    setLoadingState(true);

    try {
        const postsContainer = document.getElementById("posts-container");
        postsContainer.innerHTML = '';
        lastVisiblePost = null;

        const postsQuery = query(
            collection(db, "posts"),
            orderBy("createdAt", "desc"),
            limit(POSTS_PER_PAGE)
        );

        const snapshot = await getDocs(postsQuery);

        if (snapshot.empty) {
            postsContainer.innerHTML = '<div class="no-posts">No posts yet. Be the first to post!</div>';
            return;
        }

        lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
        await displayPosts(snapshot.docs);
    } catch (error) {
        console.error("Error loading posts:", error);
        showNotification("Error loading posts. Please try again.", true);
    } finally {
        setLoadingState(false);
    }
}

// Fetch Posts from Firestore
async function fetchPosts() {
    try {
        let q = query(
            collection(db, "posts"),
            orderBy("createdAt", "desc"),
            limit(POSTS_PER_PAGE)
        );

        if (lastVisiblePost) {
            q = query(q, startAfter(lastVisiblePost));
        }

        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
        }

        return snapshot.docs;
    } catch (error) {
        console.error("Error fetching posts:", error);
        throw error;
    }
}

// Display Posts
async function displayPosts(posts) {
    const postsContainer = document.getElementById("posts-container");
    const currentUser = auth.currentUser;

    for (const post of posts) {
        try {
            const postData = post.data();
            const postElement = document.createElement('div');
            postElement.className = 'post';

            const isLiked = postData.reactions?.like?.includes(currentUser.uid);
            let mediaHTML = '';
            if (postData.imageUrl) {
                mediaHTML = `<img src="${postData.imageUrl}" alt="Post image" class="post-image">`;
            }

            // Fetch comments for this post
            const comments = await fetchComments(post.id);

            postElement.innerHTML = `
                <div class="post-header">
                    <div class="user-info">
                        <div class="user-avatar">
                            <img src="${postData.userAvatar}" alt="User Avatar" class="avatar">
                            <span class="status-indicator ${postData.online ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="user-details">
                            <div class="username-container">
                                <span class="username">${postData.userName}</span>
                                ${postData.verifiedvip ? `<span class="verified-badge"><svg id="verifiedvip" width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <!-- Definisi Gradient -->
    <defs>
        <linearGradient id="gold-gradient" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#f4e72a"/>
            <stop offset="50%" stop-color="#cd8105"/>
            <stop offset="100%" stop-color="#f4e72a"/>
        </linearGradient>
    </defs>

    <!-- Bentuk luar dengan warna emas -->
    <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="url(#gold-gradient)"/>

    <!-- Checkmark tetap putih -->
 <path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="black"/>

</svg></span>` : 

postData.veriai ? `<span class="verified-badge">
        
<svg id="veriai" width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <!-- Bentuk luar -->
    <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/>

    <!-- Love di tengah -->
<path d="M20 30 
             C12 22, 6 16, 10 10 
             C14 5, 20 8, 20 12 
             C20 8, 26 5, 30 10 
             C34 16, 28 22, 20 30" 
          fill="white"/>

    
</svg>


</span>` :
                                postData.veriduck ? `<span class="verified-badge"><svg id="veriduck" width="22" height="22" viewBox="0 0 900 900"><path d="M436 33.9c-25 2-54.3 11.7-72.7 24.2-2.4 1.6-4.7 2.9-5 2.9s-3.5 2.3-7.2 5.2c-16.9 13.3-28.7 26-39.5 42.7-6.3 9.6-15.6 27.7-15.6 30.3 0 .8-.4 1.8-.9 2.3-.6.6-1.4 2.8-2 5s-2 7.4-3.1 11.5c-4.9 18.1-6.3 44-3.5 63 1.8 12.2 4 22.1 5.4 24.8.6 1.1 1.1 2.9 1.1 3.9s.7 3.1 1.5 4.7c.8 1.5 1.5 3.3 1.5 3.8 0 1.6 9.1 20 12.1 24.6 1.6 2.4 2.9 4.5 2.9 4.8s3.3 4.9 7.4 10.2c17.3 22.9 41.4 41.7 67.1 52.4 23.6 9.7 40.6 13.3 64 13.3 17.8 0 34.5-2.5 50.4-7.6 6.8-2.2 23.1-9.2 24.1-10.4s1.6-87.3.6-88.3c-.4-.3-4.5 3.3-9.4 7.9-12.2 12-25.4 19.5-41.7 24-10 2.7-29.7 3.7-38.8 1.9-30.6-6-55.1-24.2-68.2-50.8-2.3-4.8-5-11-5.8-13.7-2.2-6.9-4.7-21.7-4.7-28s2.5-21.1 4.7-28c8.4-26.5 30.2-49.8 55.3-59.3 11.9-4.5 18.5-5.6 33.5-5.6 16.8-.1 24.4 1.3 36.9 6.8 12.1 5.3 18.8 9.7 27.8 18.4 16.1 15.6 25 32.7 28.3 54.4 1.3 8.7 1.5 30.7 1.5 157.3 0 141.3-.1 147.3-1.8 148.8-1 1-2.8 1.7-4 1.7-3.8 0-22.5 7.2-33.7 13-13 6.7-22.1 12.7-31.5 20.7-7.4 6.2-8.3 8.4-5.2 12.4 6.9 8.8 13.9 20.2 19.8 31.9 2.9 5.8 8.9 20.7 9.8 24.5.8 3.1 2.3 5.5 3.6 5.5.3 0 2.2-2.1 4-4.7 8.2-11.5 25.3-24.7 39.4-30.3 9.7-3.9 25.3-7 35-7 8.2 0 21.8 2.2 28.4 4.6 2.3.9 4.9 1.3 5.8 1 1.3-.5 1.4-23.3 1.1-194.8-.3-192.6-.3-194.4-2.4-202.8-1.1-4.7-2.8-11-3.6-14-13.2-46.9-48.5-87-93.5-106.3-7.3-3.1-12.6-4.9-24.4-8.2-15.3-4.2-36.7-6-54.8-4.6"/></svg></span>` :
                                postData.verified ? `<span class="verified-badge"><svg id="verified" width="16" height="16" viewBox="0 0 40 40"><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="white"/></svg></span>` : ''}
                            </div>
                            <span class="timestamp">${formatTimestamp(postData.createdAt)}</span>
                        </div>
                    </div>
                </div>
                <div class="post-content">${postData.content}</div>
                ${mediaHTML}
                <div class="post-actions">
                    <button class="reaction-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                        <i class="fa${isLiked ? 's' : 'r'} fa-heart"></i>
                        <span class="count">${(postData.reactions?.like || []).length}</span>
                    </button>
                    <button class="reaction-btn comment-btn" data-post-id="${post.id}">
                        <i class="far fa-comment"></i>
                        <span class="count">${comments.length}</span>
                    </button>
                </div>
                <div class="comments-section" id="comments-${post.id}">
                    ${comments.map(comment => `
                        <div class="comment">
                            <div class="user-avatar">
                                <img src="${comment.userAvatar || 'https://i.ibb.co.com/99yLXMCw/IMG-20250216-180931-441.jpg'}" alt="User Avatar" class="avatar small">
                                <span class="status-indicator ${comment.online ? 'online' : 'offline'}"></span>
                            </div>
                            <div class="comment-content">
                                <div class="username-container">
                                    <span class="username">${comment.userName}</span>
                                    ${comment.verifiedvip ? `<span class="verified-badge"><svg id="verifiedvip" width="40" height="40" viewBox="0 0 40 40"><defs><linearGradient id="gold-gradient" x1="4" y1="2" x2="36" y2="38"><stop offset="0%" stop-color="#f4e72a"/><stop offset="50%" stop-color="#cd8105"/><stop offset="100%" stop-color="#f4e72a"/></linearGradient></defs><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="url(#gold-gradient)"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="black"/></svg></span>` : 
                                    comment.veriduck ? `<span class="verified-badge"><svg id="veriduck" width="22" height="22" viewBox="0 0 900 900"><path d="M436 33.9c-25 2-54.3 11.7-72.7 24.2-2.4 1.6-4.7 2.9-5 2.9s-3.5 2.3-7.2 5.2c-16.9 13.3-28.7 26-39.5 42.7-6.3 9.6-15.6 27.7-15.6 30.3 0 .8-.4 1.8-.9 2.3-.6.6-1.4 2.8-2 5s-2 7.4-3.1 11.5c-4.9 18.1-6.3 44-3.5 63 1.8 12.2 4 22.1 5.4 24.8.6 1.1 1.1 2.9 1.1 3.9s.7 3.1 1.5 4.7c.8 1.5 1.5 3.3 1.5 3.8 0 1.6 9.1 20 12.1 24.6 1.6 2.4 2.9 4.5 2.9 4.8s3.3 4.9 7.4 10.2c17.3 22.9 41.4 41.7 67.1 52.4 23.6 9.7 40.6 13.3 64 13.3 17.8 0 34.5-2.5 50.4-7.6 6.8-2.2 23.1-9.2 24.1-10.4s1.6-87.3.6-88.3c-.4-.3-4.5 3.3-9.4 7.9-12.2 12-25.4 19.5-41.7 24-10 2.7-29.7 3.7-38.8 1.9-30.6-6-55.1-24.2-68.2-50.8-2.3-4.8-5-11-5.8-13.7-2.2-6.9-4.7-21.7-4.7-28s2.5-21.1 4.7-28c8.4-26.5 30.2-49.8 55.3-59.3 11.9-4.5 18.5-5.6 33.5-5.6 16.8-.1 24.4 1.3 36.9 6.8 12.1 5.3 18.8 9.7 27.8 18.4 16.1 15.6 25 32.7 28.3 54.4 1.3 8.7 1.5 30.7 1.5 157.3 0 141.3-.1 147.3-1.8 148.8-1 1-2.8 1.7-4 1.7-3.8 0-22.5 7.2-33.7 13-13 6.7-22.1 12.7-31.5 20.7-7.4 6.2-8.3 8.4-5.2 12.4 6.9 8.8 13.9 20.2 19.8 31.9 2.9 5.8 8.9 20.7 9.8 24.5.8 3.1 2.3 5.5 3.6 5.5.3 0 2.2-2.1 4-4.7 8.2-11.5 25.3-24.7 39.4-30.3 9.7-3.9 25.3-7 35-7 8.2 0 21.8 2.2 28.4 4.6 2.3.9 4.9 1.3 5.8 1 1.3-.5 1.4-23.3 1.1-194.8-.3-192.6-.3-194.4-2.4-202.8-1.1-4.7-2.8-11-3.6-14-13.2-46.9-48.5-87-93.5-106.3-7.3-3.1-12.6-4.9-24.4-8.2-15.3-4.2-36.7-6-54.8-4.6"/></svg></span>` :
                                    comment.verified ? `<span class="verified-badge"><svg id="verified" width="16" height="16" viewBox="0 0 40 40"><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="white"/></svg></span>` : ''}
                                </div>
                                <p>${comment.content}</p>
                                <span class="comment-timestamp">${formatTimestamp(comment.createdAt)}</span>
                            </div>
                        </div>
                    `).join('')}
                    <div class="comment-input-container">
                        <input type="text" class="comment-input" placeholder="Write a comment...">
                        <button class="send-comment-btn" data-post-id="${post.id}">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            `;

            // Add event listeners
            const likeBtn = postElement.querySelector('.like-btn');
            likeBtn.addEventListener('click', () => handleLike(post.id, isLiked));

            const commentInput = postElement.querySelector('.comment-input');
            const sendCommentBtn = postElement.querySelector('.send-comment-btn');
            sendCommentBtn.addEventListener('click', () => {
                const content = commentInput.value.trim();
                if (content) {
                    handleComment(post.id, content);
                    commentInput.value = '';
                }
            });

            postsContainer.appendChild(postElement);
        } catch (error) {
            console.error("Error displaying post:", error);
            continue;
        }
    }
}

// Fetch Comments for Post
async function fetchComments(postId) {
    try {
        const q = query(
            collection(db, "comments"),
            where("postId", "==", postId),
            orderBy("createdAt", "desc")
        );
        
        // Set up real-time listener for comments
        onSnapshot(q, (snapshot) => {
            const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
            if (commentBtn) {
                const countSpan = commentBtn.querySelector('.count');
                countSpan.textContent = snapshot.size;
            }
        });

        const commentsSnapshot = await getDocs(q);
        return commentsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    } catch (error) {
        console.error("Error fetching comments:", error);
        return [];
    }
}

// Upload Image to ImgBB
async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append("image", await fileToBase64(file));
    formData.append("key", IMGBB_API_KEY);
    formData.append("expiration", "600");

    try {
        const response = await fetch("https://api.imgbb.com/1/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Failed to upload image");
        }

        const data = await response.json();
        if (data.success && data.data?.image?.url) {
            return data.data.image.url;
        } else {
            throw new Error("Invalid response from ImgBB");
        }
    } catch (error) {
        console.error("Image upload error:", error);
        throw new Error("Failed to upload image");
    }
}

// Convert File to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

// Handle Like
async function handleLike(postId, isLiked) {
    const user = auth.currentUser;
    if (!user) return;

    const postRef = doc(db, "posts", postId);
    try {
        await updateDoc(postRef, {
            "reactions.like": isLiked 
                ? arrayRemove(user.uid)
                : arrayUnion(user.uid)
        });

        // Update UI immediately
        const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
        const likeCount = likeBtn.querySelector('.count');
        const icon = likeBtn.querySelector('i');

        if (isLiked) {
            likeBtn.classList.remove('liked');
            icon.classList.replace('fas', 'far');
            likeCount.textContent = parseInt(likeCount.textContent) - 1;
        } else {
            likeBtn.classList.add('liked');
            icon.classList.replace('far', 'fas');
            likeCount.textContent = parseInt(likeCount.textContent) + 1;
        }
    } catch (error) {
        console.error("Error updating like:", error);
        showNotification("Failed to update like", true);
    }
}

// Handle Comment
async function handleComment(postId, content) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const comment = {
            postId,
            userId: user.uid,
            userName: userData?.username || "Anonymous",
            userAvatar: userData?.avatar || 'https://i.ibb.co.com/99yLXMCw/IMG-20250216-180931-441.jpg',
            verified: userData?.verified || false,
            verifiedvip: userData?.verifiedvip || false,
            veriduck: userData?.veriduck || false,
            veriai: userData?.veriai || false,
            online: userData?.online || false,
            content,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, "comments"), comment);

        // Update UI immediately
        const commentsSection = document.getElementById(`comments-${postId}`);
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        commentElement.innerHTML = `
            <div class="user-avatar">
                <img src="${comment.userAvatar}" alt="User Avatar" class="avatar small">
                <span class="status-indicator ${comment.online ? 'online' : 'offline'}"></span>
            </div>
            <div class="comment-content">
                <div class="username-container">
                    <span class="username">${comment.userName}</span>
                    ${comment.verifiedvip ? `<span class="verified-badge"><svg id="verifiedvip" width="40" height="40" viewBox="0 0 40 40"><defs><linearGradient id="gold-gradient" x1="4" y1="2" x2="36" y2="38"><stop offset="0%" stop-color="#f4e72a"/><stop offset="50%" stop-color="#cd8105"/><stop offset="100%" stop-color="#f4e72a"/></linearGradient></defs><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="url(#gold-gradient)"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="black"/></svg></span>` : 
                    comment.veriduck ? `<span class="verified-badge"><svg id="veriduck" width="22" height="22" viewBox="0 0 900 900"><path d="M436 33.9c-25 2-54.3 11.7-72.7 24.2-2.4 1.6-4.7 2.9-5 2.9s-3.5 2.3-7.2 5.2c-16.9 13.3-28.7 26-39.5 42.7-6.3 9.6-15.6 27.7-15.6 30.3 0 .8-.4 1.8-.9 2.3-.6.6-1.4 2.8-2 5s-2 7.4-3.1 11.5c-4.9 18.1-6.3 44-3.5 63 1.8 12.2 4 22.1 5.4 24.8.6 1.1 1.1 2.9 1.1 3.9s.7 3.1 1.5 4.7c.8 1.5 1.5 3.3 1.5 3.8 0 1.6 9.1 20 12.1 24.6 1.6 2.4 2.9 4.5 2.9 4.8s3.3 4.9 7.4 10.2c17.3 22.9 41.4 41.7 67.1 52.4 23.6 9.7 40.6 13.3 64 13.3 17.8 0 34.5-2.5 50.4-7.6 6.8-2.2 23.1-9.2 24.1-10.4s1.6-87.3.6-88.3c-.4-.3-4.5 3.3-9.4 7.9-12.2 12-25.4 19.5-41.7 24-10 2.7-29.7 3.7-38.8 1.9-30.6-6-55.1-24.2-68.2-50.8-2.3-4.8-5-11-5.8-13.7-2.2-6.9-4.7-21.7-4.7-28s2.5-21.1 4.7-28c8.4-26.5 30.2-49.8 55.3-59.3 11.9-4.5 18.5-5.6 33.5-5.6 16.8-.1 24.4 1.3 36.9 6.8 12.1 5.3 18.8 9.7 27.8 18.4 16.1 15.6 25 32.7 28.3 54.4 1.3 8.7 1.5 30.7 1.5 157.3 0 141.3-.1 147.3-1.8 148.8-1 1-2.8 1.7-4 1.7-3.8 0-22.5 7.2-33.7 13-13 6.7-22.1 12.7-31.5 20.7-7.4 6.2-8.3 8.4-5.2 12.4 6.9 8.8 13.9 20.2 19.8 31.9 2.9 5.8 8.9 20.7 9.8 24.5.8 3.1 2.3 5.5 3.6 5.5.3 0 2.2-2.1 4-4.7 8.2-11.5 25.3-24.7 39.4-30.3 9.7-3.9 25.3-7 35-7 8.2 0 21.8 2.2 28.4 4.6 2.3.9 4.9 1.3 5.8 1 1.3-.5 1.4-23.3 1.1-194.8-.3-192.6-.3-194.4-2.4-202.8-1.1-4.7-2.8-11-3.6-14-13.2-46.9-48.5-87-93.5-106.3-7.3-3.1-12.6-4.9-24.4-8.2-15.3-4.2-36.7-6-54.8-4.6"/></svg></span>` :
                    comment.verified ? `<span class="verified-badge"><svg id="verified" width="16" height="16" viewBox="0 0 40 40"><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="white"/></svg></span>` : ''}
                </div>
                <p>${comment.content}</p>
                <span class="comment-timestamp">Just now</span>
            </div>
        `;
        commentsSection.insertBefore(commentElement, commentsSection.querySelector('.comment-input-container'));

        // Update comment count
        const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
        const countSpan = commentBtn.querySelector('.count');
        countSpan.textContent = parseInt(countSpan.textContent) + 1;

        showNotification("Comment added successfully");
    } catch (error) {
        console.error("Error adding comment:", error);
        showNotification("Failed to add comment", true);
    }
}

// Setup Post Creation
function setupPostCreation() {
    const form = document.getElementById("post-form");
    const imageInput = document.getElementById("post-image");
    const imagePreview = document.getElementById("image-preview");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = form["post-content"].value.trim();
        const image = imageInput.files[0];

        if (!content && !image) {
            showNotification("Please add some content or an image to your post", true);
            return;
        }

        try {
            setLoadingState(true);
            let imageUrl = null;
            if (image) {
                imageUrl = await uploadToImgBB(image);
            }
            await createPost(content, imageUrl);
            form.reset();
            imagePreview.innerHTML = '';
            showNotification("Post created successfully!");
            await loadInitialPosts();
        } catch (error) {
            console.error("Error creating post:", error);
            showNotification("Error creating post", true);
        } finally {
            setLoadingState(false);
        }
    });

    imageInput.addEventListener("change", handleImagePreview);
}

// Setup Infinite Scroll
function setupInfiniteScroll() {
    const observer = new IntersectionObserver(async (entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry.isIntersecting && !isLoading) {
            try {
                const posts = await fetchPosts();
                if (posts.length > 0) {
                    await displayPosts(posts);
                }
            } catch (error) {
                console.error("Error loading more posts:", error);
            }
        }
    }, { threshold: 0.5 });

    const postsContainer = document.getElementById("posts-container");
    if (postsContainer.lastElementChild) {
        observer.observe(postsContainer.lastElementChild);
    }
}

// Handle Image Preview
function handleImagePreview(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById("image-preview");
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

// Format Timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    try {
        const date = timestamp.toDate();
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffTime / (1000 * 60));
                return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
            }
            return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        }

        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } catch (error) {
        console.error("Error formatting timestamp:", error);
        return '';
    }
}

// Loading State
function setLoadingState(loading) {
    isLoading = loading;
    const loadingIndicator = document.querySelector(".loading-indicator");
    if (loading) {
        if (!loadingIndicator) {
            const indicator = document.createElement("div");
            indicator.className = "loading-indicator";
            indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            document.body.appendChild(indicator);
        }
    } else {
        loadingIndicator?.remove();
    }
}

// Show Notification
function showNotification(message, isError = false) {
    const notification = document.createElement("div");
    notification.className = `notification ${isError ? "error" : "success"}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Create Post in Firestore
async function createPost(content, imageUrl = null) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        await addDoc(collection(db, "posts"), {
            userId: user.uid,
            userName: userData?.username || "Anonymous",
            userAvatar: userData?.avatar || 'https://i.ibb.co.com/99yLXMCw/IMG-20250216-180931-441.jpg',
            verified: userData?.verified || false,
            verifiedvip: userData?.verifiedvip || false,
            veriduck: userData?.veriduck || false,
            veriai: userData?.veriai || false,
            online: userData?.online || false,
            content,
            imageUrl,
            createdAt: serverTimestamp(),
            reactions: { like: [] }
        });
    } catch (error) {
        console.error("Error creating post:", error);
        throw error;
    }
}