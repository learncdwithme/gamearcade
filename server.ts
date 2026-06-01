import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { MongoClient, Db } from "mongodb";

dotenv.config();

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- MONGODB LAZY CONNECTION ---

let mongoDbInstance: Db | null = null;
let mongoClientInstance: MongoClient | null = null;

async function getMongoDb() {
  if (mongoDbInstance) return mongoDbInstance;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI environment variable is missing. Game histories will run on transient memory.");
    return null;
  }
  try {
    mongoClientInstance = new MongoClient(uri);
    await mongoClientInstance.connect();
    mongoDbInstance = mongoClientInstance.db("gameXEdiol");
    console.log("MongoDB connection established successfully.");
    return mongoDbInstance;
  } catch (error) {
    console.error("MongoDB connection exception:", error);
    return null;
  }
}

async function saveGameLog(gameLog: {
  logId: string;
  userId: string;
  userEmail: string;
  gameName: string;
  roomId: string;
  outcome: "won" | "lost" | "draw";
  createdAt: string;
}) {
  try {
    const db = await getMongoDb();
    if (db) {
      const logsCollection = db.collection("gameLogs");
      // Use upsert to avoid duplicate documents
      await logsCollection.updateOne(
        { logId: gameLog.logId },
        { $set: gameLog },
        { upsert: true }
      );
      console.log(`Log saved/upserted for user ${gameLog.userId}: ${gameLog.outcome}`);
    }
  } catch (e) {
    console.error("Failed to commit log to MongoDB collection:", e);
  }
}

// --- GAME SERVER DATA STRUCTURES ---

interface Player {
  userId: string;
  displayName: string;
  email: string;
  symbol?: string; // 'X' or 'O' for TicTacToe, 'red' or 'green' for Ludo
  joinedAt: number;
}

interface TicTacToeState {
  board: (string | null)[]; // 9 cells
  turn: number; // Index of current/active player (0 or 1)
  status: "waiting" | "playing" | "completed";
  winner: string | null; // Player userId, 'draw', or null
}

interface LudoState {
  // 2 tokens per player
  // positions: -1 (base), 0-25 (loop tracks), 26-29 (home stretch), 30 (home/finished)
  tokens: {
    red: number[]; // e.g. [posToken1, posToken2]
    green: number[];
  };
  turn: number; // 0 for Red, 1 for Green
  status: "waiting" | "playing" | "completed";
  diceRoll: number | null;
  hasMovedThisTurn: boolean;
  winner: string | null; // UserId of winner, or null
}

interface Room {
  id: string;
  name: string;
  password?: string;
  gameName: "tictactoe" | "ludo";
  hostId: string;
  hostName: string;
  players: Player[];
  maxPlayers: number;
  status: "waiting" | "playing" | "completed";
  state: TicTacToeState | LudoState;
  createdAt: number;
  rematchRequests?: string[];
}

// Global active server states
const rooms = new Map<string, Room>();
const clients = new Map<WebSocket, { userId: string; displayName: string; email: string; currentRoomId: string | null }>();
const randomQueues = {
  tictactoe: [] as { ws: WebSocket; userId: string; displayName: string; email: string }[],
  ludo: [] as { ws: WebSocket; userId: string; displayName: string; email: string }[]
};

// Find app icon file dynamically
function getAppIconPath() {
  const assetsDir = path.join(process.cwd(), "src", "assets", "images");
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const iconFile = files.find(f => f.startsWith("app_icon") && f.endsWith(".png"));
    if (iconFile) {
      return path.join(assetsDir, iconFile);
    }
  }
  return null;
}

// Serve the generated app icon as icon.png
app.get("/icon.png", (req, res) => {
  const iconPath = getAppIconPath();
  if (iconPath && fs.existsSync(iconPath)) {
    res.setHeader("Content-Type", "image/png");
    fs.createReadStream(iconPath).pipe(res);
  } else {
    // Return a basic placeholder fallback
    res.status(404).send("Favicon icon not found");
  }
});

