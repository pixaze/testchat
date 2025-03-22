document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const header = document.querySelector("header");
    const ctaButton = document.querySelector(".cta");
    const contactButton = document.querySelector("#contact-btn");
    const popup = document.querySelector("#contact-popup");
    const closeButton = document.querySelector(".close-btn");
    const form = document.querySelector("#contact-form");
    const sections = document.querySelectorAll(".content");
    const projectCards = document.querySelectorAll(".project-card");
    const navLinks = document.querySelectorAll(".nav-list a");
    const menuToggle = document.querySelector(".menu-toggle");
    const navList = document.querySelector(".nav-list");
    const yearSpan = document.querySelector("#year");

    // Smooth Scroll Function
    const smoothScroll = (target) => {
        document.querySelector(target).scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    };

    // Handle Scroll Effects
    const handleScroll = () => {
        header.classList.toggle("scrolled", window.scrollY > 50);
        sections.forEach(section => {
            const sectionTop = section.getBoundingClientRect().top;
            if (sectionTop < window.innerHeight - 150) {
                section.classList.add("visible");
            }
        });
    };

    // Update Scroll Progress
    const progressBar = document.createElement("div");
    progressBar.classList.add("scroll-progress");
    document.body.appendChild(progressBar);

    const updateProgress = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (scrollTop / docHeight) * 100;
        progressBar.style.width = `${progress}%`;
    };

    // Popup Functions
    const showPopup = () => {
        popup.style.display = "flex";
        form.querySelector("#name").focus();
    };

    const hidePopup = () => {
        popup.style.display = "none";
        form.reset();
    };

    // Navigation Toggle and Close on Outside Click
    const toggleNav = () => {
        navList.classList.toggle("active");
    };

    const closeNav = (e) => {
        if (!navList.contains(e.target) && !menuToggle.contains(e.target) && navList.classList.contains("active")) {
            navList.classList.remove("active");
        }
    };

    // Event Listeners
    ctaButton.addEventListener("click", () => smoothScroll("#about"));

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const target = link.getAttribute("href");
            smoothScroll(target);
            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
            if (window.innerWidth <= 768) {
                navList.classList.remove("active"); // Tutup nav pada mobile setelah klik link
            }
        });
    });

    menuToggle.addEventListener("click", toggleNav);

    document.addEventListener("click", closeNav); // Tutup nav saat klik di luar

    contactButton.addEventListener("click", (e) => {
        e.preventDefault();
        showPopup();
    });

    closeButton.addEventListener("click", hidePopup);

    popup.addEventListener("click", (e) => {
        if (e.target === popup) hidePopup();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popup.style.display === "flex") hidePopup();
    });

    // Form Submission with EmailJS and IP Fetching
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = form.querySelector("#name").value.trim();
        const email = form.querySelector("#email").value.trim();
        const message = form.querySelector("#message").value.trim();

        if (name && email && message) {
            try {
                // Fetch IP Address from api.ipify.org
                const ipResponse = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipResponse.json();
                const ipAddress = ipData.ip || "N/A";

                // Prepare EmailJS parameters
                const templateParams = {
                    from_name: name,
                    from_email: email,
                    message: message,
                    time: new Date().toLocaleString(),
                    user_agent: navigator.userAgent,
                    ip_address: ipAddress,
                    to_email: "your_email@example.com" // Ganti dengan email Anda
                };

                // Send email via EmailJS
                emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", templateParams)
                    .then(() => {
                        console.log("Email sent successfully!");
                        alert("Message sent successfully!");
                        hidePopup();
                    })
                    .catch((error) => {
                        console.error("Failed to send email:", error);
                        alert("Failed to send message. Please try again later.");
                    });
            } catch (error) {
                console.error("Error fetching IP:", error);
                // Fallback jika IP gagal diambil
                const templateParams = {
                    from_name: name,
                    from_email: email,
                    message: message,
                    time: new Date().toLocaleString(),
                    user_agent: navigator.userAgent,
                    ip_address: "N/A (IP fetch failed)",
                    to_email: "your_email@example.com"
                };

                emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", templateParams)
                    .then(() => {
                        console.log("Email sent successfully!");
                        alert("Message sent successfully!");
                        hidePopup();
                    })
                    .catch((emailError) => {
                        console.error("Failed to send email:", emailError);
                        alert("Failed to send message. Please try again later.");
                    });
            }
        } else {
            alert("Please complete all fields.");
        }
    });

    // Project Card Interactions
    projectCards.forEach(card => {
        card.addEventListener("mouseenter", () => {
            card.style.zIndex = "10";
        });
        card.addEventListener("mouseleave", () => {
            card.style.zIndex = "1";
        });
        card.addEventListener("click", () => {
            const desc = card.querySelector("p").textContent;
            console.log("Clicked Project:", desc);
        });
    });

    // Lazy Load Images
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add("loaded");
                imageObserver.unobserve(img);
            }
        });
    }, { rootMargin: "0px 0px 100px 0px" });

    document.querySelectorAll("img").forEach(img => imageObserver.observe(img));

    // Set Dynamic Year
    yearSpan.textContent = new Date().getFullYear();

    // Window Event Listeners
    window.addEventListener("scroll", () => {
        handleScroll();
        updateProgress();
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 768) navList.classList.remove("active");
    });

    // Initial Setup
    handleScroll();
});

// Inline CSS for Scroll Progress and Lazy Loading
const style = document.createElement("style");
style.textContent = `
    .scroll-progress {
        position: fixed;
        top: 0;
        left: 0;
        height: 4px;
        background: #fff;
        width: 0;
        z-index: 2000;
        transition: width 0.2s ease;
    }
    img {
        opacity: 0;
        transition: opacity 0.5s ease;
    }
    img.loaded {
        opacity: 1;
    }
`;
document.head.appendChild(style);

setTimeout(() => {
    document.querySelector('.preloader').style.display = 'none';
    document.querySelector('.wrapper').classList.remove('hidden');
}, 3000);
