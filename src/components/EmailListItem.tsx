import React from "react";
import { Star, Archive, Trash2, MailOpen, Mail } from "lucide-react";
import { MessageHeader } from "../types";

interface EmailListItemProps {
  msg: MessageHeader;
  isActive: boolean;
  isSelected: boolean;
  isStarred: boolean;
  onSelect: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onToggleRead: (e: React.MouseEvent) => void;
  onToggleStar: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  onTrash: (e: React.MouseEvent) => void;
}

// Format the Unix timestamp to a readable date
const formatTime = (timestamp: number) => {
  try {
    const emailDate = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - emailDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24) {
      return emailDate.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    if (diffHours < 48) {
      return "Yesterday";
    }
    return emailDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

const EmailListItem = React.memo(function EmailListItem({
  msg,
  isActive,
  isSelected,
  isStarred,
  onSelect,
  onToggleSelect,
  onToggleRead,
  onToggleStar,
  onArchive,
  onTrash,
}: EmailListItemProps) {
  const senderName = msg.sender.split("<")[0].trim() || msg.sender;

  return (
    <div
      onClick={onSelect}
      className={`relative border-b border-black/5 dark:border-white/5 px-4 py-3 cursor-pointer select-none transition-colors duration-100 group flex items-start gap-3 ${
        isActive
          ? "bg-blue-500/10 dark:bg-blue-500/15 border-l-2 border-l-blue-500"
          : "bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      {/* Checkbox wrapper */}
      <div
        className="flex items-center justify-center pt-1"
        onClick={onToggleSelect}
      >
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-blue-500/30 bg-transparent cursor-pointer"
          checked={isSelected}
          onChange={() => {}}
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        {/* Top Sender Line */}
        <div className="flex items-center justify-between text-xs mb-0.5">
          <span
            className={`truncate flex items-center gap-1.5 ${
              msg.is_read
                ? "text-neutral-500 dark:text-neutral-400 font-medium"
                : "text-neutral-900 dark:text-white font-extrabold"
            }`}
          >
            {!msg.is_read && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
            {senderName}
          </span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono whitespace-nowrap ml-2 shrink-0">
            {formatTime(msg.timestamp)}
          </span>
        </div>

        {/* Subject Line */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`truncate text-xs tracking-tight ${
              msg.is_read
                ? "text-neutral-700 dark:text-neutral-300 font-semibold"
                : "text-neutral-900 dark:text-white font-black"
            }`}
          >
            {msg.subject || "(No Subject)"}
          </span>
        </div>

        {/* Snippet Preview */}
        <p className="text-xs text-neutral-400 dark:text-neutral-500 line-clamp-1 mt-0.5 font-sans">
          {msg.snippet || ""}
        </p>

        {/* Labels / Tags row */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {msg.labels &&
            msg.labels
              .filter((label) => !["INBOX", "SENT", "TRASH", "STARRED", "UNREAD"].includes(label) && !label.startsWith("CATEGORY_"))
              .map((label) => (
                <span
                  key={label}
                  className="text-[9px] bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200/30 dark:border-blue-900/30 px-1.5 py-0.25 rounded font-medium shrink-0"
                >
                  {label}
                </span>
              ))}
        </div>
      </div>

      {/* Star Indicator Button on the Right */}
      <div className="flex items-center justify-center h-full pt-1">
        <button
          onClick={onToggleStar}
          className={`p-1 rounded transition-colors duration-100 ${
            isStarred
              ? "text-amber-500"
              : "text-neutral-300 dark:text-neutral-700 hover:text-amber-500 dark:hover:text-amber-500"
          }`}
        >
          <Star className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>

      {/* Quick Action Hover Overlay */}
      <div className="absolute right-3 top-2.5 invisible group-hover:visible flex items-center bg-white/90 dark:bg-neutral-900/90 border border-black/10 dark:border-white/10 shadow-lg rounded-lg px-1.5 py-1 space-x-1 scale-95 group-hover:scale-100 transition-all duration-100 z-10">
        <button
          onClick={onToggleRead}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title={msg.is_read ? "Mark as Unread" : "Mark as Read"}
        >
          {msg.is_read ? <Mail size={14} /> : <MailOpen size={14} />}
        </button>

        <button
          onClick={onArchive}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="Archive message"
        >
          <Archive size={14} />
        </button>

        <button
          onClick={onTrash}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          title="Move to Trash"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparator: only re-render if meaningful data changed
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.is_read === nextProps.msg.is_read &&
    prevProps.msg.timestamp === nextProps.msg.timestamp &&
    prevProps.msg.subject === nextProps.msg.subject &&
    prevProps.msg.sender === nextProps.msg.sender &&
    prevProps.msg.snippet === nextProps.msg.snippet &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isStarred === nextProps.isStarred &&
    prevProps.msg.labels.length === nextProps.msg.labels.length
  );
});

export default EmailListItem;