// App endpoint health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    activeSockets: wss.clients.size,
    activeRooms: rooms.size
  });
});

// Retrieves the last 15 completed games log entries from MongoDB for a specific player
app.get("/api/logs", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: "userId parameter is required." });
  }
  try {
    const db = await getMongoDb();
    if (db) {
      const logsCollection = db.collection("gameLogs");
      const list = await logsCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(15)
        .toArray();
      return res.json(list);
    } else {
      return res.json([]);
    }
  } catch (error) {
    console.error("Failed to query MongoDB gameLogs collection:", error);
    return res.status(500).json({ error: "Database querying exception." });
  }
});

// Admin Connections Panel endpoint mapping (requires matching ADMIN_EMAIL header)
app.get("/api/admin/connections", async (req, res) => {
  const adminEmailParam = req.query.email as string;
  const envAdminEmail = process.env.ADMIN_EMAIL;

  if (!envAdminEmail || adminEmailParam !== envAdminEmail) {
    return res.status(403).json({ error: "HTTP 403 Forbidden. Access Denied." });
  }

  const connectionsList = Array.from(clients.values()).map(c => {
    let activeGame = "None";
    let activeRoomName = "";
    if (c.currentRoomId) {
      const foundRoom = rooms.get(c.currentRoomId);
      if (foundRoom) {
        activeGame = foundRoom.gameName === "tictactoe" ? "Tic Tac Toe" : "Battle Ludo";
        activeRoomName = foundRoom.name;
      }
    }
    return {
      userId: c.userId,
      displayName: c.displayName,
      email: c.email,
      activeGame,
      activeRoomName,
      roomId: c.currentRoomId || "None"
    };
  });

  return res.json({ connections: connectionsList });
});

// --- COMPLETED GAME LOGGING UTILITIES ---

async function logMatchCompletion(room: Room) {
  const players = room.players;
  if (players.length === 0) return;

  const winnerUserId = room.state.winner; // string representing userId, 'draw', or null
  
  for (const p of players) {
    let outcome: "won" | "lost" | "draw" = "draw";
    if (winnerUserId && winnerUserId !== "draw") {
      outcome = (winnerUserId === p.userId) ? "won" : "lost";
    }

    const logItem = {
      logId: `log-${room.id}-${p.userId}-${Date.now()}`,
      userId: p.userId,
      userEmail: p.email,
      gameName: room.gameName === "tictactoe" ? "Tic-Tac-Toe" : "Battle Ludo",
      roomId: room.id,
      outcome,
      createdAt: new Date().toISOString()
    };

    await saveGameLog(logItem);
  }
}

async function logForfeitMatch(room: Room, forfeitedPlayer: { userId: string; displayName: string; email: string }) {
  const remainingPlayer = room.players[0];
  if (!remainingPlayer) return;

  // Log for the forfeited player as lost
  const lostItem = {
    logId: `log-${room.id}-${forfeitedPlayer.userId}-${Date.now()}`,
    userId: forfeitedPlayer.userId,
    userEmail: forfeitedPlayer.email,
    gameName: room.gameName === "tictactoe" ? "Tic-Tac-Toe" : "Battle Ludo",
    roomId: room.id,
    outcome: "lost" as const,
    createdAt: new Date().toISOString()
  };
  await saveGameLog(lostItem);

  // Log for the remaining player as won
  const wonItem = {
    logId: `log-${room.id}-${remainingPlayer.userId}-${Date.now()}`,
    userId: remainingPlayer.userId,
    userEmail: remainingPlayer.email,
    gameName: room.gameName === "tictactoe" ? "Tic-Tac-Toe" : "Battle Ludo",
    roomId: room.id,
    outcome: "won" as const,
    createdAt: new Date().toISOString()
  };
  await saveGameLog(wonItem);
}

