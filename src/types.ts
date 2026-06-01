export interface GameConfig {
  id: "tictactoe" | "ludo";
  title: string;
  shortDesc: string;
  longDesc: string;
  minPlayers: number;
  maxPlayers: number;
  rules: string[];
  themeColor: string;
  accentColor: string;
}

export interface Player {
  userId: string;
  displayName: string;
  email: string;
  symbol?: string; // 'X' | 'O' for Tic-Tac-Toe, 'red' | 'green' for Ludo
  joinedAt: number;
}

export interface TicTacToeState {
  board: (string | null)[];
  turn: number;
  status: "waiting" | "playing" | "completed";
  winner: string | null;
}

export interface LudoState {
  tokens: {
    red: number[];
    green: number[];
  };
  turn: number;
  status: "waiting" | "playing" | "completed";
  diceRoll: number | null;
  hasMovedThisTurn: boolean;
  winner: string | null;
}

export interface Room {
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

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

// Game collection catalog data for easy maintainability
export const GAMES_CATALOG: Record<string, GameConfig> = {
  tictactoe: {
    id: "tictactoe",
    title: "Tic-Tac-Toe",
    shortDesc: "Classic paper-and-pencil game of strategy for 2 players.",
    longDesc: "Take turns aligning 3 symbols in a horizontal, vertical, or diagonal row to secure the victory. A perfect game of quick wit, defensive blocks, and calculated traps.",
    minPlayers: 2,
    maxPlayers: 2,
    rules: [
      "The game is played on a 3x3 grid.",
      "The host is represented by 'X' and plays first; the opponent is 'O'.",
      "On your turn, click on an empty grid square to place your symbol.",
      "Align 3 of your symbols in a line to win.",
      "If all 9 cells are full without an alignment, the game is a draw."
    ],
    themeColor: "indigo",
    accentColor: "#6366F1"
  },
  ludo: {
    id: "ludo",
    title: "Battle Ludo",
    shortDesc: "Race your tokens across the board and knock out opponents!",
    longDesc: "Battle Ludo is an elegant, circular 2-player race. Roll the dice to release your tokens from the base, sprint along the loop, kick enemy tokens home, and reach the final sanctuary!",
    minPlayers: 2,
    maxPlayers: 2,
    rules: [
      "Each player has 2 tokens initialized inside their home Base.",
      "You MUST roll exactly a 6 to release a token onto the starting cell.",
      "Take turns rolling the 1-6 dice, then tap an eligible token to advance it.",
      "Landing on an opponent's token sends them flying back into their start Base!",
      "Start safety zones (cells 0 and 14) are safe from opponent captures.",
      "First player to safely move all tokens into the Home cell wins."
    ],
    themeColor: "emerald",
    accentColor: "#10B981"
  }
};
