import { auth, db } from "./firebase-config.js";
import { collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// State Management
let currentGameId = null;

// Cek autentikasi saat halaman dimuat
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("User logged in:", user.uid);
    setupGameButtons();
  } else {
    window.location.href = "/"; // Arahkan ke halaman login jika belum login
  }
});

// Setup tombol permainan
function setupGameButtons() {
  document.getElementById("create-game").addEventListener("click", async () => {
    currentGameId = await createGame();
    listenToGame(currentGameId);
  });

  document.getElementById("join-game").addEventListener("click", async () => {
    currentGameId = await joinGame();
    if (currentGameId) listenToGame(currentGameId);
  });
}

// Membuat permainan baru
async function createGame() {
  try {
    const gameRef = doc(collection(db, "games"));
    await setDoc(gameRef, {
      board: Array(9).fill(null),
      player1: auth.currentUser.uid,
      player2: null,
      currentTurn: auth.currentUser.uid,
      status: "waiting",
      winner: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    document.getElementById("game-status").textContent = "Waiting for another player...";
    return gameRef.id;
  } catch (error) {
    console.error("Error creating game:", error);
    alert("Failed to create game!");
    return null;
  }
}

// Bergabung ke permainan
async function joinGame() {
  try {
    const q = query(collection(db, "games"), where("status", "==", "waiting"));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const gameDoc = snapshot.docs[0];
      const gameRef = doc(db, "games", gameDoc.id);
      await updateDoc(gameRef, {
        player2: auth.currentUser.uid,
        status: "ongoing",
        updatedAt: new Date().toISOString()
      });
      document.getElementById("game-status").textContent = "Game started!";
      return gameDoc.id;
    } else {
      alert("No available games to join!");
      return null;
    }
  } catch (error) {
    console.error("Error joining game:", error);
    alert("Failed to join game!");
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
    console.error("Error making move:", error);
    alert("Failed to make move!");
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
    statusElement.textContent = "Waiting for another player...";
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