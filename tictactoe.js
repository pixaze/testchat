import { auth, db } from "./firebase-config.js";
import { collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// State Management
let currentGameId = null;
let currentUserData = null;

// Generate random 6-character code
function generateRoomCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Ambil data pengguna dari koleksi users
async function getUserData(uid) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return userSnap.data();
  }
  return { username: "Anonymous", avatar: "https://via.placeholder.com/40" };
}

// Login anonim untuk debugging
signInAnonymously(auth)
  .then(async () => {
    console.log("Logged in anonymously");
    // Simpan data pengguna ke koleksi users jika belum ada
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        username: "Player" + Math.floor(Math.random() * 1000),
        avatar: "https://via.placeholder.com/40",
        createdAt: new Date().toISOString()
      });
    }
  })
  .catch((error) => console.error("Login error:", error));

// Cek autentikasi dan setup tombol
auth.onAuthStateChanged(async (user) => {
  if (user) {
    console.log("User logged in:", user.uid);
    currentUserData = await getUserData(user.uid);
    document.getElementById("player-self").innerHTML = `
      <img src="${currentUserData.avatar}" alt="Self">
      <span>${currentUserData.username}</span>
    `;
    setupGameButtons();
  } else {
    console.log("No user logged in, redirecting...");
    window.location.href = "/";
  }
});

// Setup tombol permainan
function setupGameButtons() {
  document.getElementById("create-game").addEventListener("click", async () => {
    currentGameId = await createGame();
    if (currentGameId) listenToGame(currentGameId);
  });

  document.getElementById("join-game").addEventListener("click", async () => {
    const code = document.getElementById("room-code").value.trim().toUpperCase();
    if (!code) {
      alert("Please enter a room code!");
      return;
    }
    currentGameId = await joinGame(code);
    if (currentGameId) listenToGame(currentGameId);
  });
}

// Membuat permainan baru
async function createGame() {
  try {
    const roomCode = generateRoomCode();
    const gameRef = doc(db, "games", roomCode);
    await setDoc(gameRef, {
      board: Array(9).fill(null),
      player1: auth.currentUser.uid,
      player2: null,
      currentTurn: auth.currentUser.uid,
      status: "waiting",
      winner: null,
      roomCode: roomCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    document.getElementById("game-status").textContent = `Room created! Code: ${roomCode}`;
    console.log("Game created with ID:", roomCode);
    return roomCode;
  } catch (error) {
    console.error("Error creating game:", error.message, error.code);
    alert("Failed to create game: " + error.message);
    return null;
  }
}

// Bergabung ke permainan
async function joinGame(code) {
  try {
    const gameRef = doc(db, "games", code);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) {
      alert("Invalid room code!");
      return null;
    }
    const gameData = gameSnap.data();
    if (gameData.status !== "waiting" || gameData.player2) {
      alert("Room is full or already started!");
      return null;
    }
    await updateDoc(gameRef, {
      player2: auth.currentUser.uid,
      status: "ongoing",
      updatedAt: new Date().toISOString()
    });
    document.getElementById("game-status").textContent = "Game started!";
    console.log("Joined game with ID:", code);
    return code;
  } catch (error) {
    console.error("Error joining game:", error.message, error.code);
    alert("Failed to join game: " + error.message);
    return null;
  }
}

// Memperbarui langkah
async function makeMove(position) {
  if (!currentGameId) return;
  try {
    const gameRef = doc(db, "games", currentGameId);
    const gameSnap = await getDoc(gameRef);
    const gameData = gameSnap.data();

    if (gameData.currentTurn !== auth.currentUser.uid || gameData.board[position] !== null) return;

    const newBoard = [...gameData.board];
    newBoard[position] = gameData.player1 === auth.currentUser.uid ? "X" : "O";
    const nextTurn = gameData.player1 === auth.currentUser.uid ? gameData.player2 : gameData.player1;

    await updateDoc(gameRef, {
      board: newBoard,
      currentTurn: nextTurn,
      updatedAt: new Date().toISOString()
    });

    checkWinner(newBoard, gameData);
  } catch (error) {
    console.error("Error making move:", error.message, error.code);
    alert("Failed to make move: " + error.message);
  }
}

// Memeriksa pemenang
async function checkWinner(board, gameData) {
  const winningCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Baris
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Kolom
    [0, 4, 8], [2, 4, 6]             // Diagonal
  ];

  for (const combo of winningCombos) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      const gameRef = doc(db, "games", currentGameId);
      const winnerId = board[a] === "X" ? gameData.player1 : gameData.player2;
      await updateDoc(gameRef, {
        winner: winnerId,
        status: "finished",
        updatedAt: new Date().toISOString()
      });
      return;
    }
  }

  if (!board.includes(null)) {
    const gameRef = doc(db, "games", currentGameId);
    await updateDoc(gameRef, {
      status: "finished",
      updatedAt: new Date().toISOString()
    });
  }
}

// Mendengarkan perubahan permainan
function listenToGame(gameId) {
  const gameRef = doc(db, "games", gameId);
  onSnapshot(gameRef, (doc) => {
    const gameData = doc.data();
    renderBoard(gameData.board, gameData);
    updateGameStatus(gameData);
    updateOpponentProfile(gameData);
  });
}

// Merender papan
function renderBoard(board, gameData) {
  const boardContainer = document.getElementById("board");
  boardContainer.innerHTML = "";
  board.forEach((cell, index) => {
    const cellElement = document.createElement("div");
    cellElement.textContent = cell || "";
    if (cell === "X") cellElement.classList.add("x");
    if (cell === "O") cellElement.classList.add("o");
    if (gameData.status === "ongoing" && gameData.currentTurn === auth.currentUser.uid) {
      cellElement.addEventListener("click", () => makeMove(index));
    }
    boardContainer.appendChild(cellElement);
  });
}

// Memperbarui status permainan
function updateGameStatus(gameData) {
  const statusElement = document.getElementById("game-status");
  if (gameData.status === "waiting") {
    statusElement.textContent = `Room created! Code: ${gameData.roomCode}`;
  } else if (gameData.status === "ongoing") {
    statusElement.textContent = gameData.currentTurn === auth.currentUser.uid 
      ? "Your turn!" 
      : "Opponent's turn...";
  } else if (gameData.status === "finished") {
    if (gameData.winner) {
      statusElement.textContent = gameData.winner === auth.currentUser.uid 
        ? "You win!" 
        : "You lose!";
    } else {
      statusElement.textContent = "It's a draw!";
    }
  }
}

// Memperbarui profil lawan
async function updateOpponentProfile(gameData) {
  const opponentId = gameData.player1 === auth.currentUser.uid ? gameData.player2 : gameData.player1;
  if (opponentId) {
    const opponentData = await getUserData(opponentId);
    document.getElementById("player-opponent").innerHTML = `
      <img src="${opponentData.avatar}" alt="Opponent">
      <span>${opponentData.username}</span>
    `;
  } else {
    document.getElementById("player-opponent").innerHTML = "<span>Waiting...</span>";
  }
}
