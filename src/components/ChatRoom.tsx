import React, { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { Send, Terminal } from "lucide-react";

interface ChatRoomProps {
  messages: ChatMessage[];
  systemLogs: string[];
  onSendMessage: (text: string) => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  messages,
  systemLogs,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, systemLogs]);

  return (
    <div className="flex flex-col h-[320px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm" id="chat-and-logs-box">
      {/* Header Tabs */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <Terminal className="w-4 h-4 text-indigo-600" />
        <span className="text-xs font-mono font-bold text-slate-700">CHATS & EVENT STREAM</span>
      </div>

      {/* Messages and Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30" ref={scrollRef}>
        
        {/* Render Combined system events and player chats ordered by timeline */}
        {systemLogs.map((log, index) => (
          <div
            key={`sys-${index}`}
            className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[10.5px] font-mono text-indigo-805 leading-relaxed shadow-sm font-semibold"
          >
            {log}
          </div>
        ))}

        {messages.map((msg, index) => (
          <div key={`msg-${index}`} className="flex flex-col space-y-0.5">
            <span className="text-[10px] font-mono font-bold text-slate-450 ml-1.5">
              {msg.sender}
            </span>
            <div className="inline-block max-w-[85%] rounded-2xl px-3.5 py-2 bg-white border border-slate-200 text-xs text-slate-800 break-words font-sans shadow-sm">
              {msg.text}
            </div>
          </div>
        ))}

        {messages.length === 0 && systemLogs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 px-4">
            <span className="text-xs font-mono text-slate-500">Event logs feed empty. Throw a move to test!</span>
          </div>
        )}
      </div>

      {/* Chat sending Form */}
      <form onSubmit={handleSend} className="p-2.5 bg-slate-50 border-t border-slate-200 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Speak to opponent..."
          maxLength={120}
          className="flex-1 bg-white border border-slate-200 rounded-xl px-3 text-xs text-slate-800 placeholder-slate-450 focus:outline-none focus:border-indigo-400"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 disabled:opacity-40 transition cursor-pointer flex items-center justify-center w-9 h-9"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
