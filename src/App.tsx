import React, { useState, useEffect, useRef } from "react";
import { auth, signInWithGoogle, logOut } from "./firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { GAMES_CATALOG, GameConfig, Room, ChatMessage } from "./types";
import { TicTacToeGame } from "./components/TicTacToeGame";
import { LudoGame } from "./components/LudoGame";
import { ChatRoom } from "./components/ChatRoom";
import { Lobby } from "./components/Lobby";
import { motion, AnimatePresence } from "motion/react";
import { 
  Gamepad2, 
  LogIn, 
  LogOut, 
  Sparkles, 
  Flame, 
  Share2, 
  Monitor, 
  Download, 
  User as UserIcon, 
  BookOpen, 
  ArrowLeft,
  Activity,
  UserCheck,
  Smartphone,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Users,
  Grid,
  History,
  Timer,
  ExternalLink
} from "lucide-react";

export default function App() {
  // Navigation & URL Routing State
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeGame, setActiveGame] = useState<GameConfig | null>(null);
  const [viewState, setViewState] = useState<"detail" | "play">("detail");

  // Authentication State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // PWA Install prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  // Real-time Games WebSocket State
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeUsersCount, setActiveUsersCount] = useState(1);
  const [roomsList, setRoomsList] = useState<any[]>([]);
  const [joinedRoom, setJoinedRoom] = useState<Room | null>(null);
  
  // Searching status
  const [isSearchingRandom, setIsSearchingRandom] = useState(false);
  const [searchingGame, setSearchingGame] = useState<string | null>(null);

  // Chat message & system events stream for active game play
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Historical games logs state (Connected to MongoDB Rest Endpoint)
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Admin Dashboard Connections State
  const [adminConnections, setAdminConnections] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);

  // 1. Dynamic SEO Header Configuration for GameXEdiol
  useEffect(() => {
    let title = "GameXEdiol Arena | Progressive Multiplayer Web App";
    let desc = "Experience elite realtime board games with GameXEdiol. Play modern versions of Tic-Tac-Toe and Battle Ludo on mobile or desktop via blazing fast WebSockets.";

    if (currentPath === "/") {
      title = "GameXEdiol | Premier Multiplayer Board Games Arena";
    } else if (currentPath === "/login") {
      title = "Sign In - GameXEdiol";
      desc = "Connect securely with Google to start participating in real-time WebSockets board games matchups.";
    } else if (currentPath === "/portal") {
      title = "Game Portal - GameXEdiol";
      desc = "Select your favorite table arena, coordinate custom passwords matchmaking, and browse your recent victories.";
    } else if (currentPath === "/admin") {
      title = "Admin Terminal Panel - GameXEdiol";
      desc = "System administration viewport monitoring active WebSocket socket feeds.";
    } else if (currentPath.startsWith("/games/")) {
      const gameId = currentPath.split("/")[2];
      const match = GAMES_CATALOG[gameId];
      if (match) {
        title = `Play ${match.title} Online | GameXEdiol`;
        desc = `Join waiting rooms, challenge friends, and deploy strategies in ${match.title}. ${match.shortDesc}`;
      }
    }

    document.title = title;
    
    // Set meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", desc);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = desc;
      document.head.appendChild(meta);
    }
  }, [currentPath]);

  // 2. Handle routing and URL synchronization
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      setCurrentPath(path);

      if (path.startsWith("/games/")) {
        const gameId = path.split("/")[2];
        const match = GAMES_CATALOG[gameId];
        if (match) {
          setActiveGame(match);
        } else {
          setActiveGame(null);
        }
      } else {
        setActiveGame(null);
        setJoinedRoom(null);
        setViewState("detail");
      }
    };

    window.addEventListener("popstate", handleLocationChange);
    handleLocationChange(); // run initial matching on page layout load

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Helper trigger navigation pushes
  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new Event("popstate"));
  };

  // 3. PWA Registration and installation handler
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    window.addEventListener("appinstalled", () => {
      setDeferredPrompt(null);
      setIsPwaInstalled(true);
    });

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) {
      setIsPwaInstalled(true);
    }

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("Service Worker successfully registered in scope: ", reg.scope);
          })
          .catch((err) => {
            console.error("Service Worker registration failed: ", err);
          });
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User prompt decision for PWA installation: ${outcome}`);
    setDeferredPrompt(null);
  };

  // 4. Firebase Authentication and Profile Synchronizer
  useEffect(() => {
    const savedGuest = localStorage.getItem("gamexediol_guest_user");
    if (savedGuest) {
      try {
        const guestObj = JSON.parse(savedGuest);
        setUser(guestObj);
        setAuthLoading(false);
        loadCompletionHistory(guestObj.uid);
        if (window.location.pathname === "/login") {
          navigateTo("/portal");
        }
        return;
      } catch (e) {
        localStorage.removeItem("gamexediol_guest_user");
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const stillGuest = localStorage.getItem("gamexediol_guest_user");
      if (stillGuest) {
        setAuthLoading(false);
        return;
      }

      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        // Fetch MongoDB history logs for this logged in profile
        loadCompletionHistory(currentUser.uid);
        
        // If the path was /login, redirect automatically to portal
        if (window.location.pathname === "/login") {
          navigateTo("/portal");
        }
      } else {
        setRecentLogs([]);
        // Protect portal and game rooms from unauthenticated visitors
        const currentLoc = window.location.pathname;
        if (currentLoc === "/portal" || currentLoc.startsWith("/games/")) {
          navigateTo("/login");
        }
      }
    });

    return unsubscribe;
  }, []);

  const handleGuestLogin = (customName?: string) => {
    const adjectives = ["Alpha", "Omega", "Sonic", "Pro", "Cyber", "Shadow", "Neon", "Hyper", "Vortex", "Pixel", "Cosmic", "Rogue", "Astro", "Titan", "Spectre", "Zenith", "Turbo"];
    const nouns = ["Racer", "Knight", "Gamer", "Sniper", "Slayer", "Phantom", "Legend", "Wizard", "Ninja", "Hustler", "Warlock", "Samurai", "Striker", "Hero", "Gladiator", "Rider"];
    
    const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNickname = customName && customName.trim() ? customName.trim() : `${randAdj} ${randNoun}`;
    
    const randomId = `guest_${Math.random().toString(36).substr(2, 9)}`;
    const avatarUrl = `https://robohash.org/${randomId}.png?size=150x150`;

    const guestUser = {
      uid: randomId,
      email: `${randomId}@guest.local`,
      displayName: randomNickname,
      photoURL: avatarUrl,
      emailVerified: true,
    } as any as FirebaseUser;

    localStorage.setItem("gamexediol_guest_user", JSON.stringify(guestUser));
    setUser(guestUser);
    loadCompletionHistory(randomId);
    navigateTo("/portal");
  };

  const handleLogoutClick = async () => {
    localStorage.removeItem("gamexediol_guest_user");
    setUser(null);
    try {
      await logOut();
    } catch (e) {
      console.error("Firebase logout error:", e);
    }
    navigateTo("/login");
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedRoomId(true);
    setTimeout(() => setCopiedRoomId(false), 2000);
  };

  // 5. Query user completed game records from MongoDB API
  const loadCompletionHistory = async (uid: string) => {
    setLogsLoading(true);
    try {
      const resp = await fetch(`/api/logs?userId=${uid}`);
      if (resp.ok) {
        const data = await resp.json();
        setRecentLogs(data || []);
      } else {
        setRecentLogs([]);
      }
    } catch (e) {
      console.error("Failed to fetch historical MongoDB metrics:", e);
      setRecentLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  // 6. Admin Connections feed fetcher
  const fetchAdminConnections = async () => {
    if (!user) return;
    setAdminLoading(true);
    try {
      const resp = await fetch(`/api/admin/connections?email=${user.email}`);
      if (resp.ok) {
        const data = await resp.json();
        setAdminConnections(data.connections || []);
      }
    } catch (e) {
      console.error("Error fetching administrative connection reports:", e);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (currentPath === "/admin" && user) {
      const adminEmail = (import.meta as any).env.VITE_ADMIN_EMAIL || "vjv7273@gmail.com";
      if (user.email === adminEmail) {
        fetchAdminConnections();
        const interval = setInterval(fetchAdminConnections, 8000);
        return () => clearInterval(interval);
      }
    }
  }, [currentPath, user]);

  // 7. Single master WebSockets Connection controller for gameplay Lobbies
  useEffect(() => {
    if (!user) return;

    const protocolStr = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocolStr}://${window.location.host}`;

    const connectWebSocket = () => {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        socket.send(JSON.stringify({
          type: "init",
          userId: user.uid,
          displayName: user.displayName || "Anonymous Player",
          email: user.email || ""
        }));
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "lobby-update":
            setActiveUsersCount(msg.activeUsersCount);
            setRoomsList(msg.roomsList);
            setIsSearchingRandom(msg.isSearchingRandom);
            setSearchingGame(msg.searchingGame);
            break;

          case "room-denied":
            alert(`Lobby Denied Action: ${msg.reason}`);
            break;

          case "room-joined":
            setJoinedRoom(msg.room);
            setChatMessages([]);
            setSystemLogs([]);
            break;

          case "room-update":
            setJoinedRoom(msg.room);
            // Refresh recent completed games telemetry list if game ended!
            if (msg.room?.status === "completed") {
              setTimeout(() => loadCompletionHistory(user.uid), 1500);
            }
            break;

          case "chat-message":
            setChatMessages(prev => [...prev, msg]);
            break;

          case "chat-system":
            setSystemLogs(prev => [...prev, msg.text]);
            break;

          case "room-left":
            setJoinedRoom(null);
            setChatMessages([]);
            setSystemLogs([]);
            break;

          case "room-closed":
            setJoinedRoom(null);
            setChatMessages([]);
            setSystemLogs([]);
            showToast(msg.reason || "The room has been dissolved.");
            navigateTo("/portal");
            break;
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        console.log("WebSocket system closed. Retrying stream in 4s...");
        setTimeout(() => {
          if (auth.currentUser) connectWebSocket();
        }, 4000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user]);

  // WebSocket action dispatch helpers
  const sendWsAction = (actionName: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "game-action",
        action: actionName,
        payload
      }));
    }
  };

  const handleSendMessage = (text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "chat-message",
        text
      }));
    }
  };

  const handleJoinRandom = () => {
    if (!activeGame) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "random-join",
        gameName: activeGame.id
      }));
    }
  };

  const handleLeaveRandom = () => {
    if (!activeGame) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "random-leave",
        gameName: activeGame.id
      }));
    }
  };

  const handleCreateRoom = (roomName: string, password?: string) => {
    if (!activeGame) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "create-room",
        gameName: activeGame.id,
        roomName,
        password
      }));
    }
  };

  const handleJoinRoom = (roomId: string, password?: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "join-room",
        roomId,
        password
      }));
    }
  };

  const handleLeaveRoom = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "leave-room"
      }));
    }
  };

  // --- COMPONENT LOAD SCREEN ---
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3 animate-pulse" />
        <span className="font-mono text-xs tracking-wider text-slate-500 uppercase">Synchronizing profiles...</span>
      </div>
    );
  }

  // --- DYNAMIC VIEW COMPOSERS ---

  const renderToastAlert = () => (
    <AnimatePresence>
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-xl max-w-sm w-max font-sans text-xs font-bold uppercase tracking-wider text-center"
        >
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
          <span>{toastMessage}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Common Header layout component
  const renderHeader = () => (
    <header className="sticky top-0 bg-white/95 backdrop-blur-md z-30 border-b border-slate-200/80 px-4 md:px-8 py-4 flex items-center justify-between shadow-sm">
      {renderToastAlert()}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigateTo("/")}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
            <Gamepad2 className="w-5 h-5 text-indigo-600" />
          </div>
          <span className="font-display font-extrabold text-slate-900 text-lg tracking-tight">
            GameXEdiol
          </span>
        </button>

        {user && (
          wsConnected ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10.5px] font-mono text-emerald-600 font-semibold uppercase">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-duration-1000"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-600"></span>
              </span>
              LOBBY SYNCED
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-100 text-[10.5px] font-mono text-amber-600 font-semibold uppercase animate-pulse">
              Reconnecting...
            </span>
          )
        )}
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <button
              onClick={() => navigateTo("/portal")}
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              Play Portal
            </button>
            {user.email === ((import.meta as any).env.VITE_ADMIN_EMAIL || "vjv7273@gmail.com") && (
              <button
                onClick={() => navigateTo("/admin")}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition cursor-pointer flex items-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </button>
            )}

            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || "User"} 
                  className="w-7 h-7 rounded-full border border-slate-200" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                </div>
              )}
              <button
                onClick={handleLogoutClick}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => navigateTo("/login")}
            className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/10 transition cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In with Google
          </button>
        )}
      </div>
    </header>
  );

  // Common Footer layout component
  const renderFooter = () => (
    <footer className="bg-slate-50 border-t border-slate-200/80 py-8 text-center text-xs font-mono text-slate-500 select-none px-4 space-y-2">
      <p className="font-semibold text-slate-700">GameXEdiol Arena</p>
      <p>Powered by QTLWS</p>
    </footer>
  );

  // VIEW 1: AUTHENTICATE LOGIN SCREEN
  if (currentPath === "/login") {
    if (user) {
      navigateTo("/portal");
      return null;
    }
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col justify-between">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200/80 shadow-xl rounded-3xl p-8 text-center space-y-6">
            <div className="inline-flex p-4 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
              <Gamepad2 className="w-10 h-10 text-indigo-600 animate-pulse" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight leading-none">
                Connect Profile
              </h1>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Securely logs on via certified Google Authenticate. Synced with MongoDB history registers.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-3">
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-mono font-bold px-2.5 py-0.5 rounded border border-indigo-200">
                SECURED COMPRESSION LOGS
              </span>
              <p className="text-xs text-slate-600 leading-relaxed font-sans mt-1">
                A unique authentication profile holds active room lists, records streak tallies, and prevents identity hijacking in competitive game chambers.
              </p>
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold transition hover:bg-indigo-500 shadow-lg shadow-indigo-600/10 cursor-pointer text-sm"
              id="google-signin-btn"
            >
              <LogIn className="w-4 h-4 text-indigo-200" />
              Secure Sign in with Google
            </button>

            {/* Divider */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-250"></div>
              <span className="flex-shrink mx-4 text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                Or Developer Sandbox
              </span>
              <div className="flex-grow border-t border-slate-250"></div>
            </div>

            <div className="p-5 bg-indigo-50/40 rounded-2xl border border-indigo-100/50 space-y-4 text-left">
              <div>
                <span className="text-[10px] bg-indigo-100 text-indigo-750 font-mono font-bold px-2.5 py-0.5 rounded border border-indigo-200 uppercase">
                  Local Dev Guest Entrance
                </span>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-normal font-sans">
                  Testing in multiple private windows? Enter a custom handle or keep blank for a funny auto-generated alias and jump directly in!
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Guest Nickname (e.g. Tab 1)"
                  id="guest_nickname_input"
                  maxLength={16}
                  className="flex-1 bg-white border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-sans"
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById("guest_nickname_input") as HTMLInputElement;
                    handleGuestLogin(input ? input.value : "");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition hover:shadow-sm cursor-pointer shrink-0"
                >
                  Quick Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
        {renderFooter()}
      </div>
    );
  }

  // VIEW 2: ADMIN PANEL TERMINAL MAP
  if (currentPath === "/admin") {
    const adminEmail = (import.meta as any).env.VITE_ADMIN_EMAIL || "vjv7273@gmail.com";
    if (!user || user.email !== adminEmail) {
      // Return beautiful, customizable 404
      return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
          {renderHeader()}
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="p-4 rounded-full bg-rose-50 text-rose-500 border border-rose-100 select-none">
              <ShieldCheck className="w-12 h-12 stroke-[1.5]" />
            </div>
            <h1 className="text-6xl font-display font-black text-slate-900">404</h1>
            <h2 className="text-lg font-bold text-slate-800">Page Not Found</h2>
            <p className="text-xs text-slate-500 max-w-sm">
              The requested address is restricted or is not available inside the current user viewport.
            </p>
            <button 
              onClick={() => navigateTo("/")}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Return Home
            </button>
          </div>
          {renderFooter()}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-100/50 text-slate-800 flex flex-col justify-between">
        {renderHeader()}
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-indigo-600" />
              <h1 className="text-2xl font-display font-bold text-slate-900">Admin Control Terminal</h1>
            </div>
            <button
              onClick={fetchAdminConnections}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-xl flex items-center gap-1 transition cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              Refresh Nodes
            </button>
          </div>

          {/* Quick info boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
              <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600 font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">LIVE CLIENTS</span>
                <span className="text-lg font-bold font-mono text-slate-800">{adminConnections.length} connected</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600 font-bold">
                <Grid className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">ACTIVE CHAMBERS</span>
                <span className="text-lg font-bold font-mono text-slate-800">
                  {roomsList.length} rooms
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
              <div className="p-3 rounded-lg bg-amber-50 text-amber-600 font-bold">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-mono block">SYSTEM STATUS</span>
                <span className="text-lg font-bold font-mono text-emerald-600 font-bold uppercase text-xs">operational</span>
              </div>
            </div>
          </div>

          {/* Connected Members Matrix */}
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
              <h3 className="font-display font-semibold text-slate-900 text-sm">Online socket connections</h3>
              <p className="text-xs text-slate-500">Real-time listing of verified player sockets attached to the WebSocket server.</p>
            </div>

            {adminLoading && adminConnections.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400">
                Decrypting connections feeds...
              </div>
            ) : adminConnections.length === 0 ? (
              <div className="p-12 text-center text-slate-500 border-none">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-mono">No active connections reported.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto min-w-full">
                <table className="min-w-full text-left font-sans text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-mono font-bold text-[10px] uppercase border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3">Player Identifiers</th>
                      <th className="px-6 py-3">User Email</th>
                      <th className="px-6 py-3">Active Chamber Game</th>
                      <th className="px-6 py-3">Chamber ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {adminConnections.map((conn) => (
                      <tr key={conn.userId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                          <span>{conn.displayName}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-500">{conn.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold border ${
                            conn.activeGame !== "None" 
                              ? "bg-indigo-50 border-indigo-100 text-indigo-600" 
                              : "bg-slate-100 border-slate-200 text-slate-500"
                          }`}>
                            {conn.activeGame}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-[10px] text-slate-400 truncate max-w-[120px]">{conn.roomId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
        {renderFooter()}
      </div>
    );
  }

  // VIEW 3: BEAUTIFUL LANDING MARKETING HOME PAGE
  if (currentPath === "/") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
        {renderHeader()}
        
        {/* HERO HEADER JUMBOTRON */}
        <div className="py-16 px-4 md:px-8 max-w-5xl mx-auto w-full text-center relative overflow-hidden space-y-8">
          <div className="absolute inset-0 top-0 h-48 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none -z-10" />
          
          <div className="space-y-4 max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold font-mono tracking-wider uppercase animate-bounce">
              <Sparkles className="w-3.5 h-3.5" /> High-Fidelity Gaming
            </span>
            <h1 className="text-4xl md:text-5xl font-display font-black tracking-tight text-slate-900 leading-none">
              Retro Board Classics <br />
              <span className="text-indigo-600">Rebuilt For Modern Webs.</span>
            </h1>
            <p className="text-sm md:text-base text-slate-500 leading-relaxed max-w-2xl mx-auto">
              Welcome to the elite tables of <strong className="font-extrabold text-slate-800">GameXEdiol</strong>. Challenging duels with live latency tracking, Progressive Installer support, and persistent records backup.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <button
                onClick={() => navigateTo("/portal")}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/15 transition cursor-pointer text-sm"
              >
                Go to Lobby Arenas
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => navigateTo("/login")}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/15 transition cursor-pointer text-sm"
              >
                Login and Play Instantly
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => {
                const gamesElem = document.getElementById("games_overview_section");
                if (gamesElem) gamesElem.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition font-bold cursor-pointer text-sm"
            >
              Learn More
            </button>
          </div>

          {/* App Preview Mockups */}
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-6" id="games_overview_section">
            {/* Tic-Tac-Toe */}
            <div className="bg-white border border-slate-200/85 p-6 rounded-3xl text-left space-y-4 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
              <div>
                <img 
                  src="/src/assets/images/tictactoe_preview_1780246919051.png" 
                  alt="Tic-Tac-Toe illustration" 
                  className="w-full h-44 object-cover rounded-2xl border border-slate-100"
                />
                <h3 className="text-xl font-display font-black text-slate-900 mt-4">Tic-Tac-Toe</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Fast, reactive turns. Lock 3 cells in a straight line, block flanking tactics, and deploy calculated defensive seals.
                </p>
              </div>
              <button 
                onClick={() => {
                  if (user) navigateTo("/games/tictactoe");
                  else navigateTo("/login");
                }}
                className="w-full py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-100 text-xs text-indigo-600 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                Launch Tic-Tac-Toe <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Battle Ludo */}
            <div className="bg-white border border-slate-200/85 p-6 rounded-3xl text-left space-y-4 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
              <div>
                <img 
                  src="/src/assets/images/ludo_preview_1780246937690.png" 
                  alt="Battle Ludo illustration" 
                  className="w-full h-44 object-cover rounded-2xl border border-slate-100"
                />
                <h3 className="text-xl font-display font-black text-slate-900 mt-4">Battle Ludo</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  An immersive 2-player racing board loop. Roll the 1-6 dice, launch tokens, sprint the loop tracks, and knock out enemies!
                </p>
              </div>
              <button 
                onClick={() => {
                  if (user) navigateTo("/games/ludo");
                  else navigateTo("/login");
                }}
                className="w-full py-2.5 bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-100 text-xs text-emerald-600 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                Launch Battle Ludo <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* FEATURE HIGHLIGHT GRID */}
        <section className="bg-slate-100/50 py-16 px-4 md:px-8">
          <div className="max-w-5xl mx-auto space-y-12">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-display font-black text-slate-900">Built to Professional Specifications</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">GameXEdiol fuses legacy boards geometry with cutting-edge stack integrations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200/70 p-6 rounded-2xl space-y-2 text-left">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Zero Server Lag</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  Real-time events broadcast via single-endpoint persistent WebSockets connection mapping. Live sync in milliseconds.
                </p>
              </div>

              <div className="bg-white border border-slate-200/70 p-6 rounded-2xl space-y-2 text-left">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Progressive Web App</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  Install easily to mobile or desktop launchers with offline fallback support, fast layouts reload, and beautiful standalone viewports.
                </p>
              </div>

              <div className="bg-white border border-slate-200/70 p-6 rounded-2xl space-y-2 text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">MongoDB Persistence</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  No frontend database credentials leaks. Your records, scores, and matchups completions list are saved via our secure backend.
                </p>
              </div>
            </div>
          </div>
        </section>

        {renderFooter()}
      </div>
    );
  }

  // VIEW 4: COMPREHENSIVE USER GUEST PORTAL
  if (currentPath === "/portal") {
    if (!user) {
      navigateTo("/login");
      return null;
    }
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
        {renderHeader()}

        {/* PWA INSTALL BANNER */}
        {deferredPrompt && (
          <div className="bg-indigo-600 p-3.5 text-white flex items-center justify-between z-40 relative px-6">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-indigo-200 shrink-0" />
              <div>
                <h4 className="text-xs font-bold leading-tight">Install GameXEdiol Progressive App</h4>
                <p className="text-[10px] text-indigo-100 font-mono">Offline cached assets, full launch icons, optimized mobile layout.</p>
              </div>
            </div>
            <button
              onClick={triggerPwaInstall}
              className="flex items-center gap-1.5 bg-white text-indigo-600 hover:bg-slate-100 text-xs font-mono font-bold px-4 py-1.5 rounded-xl cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              INSTALL NOW
            </button>
          </div>
        )}

        <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-8">
          
          {/* Welcome Dashboard Banner */}
          <div className="p-6 md:p-8 rounded-3xl bg-white border border-slate-200 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-50/20 blur-3xl pointer-events-none rounded-full" />
            
            <div className="space-y-1.5 text-center md:text-left max-w-md">
              <span className="text-[9.5px] bg-indigo-50 text-indigo-700 font-mono font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                PORTAL WORKSPACE
              </span>
              <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 tracking-tight leading-none pt-2">
                Arena Center, <br className="hidden md:inline" />{user.displayName?.split(" ")[0]}!
              </h1>
              <p className="text-xs text-slate-500 leading-normal">
                Coordinate matchups with live telemetry logging under a secure full-stack layout. Offline asset cached layers are registered live with MongoDB.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-center flex flex-col items-center justify-center w-40 shrink-0">
              <Activity className="w-5 h-5 text-indigo-600 mb-1" />
              <span className="text-[9px] text-slate-400 font-mono uppercase font-bold">Arena Sync</span>
              <span className="text-base font-mono font-bold text-slate-800">{activeUsersCount} players</span>
            </div>
          </div>

          {/* Game Selection Cards */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Gamepad2 className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2 className="text-sm font-mono text-slate-400 uppercase tracking-wider font-bold">
                Browse Active Chambers
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.values(GAMES_CATALOG).map((game) => {
                const gameImage = game.id === "tictactoe" 
                  ? "/src/assets/images/tictactoe_preview_1780246919051.png" 
                  : "/src/assets/images/ludo_preview_1780246937690.png";
                return (
                  <div
                    key={game.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 flex flex-col justify-between hover:border-indigo-250 transition-all hover:shadow-md group relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase font-mono font-bold ${
                          game.id === "tictactoe" 
                            ? "bg-indigo-50 border-indigo-100 text-indigo-600" 
                            : "bg-emerald-50 border-emerald-100 text-emerald-600"
                        }`}>
                          {game.id === "tictactoe" ? "TIC TAC TOE" : "BATTLE LUDO"}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {game.maxPlayers} Players
                        </span>
                      </div>

                      <img 
                        src={gameImage} 
                        alt={game.title} 
                        className="w-full h-36 object-cover rounded-2xl border border-slate-100 mb-4"
                      />

                      <h3 className="text-xl font-display font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {game.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {game.shortDesc}
                      </p>
                    </div>

                    <div className="mt-6">
                      <button
                        onClick={() => navigateTo(`/games/${game.id}`)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white cursor-pointer shadow-sm transition"
                      >
                        Enter Lobby & Match Room
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MongoDB Performance Logs History Table */}
          <div className="space-y-4 shadow-sm rounded-3xl bg-white border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-150 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600 shrink-0" />
                <h2 className="text-sm font-mono text-slate-700 tracking-tight font-bold uppercase leading-none">
                  Your Recent Performance Logs
                </h2>
              </div>
              <span className="text-[10px] text-slate-400 font-mono uppercase bg-white px-2.5 py-0.5 border border-slate-200 rounded-full font-bold">
                MongoDB PERSISTENT
              </span>
            </div>

            {logsLoading ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400 animate-pulse">
                Querying matchmaking archives on MongoDB...
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 border-none select-none">
                <p className="text-xs font-mono">No previous board games logged. Launch search match details to initialize records!</p>
              </div>
            ) : (
              <div className="overflow-x-auto min-w-full" id="logs_history_table">
                <table className="min-w-full text-left font-sans text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-mono font-bold text-[10px] uppercase border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3">Game Name</th>
                      <th className="px-6 py-3">Room ID File</th>
                      <th className="px-6 py-3">Outcome</th>
                      <th className="px-6 py-3 text-right">Date Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {recentLogs.map((log) => {
                      const win = log.outcome === "won";
                      const draw = log.outcome === "draw";
                      return (
                        <tr key={log.logId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-800 uppercase text-[11px]">{log.gameName}</td>
                          <td className="px-6 py-4 font-mono text-slate-400 text-[10px] truncate max-w-[120px]">{log.roomId}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold leading-none border ${
                              win ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                              draw ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-rose-50 border-rose-200 text-rose-700"
                            }`}>
                              {log.outcome?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-slate-400 text-[10px]">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
        {renderFooter()}
      </div>
    );
  }

  // VIEW 5: ACTIVE GAMES CHAMBERS (TIC-TAC-TOE & BATTLE LUDO)
  if (currentPath.startsWith("/games/")) {
    if (!activeGame) {
      navigateTo("/");
      return null;
    }
    if (!user) {
      navigateTo("/login");
      return null;
    }

    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
        {renderHeader()}

        <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-200/80 outline-none gap-2">
            <button
              onClick={() => {
                if (joinedRoom) {
                  const leave = confirm("Hold on! Leaving the active room chamber will forfeit your gameplay progress. Are you sure you want to surrender?");
                  if (!leave) return;
                  handleLeaveRoom();
                }
                navigateTo("/portal");
              }}
              className="flex items-center gap-2 text-xs font-mono font-bold text-slate-500 hover:text-indigo-600 transition cursor-pointer"
              id="lobby_back_button"
            >
              <ArrowLeft className="w-4 h-4" />
              BACK TO GAME SELECTION
            </button>

            <span className="text-xs text-slate-600 font-mono uppercase bg-white border border-slate-200 px-3 py-1 rounded-full font-bold">
              ARENA: {activeGame.title}
            </span>
          </div>

          {joinedRoom ? (
            // --- WORKSPACE WITH CHATS CARD & MULTI-PLAYER MATCH ---
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="lg:col-span-2 space-y-4">
                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm relative">
                  
                  <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                    <div>
                      <h4 className="font-display font-black text-slate-900 text-lg flex items-center gap-2">
                        {joinedRoom.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-450 font-mono bg-slate-100 px-2.5 py-0.5 rounded border border-slate-150">
                          ROOM ID: {joinedRoom.id}
                        </span>
                        <button
                          onClick={() => handleCopyId(joinedRoom.id)}
                          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 active:scale-95 transition cursor-pointer"
                        >
                          {copiedRoomId ? "COPIED!" : "COPY ID"}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleLeaveRoom}
                      className="px-4 py-2 text-xs font-mono rounded-xl bg-rose-50 border border-rose-100/80 hover:bg-rose-100 text-rose-700 font-bold transition cursor-pointer"
                      id="forfeit_room_btn"
                    >
                      FORFEIT CHAMBER
                    </button>
                  </div>

                  {/* MINIMUM PLAYER SEALS: CHECK IF MATCH FILL IS COMPLETED */}
                  {joinedRoom.players.length < 2 ? (
                    <div className="py-16 text-center space-y-5 select-none" id="waiting-room-seal">
                      <div className="inline-flex p-4 rounded-full bg-indigo-50 border border-indigo-100">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                      </div>
                      <div className="space-y-1 max-w-sm mx-auto">
                        <h4 className="font-display font-black text-slate-900 uppercase tracking-tight text-base">
                          Waiting for duel opponent
                        </h4>
                        <p className="text-xs text-slate-500 font-mono">
                          Minimum 2 players requirement is not met. Send Room ID link to friends or share room settings to start competitive board mapping.
                        </p>
                      </div>
                      <div className="inline-flex flex-col items-center p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                        <span className="text-[10px] text-slate-400 font-mono block">SHARE CODE FOR OPPONENT JOINS</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono font-black text-indigo-600 tracking-wider">
                            {joinedRoom.id}
                          </span>
                          <button
                            onClick={() => handleCopyId(joinedRoom.id)}
                            className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
                          >
                            {copiedRoomId ? "COPIED!" : "COPY CODE"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Display matched board component */
                    joinedRoom.gameName === "tictactoe" ? (
                      <TicTacToeGame
                        room={joinedRoom}
                        currentPlayerId={user.uid}
                        onSendAction={sendWsAction}
                      />
                    ) : (
                      <LudoGame
                        room={joinedRoom}
                        currentPlayerId={user.uid}
                        onSendAction={sendWsAction}
                      />
                    )
                  )}
                </div>
              </div>

              {/* Chat room messages column */}
              <div className="space-y-4">
                <ChatRoom
                  messages={chatMessages}
                  systemLogs={systemLogs}
                  onSendMessage={handleSendMessage}
                />

                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <span className="text-[10px] font-mono tracking-wider font-bold text-indigo-600">ARENA TIPS GUIDE</span>
                  <ul className="mt-2 text-[10.5px] text-slate-500 list-disc pl-4 space-y-1 font-mono leading-normal">
                    {activeGame.rules.slice(0, 3).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            // --- ROOM SEARCH AND MATCHING LOBBY WINDOW ---
            <div className="space-y-6">
              {viewState === "detail" ? (
                <div className="p-6 md:p-8 bg-white border border-slate-200 rounded-3xl space-y-6 shadow-sm relative overflow-hidden" id="details-view-space">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-50/20 blur-3xl pointer-events-none rounded-full" />

                  <div className="space-y-2">
                    <span className="text-[9.5px] font-mono font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2.5 py-1 border border-indigo-100 rounded-full">
                      COMPACT CLASSIC BOARD
                    </span>
                    <h1 className="text-2xl md:text-3xl font-display font-black text-slate-900 tracking-tight leading-none pt-2">
                      {activeGame.title} Classroom
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 pt-1 leading-relaxed max-w-2xl">
                      {activeGame.longDesc}
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-[10px] font-mono font-black text-slate-700 flex items-center gap-1.5 leading-none">
                      <BookOpen className="w-4 h-4 text-indigo-600" />
                      OFFICIAL BOARD CHALLENGE LAWS
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 pl-2">
                      {activeGame.rules.map((rule, idx) => (
                        <div key={idx} className="flex gap-2 text-xs font-mono text-slate-500 items-start">
                          <span className="text-indigo-600 font-bold shrink-0">{idx + 1}.</span>
                          <p className="leading-snug">{rule}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => setViewState("play")}
                      className="w-full md:w-auto flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/10 cursor-pointer transition uppercase"
                      id="play-game-screen-cta"
                    >
                      <Gamepad2 className="w-4 h-4 text-white" />
                      Proceed to lobby room matching
                    </button>
                  </div>
                </div>
              ) : (
                <Lobby
                  game={activeGame}
                  activeUsersCount={activeUsersCount}
                  roomsList={roomsList}
                  isSearchingRandom={isSearchingRandom}
                  searchingGame={searchingGame}
                  onJoinRandom={handleJoinRandom}
                  onLeaveRandom={handleLeaveRandom}
                  onCreateRoom={handleCreateRoom}
                  onJoinRoom={handleJoinRoom}
                />
              )}
            </div>
          )}
        </main>

        {renderFooter()}
      </div>
    );
  }

  // FALLBACK FALLTHROUGH REDIRECTS FOR SPA STABILITY
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {renderHeader()}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
        <h1 className="text-4xl font-display font-black text-slate-900">Routing Redirect</h1>
        <button 
          onClick={() => navigateTo("/")}
          className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs"
        >
          Go Back Home
        </button>
      </div>
      {renderFooter()}
    </div>
  );
}
