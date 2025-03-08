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

// Load Initial Posts with Real-Time Updates
async function loadInitialPosts() {
    if (isLoading) return;
    setLoadingState(true);

    try {
        const postsContainer = document.getElementById("posts-container");
        postsContainer.innerHTML = '';

        const postsQuery = query(
            collection(db, "posts"),
            orderBy("createdAt", "desc"),
            limit(POSTS_PER_PAGE)
        );

        onSnapshot(postsQuery, (snapshot) => {
            if (snapshot.empty) {
                postsContainer.innerHTML = '<div class="no-posts">No posts yet. Be the first to post!</div>';
                setLoadingState(false);
                return;
            }

            lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
            displayPosts(snapshot.docs);
            setLoadingState(false);
        }, (error) => {
            console.error("Error listening to posts:", error);
            showNotification("Error loading posts. Please try again.", true);
            setLoadingState(false);
        });
    } catch (error) {
        console.error("Error initializing posts listener:", error);
        showNotification("Error initializing feed. Please try again.", true);
        setLoadingState(false);
    }
}

// Fetch Posts for Infinite Scroll
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

// Display Posts with Real-Time Updates
async function displayPosts(posts) {
    const postsContainer = document.getElementById("posts-container");
    const currentUser = auth.currentUser;

    for (const post of posts) {
        try {
            const postData = post.data();
            const postElement = document.createElement('div');
            postElement.className = 'post';
            postElement.setAttribute('data-post-id', post.id);

            const isLiked = postData.reactions?.like?.includes(currentUser.uid);
            let mediaHTML = postData.imageUrl ? `<img src="${postData.imageUrl}" alt="Post image" class="post-image">` : '';

            postElement.innerHTML = `
                <div class="post-header">
                    <div class="user-avatar">
                        <img src="${postData.userAvatar}" alt="User Avatar" class="avatar">
                        <span class="status-indicator ${postData.online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="user-details">
                        <div class="username-container">
                            <span class="username">${postData.userName}</span>
                            ${postData.verifiedvip ? `<span class="verified-badge"><svg id="verifiedvip" width="16" height="16" viewBox="0 0 40 40"><defs><linearGradient id="gold-gradient" x1="4" y1="2" x2="36" y2="38"><stop offset="0%" stop-color="#f4e72a"/><stop offset="50%" stop-color="#cd8105"/><stop offset="100%" stop-color="#f4e72a"/></linearGradient></defs><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="url(#gold-gradient)"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="black"/></svg></span>` : 
                            postData.verified ? `<span class="verified-badge"><svg id="verified" width="16" height="16" viewBox="0 0 40 40"><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="white"/></svg></span>` : ''}
                        </div>
                        <span class="timestamp">${formatTimestamp(postData.createdAt)}</span>
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
                        <span class="count">${postData.commentCount || 0}</span>
                    </button>
                </div>
                <div class="comments-section" id="comments-${post.id}" style="display: none;"></div>
                <div class="comment-input-container" id="comment-input-${post.id}" style="display: none;">
                    <input type="text" class="comment-input" placeholder="Write a comment...">
                    <button class="send-comment-btn" data-post-id="${post.id}">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            `;

            // Add event listeners
            const likeBtn = postElement.querySelector('.like-btn');
            likeBtn.addEventListener('click', () => handleLike(post.id, isLiked));

            const commentBtn = postElement.querySelector('.comment-btn');
            commentBtn.addEventListener('click', () => toggleComments(post.id));

            const commentInput = postElement.querySelector('.comment-input');
            const sendCommentBtn = postElement.querySelector('.send-comment-btn');
            sendCommentBtn.addEventListener('click', () => {
                const content = commentInput.value.trim();
                if (content) {
                    handleComment(post.id, content);
                    commentInput.value = '';
                    toggleComments(post.id, true); // Pastikan komentar tetap terlihat setelah dikirim
                }
            });

            // Real-time like and comment count updates
            const postRef = doc(db, "posts", post.id);
            onSnapshot(postRef, (doc) => {
                const updatedData = doc.data();
                const updatedIsLiked = updatedData.reactions?.like?.includes(currentUser.uid);
                const likeCount = updatedData.reactions?.like?.length || 0;
                const commentCount = updatedData.commentCount || 0;

                const likeBtn = postElement.querySelector('.like-btn');
                const likeCountSpan = likeBtn.querySelector('.count');
                const likeIcon = likeBtn.querySelector('i');
                likeCountSpan.textContent = likeCount;
                if (updatedIsLiked) {
                    likeBtn.classList.add('liked');
                    likeIcon.classList.replace('far', 'fas');
                } else {
                    likeBtn.classList.remove('liked');
                    likeIcon.classList.replace('fas', 'far');
                }

                const commentBtn = postElement.querySelector('.comment-btn');
                const commentCountSpan = commentBtn.querySelector('.count');
                commentCountSpan.textContent = commentCount;
            });

            postsContainer.appendChild(postElement);
        } catch (error) {
            console.error("Error displaying post:", error);
            continue;
        }
    }
}

