import React, { useState } from "react";
import { GameConfig } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Play, Users, Lock, ChevronRight, Hash, Plus, Loader2 } from "lucide-react";

interface LobbyProps {
  game: GameConfig;
  activeUsersCount: number;
  roomsList: {
    id: string;
    name: string;
    gameName: string;
    playerCount: number;
    maxPlayers: number;
    status: string;
    hostName: string;
    hasPassword: boolean;
  }[];
  isSearchingRandom: boolean;
  searchingGame: string | null;
  onJoinRandom: () => void;
  onLeaveRandom: () => void;
  onCreateRoom: (roomName: string, password?: string) => void;
  onJoinRoom: (roomId: string, password?: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  game,
  activeUsersCount,
  roomsList,
  isSearchingRandom,
  searchingGame,
  onJoinRandom,
  onLeaveRandom,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [passwordTargetRoomId, setPasswordTargetRoomId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [directRoomId, setDirectRoomId] = useState("");

  // Filter list of rooms to just this game
  const gameRooms = roomsList.filter((r) => r.gameName === game.id);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setErrorMsg("Room name is required.");
      return;
    }
    // Check if the name matches already
    const duplicate = gameRooms.some(r => r.name.toLowerCase() === roomName.trim().toLowerCase());
    if (duplicate) {
      setErrorMsg("A room with this name already exists.");
      return;
    }

    onCreateRoom(roomName.trim(), roomPassword.trim() || undefined);
    setRoomName("");
    setRoomPassword("");
    setErrorMsg("");
    setShowCreateModal(false);
  };

  const handleJoinClick = (room: typeof roomsList[0]) => {
    if (room.hasPassword) {
      setPasswordTargetRoomId(room.id);
      setPasswordInput("");
      setPasswordError("");
    } else {
      onJoinRoom(room.id);
    }
  };

  const handleDirectJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = directRoomId.trim();
    if (!cleanId) return;

