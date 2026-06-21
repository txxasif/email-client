import React from "react";
import {
  Reply,
  Star,
  Mail,
  MailOpen,
  Archive,
  Trash2,
  Clock,
  Sparkles,
} from "lucide-react";
import { MessageDetail } from "../types";

interface ReadingPaneProps {
  selectedMessage: MessageDetail | null;
  onReply: () => void;
  onStar: (e: React.MouseEvent) => void;
  onToggleRead: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  onTrash: (e: React.MouseEvent) => void;
}

const ReadingPane = React.memo(function ReadingPane({
  selectedMessage,
  onReply,
  onStar,
  onToggleRead,
  onArchive,
  onTrash,
}: ReadingPaneProps) {
  // Safe Sandboxed Email Reader Contents
  const renderIframeContent = (msg: MessageDetail) => {
    const rawHtml =
      msg.body_html ||
      `<pre style="font-family: sans-serif; white-space: pre-wrap;">${
        msg.body_text || ""
      }</pre>`;

    // Inject custom styling and link targeting inside the iframe
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <base target="_blank">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 14.5px;
              line-height: 1.6;
              color: #1e293b;
              padding: 24px;
              margin: 0;
              background-color: #ffffff;
              word-wrap: break-word;
            }
            p { margin-top: 0; margin-bottom: 1em; }
            a { color: #2563eb; text-decoration: underline; }
            a:hover { color: #1d4ed8; }
            img { max-width: 100% !important; height: auto !important; }
            blockquote {
              border-left: 3px solid #cbd5e1;
              margin: 0 0 1rem 0;
              padding-left: 1rem;
              color: #64748b;
            }
            pre {
              white-space: pre-wrap;
              word-break: break-all;
              background: #f1f5f9;
              padding: 12px;
              border-radius: 6px;
              font-size: 13px;
            }
            /* Dark mode override support if iframe supports it */
            @media (prefers-color-scheme: dark) {
              body {
                background-color: #09090b;
                color: #e4e4e7;
              }
              blockquote {
                border-left-color: #27272a;
                color: #a1a1aa;
              }
              pre {
                background-color: #18181b;
                color: #d4d4d8;
              }
            }
          </style>
        </head>
        <body>
          ${rawHtml}
        </body>
      </html>
    `;
  };

  if (!selectedMessage) {
    return (
      <div
        id="reading-pane-empty"
        className="flex-1 h-full bg-transparent flex flex-col justify-center items-center p-8 select-none text-center"
      >
        <div className="w-14 h-14 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-lg rounded-2xl shadow-sm border border-black/5 dark:border-white/5 flex items-center justify-center text-neutral-400 dark:text-neutral-500 mb-4 animate-pulse">
          <MailOpen className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
        </div>
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
          No conversation open
        </h2>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 max-w-xs mt-1 font-medium">
          Select an item from the mail panel or use workspace shortcuts to browse.
        </p>

        {/* Keyboard Shortcuts Cheatsheet Card */}
        <div className="mt-8 glass-card rounded-2xl p-5 w-full max-w-xs text-left shadow-lg border border-black/5 dark:border-white/5 bg-white/45 dark:bg-neutral-900/45 backdrop-blur-md">
          <div className="flex items-center space-x-2 border-b border-black/5 dark:border-white/5 pb-2 mb-2">
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 font-mono tracking-wider uppercase flex items-center gap-1">
              <Sparkles size={10} className="text-amber-500" /> Speed Dial Shortcuts
            </span>
          </div>
          <div className="space-y-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
            <div className="flex justify-between items-center">
              <span className="font-sans">Navigate emails</span>
              <kbd className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-neutral-800 dark:text-neutral-200">
                j / k
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-sans">Open mail</span>
              <kbd className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-neutral-800 dark:text-neutral-200">
                Enter
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-sans">Compose new draft</span>
              <kbd className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-neutral-800 dark:text-neutral-200">
                c
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-sans">Focus search</span>
              <kbd className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-neutral-800 dark:text-neutral-200">
                /
              </kbd>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isStarred = selectedMessage.labels.includes("STARRED");

  return (
    <div id="reading-pane" className="flex-1 h-full glass-panel-pane flex flex-col overflow-hidden">
      {/* Top Toolbar Action Row */}
      <div className="h-16 border-b border-black/5 dark:border-white/5 flex items-center justify-between px-6 shrink-0 bg-transparent select-none">
        <div className="flex items-center space-x-2">
          {/* Action: Reply */}
          <button
            onClick={onReply}
            className="p-1 px-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-black/10 dark:border-white/10"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
            <span>Reply</span>
          </button>

          {/* Action: Archive */}
          <button
            onClick={onArchive}
            className="p-1 px-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-black/10 dark:border-white/10"
            title="Archive Mail"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archive</span>
          </button>

          {/* Action: Delete */}
          <button
            onClick={onTrash}
            className="p-1 px-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-black/10 dark:border-white/10"
            title="Trash Mail"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {/* Action: Read/Unread toggle */}
          <button
            onClick={onToggleRead}
            className="p-1 px-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer border border-black/10 dark:border-white/10"
            title="Mark Status Toggle"
          >
            {selectedMessage.is_read ? (
              <>
                <Mail className="w-3.5 h-3.5" />
                <span>Mark Unread</span>
              </>
            ) : (
              <>
                <MailOpen className="w-3.5 h-3.5" />
                <span>Mark Read</span>
              </>
            )}
          </button>
        </div>

        {/* Star Action */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onStar}
            className={`p-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-150 ${
              isStarred
                ? "text-amber-500"
                : "text-neutral-400 dark:text-neutral-600 hover:text-amber-500"
            }`}
            title="Star Conversation"
          >
            <Star className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 md:p-8 space-y-4 overflow-hidden bg-transparent">
        {/* Email Header Subject Block */}
        <div className="border-b border-black/5 dark:border-white/5 pb-4 shrink-0">
          <div className="flex justify-between items-start">
            <div className="min-w-0">
              <h1 className="text-base font-black text-neutral-900 dark:text-white tracking-tight break-words font-sans md:text-lg">
                {selectedMessage.subject || "(No Subject)"}
              </h1>
              {selectedMessage.labels && selectedMessage.labels.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {selectedMessage.labels
                    .filter((l) => !["INBOX", "SENT", "TRASH", "STARRED", "UNREAD"].includes(l) && !l.startsWith("CATEGORY_"))
                    .map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] uppercase font-bold bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200/35 dark:border-blue-900/35 px-1.5 py-0.5 rounded tracking-wider"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sender Info Block */}
        <div className="glass-card rounded-2xl p-4 shadow-md border border-black/5 dark:border-white/5 bg-white/45 dark:bg-neutral-900/45 backdrop-blur-md shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-neutral-800 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-sm select-none shrink-0 font-sans">
                {(selectedMessage.sender.split("<")[0].trim() || selectedMessage.sender)[0]}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-neutral-900 dark:text-white truncate">
                  {selectedMessage.sender.split("<")[0].trim() || selectedMessage.sender}
                  {selectedMessage.sender.includes("<") && (
                    <span className="font-normal font-mono text-neutral-400 dark:text-neutral-500 ml-1">
                      {selectedMessage.sender.substring(selectedMessage.sender.indexOf("<"))}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                  to me
                </div>
              </div>
            </div>

            <div className="text-right flex items-center space-x-2 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono shrink-0 pl-2">
              <Clock className="w-3 h-3 text-neutral-400" />
              <span>{new Date(selectedMessage.timestamp * 1000).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Email iframe container */}
        <div className="flex-1 w-full relative border border-black/10 dark:border-white/10 rounded-xl overflow-hidden bg-white shadow-inner">
          <iframe
            title="Email Reader"
            className="w-full h-full border-none animate-in fade-in duration-200"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={renderIframeContent(selectedMessage)}
          ></iframe>
        </div>
      </div>
    </div>
  );
});

export default ReadingPane;