// Toggle Comments Visibility and Load Comments
async function toggleComments(postId, forceShow = false) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    const commentInputContainer = document.getElementById(`comment-input-${postId}`);
    if (!commentsSection || !commentInputContainer) {
        console.error(`Comments section or input not found for post ${postId}`);
        return;
    }

    const isVisible = commentsSection.style.display === 'block';
    if (forceShow || !isVisible) {
        commentsSection.style.display = 'block';
        commentInputContainer.style.display = 'flex'; // Tampilkan input bersama komentar
        const commentsQuery = query(
            collection(db, "comments"),
            where("postId", "==", postId),
            orderBy("createdAt", "asc") // Urutan bawah ke atas (terbaru di bawah)
        );
        onSnapshot(commentsQuery, (snapshot) => {
            commentsSection.innerHTML = snapshot.docs.map(doc => {
                const comment = doc.data();
                return `
                    <div class="comment">
                        <div class="user-avatar">
                            <img src="${comment.userAvatar || 'https://i.ibb.co.com/99yLXMCw/IMG-20250216-180931-441.jpg'}" alt="User Avatar" class="avatar">
                            <span class="status-indicator ${comment.online ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="comment-content">
                            <div class="username-container">
                                <span class="username">${comment.userName}</span>
                                ${comment.verified ? `<span class="verified-badge"><svg id="verified" width="16" height="16" viewBox="0 0 40 40"><path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z" fill="currentColor"/><path d="M27.413 14.319l2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fill="white"/></svg></span>` : ''}
                            </div>
                            <p>${comment.content}</p>
                            <span class="comment-timestamp">${formatTimestamp(comment.createdAt)}</span>
                        </div>
                    </div>
                `;
            }).join('');
            // Gulir otomatis ke bawah setelah komentar dimuat
            commentsSection.scrollTop = commentsSection.scrollHeight;
        }, (error) => {
            console.error(`Error loading comments for post ${postId}:`, error);
        });
    } else {
        commentsSection.style.display = 'none';
        commentInputContainer.style.display = 'none'; // Sembunyikan input bersama komentar
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

        if (!response.ok) throw new Error("Failed to upload image");

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
        reader.onload = () => resolve(reader.result.split(',')[1]);
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
            "reactions.like": isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
        });
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
            online: userData?.online || false,
            content,
            createdAt: serverTimestamp()
        };

        const commentDocRef = await addDoc(collection(db, "comments"), comment);
        const postRef = doc(db, "posts", postId);
        const postDoc = await getDoc(postRef);
        const currentCommentCount = postDoc.data().commentCount || 0;

        await updateDoc(postRef, {
            comments: arrayUnion(commentDocRef.id),
            commentCount: currentCommentCount + 1
        });

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
            if (image) imageUrl = await uploadToImgBB(image);
            await createPost(content, imageUrl);
            form.reset();
            imagePreview.innerHTML = '';
            showNotification("Post created successfully!");
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
            setLoadingState(true);
            try {
                const posts = await fetchPosts();
                if (posts.length > 0) {
                    await displayPosts(posts);
                }
            } catch (error) {
                console.error("Error loading more posts:", error);
                showNotification("Error loading more posts", true);
            } finally {
                setLoadingState(false);
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
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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
            online: userData?.online || false,
            content,
            imageUrl,
            createdAt: serverTimestamp(),
            reactions: { like: [] },
            comments: [],
            commentCount: 0
        });
    } catch (error) {
        console.error("Error creating post:", error);
        throw error;
    }
}