function handleParticipantLeave(roomId: string, client: { userId: string; displayName: string; email: string }) {
  const room = rooms.get(roomId);
  if (!room) return;

  const isHostLeaving = room.hostId === client.userId;

  if (isHostLeaving) {
    // Host leaves: dissolve room completely, notify other player
    broadcastToRoom(roomId, {
      type: "room-closed",
      reason: `⚠️ Host ${client.displayName} has left and collapsed the arena. Back to selection portal.`
    });

    // Clear currentRoomId for all players inside this room
    clients.forEach((c) => {
      if (c.currentRoomId === roomId) {
        c.currentRoomId = null;
      }
    });

    rooms.delete(roomId);
  } else {
    // Guest leaves:
    // If playing, log forfeit match in MongoDB so host still gets their win logged!
    if (room.status === "playing") {
      logForfeitMatch(room, client).catch(err => console.error("Error logging forfeit on leave:", err));
    }

    // Remove the guest from the player array
    room.players = room.players.filter(p => p.userId !== client.userId);
    room.rematchRequests = [];

    // Reset room status back to waiting
    room.status = "waiting";

    if (room.gameName === "tictactoe") {
      room.state = {
        board: Array(9).fill(null),
        turn: 0,
        status: "waiting",
        winner: null
      };
    } else {
      room.state = {
        tokens: { red: [-1, -1], green: [-1, -1] },
        turn: 0,
        status: "waiting",
        diceRoll: null,
        hasMovedThisTurn: false,
        winner: null
      };
    }

    broadcastToRoom(roomId, {
      type: "room-update",
      room
    });

    broadcastToRoom(roomId, {
      type: "chat-system",
      text: `⚠️ Opponent ${client.displayName} has left the chamber. Waiting for a new challenger to join...`
    });
  }
}

// Broadcast lobby updates to all clients that are NOT in a room
function broadcastLobbyUpdate() {
  const roomsList = Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    gameName: r.gameName,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers,
    status: r.status,
    hostName: r.hostName,
    hasPassword: !!r.password
  }));

  const activeUsersCount = clients.size;

  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN && !clientInfo.currentRoomId) {
      // Find if this specific user is in a random matchmaking queue
      const isSearchingTtt = randomQueues.tictactoe.some(q => q.userId === clientInfo.userId);
      const isSearchingLudo = randomQueues.ludo.some(q => q.userId === clientInfo.userId);

      ws.send(JSON.stringify({
        type: "lobby-update",
        activeUsersCount,
        roomsList,
        isSearchingRandom: isSearchingTtt || isSearchingLudo,
        searchingGame: isSearchingTtt ? "tictactoe" : (isSearchingLudo ? "ludo" : null)
      }));
    }
  });
}

