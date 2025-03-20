
## TestChat

A simple, lightweight web-based chat application built with HTML, CSS, and JavaScript. This project demonstrates real-time messaging functionality using a basic client-side approach, suitable for learning purposes or as a starting point for more complex chat systems. Hosted on GitHub Pages.

## Features
- **Real-Time Messaging:** Send and receive messages instantly within the browser.
- **Simple UI:** Clean, minimalistic design with a dark theme.
- **Responsive Layout:** Works on both desktop and mobile devices.
- **Message History:** Displays sent messages in a scrollable chat window.
- **Easy to Extend:** Lightweight code base for adding new features.

## Demo
Check out the live demo [here](https://pixaze.github.io/testchat/).

## Prerequisites
- A modern web browser (Chrome, Firefox, Edge, etc.).
- A GitHub account for hosting (optional, if deploying).

## Installation
1. **Clone the Repository:**
   ```bash
   git clone https://github.com/pixaze/testchat.git
   cd testchat
   ```

2. **Open the Project:**
   - Open `index.html` in your browser to run the chat locally.

3. **Deploy to GitHub Pages (Optional):**
   - Push the project to your GitHub repository:
     ```bash
     git add .
     git commit -m "Initial commit"
     git push origin main
     ```
   - Enable GitHub Pages in your repository settings:
     - Go to `Settings` > `Pages`.
     - Set the source to `main` branch and root folder (`/`).
     - Save and wait for the site to deploy (URL: `https://pixaze.github.io/testchat/`).

## Usage
- Open the website in your browser.
- Type a message in the input field at the bottom.
- Press "Enter" or click the send button to add your message to the chat window.
- Messages appear in the chat area with a timestamp.

## File Structure
```
testchat/
├── index.html       # Main HTML file with chat structure
├── style.css        # Stylesheet for layout and design
├── script.js        # JavaScript for chat functionality
└── README.md        # This file
```

## How It Works
- **HTML:** Defines the chat container, message area, and input form.
- **CSS:** Styles the chat with a dark theme, responsive design, and smooth transitions.
- **JavaScript:** Handles message input, display, and basic event listeners for real-time interaction.

## Limitations
- This is a client-side-only chat; messages are not persisted or sent to a server.
- No user authentication or multi-user support (single-user demo).
- Works locally in one browser tab; no real-time sync across devices.

## Contributing
Feel free to fork this repository, submit issues, or send pull requests with improvements. Suggestions for adding server-side functionality (e.g., WebSocket or Firebase) are welcome!

## Future Enhancements
- Add server-side storage for message persistence.
- Implement multi-user chat with WebSocket or a backend service.
- Include user nicknames and avatars.
- Enhance security with input sanitization.

## Credits
- Built with ❤️ by [Pixaze](https://github.com/pixaze).

## License
This project is open-source and available under the [MIT License](LICENSE).

---

### Cara Menambahkan ke Repositori
1. Buat file bernama `README.md` di root folder repositori Anda (`testchat/`).
2. Salin dan tempel kode di atas ke dalam file tersebut.
3. Commit dan push ke GitHub:
   ```bash
   git add README.md
   git commit -m "Add README.md"
   git push origin main
   ```

### Penyesuaian
- **Demo Link:** URL `https://pixaze.github.io/testchat/` diasumsikan benar. Jika Anda belum mengaktifkan GitHub Pages atau URL-nya berbeda, sesuaikan link tersebut.
- **Fitur:** Saya mendeskripsikan fitur berdasarkan apa yang umum untuk chat sederhana. Jika proyek Anda memiliki fitur spesifik (misalnya emoji atau tema tambahan), beri tahu saya untuk menyesuaikan.
- **Nama Anda:** Saya menggunakan "Pixaze" sebagai kredit. Ganti jika Anda ingin nama lain.

Jika Anda ingin tambahan seperti screenshot, instruksi lebih detail, atau bagian lain, beri tahu saya!
