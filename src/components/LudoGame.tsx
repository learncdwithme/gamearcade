import React, { useState } from "react";
import { Room, LudoState } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, ShieldAlert, Award, Star } from "lucide-react";

interface LudoGameProps {
  room: Room;
  currentPlayerId: string;
  onSendAction: (actionName: string, payload: any) => void;
}

export const LudoGame: React.FC<LudoGameProps> = ({
  room,
  currentPlayerId,
  onSendAction,
}) => {
  const lState = room.state as LudoState;
  const players = room.players;

  const [isRolling, setIsRolling] = useState(false);

  // Identity checks
  const isPlayer = players.some((p) => p.userId === currentPlayerId);
  const myPlayerIdx = players.findIndex((p) => p.userId === currentPlayerId);
  const myColor = myPlayerIdx === 0 ? "red" : "green";
  const isMyTurn = players[lState.turn]?.userId === currentPlayerId;

  // Track Start positions: Red starts at cell 0, Green starts at cell 14.
  const redStartAbs = 0;
  const greenStartAbs = 14;

  const handleRollDice = () => {
    if (!isPlayer || !isMyTurn || lState.diceRoll !== null || isRolling || lState.status !== "playing") return;
    setIsRolling(true);
    setTimeout(() => {
      onSendAction("roll-dice", {});
      setIsRolling(false);
    }, 800);
  };

  const handleMoveToken = (tokenIdx: number) => {
    if (!isPlayer || !isMyTurn || lState.diceRoll === null || lState.status !== "playing") return;

    // Check legality of the move
    const pos = lState.tokens[myColor][tokenIdx];
    const diceRoll = lState.diceRoll;

    if (pos === -1 && diceRoll !== 6) return; // Need 6
    if (pos >= 30) return; // Completed
    if (pos + diceRoll > 30) return; // Can't overshoot

    onSendAction("move-token", { tokenIndex: tokenIdx });
  };

  const renderDiceIcon = (rollVal: number | null) => {
    const styling = `w-14 h-14 ${isMyTurn ? "text-indigo-600 group-hover:text-indigo-500" : "text-slate-400"}`;
    switch (rollVal) {
      case 1: return <Dice1 className={styling} />;
      case 2: return <Dice2 className={styling} />;
      case 3: return <Dice3 className={styling} />;
      case 4: return <Dice4 className={styling} />;
      case 5: return <Dice5 className={styling} />;
      case 6: return <Dice6 className={styling} />;
      default: return <Dice6 className={`${styling} opacity-30`} />;
    }
  };

  // Check if a specific token has a valid move
  const isTokenMovable = (color: "red" | "green", idx: number): boolean => {
    if (!isMyTurn || lState.diceRoll === null || lState.status !== "playing") return false;
    if (color !== myColor) return false;

    const pos = lState.tokens[color][idx];
    const roll = lState.diceRoll;

    if (pos === -1) return roll === 6;
    if (pos >= 30) return false;
    return pos + roll <= 30;
  };

  // Generate an abstract ring coordinate system for a responsive circular UI
  const getAbsTrackPositionId = (color: "red" | "green", relativePos: number): number | "yard" | "home" | "stairs" => {
    if (relativePos === -1) return "yard";
    if (relativePos === 30) return "home";
    if (relativePos >= 26) return "stairs";

    const startIdx = color === "red" ? redStartAbs : greenStartAbs;
    return (relativePos + startIdx) % 28;
  };

  // Build the list of active board steps for visualization
  // Total 28 cells in the loop (numbered 0 to 27)
  const trackCells = Array.from({ length: 28 }, (_, i) => i);

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-6" id="ludo_board_container">
      {/* Turn Display Banner */}
      <div className="w-full flex items-center justify-between px-3">
        <div className="flex gap-2">
          {players.map((p, idx) => {
            const color = idx === 0 ? "border-red-400 text-red-600 bg-red-50" : "border-emerald-400 text-emerald-600 bg-emerald-50";
            const active = lState.turn === idx && lState.status === "playing";
            return (
              <div
                key={p.userId}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold font-mono ${
                  active ? `${color} shadow-sm border-indigo-400 scale-102` : "opacity-45 border-slate-200 text-slate-400"
                }`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${idx === 0 ? "bg-red-500" : "bg-emerald-500"}`} />
                <span>{p.displayName.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>

        {lState.status === "playing" ? (
          <div className="text-xs font-mono font-bold text-slate-500">
            {isMyTurn ? "Your turn to play" : "Opponent is playing..."}
          </div>
        ) : (
          <div className="text-xs font-mono font-bold text-amber-600 flex items-center gap-1">
            <Award className="w-4 h-4 fill-amber-100" />
            MATCH COMPLETED
          </div>
        )}
      </div>

      {/* VISUAL BOARD MAP */}
      <div className="w-full bg-slate-50 border border-slate-200/80 p-5 rounded-3xl shadow-sm flex flex-col space-y-4">
        
        {/* Top Section - Bases and Homes */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* RED PLAYER BASE CAMP */}
          <div className="bg-red-50/50 border border-red-200 p-4 rounded-2xl flex flex-col items-center justify-between">
            <span className="text-xs text-red-650 font-mono flex items-center gap-1.5 font-bold">
              <Star className="w-3.5 h-3.5 fill-red-500 text-red-500" /> BASE (RED)
            </span>
            <div className="flex gap-3 my-4">
              {lState.tokens.red.map((pos, idx) => {
                const inBase = pos === -1;
                const movable = isTokenMovable("red", idx);
                return (
                  <button
                    key={idx}
                    onClick={() => handleMoveToken(idx)}
                    disabled={!movable}
                    className={`w-11 h-11 rounded-full relative flex items-center justify-center transition-all ${
                      inBase 
                        ? `bg-red-500 border-2 border-white shadow ${movable ? "animate-bounce scale-110 ring-4 ring-yellow-400 cursor-pointer" : "opacity-80"}`
                        : "bg-white border border-slate-200 text-slate-400 text-xs font-mono"
                    }`}
                  >
                    {inBase ? (
                      <div className="w-5 h-5 rounded-full bg-red-650 shadow-inner flex items-center justify-center">
                        <span className="text-[10px] text-white font-bold">{idx + 1}</span>
                      </div>
                    ) : (
                      "OUT"
                    )}
                  </button>
                );
              })}
            </div>
            <span className="text-[9.5px] text-red-600 font-mono tracking-tight text-center">
              Roll 6 to release from Yard
            </span>
          </div>

          {/* GREEN MAP BASE CAMP */}
          <div className="bg-emerald-50/50 border border-emerald-200 p-4 rounded-2xl flex flex-col items-center justify-between">
            <span className="text-xs text-emerald-750 font-mono flex items-center gap-1.5 font-bold">
              <Star className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" /> BASE (GREEN)
            </span>
            <div className="flex gap-3 my-4">
              {lState.tokens.green.map((pos, idx) => {
                const inBase = pos === -1;
                const movable = isTokenMovable("green", idx);
                return (
                  <button
                    key={idx}
                    onClick={() => handleMoveToken(idx)}
                    disabled={!movable}
                    className={`w-11 h-11 rounded-full relative flex items-center justify-center transition-all ${
                      inBase 
                        ? `bg-emerald-500 border-2 border-white shadow ${movable ? "animate-bounce scale-110 ring-4 ring-yellow-400 cursor-pointer" : "opacity-80"}`
                        : "bg-white border border-slate-200 text-slate-400 text-xs font-mono"
                    }`}
                  >
                    {inBase ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-650 shadow-inner flex items-center justify-center">
                        <span className="text-[10px] text-white font-bold">{idx + 1}</span>
                      </div>
                    ) : (
                      "OUT"
                    )}
                  </button>
                );
              })}
            </div>
            <span className="text-[9.5px] text-emerald-600 font-mono tracking-tight text-center">
              Roll 6 to release from Yard
            </span>
          </div>
        </div>

        {/* Tracks representation - Circular Loop View */}
        <div>
          <div className="text-[11px] font-mono font-bold text-slate-500 mb-2 px-1 flex items-center justify-between">
            <span>RACEWAY LOOP PATH</span>
            <span className="text-[10px] text-amber-600 flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Safe Start Cells
            </span>
          </div>
          
          <div className="grid grid-cols-7 gap-1.5 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-inner">
            {/* Linear track coordinates rendered beautifully */}
            {trackCells.map((val) => {
              // Check what tokens sit here
              const hasRedToken = lState.tokens.red.map((pos, idx) => getAbsTrackPositionId("red", pos) === val);
              const hasGreenToken = lState.tokens.green.map((pos, idx) => getAbsTrackPositionId("green", pos) === val);

              const isRedStart = val === redStartAbs;
              const isGreenStart = val === greenStartAbs;
              const isSafe = isRedStart || isGreenStart;

              return (
                <div
                  key={val}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-300 border ${
                    isRedStart
                      ? "bg-red-50 border-red-300"
                      : isGreenStart
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-slate-50/50 border-slate-200/50"
                  }`}
                >
                  <span className="absolute top-0.5 left-0.5 text-[8px] font-mono font-bold text-slate-400">
                    {val}
                  </span>

                  {isSafe && !hasRedToken.includes(true) && !hasGreenToken.includes(true) && (
                    <Star className={`w-3.5 h-3.5 fill-current opacity-40 ${isRedStart ? "text-red-500" : "text-emerald-500"}`} />
                  )}

                  {/* Render overlapping tokens inside cells */}
                  <div className="flex flex-wrap items-center justify-center gap-0.5">
                    {hasRedToken.map((active, idx) => {
                      if (!active) return null;
                      const movable = isTokenMovable("red", idx);
                      return (
                        <button
                          key={`r-${idx}`}
                          onClick={() => handleMoveToken(idx)}
                          disabled={!movable}
                          className={`w-5.5 h-5.5 rounded-full bg-red-500 border border-white flex items-center justify-center text-[7.5px] text-white font-bold shadow-sm ${
                            movable ? "animate-pulse ring-2 ring-yellow-400 cursor-pointer" : ""
                          }`}
                        >
                          R{idx + 1}
                        </button>
                      );
                    })}
                    {hasGreenToken.map((active, idx) => {
                      if (!active) return null;
                      const movable = isTokenMovable("green", idx);
                      return (
                        <button
                          key={`g-${idx}`}
                          onClick={() => handleMoveToken(idx)}
                          disabled={!movable}
                          className={`w-5.5 h-5.5 rounded-full bg-emerald-500 border border-white flex items-center justify-center text-[7.5px] text-white font-bold shadow-sm ${
                            movable ? "animate-pulse ring-2 ring-yellow-400 cursor-pointer" : ""
                          }`}
                        >
                          G{idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Home Stretch Progress Indicators */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
          <div className="text-[11px] font-mono text-slate-600 font-bold mb-3 flex items-center gap-1.5 uppercase">
            🏁 HOME PROGRESSION (Steps 26 to 29, then Home 30!)
          </div>

          <div className="space-y-3">
            {/* Red home track */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-red-600 font-mono w-14 font-bold">RED PIECES:</span>
              <div className="flex-1 grid grid-cols-5 gap-1.5">
                {[26, 27, 28, 29, 30].map((stepIdx) => {
                  const hasToken = lState.tokens.red.map((pos) => pos === stepIdx);
                  const isHomeCell = stepIdx === 30;
                  return (
                    <div
                      key={stepIdx}
                      className={`h-7 rounded-lg flex items-center justify-center relative border ${
                        isHomeCell ? "bg-red-100 border-red-300 font-bold" : "bg-red-50/40 border-red-200/50"
                      }`}
                    >
                      <span className="absolute text-[8px] text-red-400 font-bold top-0.5 right-1 font-mono">
                        {isHomeCell ? "H" : stepIdx}
                      </span>
                      {hasToken.map((active, idx) => {
                        if (!active) return null;
                        const movable = isTokenMovable("red", idx);
                        return (
                          <button
                            key={idx}
                            onClick={() => handleMoveToken(idx)}
                            disabled={!movable}
                            className={`w-4 h-4 rounded-full bg-red-500 border border-white flex items-center justify-center text-[7px] text-white font-bold shrink-0 shadow-sm ${
                              movable ? "animate-pulse ring-1 ring-yellow-400 cursor-pointer" : ""
                            }`}
                          >
                            R{idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Green home track */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-emerald-600 font-mono w-14 font-bold">GREEN:</span>
              <div className="flex-1 grid grid-cols-5 gap-1.5">
                {[26, 27, 28, 29, 30].map((stepIdx) => {
                  const hasToken = lState.tokens.green.map((pos) => pos === stepIdx);
                  const isHomeCell = stepIdx === 30;
                  return (
                    <div
                      key={stepIdx}
                      className={`h-7 rounded-lg flex items-center justify-center relative border ${
                        isHomeCell ? "bg-emerald-100 border-emerald-300 font-bold" : "bg-emerald-50/40 border-emerald-200/50"
                      }`}
                    >
                      <span className="absolute text-[8px] text-emerald-400 font-bold top-0.5 right-1 font-mono">
                        {isHomeCell ? "H" : stepIdx}
                      </span>
                      {hasToken.map((active, idx) => {
                        if (!active) return null;
                        const movable = isTokenMovable("green", idx);
                        return (
                          <button
                            key={idx}
                            onClick={() => handleMoveToken(idx)}
                            disabled={!movable}
                            className={`w-4 h-4 rounded-full bg-emerald-500 border border-white flex items-center justify-center text-[7px] text-white font-bold shrink-0 shadow-sm ${
                              movable ? "animate-pulse ring-1 ring-yellow-400 cursor-pointer" : ""
                            }`}
                          >
                            G{idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MULTIPLAYER DICE INTERACTIVE PANEL OR REMATCH BUTTON */}
      {lState.status === "completed" ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full text-center p-6 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col items-center gap-2"
        >
          <Award className="w-9 h-9 text-amber-500 animate-bounce" />
          <h4 className="font-display font-black text-slate-900 text-sm">
            {players.find(p => p.userId === lState.winner)?.displayName} Claims the Victory!
          </h4>
          <p className="text-xs text-slate-550 leading-relaxed max-w-sm font-mono">
            All tokens have safely arrived home. Rematch is waiting for competitive redemption.
          </p>

          <div className="w-full mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
            {room.rematchRequests?.includes(currentPlayerId) ? (
              <div className="py-2.5 px-4 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-mono font-bold animate-pulse text-center">
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
      ) : (
        <div className="w-full flex justify-between items-center bg-white border border-slate-200/80 p-5 rounded-3xl shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest font-bold">ACTIVE ROLLER</span>
            <span className="text-sm font-black text-slate-800 truncate">
              {players[lState.turn]?.displayName}
            </span>
            <span className="text-[10px] text-indigo-600 font-bold font-mono">
              {isMyTurn ? "Your turn - Tap the dice to roll!" : "Waiting for opponent..."}
            </span>
          </div>

          <button
            onClick={handleRollDice}
            disabled={!isPlayer || !isMyTurn || lState.diceRoll !== null || isRolling || lState.status !== "playing"}
            className={`group flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all duration-300 ${
              isMyTurn && lState.diceRoll === null && lState.status === "playing"
                ? "bg-indigo-50 border-indigo-300 shadow-sm cursor-pointer hover:bg-indigo-100"
                : "bg-slate-50 border-slate-150 cursor-not-allowed opacity-70"
            }`}
          >
            <motion.div
              animate={isRolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.2, 0.9, 1.1, 1] } : {}}
              transition={{ duration: 0.8 }}
            >
              {renderDiceIcon(lState.diceRoll)}
            </motion.div>
          </button>
        </div>
      )}
    </div>
  );
};