// Send private error or message to specific socket
function sendToSocket(ws: WebSocket, payload: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Broadcast room state to all players inside a room
function broadcastToRoom(roomId: string, message: object) {
  const room = rooms.get(roomId);
  if (!room) return;

  clients.forEach((clientInfo, ws) => {
    if (clientInfo.currentRoomId === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// --- TIC TAC TOE RULES ENGINE ---

function checkTicTacToeWinner(board: (string | null)[]) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // Returns symbol 'X' or 'O'
    }
  }

  if (board.every(cell => cell !== null)) {
    return "draw";
  }

  return null;
}

// --- LUDO BOARD RULES ENGINE ---

// Core board configuration
// Let Red start on step 0. Blue/Green start on step 14.
// Safety step protection against kicks could be standard, but classic kicks makes it very competitive!
function processLudoMove(room: Room, tokenIdx: number, playerId: string) {
  const lState = room.state as LudoState;
  const isRedTurn = lState.turn === 0;
  const color = isRedTurn ? "red" : "green";
  const startTrackIdx = isRedTurn ? 0 : 14;

  const currentPos = lState.tokens[color][tokenIdx];
  const roll = lState.diceRoll;
  if (!roll) return false;

  let nextPos = currentPos;

  if (currentPos === -1) {
    // Must roll a 6 to exit home
    if (roll === 6) {
      nextPos = 0; // Starts from 0 relative step
    } else {
      return false; // Can't move from base without 6
    }
  } else {
    nextPos = currentPos + roll;
  }

  // Token is finished and enters home stretch or home index (30 is home)
  if (nextPos > 30) {
    return false; // Cannot overshoot home index
  }

  // Set the updated token position
  lState.tokens[color][tokenIdx] = nextPos;

  // Real coordinate calculation in relative steps:
  // Let's resolve absolute loop indices to detect landing captures!
  // If nextPos is a circular step (0 to 25), compute its absolute path coordinate
  // Absolute loop step = (relativePos + startTrackIdx) % 28
  if (nextPos >= 0 && nextPos <= 25) {
    const nextAbsPos = (nextPos + startTrackIdx) % 28;

    // Detect landing on opponent's token and kick back to home yard (-1)
    const oppColor = isRedTurn ? "green" : "red";
    const oppStartIdx = isRedTurn ? 14 : 0;

    lState.tokens[oppColor].forEach((oppPos, oppIdx) => {
      if (oppPos >= 0 && oppPos <= 25) {
        const oppAbsPos = (oppPos + oppStartIdx) % 28;
        if (nextAbsPos === oppAbsPos) {
          // Capturing! Reset opponent token back to -1
          lState.tokens[oppColor][oppIdx] = -1;
          broadcastToRoom(room.id, {
            type: "chat-system",
            text: `🔥 Splash! ${room.players[lState.turn].displayName}'s token sent ${room.players[1 - lState.turn].displayName}'s token to the base!`
          });
        }
      }
    });
  }

  lState.hasMovedThisTurn = true;

  // Check victory condition: all tokens at position 30 (Home)
  if (lState.tokens[color].every(pos => pos === 30)) {
    lState.status = "completed";
    room.status = "completed";
    lState.winner = playerId;
    logMatchCompletion(room).catch(err => console.error("Error logging Ludo match completion:", err));
  } else {
    // Rotate turn
    lState.turn = 1 - lState.turn;
    lState.diceRoll = null;
    lState.hasMovedThisTurn = false;
  }

  return true;
}

// Calculate if the player has any valid moves available with the rolled dice
function hasLudoValidMoves(lState: LudoState, roll: number): boolean {
  const color = lState.turn === 0 ? "red" : "green";
  const tokens = lState.tokens[color];

  return tokens.some(pos => {
    if (pos === -1) {
      return roll === 6; // Requires a 6 to escape base
    }
    if (pos >= 30) {
      return false; // Completed tokens can't move
    }
    return pos + roll <= 30; // Cannot overshoot home
  });
}

// --- WEBSOCKET EVENT ROUTERS ---

wss.on("connection", (ws) => {
  console.log("New websocket client connected.");

  ws.on("message", (messageStr) => {
    try {
      const message = JSON.parse(messageStr.toString());

      switch (message.type) {
        case "init": {
          const { userId, displayName, email } = message;
          if (!userId) return;

          clients.set(ws, {
            userId,
            displayName: displayName || "Anonymous Player",
            email: email || "",
            currentRoomId: null
          });

          sendToSocket(ws, { type: "init-ok", success: true });
          broadcastLobbyUpdate();
          break;
        }

        case "random-join": {
          const gameName = message.gameName as "tictactoe" | "ludo";
          const client = clients.get(ws);
          if (!client) return;

          // Make sure user isn't already searching
          if (randomQueues[gameName].some(q => q.userId === client.userId)) {
            return;
          }

          // Join queue
          randomQueues[gameName].push({
            ws,
            userId: client.userId,
            displayName: client.displayName,
            email: client.email
          });

          console.log(`User ${client.displayName} searching random ${gameName}. Queue size: ${randomQueues[gameName].length}`);

          // Trigger Matchmaker
          if (randomQueues[gameName].length >= 2) {
            const p1 = randomQueues[gameName].shift()!;
            const p2 = randomQueues[gameName].shift()!;

            // Create match room
            const roomId = `room-${Math.random().toString(36).substring(2, 9)}`;
            const roomName = `${p1.displayName}'s Arena`;

            // State initializer
            let initialGameState: object;
            if (gameName === "tictactoe") {
              initialGameState = {
                board: Array(9).fill(null),
                turn: 0,
                status: "playing",
                winner: null
              };
            } else {
              initialGameState = {
                tokens: { red: [-1, -1], green: [-1, -1] },
                turn: 0,
                status: "playing",
                diceRoll: null,
                hasMovedThisTurn: false,
                winner: null
              };
            }

            const newRoom: Room = {
              id: roomId,
              name: roomName,
              gameName,
              hostId: p1.userId,
              hostName: p1.displayName,
              players: [
                { userId: p1.userId, displayName: p1.displayName, email: p1.email, symbol: gameName === "tictactoe" ? "X" : "red", joinedAt: Date.now() },
                { userId: p2.userId, displayName: p2.displayName, email: p2.email, symbol: gameName === "tictactoe" ? "O" : "green", joinedAt: Date.now() }
              ],
              maxPlayers: 2,
              status: "playing",
              state: initialGameState as any,
              createdAt: Date.now()
            };

            rooms.set(roomId, newRoom);

            // Set rooms in client associations
            const info1 = clients.get(p1.ws);
            if (info1) info1.currentRoomId = roomId;

            const info2 = clients.get(p2.ws);
            if (info2) info2.currentRoomId = roomId;

            // Notify both players
            broadcastToRoom(roomId, {
              type: "room-joined",
              room: newRoom
            });
            
            broadcastToRoom(roomId, {
              type: "chat-system",
              text: "⚡ Match found! Round started. Let the best player win!"
            });
          }

          broadcastLobbyUpdate();
          break;
        }

        case "random-leave": {
          const gameName = message.gameName as "tictactoe" | "ludo";
          const client = clients.get(ws);
          if (!client) return;

          randomQueues[gameName] = randomQueues[gameName].filter(q => q.userId !== client.userId);
          broadcastLobbyUpdate();
          break;
        }

        case "create-room": {
          const { roomName, password, gameName } = message;
          const client = clients.get(ws);
          if (!client || !roomName) return;

          // Check duplicate name
          const duplicate = Array.from(rooms.values()).some(r => r.name.toLowerCase() === roomName.toLowerCase() && r.status !== "completed");
          if (duplicate) {
            sendToSocket(ws, { type: "room-denied", reason: "A room with this name already exists. Try another name." });
            return;
          }

          const roomId = `room-${Math.random().toString(36).substring(2, 9)}`;

          let initialGameState: object;
          if (gameName === "tictactoe") {
            initialGameState = {
              board: Array(9).fill(null),
              turn: 0,
              status: "waiting",
              winner: null
            };
          } else {
            initialGameState = {
              tokens: { red: [-1, -1], green: [-1, -1] },
              turn: 0,
              status: "waiting",
              diceRoll: null,
              hasMovedThisTurn: false,
              winner: null
            };
          }

          const newRoom: Room = {
            id: roomId,
            name: roomName,
            password: password || undefined,
            gameName,
            hostId: client.userId,
            hostName: client.displayName,
            players: [
              { userId: client.userId, displayName: client.displayName, email: client.email, symbol: gameName === "tictactoe" ? "X" : "red", joinedAt: Date.now() }
            ],
            maxPlayers: 2,
            status: "waiting",
            state: initialGameState as any,
            createdAt: Date.now()
          };

          rooms.set(roomId, newRoom);
          client.currentRoomId = roomId;

          sendToSocket(ws, {
            type: "room-joined",
            room: newRoom
          });

          broadcastLobbyUpdate();
          break;
        }

        case "join-room": {
          const { roomId, password } = message;
          const client = clients.get(ws);
          if (!client || !roomId) return;

          const room = rooms.get(roomId);
          if (!room) {
            sendToSocket(ws, { type: "room-denied", reason: "Room not found or might have closed." });
            return;
          }

          if (room.players.length >= room.maxPlayers) {
            sendToSocket(ws, { type: "room-denied", reason: "This room is full." });
            return;
          }

          if (room.password && room.password !== password) {
            sendToSocket(ws, { type: "room-denied", reason: "Incorrect password." });
            return;
          }

          // Setup symbol for second client
          const symbol = room.gameName === "tictactoe" ? "O" : "green";

          room.players.push({
            userId: client.userId,
            displayName: client.displayName,
            email: client.email,
            symbol,
            joinedAt: Date.now()
          });

          // Room is filled, trigger playing status
          room.status = "playing";
          room.state.status = "playing";

          client.currentRoomId = roomId;

          broadcastToRoom(roomId, {
            type: "room-joined",
            room
          });

          broadcastToRoom(roomId, {
            type: "chat-system",
            text: `⚡ ${client.displayName} joined the room. The game is beginning!`
          });

          broadcastLobbyUpdate();
          break;
        }

        case "leave-room": {
          const client = clients.get(ws);
          if (!client || !client.currentRoomId) return;

          const roomId = client.currentRoomId;
          client.currentRoomId = null;

          handleParticipantLeave(roomId, client);

          sendToSocket(ws, { type: "room-left" });
          broadcastLobbyUpdate();
          break;
        }

        case "game-action": {
          const client = clients.get(ws);
          if (!client || !client.currentRoomId) return;

          const room = rooms.get(client.currentRoomId);
          if (!room) return;

          const { action, payload } = message;

          if (action === "request-rematch") {
            if (room.status !== "completed") return;

            if (!room.rematchRequests) {
              room.rematchRequests = [];
            }

            if (!room.rematchRequests.includes(client.userId)) {
              room.rematchRequests.push(client.userId);
              
              broadcastToRoom(room.id, {
                type: "chat-system",
                text: `🔄 ${client.displayName} wants a rematch!`
              });
            }

            if (room.rematchRequests.length >= 2) {
              room.rematchRequests = [];
              room.status = "playing";
              
              if (room.gameName === "tictactoe") {
                room.state = {
                  board: Array(9).fill(null),
                  turn: 0,
                  status: "playing",
                  winner: null
                };
              } else {
                room.state = {
                  tokens: { red: [-1, -1], green: [-1, -1] },
                  turn: 0,
                  status: "playing",
                  diceRoll: null,
                  hasMovedThisTurn: false,
                  winner: null
                };
              }

              broadcastToRoom(room.id, {
                type: "room-update",
                room
              });

              broadcastToRoom(room.id, {
                type: "chat-system",
                text: "⚡ Match restarted! Let the battle begin!"
              });
            } else {
              broadcastToRoom(room.id, {
                type: "room-update",
                room
              });
            }
            break;
          }

          if (room.status !== "playing") return;

          if (room.gameName === "tictactoe") {
            const tState = room.state as TicTacToeState;
            const currentPlayer = room.players[tState.turn];

            // Ensure turn checks
            if (currentPlayer.userId !== client.userId) {
              return; // Not your turn
            }

            if (action === "cell-click") {
              const cellIdx = payload.cellIndex;
              if (cellIdx < 0 || cellIdx > 8 || tState.board[cellIdx] !== null) {
                return; // Invalid cell
              }

              // Place mark
              tState.board[cellIdx] = currentPlayer.symbol || "X";

              // Check victory
              const result = checkTicTacToeWinner(tState.board);
              if (result) {
                tState.status = "completed";
                room.status = "completed";
                if (result === "draw") {
                  tState.winner = "draw";
                  broadcastToRoom(room.id, {
                    type: "chat-system",
                    text: "🤝 It's a draw! Spectacular match from both opponents!"
                  });
                } else {
                  tState.winner = currentPlayer.userId;
                  broadcastToRoom(room.id, {
                    type: "chat-system",
                    text: `🏆 Winner Winner! Congratulations to ${currentPlayer.displayName} for securing the crown!`
                  });
                }
                logMatchCompletion(room).catch(err => console.error("Error logging match on DB:", err));
              } else {
                // Switch turn
                tState.turn = 1 - tState.turn;
              }

              broadcastToRoom(room.id, {
                type: "room-update",
                room
              });
            }
          } else if (room.gameName === "ludo") {
            const lState = room.state as LudoState;
            const currentPlayerIdx = lState.turn;
            const currentPlayer = room.players[currentPlayerIdx];

            if (currentPlayer.userId !== client.userId) {
              return; // Out of turn
            }

            if (action === "roll-dice") {
              if (lState.diceRoll !== null) return; // Already rolled

              const roll = Math.floor(Math.random() * 6) + 1;
              lState.diceRoll = roll;

              broadcastToRoom(room.id, {
                type: "room-update",
                room
              });

              // Check if any legal moves can be played
              const activeColor = lState.turn === 0 ? "red" : "green";
              const canMove = hasLudoValidMoves(lState, roll);

              if (!canMove) {
                // No valid moves, display roll then swap turns automatically
                broadcastToRoom(room.id, {
                  type: "chat-system",
                  text: `🎲 ${currentPlayer.displayName} rolls ${roll}, but has no playable moves!`
                });

                setTimeout(() => {
                  if (rooms.has(room.id)) {
                    lState.turn = 1 - lState.turn;
                    lState.diceRoll = null;
                    lState.hasMovedThisTurn = false;
                    broadcastToRoom(room.id, {
                      type: "room-update",
                      room
                    });
                  }
                }, 1800);
              } else {
                broadcastToRoom(room.id, {
                  type: "chat-system",
                  text: `🎲 ${currentPlayer.displayName} rolled a ${roll}! Select a token to move.`
                });
              }
            } else if (action === "move-token") {
              const tokenIdx = payload.tokenIndex as number;
              if (tokenIdx < 0 || tokenIdx > 1) return;
              if (lState.diceRoll === null) return; // Has not rolled yet

              const success = processLudoMove(room, tokenIdx, client.userId);
              if (success) {
                // Return updated state
                broadcastToRoom(room.id, {
                  type: "room-update",
                  room
                });
              }
            }
          }
          break;
        }

        case "chat-message": {
          const client = clients.get(ws);
          if (!client || !client.currentRoomId) return;

          broadcastToRoom(client.currentRoomId, {
            type: "chat-message",
            sender: client.displayName,
            text: message.text,
            timestamp: Date.now()
          });
          break;
        }
      }
    } catch (e) {
      console.error("Syntax parser error parsing websocket packet: ", e);
    }
  });

  ws.on("close", () => {
    const client = clients.get(ws);
    if (!client) return;

    console.log(`Connection closed: ${client.displayName}`);

    // Clean up matchmaking schedules
    randomQueues.tictactoe = randomQueues.tictactoe.filter(q => q.userId !== client.userId);
    randomQueues.ludo = randomQueues.ludo.filter(q => q.userId !== client.userId);

    // Evict from active rooms
    if (client.currentRoomId) {
      const roomId = client.currentRoomId;
      handleParticipantLeave(roomId, client);
    }

    clients.delete(ws);
    broadcastLobbyUpdate();
  });
});

// --- SERVER VITE MIDDLEWARE PLATFORM BOOTSTRAP ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite middleware integrated inside developer container
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    // Serve client static dist bundle
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully listening on Port (routed behind reverse proxy): ${PORT}`);
  });
}

startServer();