    // Check if the room exists in the local room list
    const matchedRoom = roomsList.find((r) => r.id === cleanId);
    if (matchedRoom) {
      handleJoinClick(matchedRoom);
    } else {
      // If not in the list (could be private or recently created), try joining directly
      onJoinRoom(cleanId);
    }
    setDirectRoomId("");
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setPasswordError("Password is required.");
      return;
    }
    onJoinRoom(passwordTargetRoomId!, passwordInput.trim());
    setPasswordTargetRoomId(null);
  };

  return (
    <div className="w-full flex flex-col space-y-6" id="game_lobby_layout">
      {/* Lobby stats panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-5 rounded-3xl bg-white border border-slate-200/80 shadow-sm gap-4">
        <div>
          <span className="text-[10px] font-mono tracking-wider font-bold text-indigo-600 uppercase">
            MULTIPLAYER ZONE
          </span>
          <h2 className="text-xl font-display font-black text-slate-900 flex items-center gap-2 mt-0.5">
            Lobby Desk: {game.title}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <Users className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Active in Platform: <strong className="text-slate-805 font-bold">{activeUsersCount} players</strong></span>
        </div>
      </div>

      {/* Grid containing Quick Match, Create Custom Room, and Direct Entry buttons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Quick Match Card */}
        <div className="p-6 rounded-3xl bg-indigo-50/70 border border-indigo-150 flex flex-col justify-between">
          <div>
            <h3 className="font-display font-bold text-indigo-900">Express Matchmaking</h3>
            <p className="text-xs text-slate-550 mt-1 leading-relaxed">
              Skip browser grids and search for any active player looking for a duel instantly. Fast, real-time matching.
            </p>
          </div>

          <div className="mt-6 flex items-center">
            {isSearchingRandom && searchingGame === game.id ? (
              <button
                onClick={onLeaveRandom}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-mono text-xs font-bold hover:bg-rose-100 cursor-pointer transition shadow-sm"
              >
                <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                CANCEL SEARCH...
              </button>
            ) : (
              <button
                onClick={onJoinRandom}
                disabled={isSearchingRandom}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-500 transition cursor-pointer text-xs disabled:opacity-40 shadow-md shadow-indigo-600/10"
              >
                <Play className="w-4 h-4 fill-current" />
                DUELLING MATCH MATCHMAKER
              </button>
            )}
          </div>
        </div>

        {/* Create room card */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="font-display font-bold text-slate-900">Custom Shared Chamber</h3>
            <p className="text-xs text-slate-550 mt-1 leading-relaxed">
              Host a customized game room. Share an optional password to setup direct challenges with friends privately.
            </p>
          </div>

          <div className="mt-6">
            <button
              onClick={() => {
                setErrorMsg("");
                setShowCreateModal(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 text-xs font-bold text-white transition cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4 text-white" />
              CREATE EXCLUSIVE LOBBY
            </button>
          </div>
        </div>

        {/* Direct join via Room ID card */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 flex flex-col justify-between shadow-sm">
          <div>
            <h3 className="font-display font-bold text-slate-900">Direct Entry Chamber</h3>
            <p className="text-xs text-slate-550 mt-1 leading-relaxed">
              Have an active Room ID shared by an opponent? Enter the identifier directly below to route yourself instantly.
            </p>
          </div>

          <form onSubmit={handleDirectJoinSubmit} className="mt-6 flex gap-2">
            <input
              type="text"
              placeholder="Paste Room ID (e.g. room-...)"
              value={directRoomId}
              onChange={(e) => setDirectRoomId(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              type="submit"
              disabled={!directRoomId.trim()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white disabled:opacity-40 transition cursor-pointer shadow-sm flex items-center justify-center gap-1 shrink-0"
            >
              Join <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Available custom Rooms List */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-bold text-slate-500 flex items-center gap-1.5 px-1 uppercase tracking-wider">
          <Hash className="w-4 h-4 text-indigo-600" /> Current Custom Rooms ({gameRooms.length})
        </h3>

        {gameRooms.length === 0 ? (
          <div className="text-center p-12 border border-slate-200 bg-white rounded-3xl select-none shadow-sm">
            <p className="text-xs font-mono text-slate-450">No active custom chambers. Create your own above to begin!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gameRooms.map((room) => {
              const rFull = room.playerCount >= room.maxPlayers;
              const completed = room.status === "completed";
              return (
                <div
                  key={room.id}
                  className="p-5 rounded-2xl border border-slate-250 bg-white hover:border-indigo-305 flex items-center justify-between transition-all hover:shadow-sm"
                >
                  <div className="flex flex-col min-w-0 pr-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-slate-900 truncate text-sm">
                        {room.name}
                      </span>
                      {room.hasPassword && (
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-450 mt-0.5 truncate">
                      Host: {room.hostName}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-lg text-slate-700 font-bold border border-slate-150">
                      {room.playerCount}/{room.maxPlayers}
                    </span>

                    <button
                      onClick={() => handleJoinClick(room)}
                      disabled={rFull || completed}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition overflow-hidden cursor-pointer ${
                        rFull || completed
                          ? "bg-slate-105 text-slate-400 cursor-not-allowed border border-slate-200"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                      }`}
                    >
                      {rFull ? "Full" : completed ? "Ended" : "Join"}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE ROOM MODAL OVERLAY */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white border border-slate-250 rounded-3xl overflow-hidden shadow-2xl p-6 relative z-50 text-slate-800"
            >
              <h3 className="text-lg font-display font-black text-slate-950 mb-1">Host Custom Lobby</h3>
              <p className="text-xs text-slate-500 mb-4 font-mono">
                Launch a customized board arena for {game.title}.
              </p>

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Lobby Name (Unique)
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g., Duels only"
                    maxLength={24}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Room Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    placeholder="e.g., 1234"
                    maxLength={16}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 italic block mt-0.5">
                    Leave empty to let anyone enter.
                  </span>
                </div>

                {errorMsg && (
                  <p className="text-xs text-rose-600 font-mono font-semibold">{errorMsg}</p>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRoomName("");
                      setRoomPassword("");
                      setShowCreateModal(false);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer"
                  >
                    Launch
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PASSWORD CHALLENGE PROMPT */}
      <AnimatePresence>
        {passwordTargetRoomId !== null && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white border border-slate-250 rounded-3xl overflow-hidden shadow-2xl p-6 relative z-50 text-slate-800"
            >
              <h3 className="text-lg font-display font-black text-slate-950 flex items-center gap-2 mb-1">
                <Lock className="w-4 h-4 text-amber-500" /> Enter Passcode
              </h3>
              <p className="text-xs text-slate-500 mb-4 font-mono">
                This custom lobby requires a password.
              </p>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Room Code Password
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-505"
                  />
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-600 font-mono font-semibold">{passwordError}</p>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordTargetRoomId(null);
                      setPasswordInput("");
                      setPasswordError("");
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer"
                  >
                    Verify & Join
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
