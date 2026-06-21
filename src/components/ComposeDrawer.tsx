import React, { useRef } from "react";
import { Send, Trash2, Minimize2, Maximize2, X, Paperclip } from "lucide-react";
import { Account, Attachment } from "../types";

interface ComposeDrawerProps {
  isOpen: boolean;
  isMinimized: boolean;
  setIsComposeMinimized: (val: boolean) => void;
  isMaximized: boolean;
  setIsComposeMaximized: (val: boolean) => void;
  composeTo: string;
  setComposeTo: (val: string) => void;
  composeSubject: string;
  setComposeSubject: (val: string) => void;
  composeBody: string;
  setComposeBody: (val: string) => void;
  composeThreadId: string | null;
  activeAccount: Account | null;
  handleSendMessage: (e: React.FormEvent) => void;
  onClose: () => void;
  attachments: Attachment[];
  onAddAttachments: (files: FileList) => void;
  onRemoveAttachment: (index: number) => void;
}

const formatFileSize = (bytes?: number) => {
  if (bytes === undefined) return "";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const ComposeDrawer = React.memo(function ComposeDrawer({
  isOpen,
  isMinimized,
  setIsComposeMinimized,
  isMaximized,
  setIsComposeMaximized,
  composeTo,
  setComposeTo,
  composeSubject,
  setComposeSubject,
  composeBody,
  setComposeBody,
  composeThreadId,
  activeAccount,
  handleSendMessage,
  onClose,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
}: ComposeDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 right-4 z-50 flex flex-col items-end pointer-events-none w-[calc(100%-32px)] sm:w-auto">
      <div
        className={`w-full sm:w-[480px] bg-white dark:bg-zinc-900 shadow-2xl rounded-t-xl border border-black/10 dark:border-white/10 flex flex-col pointer-events-auto transition-all duration-200 ${
          isMinimized
            ? "h-10"
            : isMaximized
            ? "h-[calc(100vh-32px)] sm:w-[680px]"
            : "h-[450px]"
        }`}
      >
        {/* Header Bar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 text-white rounded-t-xl cursor-pointer select-none shrink-0"
          onClick={() => setIsComposeMinimized(!isMinimized)}
        >
          <span className="text-xs font-bold truncate pr-4">
            {composeSubject.trim()
              ? composeSubject
              : composeThreadId
              ? "Reply to Thread"
              : "New Message"}
          </span>
          <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
              onClick={() => setIsComposeMinimized(!isMinimized)}
              title={isMinimized ? "Expand Draft" : "Minimize Draft"}
            >
              <Minimize2 size={12} />
            </button>
            {!isMinimized && (
              <button
                className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                onClick={() => setIsComposeMaximized(!isMaximized)}
                title={isMaximized ? "Restore View" : "Maximize Composition"}
              >
                <Maximize2 size={12} />
              </button>
            )}
            <button
              className="p-1 rounded hover:bg-rose-500/30 text-neutral-400 hover:text-rose-400 transition-colors"
              onClick={onClose}
              title="Discard Draft"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Compose Form */}
        {!isMinimized && (
          <form onSubmit={handleSendMessage} className="flex-1 flex flex-col overflow-hidden">
            {/* Sender From display */}
            <div className="flex items-center border-b border-black/5 dark:border-white/5 py-2.5 px-4 text-xs">
              <span className="text-neutral-400 font-medium w-16 shrink-0 select-none">From:</span>
              <span className="text-neutral-800 dark:text-neutral-200 font-medium truncate">
                {activeAccount?.display_name || activeAccount?.email} &lt;{activeAccount?.email}&gt;
              </span>
            </div>

            {/* Recipient To Input */}
            <div className="flex items-center border-b border-black/5 dark:border-white/5 py-2 px-4 text-xs">
              <span className="text-neutral-400 font-medium w-16 shrink-0 select-none">To:</span>
              <input
                type="email"
                required
                className="w-full bg-transparent border-none outline-none text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-600 font-sans"
                placeholder="recipient@example.com"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
              />
            </div>

            {/* Subject Input */}
            <div className="flex items-center border-b border-black/5 dark:border-white/5 py-2 px-4 text-xs">
              <span className="text-neutral-400 font-medium w-16 shrink-0 select-none">Subject:</span>
              <input
                type="text"
                required
                className="w-full bg-transparent border-none outline-none text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-600 font-sans font-semibold"
                placeholder="Subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                disabled={!!composeThreadId}
              />
            </div>

            {/* Content Textarea */}
            <textarea
              required
              className="flex-1 w-full resize-none p-4 text-xs bg-transparent outline-none text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-600 font-sans leading-relaxed"
              placeholder="Write your email here..."
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
            />

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-black/5 dark:border-white/5 flex flex-wrap gap-2 max-h-[80px] overflow-y-auto bg-neutral-50 dark:bg-zinc-950/40 shrink-0">
                {attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 px-2.5 py-1 rounded-lg text-[11px] max-w-xs"
                  >
                    <span className="truncate text-neutral-700 dark:text-neutral-300 font-medium select-none max-w-[120px]">
                      {file.filename}
                    </span>
                    {file.size !== undefined && (
                      <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-mono select-none">
                        ({formatFileSize(file.size)})
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-neutral-400 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                      onClick={() => onRemoveAttachment(idx)}
                      title="Remove Attachment"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Footer Toolbar */}
            <div className="border-t border-black/5 dark:border-white/5 p-3 flex items-center justify-between shrink-0 bg-neutral-50 dark:bg-neutral-950/20">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={12} />
                  <span>Send Mail</span>
                </button>
                <button
                  type="button"
                  className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-500 hover:text-blue-500 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach Files"
                >
                  <Paperclip size={14} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      onAddAttachments(e.target.files);
                      e.target.value = ""; // clear so same file can be selected again
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-400 hover:text-rose-500 transition-colors"
                onClick={onClose}
                title="Discard draft"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
});

export default ComposeDrawer;
