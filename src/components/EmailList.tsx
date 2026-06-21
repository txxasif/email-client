import React, { useCallback } from "react";
import {
  Search,
  RefreshCw,
  Mail,
  MailOpen,
  Archive,
  Trash2,
  X,
} from "lucide-react";
import { Account, MessageHeader, MessageDetail } from "../types";
import EmailListItem from "./EmailListItem";

interface EmailListProps {
  filteredMessages: MessageHeader[];
  selectedMessage: MessageDetail | null;
  selectedMessageIds: string[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  listFilter: "ALL" | "UNREAD" | "STARRED";
  setListFilter: (filter: "ALL" | "UNREAD" | "STARRED") => void;
  isSyncing: boolean;
  hasMore: boolean;
  activeAccount: Account | null;
  messageListRef: React.RefObject<HTMLDivElement>;
  loadMoreMessages: () => void;
  handleToggleSelectMessage: (id: string, e: React.MouseEvent) => void;
  handleSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBatchMarkRead: (isRead: boolean) => void;
  handleBatchArchive: () => void;
  handleBatchTrash: () => void;
  handleManualSync: () => void;
  handleToggleRead: (msg: MessageHeader, e: React.MouseEvent) => void;
  handleStar: (msg: MessageHeader, e: React.MouseEvent) => void;
  handleArchive: (msg: MessageHeader, e: React.MouseEvent) => void;
  handleTrash: (msg: MessageHeader, e: React.MouseEvent) => void;
  handleSelectMessage: (msg: MessageHeader) => void;
  setSelectedMessageIds: (ids: string[]) => void;
  unreadCount: number;
  starredCount: number;
}

export default function EmailList({
  filteredMessages,
  selectedMessage,
  selectedMessageIds,
  searchQuery,
  listFilter,
  setListFilter,
  isSyncing,
  hasMore,
  activeAccount,
  messageListRef,
  loadMoreMessages,
  handleToggleSelectMessage,
  handleSelectAll,
  handleBatchMarkRead,
  handleBatchArchive,
  handleBatchTrash,
  handleManualSync,
  handleToggleRead,
  handleStar,
  handleArchive,
  handleTrash,
  handleSelectMessage,
  setSelectedMessageIds,
  setSearchQuery,
  unreadCount,
  starredCount,
}: EmailListProps) {
  const isAllSelected =
    filteredMessages.length > 0 && selectedMessageIds.length === filteredMessages.length;
  const isSomeSelected =
    selectedMessageIds.length > 0 && selectedMessageIds.length < filteredMessages.length;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      loadMoreMessages();
    }
  }, [loadMoreMessages]);

  return (
    <div
      id="email-list-pane"
      className="w-[360px] md:w-[390px] h-full glass-panel-list flex flex-col shrink-0 overflow-hidden"
    >
      {/* Top Search bar or Batch actions bar */}
      <div className="p-4 border-b border-black/5 dark:border-white/5 shrink-0">
        {selectedMessageIds.length > 0 ? (
          <div className="flex items-center justify-between bg-blue-500/10 dark:bg-blue-500/15 border border-blue-200/30 dark:border-blue-900/30 rounded-xl p-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-2 pl-1 select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-blue-500/30 bg-transparent cursor-pointer"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = isSomeSelected;
                  }
                }}
                onChange={handleSelectAll}
              />
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 font-mono">
                {selectedMessageIds.length} Selected
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                title="Mark Read"
                onClick={() => handleBatchMarkRead(true)}
              >
                <MailOpen size={14} />
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                title="Mark Unread"
                onClick={() => handleBatchMarkRead(false)}
              >
                <Mail size={14} />
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                title="Archive"
                onClick={handleBatchArchive}
              >
                <Archive size={14} />
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-rose-500 hover:bg-rose-500/10 transition-colors"
                title="Delete"
                onClick={handleBatchTrash}
              >
                <Trash2 size={14} />
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
                title="Clear Selection"
                onClick={() => setSelectedMessageIds([])}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 relative bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2">
            <Search size={14} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
            <input
              type="text"
              id="search-input"
              className="w-full bg-transparent outline-none border-none text-xs text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 font-sans"
              placeholder="Search cached mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-750 dark:hover:text-white transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0 cursor-pointer"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
            <button
              className="p-1 rounded-md text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              title="Sync mailbox"
              onClick={handleManualSync}
              disabled={isSyncing || !activeAccount}
            >
              <RefreshCw
                size={14}
                className={isSyncing ? "animate-spin" : ""}
              />
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-1.5 border-b border-black/5 dark:border-white/5 flex items-center gap-1.5 shrink-0 bg-black/[0.01] dark:bg-white/[0.01]">
        <button
          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
            listFilter === "ALL"
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
          }`}
          onClick={() => setListFilter("ALL")}
        >
          All
        </button>
        <button
          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 flex items-center gap-1.5 ${
            listFilter === "UNREAD"
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
          }`}
          onClick={() => setListFilter("UNREAD")}
        >
          Unread
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.25 rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono text-[9px]">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 flex items-center gap-1.5 ${
            listFilter === "STARRED"
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300"
          }`}
          onClick={() => setListFilter("STARRED")}
        >
          Starred
          {starredCount > 0 && (
            <span className="px-1.5 py-0.25 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono text-[9px]">
              {starredCount}
            </span>
          )}
        </button>
      </div>

      {/* Message List */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar"
        ref={messageListRef}
        onScroll={handleScroll}
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none pt-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-neutral-400 dark:text-neutral-500 mb-3">
              <Mail size={24} />
            </div>
            <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
              No messages found
            </h3>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 max-w-[200px] mt-1">
              {searchQuery
                ? `No cached emails match your search query.`
                : "Enjoy a clean inbox! No messages in this folder."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredMessages.map((msg) => {
              const isStarred = msg.labels.includes("STARRED");
              const isSelected = selectedMessageIds.includes(msg.id);
              const isActive = selectedMessage?.id === msg.id;

              return (
                <EmailListItem
                  key={msg.id}
                  msg={msg}
                  isActive={isActive}
                  isSelected={isSelected}
                  isStarred={isStarred}
                  onSelect={() => handleSelectMessage(msg)}
                  onToggleSelect={(e) => handleToggleSelectMessage(msg.id, e)}
                  onToggleRead={(e) => handleToggleRead(msg, e)}
                  onToggleStar={(e) => handleStar(msg, e)}
                  onArchive={(e) => handleArchive(msg, e)}
                  onTrash={(e) => handleTrash(msg, e)}
                />
              );
            })}

            {hasMore && !isSyncing && (
              <div className="p-4 flex items-center justify-center">
                <button
                  className="px-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  onClick={loadMoreMessages}
                >
                  Load More Messages
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
