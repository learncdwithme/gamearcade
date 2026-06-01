import React from "react";
import { Room, TicTacToeState } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { User, Trophy, Scale, Circle, Award } from "lucide-react";

interface TicTacToeGameProps {
  room: Room;
  currentPlayerId: string;
  onSendAction: (actionName: string, payload: any) => void;
}

export const TicTacToeGame: React.FC<TicTacToeGameProps> = ({
  room,
  currentPlayerId,
  onSendAction,
}) => {
  const gState = room.state as TicTacToeState;
  const players = room.players;

  // Identity checks
  const isHost = currentPlayerId === room.hostId;
  const isPlayer = players.some((p) => p.userId === currentPlayerId);
  const mySymbol = players.find((p) => p.userId === currentPlayerId)?.symbol || "";
  const isMyTurn = players[gState.turn]?.userId === currentPlayerId;

  const handleCellClick = (idx: number) => {
    if (!isPlayer || !isMyTurn || gState.status !== "playing") return;
    onSendAction("cell-click", { cellIndex: idx });
  };

  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  // Helper to identify winning cells to animate
  const getWinningCells = (): number[] => {
    if (gState.status !== "completed" || gState.winner === "draw" || !gState.winner) return [];
    
    // Find winner symbol
    const winningPlayer = players.find(p => p.userId === gState.winner);
    const winSym = winningPlayer?.symbol;
    if (!winSym) return [];

    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (gState.board[a] === winSym && gState.board[b] === winSym && gState.board[c] === winSym) {
        return pattern;
      }
    }
    return [];
  };

  const winningCells = getWinningCells();

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto space-y-6" id="tictactoe_board_container">
      {/* Player Headers */}
      <div className="grid grid-cols-2 gap-4 w-full">
        {players.map((p, idx) => {
          const active = gState.turn === idx && gState.status === "playing";
          return (
            <div
              key={p.userId}
              className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                active
                  ? "bg-indigo-50 border-indigo-400 shadow-md scale-102"
                  : "bg-slate-50 border-slate-200/80 opacity-75"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    p.symbol === "X" ? "bg-indigo-600" : "bg-emerald-500"
                  }`}
                />
                <span className={`font-bold text-sm truncate ${active ? "text-indigo-900" : "text-slate-800"}`}>
                  {p.displayName}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-550">
                  {p.userId === currentPlayerId ? "You (Player)" : "Opponent"}
                </span>
                <span className={`font-mono font-black text-xs px-2.5 py-0.5 rounded ${
                  p.symbol === "X" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-850"
                }`}>
                  {p.symbol}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Turn Banner */}
      <div className="w-full text-center">
        {gState.status === "playing" ? (
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-50 border border-slate-200 shadow-sm animate-pulse">
            <span className="relative flex h-20 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
            </span>
            <span className="text-xs font-mono font-bold text-slate-600">
              {isMyTurn ? "YOUR MOVE" : `WAITING FOR ${players[gState.turn]?.displayName.toUpperCase()}`}
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-850 text-xs font-bold">
            <Trophy className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-bold">
              {gState.winner === "draw"
                ? "MATCH ENDED IN A DRAW"
                : gState.winner === currentPlayerId
                ? "VICTORY! YOU SCORED THE GAME"
                : "MATCH COMPLETED"}
            </span>
          </div>
        )}
      </div>

      {/* 3x3 Tile Grid */}
      <div className="grid grid-cols-3 gap-3 w-full aspect-square bg-slate-100/50 p-3 rounded-3xl border border-slate-200 shadow-sm">
        {gState.board.map((cell, idx) => {
          const isWinningCell = winningCells.includes(idx);
          return (
            <button
              key={idx}
              id={`ttt-cell-${idx}`}
              onClick={() => handleCellClick(idx)}
              disabled={!isPlayer || !isMyTurn || cell !== null || gState.status !== "playing"}
              className={`relative flex items-center justify-center rounded-2xl transition-all duration-300 text-4xl font-display font-black border group ${
                cell === null && isMyTurn && gState.status === "playing"
                  ? "bg-white border-slate-200 hover:border-indigo-500 hover:bg-slate-50 cursor-pointer shadow-inner"
                  : cell === null
                  ? "bg-slate-50/50 border-slate-200/60 cursor-not-allowed"
                  : isWinningCell
                  ? "bg-indigo-600 border-indigo-500 text-white shadow-md scale-102"
                  : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <AnimatePresence mode="wait">
                {cell === "X" && (
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 220, damping: 15 }}
                    className={`${isWinningCell ? "text-white" : "text-indigo-600"} font-display`}
                  >
                    X
                  </motion.div>
                )}
                {cell === "O" && (
                  <motion.div
                    initial={{ scale: 0, rotate: 45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 220, damping: 15 }}
                    className={`${isWinningCell ? "text-white" : "text-emerald-500"} flex items-center justify-center`}
                  >
                    <Circle className="w-10 h-10 stroke-[3.5]" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hover indicator for my moves */}
              {cell === null && isMyTurn && isPlayer && gState.status === "playing" && (
                <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity" />
              )}
            </button>
          );
        })}
      </div>

      {/* Outcome Medal Cards */}
      <AnimatePresence>
        {gState.status === "completed" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full text-center p-5 rounded-2xl border bg-white border-indigo-100 shadow-sm"
          >
            {gState.winner === "draw" ? (
              <div className="flex flex-col items-center gap-1.5">
                <Scale className="w-8 h-8 text-indigo-500 mb-1" />
                <h4 className="font-display font-black text-indigo-900">Intense Duel Over</h4>
                <p className="text-xs text-slate-550">Perfect strategy deployed by both athletes. No layout flanks found.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Award className="w-8 h-8 text-amber-500 mb-1 animate-bounce" />
                <h4 className="font-display font-black text-slate-900 text-sm">
                  {players.find(p => p.userId === gState.winner)?.displayName} Claims The Lobby!
                </h4>
                <p className="text-xs text-indigo-605 font-semibold">
                  {gState.winner === currentPlayerId ? "Match log results written to high speed database cache!" : "Rematch is waiting for competitive redemption."}
                </p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
              {room.rematchRequests?.includes(currentPlayerId) ? (
                <div className="py-2.5 px-4 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-mono font-bold animate-pulse">
                  ⏳ WAITING FOR OPPONENT TO CONFIRM REMATCH...
                </div>
              ) : (
                <button
                  onClick={() => onSendAction("request-rematch", {})}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm hover:shadow active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  Start Match Again / Rematch
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
