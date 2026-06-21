import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, X } from "lucide-react";
import { Account, MessageHeader, MessageDetail, Attachment } from "./types";
import AccountRail from "./components/AccountRail";
import Sidebar from "./components/Sidebar";
import EmailList from "./components/EmailList";
import ReadingPane from "./components/ReadingPane";
import ComposeDrawer from "./components/ComposeDrawer";

interface CustomSelectProps {
  value: any;
  onChange: (val: any) => void;
  options: { value: any; label: string }[];
}

function CustomSelect({ value, onChange, options }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative inline-block text-left z-40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-neutral-100 dark:bg-zinc-800 border border-black/10 dark:border-white/10 text-neutral-800 dark:text-neutral-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer flex items-center justify-between gap-2 min-w-[120px] transition-colors hover:bg-neutral-200 dark:hover:bg-zinc-700"
      >
        <span>{selectedOption?.label}</span>
        <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-full min-w-[140px] rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden py-1 z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                opt.value === value
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-zinc-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

  // Accounts State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  
  // Messages State
  const [messages, setMessages] = useState<MessageHeader[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>(() => {
    return localStorage.getItem("settings_default_folder") || "INBOX";
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);

  // Custom states for batch actions and filters
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [listFilter, setListFilter] = useState<"ALL" | "UNREAD" | "STARRED">("ALL");

  // Status/Loader States
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [status, setStatus] = useState<{ message: string; type: "syncing" | "error" | "" }>({
    message: "",
    type: "",
  });

  // Compose State
  const [isComposeOpen, setIsComposeOpen] = useState<boolean>(false);
  const [composeTo, setComposeTo] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState<string>("");
  const [composeBody, setComposeBody] = useState<string>("");
  const [composeThreadId, setComposeThreadId] = useState<string | null>(null);
  const [isComposeMinimized, setIsComposeMinimized] = useState<boolean>(false);
  const [isComposeMaximized, setIsComposeMaximized] = useState<boolean>(false);
  const [composeAttachments, setComposeAttachments] = useState<Attachment[]>([]);

  // Layout Theme State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const val = localStorage.getItem("settings_dark_mode");
    return val !== null ? val === "true" : true;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsNotificationsEnabled, setSettingsNotificationsEnabled] = useState<boolean>(() => {
    const val = localStorage.getItem("settings_notifications_enabled");
    return val !== null ? val === "true" : true;
  });
  const [settingsSyncInterval, setSettingsSyncInterval] = useState<number>(() => {
    const val = localStorage.getItem("settings_sync_interval");
    return val !== null ? parseInt(val, 10) : 30;
  });
  const [settingsDefaultFolder, setSettingsDefaultFolder] = useState<string>(() => {
    return localStorage.getItem("settings_default_folder") || "INBOX";
  });

  // Keep localStorage updated
  useEffect(() => {
    localStorage.setItem("settings_dark_mode", darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("settings_notifications_enabled", settingsNotificationsEnabled.toString());
  }, [settingsNotificationsEnabled]);

  useEffect(() => {
    localStorage.setItem("settings_sync_interval", settingsSyncInterval.toString());
  }, [settingsSyncInterval]);

  useEffect(() => {
    localStorage.setItem("settings_default_folder", settingsDefaultFolder);
  }, [settingsDefaultFolder]);

  // Custom UI Modals State
  const [accountToRemove, setAccountToRemove] = useState<Account | null>(null);
  const [lastAction, setLastAction] = useState<{
    type: "trash" | "archive" | "batch_trash" | "batch_archive";
    messageIds: string[];
    accountId: string;
    messages: MessageHeader[];
  } | null>(null);

  // References
  const messageListRef = useRef<HTMLDivElement>(null);

  // Ref to always hold the latest activeLabel (avoids event listener re-subscription)
  const activeLabelRef = useRef(activeLabel);
  activeLabelRef.current = activeLabel;

  // Filter messages locally by search query and listFilter tab selection
  const filteredMessages = useMemo(() => messages.filter((m) => {
    if (listFilter === "UNREAD" && m.is_read) return false;
    if (listFilter === "STARRED" && !m.labels.includes("STARRED")) return false;

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      m.sender.toLowerCase().includes(query) ||
      m.subject.toLowerCase().includes(query) ||
      (m.snippet && m.snippet.toLowerCase().includes(query))
    );
  }), [messages, listFilter, searchQuery]);

  // Precomputed counts for filter tabs (avoid repeated .filter() in render)
  const unreadCount = useMemo(() => messages.filter((m) => !m.is_read).length, [messages]);
  const starredCount = useMemo(() => messages.filter((m) => m.labels.includes("STARRED")).length, [messages]);

  // Load accounts on mount — uses ref for activeLabel to avoid re-subscribing
  useEffect(() => {
    if (!isTauri) return;

    loadAccounts(true);

    // Listen for incremental update event from Rust
    const setupListener = async () => {
      const unlisten = await listen("messages-updated", (event) => {
        const updatedEmail = event.payload as string;
        console.log(`Received update notification for: ${updatedEmail}`);
        
        // If this update was for our active account, reload message list
        setActiveAccount((currentActive) => {
          if (currentActive && currentActive.id === updatedEmail) {
            loadMessages(updatedEmail, activeLabelRef.current, 1, false);
          }
          return currentActive;
        });

        // Always reload accounts to refresh badges
        loadAccounts(false);
      });
      return unlisten;
    };

    // Listen for new mail notifications from Rust backend
    const setupNewMailListener = async () => {
      const unlisten = await listen("new-mail", (event) => {
        const { sender, subject } = event.payload as any;
        console.log(`Received new mail notification event: ${sender} - ${subject}`);

        const enabled = localStorage.getItem("settings_notifications_enabled") !== "false";
        if (enabled) {
          import("@tauri-apps/plugin-notification").then(({ isPermissionGranted, requestPermission, sendNotification }) => {
            const handleNotify = async () => {
              let granted = await isPermissionGranted();
              if (!granted) {
                const permission = await requestPermission();
                granted = permission === "granted";
              }
              if (granted) {
                sendNotification({
                  title: `New Mail: ${sender.split("<")[0].trim()}`,
                  body: subject || "No Subject",
                });
              }
            };
            handleNotify();
          });
        }
      });
      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;
    let unlistenNewMailFn: (() => void) | null = null;

    setupListener().then((fn) => {
      unlistenFn = fn;
    });

    setupNewMailListener().then((fn) => {
      unlistenNewMailFn = fn;
    });

    return () => {
      if (unlistenFn) unlistenFn();
      if (unlistenNewMailFn) unlistenNewMailFn();
    };
  }, []); // No deps: ref handles activeLabel changes without re-subscribing

  // Periodic poll of active account with user defined sync interval (ms)
  useEffect(() => {
    if (!isTauri || !activeAccount) return;

    const intervalMs = settingsSyncInterval * 1000;
    const pollInterval = setInterval(() => {
      console.log(`Polling active account for changes every ${settingsSyncInterval}s...`);
      invoke("sync_account", { 
        accountId: activeAccount.id,
        activeLabel
      }).catch(console.error);
    }, intervalMs);

    return () => clearInterval(pollInterval);
  }, [activeAccount, activeLabel, settingsSyncInterval]);

  // Load messages when active account or active label changes
  useEffect(() => {
    if (!isTauri) return;

    setSelectedMessageIds([]); // Reset selection on folder or account switch

    if (activeAccount) {
      loadMessages(activeAccount.id, activeLabel, 1, true);
    } else {
      setMessages([]);
      setSelectedMessage(null);
    }
  }, [activeAccount, activeLabel]);

  // Auto-dismiss undo notification after 8 seconds
  useEffect(() => {
    if (!lastAction) return;
    const timer = setTimeout(() => {
      setLastAction(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [lastAction]);

  // Request notifications permission on mount
  useEffect(() => {
    if (!isTauri) return;

    const initNotifications = async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import(
          "@tauri-apps/plugin-notification"
        );
        let granted = await isPermissionGranted();
        if (!granted) {
          await requestPermission();
        }
      } catch (e) {
        console.error("Failed to initialize notifications plugin:", e);
      }
    };

    initNotifications();
  }, []);

  const handleToggleSelectMessage = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedMessageIds((prev) => {
      // Use filteredMessages length from the closure — this is fine because
      // handleSelectAll is only called from within the EmailList which re-renders
      // when filteredMessages changes anyway.
      return prev.length === filteredMessages.length
        ? []
        : filteredMessages.map((m) => m.id);
    });
  }, [filteredMessages]);

  const handleBatchTrash = async () => {
    if (!activeAccount || selectedMessageIds.length === 0) return;
    const idsToTrash = [...selectedMessageIds];
    const savedMsgs = messages.filter((m) => idsToTrash.includes(m.id));
    
    // Optimistic UI updates
    setMessages((prev) => prev.filter((m) => !idsToTrash.includes(m.id)));
    if (selectedMessage && idsToTrash.includes(selectedMessage.id)) {
      setSelectedMessage(null);
    }
    setSelectedMessageIds([]);

    setLastAction({
      type: "batch_trash",
      messageIds: idsToTrash,
      accountId: activeAccount.id,
      messages: savedMsgs,
    });

    try {
      await invoke("batch_trash_messages", {
        accountId: activeAccount.id,
        messageIds: idsToTrash,
      });
      showStatus(`${idsToTrash.length} messages deleted.`, "");
    } catch (err) {
      showStatus(`Batch delete failed: ${err}`, "error");
    }
  };

  const handleBatchArchive = async () => {
    if (!activeAccount || selectedMessageIds.length === 0) return;
    const idsToArchive = [...selectedMessageIds];
    const savedMsgs = messages.filter((m) => idsToArchive.includes(m.id));

    // Optimistic UI updates
    setMessages((prev) => prev.filter((m) => !idsToArchive.includes(m.id)));
    if (selectedMessage && idsToArchive.includes(selectedMessage.id)) {
      setSelectedMessage(null);
    }
    setSelectedMessageIds([]);

    setLastAction({
      type: "batch_archive",
      messageIds: idsToArchive,
      accountId: activeAccount.id,
      messages: savedMsgs,
    });

    try {
      await invoke("batch_archive_messages", {
        accountId: activeAccount.id,
        messageIds: idsToArchive,
      });
      showStatus(`${idsToArchive.length} messages archived.`, "");
    } catch (err) {
      showStatus(`Batch archive failed: ${err}`, "error");
    }
  };

  const handleBatchMarkRead = async (read: boolean) => {
    if (!activeAccount || selectedMessageIds.length === 0) return;
    const ids = [...selectedMessageIds];

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, is_read: read } : m))
    );
    if (selectedMessage && ids.includes(selectedMessage.id)) {
      setSelectedMessage((prev) => prev ? { ...prev, is_read: read } : null);
    }
    setSelectedMessageIds([]);

    try {
      await Promise.all(
        ids.map((id) =>
          invoke("mark_read", {
            accountId: activeAccount.id,
            messageId: id,
            read,
          })
        )
      );
      showStatus(`Marked ${ids.length} messages as ${read ? "read" : "unread"}.`, "");
    } catch (err) {
      showStatus(`Failed to update messages: ${err}`, "error");
    }
  };

  // Keyboard navigation shortcuts hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "j": {
          e.preventDefault();
          if (filteredMessages.length === 0) return;
          const currentIndex = selectedMessage
            ? filteredMessages.findIndex((m) => m.id === selectedMessage.id)
            : -1;
          const nextIndex = Math.min(currentIndex + 1, filteredMessages.length - 1);
          if (nextIndex >= 0 && nextIndex < filteredMessages.length) {
            handleSelectMessage(filteredMessages[nextIndex]);
          }
          break;
        }
        case "k": {
          e.preventDefault();
          if (filteredMessages.length === 0) return;
          const currentIndex = selectedMessage
            ? filteredMessages.findIndex((m) => m.id === selectedMessage.id)
            : -1;
          const prevIndex = Math.max(currentIndex - 1, 0);
          if (prevIndex >= 0 && prevIndex < filteredMessages.length) {
            handleSelectMessage(filteredMessages[prevIndex]);
          }
          break;
        }
        case "e":
        case "y": {
          if (selectedMessage) {
            e.preventDefault();
            handleArchive(selectedMessage);
          }
          break;
        }
        case "delete":
        case "#": {
          if (selectedMessage) {
            e.preventDefault();
            handleTrash(selectedMessage);
          }
          break;
        }
        case "r": {
          if (selectedMessage) {
            e.preventDefault();
            handleOpenReply();
          }
          break;
        }
        case "c": {
          if (activeAccount) {
            e.preventDefault();
            setComposeTo("");
            setComposeSubject("");
            setComposeBody("");
            setComposeThreadId(null);
            setIsComposeOpen(true);
          }
          break;
        }
        case "/": {
          e.preventDefault();
          document.getElementById("search-input")?.focus();
          break;
        }
        case "escape": {
          if (isComposeOpen) {
            setIsComposeOpen(false);
          } else if (selectedMessageIds.length > 0) {
            setSelectedMessageIds([]);
          } else if (selectedMessage) {
            setSelectedMessage(null);
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredMessages, selectedMessage, activeAccount, isComposeOpen, selectedMessageIds]);

  const showStatus = (msg: string, type: "syncing" | "error" | "") => {
    setStatus({ message: msg, type });
    if (type !== "syncing") {
      setTimeout(() => {
        setStatus({ message: "", type: "" });
      }, 5000);
    }
  };

  const loadAccounts = async (selectActive = false) => {
    try {
      const list: Account[] = await invoke("list_accounts");
      setAccounts(list);

      if (selectActive && list.length > 0) {
        const active = list.find((a) => a.active) || list[0];
        setActiveAccount(active);
      }
    } catch (e) {
      showStatus(`Failed to load accounts: ${e}`, "error");
    }
  };

  const loadMessages = async (
    accountId: string,
    label: string,
    pageNum: number,
    showLoader = true
  ) => {
    if (showLoader) setIsSyncing(true);
    try {
      const pageToken = pageNum.toString();
      const list: MessageHeader[] = await invoke("list_messages", {
        accountId,
        label,
        pageToken,
      });

      if (pageNum === 1) {
        setMessages(list);
      } else {
        setMessages((prev) => [...prev, ...list]);
      }

      setPage(pageNum);
      // If we returned less than 50 messages, we reached the end of cache
      setHasMore(list.length === 50);
    } catch (e) {
      showStatus(`Failed to fetch messages: ${e}`, "error");
    } finally {
      if (showLoader) setIsSyncing(false);
    }
  };

  const loadMoreMessages = () => {
    if (activeAccount && hasMore && !isSyncing) {
      loadMessages(activeAccount.id, activeLabel, page + 1, false);
    }
  };

  const handleAddAccount = async () => {
    showStatus("Please complete authentication in your system browser...", "syncing");
    setIsSyncing(true);
    try {
      const email: string = await invoke("add_account");
      showStatus(`Account ${email} added successfully!`, "");
      await loadAccounts(false);
      
      // Select the newly added account
      const list: Account[] = await invoke("list_accounts");
      const addedAcc = list.find((a) => a.email === email);
      if (addedAcc) {
        setActiveAccount(addedAcc);
      }
    } catch (e) {
      showStatus(`Auth failed: ${e}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const executeRemoveAccount = async (id: string) => {
    try {
      await invoke("remove_account", { accountId: id });
      showStatus("Account removed.", "");
      
      const list: Account[] = await invoke("list_accounts");
      setAccounts(list);
      
      // If we removed the active account, switch to another
      if (activeAccount && activeAccount.id === id) {
        if (list.length > 0) {
          setActiveAccount(list[0]);
          invoke("switch_account", { accountId: list[0].id }).catch(console.error);
        } else {
          setActiveAccount(null);
        }
      }
    } catch (err) {
      showStatus(`Failed to remove account: ${err}`, "error");
    }
  };

  const handleSwitchAccount = async (account: Account) => {
    if (activeAccount && activeAccount.id === account.id) return;
    
    // Switch state instantly for cache-first reads
    setActiveAccount(account);
    setSelectedMessage(null);
    setMessages([]);
    
    try {
      await invoke("switch_account", { accountId: account.id });
    } catch (e) {
      showStatus(`Failed to switch active account: ${e}`, "error");
    }
  };

  const handleSelectMessage = async (msgHeader: MessageHeader) => {
    if (selectedMessage && selectedMessage.id === msgHeader.id) return;

    // Optimistic read status update on header list
    setMessages((prev) =>
      prev.map((m) => (m.id === msgHeader.id ? { ...m, is_read: true } : m))
    );

    try {
      const detail: MessageDetail = await invoke("get_message", {
        accountId: msgHeader.account_id,
        messageId: msgHeader.id,
      });
      setSelectedMessage(detail);

      // Trigger silent background read mark on Gmail
      if (!msgHeader.is_read) {
        invoke("mark_read", {
          accountId: msgHeader.account_id,
          messageId: msgHeader.id,
          read: true,
        }).catch(console.error);
      }
    } catch (e) {
      showStatus(`Failed to fetch message body: ${e}`, "error");
    }
  };

  const handleToggleRead = async (msg: MessageDetail | MessageHeader, e: React.MouseEvent) => {
    e.stopPropagation();
    const read = !msg.is_read;

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, is_read: read } : m))
    );
    if (selectedMessage && selectedMessage.id === msg.id) {
      setSelectedMessage((prev) => prev ? { ...prev, is_read: read } : null);
    }

    try {
      await invoke("mark_read", {
        accountId: msg.account_id,
        messageId: msg.id,
        read,
      });
    } catch (e) {
      showStatus(`Failed to update read status: ${e}`, "error");
    }
  };

  const handleArchive = async (msg: MessageDetail | MessageHeader, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const savedMsg = messages.find((m) => m.id === msg.id);

    // Optimistic delete from current view
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    if (selectedMessage && selectedMessage.id === msg.id) {
      setSelectedMessage(null);
    }

    if (savedMsg) {
      setLastAction({
        type: "archive",
        messageIds: [msg.id],
        accountId: msg.account_id,
        messages: [savedMsg],
      });
    }

    try {
      await invoke("archive_message", {
        accountId: msg.account_id,
        messageId: msg.id,
      });
    } catch (err) {
      showStatus(`Failed to archive message: ${err}`, "error");
    }
  };

  const handleTrash = async (msg: MessageDetail | MessageHeader, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const savedMsg = messages.find((m) => m.id === msg.id);

    // Optimistic delete from current view
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    if (selectedMessage && selectedMessage.id === msg.id) {
      setSelectedMessage(null);
    }

    if (savedMsg) {
      setLastAction({
        type: "trash",
        messageIds: [msg.id],
        accountId: msg.account_id,
        messages: [savedMsg],
      });
    }

    try {
      await invoke("trash_message", {
        accountId: msg.account_id,
        messageId: msg.id,
      });
    } catch (err) {
      showStatus(`Failed to move to trash: ${err}`, "error");
    }
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    const { type, messageIds, accountId, messages: savedMessages } = lastAction;
    setLastAction(null); // Clear undo state immediately

    showStatus("Undoing last action...", "syncing");
    try {
      if (type === "trash" || type === "batch_trash") {
        // Untrash: remove TRASH, add INBOX
        await Promise.all(
          messageIds.map(async (id) => {
            await invoke("remove_label", { accountId, messageId: id, labelId: "TRASH" });
            await invoke("apply_label", { accountId, messageId: id, labelId: "INBOX" });
          })
        );
      } else if (type === "archive" || type === "batch_archive") {
        // Unarchive: add INBOX
        await Promise.all(
          messageIds.map((id) =>
            invoke("apply_label", { accountId, messageId: id, labelId: "INBOX" })
          )
        );
      }

      // Restore messages in local state
      setMessages((prev) => {
        const combined = [...prev, ...savedMessages];
        const unique = combined.filter(
          (m, idx, self) => self.findIndex((x) => x.id === m.id) === idx
        );
        return unique.sort((a, b) => b.timestamp - a.timestamp);
      });
      showStatus("Action undone successfully.", "");
    } catch (err) {
      showStatus(`Undo failed: ${err}`, "error");
    }
  };

  const handleStar = async (msg: MessageDetail | MessageHeader, e: React.MouseEvent) => {
    e.stopPropagation();
    const isStarred = msg.labels.includes("STARRED");
    
    // Optimistic update
    const updatedLabels = isStarred
      ? msg.labels.filter((l) => l !== "STARRED")
      : [...msg.labels, "STARRED"];

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, labels: updatedLabels } : m))
    );

    if (selectedMessage && selectedMessage.id === msg.id) {
      setSelectedMessage((prev) =>
        prev ? { ...prev, labels: updatedLabels } : null
      );
    }

    try {
      if (isStarred) {
        await invoke("remove_label", {
          accountId: msg.account_id,
          messageId: msg.id,
          labelId: "STARRED",
        });
      } else {
        await invoke("apply_label", {
          accountId: msg.account_id,
          messageId: msg.id,
          labelId: "STARRED",
        });
      }
    } catch (err) {
      showStatus(`Starred toggle failed: ${err}`, "error");
    }
  };

  const handleManualSync = async () => {
    if (!activeAccount) return;
    setIsSyncing(true);
    showStatus("Syncing mailbox...", "syncing");
    try {
      await invoke("sync_account", { 
        accountId: activeAccount.id,
        activeLabel
      });
      showStatus("Sync complete.", "");
    } catch (e) {
      showStatus(`Sync failed: ${e}`, "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenReply = () => {
    if (!selectedMessage) return;
    setComposeTo(selectedMessage.sender);
    setComposeSubject(
      selectedMessage.subject.toUpperCase().startsWith("RE:")
        ? selectedMessage.subject
        : `Re: ${selectedMessage.subject}`
    );
    setComposeBody(
      `\n\nOn ${new Date(selectedMessage.timestamp * 1000).toLocaleString()}, <${
        selectedMessage.sender
      }> wrote:\n> `
    );
    setComposeThreadId(selectedMessage.thread_id);
    setIsComposeOpen(true);
  };

  const handleAddAttachments = async (files: FileList) => {
    const filesArray = Array.from(files);
    const newAttachments: Attachment[] = [];
    let currentTotalSize = composeAttachments.reduce((sum, att) => sum + (att.size || 0), 0);

    for (const file of filesArray) {
      if (currentTotalSize + file.size > 25 * 1024 * 1024) {
        showStatus("Total attachments exceed Gmail's 25MB limit", "error");
        setTimeout(() => showStatus("", ""), 4000);
        return;
      }
      
      try {
        const base64 = await fileToBase64(file);
        newAttachments.push({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          content_b64: base64,
          size: file.size,
        });
        currentTotalSize += file.size;
      } catch (err) {
        console.error("Failed to read file", file.name, err);
        showStatus(`Failed to read file: ${file.name}`, "error");
        setTimeout(() => showStatus("", ""), 4000);
      }
    }

    setComposeAttachments((prev) => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = (index: number) => {
    setComposeAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64Str = result.split(",")[1];
        resolve(base64Str);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    showStatus("Sending email...", "syncing");
    try {
      // Find clean recipient email out of full name sender format
      const recipientMatch = composeTo.match(/<(.+?)>/);
      const cleanTo = recipientMatch ? recipientMatch[1] : composeTo.trim();

      const attsPayload = composeAttachments.map((att) => ({
        filename: att.filename,
        mime_type: att.mime_type,
        content_b64: att.content_b64,
      }));

      await invoke("send_message", {
        accountId: activeAccount.id,
        to: cleanTo,
        subject: composeSubject,
        body: composeBody.replace(/\n/g, "<br>"), // Basic html line break replacement
        threadId: composeThreadId,
        attachments: attsPayload.length > 0 ? attsPayload : null,
      });

      showStatus("Message sent successfully!", "");
      setIsComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeThreadId(null);
      setComposeAttachments([]);
    } catch (err) {
      showStatus(`Failed to send message: ${err}`, "error");
    }
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden flex bg-slate-105 dark:bg-zinc-950 font-sans transition-colors duration-300 ${darkMode ? "dark" : ""}`}>
      {/* Ambient background blurred radial gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 dark:bg-blue-600/5 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 dark:bg-violet-600/5 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute top-[30%] right-[20%] w-[40%] h-[40%] bg-indigo-500/5 dark:bg-indigo-600/5 rounded-full blur-[80px] pointer-events-none z-0" />

      {/* Main Container */}
      <div className="relative w-full h-full flex z-10">
        <AccountRail
          accounts={accounts}
          activeAccount={activeAccount}
          onSwitchAccount={handleSwitchAccount}
          onAddAccount={handleAddAccount}
          onRemoveAccount={(id, e) => {
            e.stopPropagation();
            const acc = accounts.find((a) => a.id === id);
            if (acc) setAccountToRemove(acc);
          }}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        
        <Sidebar
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          activeLabel={activeLabel}
          setActiveLabel={setActiveLabel}
          setSelectedMessage={setSelectedMessage}
          activeAccount={activeAccount}
          onComposeClick={() => {
            setComposeTo("");
            setComposeSubject("");
            setComposeBody("");
            setComposeThreadId(null);
            setIsComposeOpen(true);
            setIsComposeMinimized(false);
          }}
        />

        <div className="flex-1 h-full flex overflow-hidden">
          <EmailList
            filteredMessages={filteredMessages}
            selectedMessage={selectedMessage}
            selectedMessageIds={selectedMessageIds}
            searchQuery={searchQuery}
            listFilter={listFilter}
            setListFilter={setListFilter}
            isSyncing={isSyncing}
            hasMore={hasMore}
            activeAccount={activeAccount}
            messageListRef={messageListRef}
            loadMoreMessages={loadMoreMessages}
            handleToggleSelectMessage={handleToggleSelectMessage}
            handleSelectAll={handleSelectAll}
            handleBatchMarkRead={handleBatchMarkRead}
            handleBatchArchive={handleBatchArchive}
            handleBatchTrash={handleBatchTrash}
            handleManualSync={handleManualSync}
            handleToggleRead={handleToggleRead}
            handleStar={handleStar}
            handleArchive={handleArchive}
            handleTrash={handleTrash}
            handleSelectMessage={handleSelectMessage}
            setSelectedMessageIds={setSelectedMessageIds}
            setSearchQuery={setSearchQuery}
            unreadCount={unreadCount}
            starredCount={starredCount}
          />

          <ReadingPane
            selectedMessage={selectedMessage}
            onReply={handleOpenReply}
            onStar={(e) => handleStar(selectedMessage!, e)}
            onToggleRead={(e) => handleToggleRead(selectedMessage!, e)}
            onArchive={(e) => handleArchive(selectedMessage!, e)}
            onTrash={(e) => handleTrash(selectedMessage!, e)}
          />
        </div>
      </div>

      {/* Floating Composer Drawer */}
      <ComposeDrawer
        isOpen={isComposeOpen}
        isMinimized={isComposeMinimized}
        setIsComposeMinimized={setIsComposeMinimized}
        isMaximized={isComposeMaximized}
        setIsComposeMaximized={setIsComposeMaximized}
        composeTo={composeTo}
        setComposeTo={setComposeTo}
        composeSubject={composeSubject}
        setComposeSubject={setComposeSubject}
        composeBody={composeBody}
        setComposeBody={setComposeBody}
        composeThreadId={composeThreadId}
        activeAccount={activeAccount}
        handleSendMessage={handleSendMessage}
        attachments={composeAttachments}
        onAddAttachments={handleAddAttachments}
        onRemoveAttachment={handleRemoveAttachment}
        onClose={() => {
          setIsComposeOpen(false);
          setComposeTo("");
          setComposeSubject("");
          setComposeBody("");
          setComposeThreadId(null);
          setComposeAttachments([]);
        }}
      />

      {/* Status Notifications */}
      {status.message && (
        <div className={`fixed bottom-4 left-24 z-50 flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg shadow-lg backdrop-blur-md border ${
          status.type === "error"
            ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
            : "bg-white/80 dark:bg-zinc-900/80 border-black/10 dark:border-white/10 text-neutral-800 dark:text-neutral-200"
        }`}>
          {status.type === "syncing" && <RefreshCw size={14} className="animate-spin" />}
          <span>{status.message}</span>
        </div>
      )}

      {/* Custom Frosted Account Removal Confirmation Modal */}
      {accountToRemove && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-in fade-in duration-250">
          <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-150">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              Remove Account Connection
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
              Are you sure you want to disconnect <strong>{accountToRemove.display_name || accountToRemove.email}</strong>? This will clear all its local database cache and sign out.
            </p>
            <div className="mt-6 flex justify-end gap-2 text-xs">
              <button
                onClick={() => setAccountToRemove(null)}
                className="px-4 py-2 bg-neutral-100 dark:bg-neutral-850 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = accountToRemove.id;
                  setAccountToRemove(null);
                  executeRemoveAccount(id);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold shadow-md cursor-pointer transition-colors"
              >
                Remove Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Popup Notification at bottom center */}
      {lastAction && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-neutral-800 text-white shadow-2xl rounded-xl px-4 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
          <span className="text-xs font-sans font-medium text-neutral-200 select-none">
            {lastAction.type.includes("trash")
              ? `${lastAction.messageIds.length} message${lastAction.messageIds.length > 1 ? "s" : ""} deleted`
              : `${lastAction.messageIds.length} message${lastAction.messageIds.length > 1 ? "s" : ""} archived`}
          </span>
          <button
            onClick={handleUndo}
            className="text-xs font-bold text-blue-400 hover:text-blue-300 cursor-pointer uppercase tracking-wider transition-colors"
          >
            Undo
          </button>
          <button
            onClick={() => setLastAction(null)}
            className="text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Modern Frosted Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5 bg-neutral-50/50 dark:bg-zinc-950/20">
              <div className="flex flex-col">
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">Settings</h2>
                <span className="text-[10px] text-neutral-400 font-medium">Configure your email preferences</span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Notifications section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Notifications
                </h3>
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                  <div className="flex flex-col space-y-0.5">
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Desktop Notifications
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      Receive notifications when new emails arrive.
                    </span>
                  </div>
                  <button
                    onClick={() => setSettingsNotificationsEnabled(!settingsNotificationsEnabled)}
                    className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
                      settingsNotificationsEnabled ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-700"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        settingsNotificationsEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Sync settings */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Synchronization
                </h3>
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                  <div className="flex flex-col space-y-0.5">
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Background Poll Interval
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      How frequently to check for new mail.
                    </span>
                  </div>
                  <CustomSelect
                    value={settingsSyncInterval}
                    onChange={(val) => setSettingsSyncInterval(val)}
                    options={[
                      { value: 15, label: "15 Seconds" },
                      { value: 30, label: "30 Seconds" },
                      { value: 60, label: "1 Minute" },
                      { value: 300, label: "5 Minutes" },
                      { value: 600, label: "10 Minutes" }
                    ]}
                  />
                </div>
              </div>
 
              {/* Startup Folder */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Preferences
                </h3>
                <div className="flex items-center justify-between p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                  <div className="flex flex-col space-y-0.5">
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Default Startup Mailbox
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      Initial folder shown on app startup.
                    </span>
                  </div>
                  <CustomSelect
                    value={settingsDefaultFolder}
                    onChange={(val) => setSettingsDefaultFolder(val)}
                    options={[
                      { value: "INBOX", label: "Inbox" },
                      { value: "STARRED", label: "Starred" },
                      { value: "SENT", label: "Sent" },
                      { value: "DRAFT", label: "Drafts" },
                      { value: "TRASH", label: "Trash" },
                      { value: "SPAM", label: "Spam" },
                      { value: "ALL", label: "All Mail" }
                    ]}
                  />
                </div>
              </div>

              {/* Connected Accounts */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Connected Accounts
                </h3>
                <div className="space-y-2">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center font-mono font-bold text-neutral-700 dark:text-neutral-300 overflow-hidden">
                          {acc.picture_url ? (
                            <img src={acc.picture_url} alt={acc.email} className="w-full h-full object-cover" />
                          ) : (
                            acc.email.substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {acc.display_name || acc.email}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">{acc.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {acc.active ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/25">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">
                            Linked
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {accounts.length === 0 && (
                    <div className="text-center py-4 text-xs text-neutral-400">No accounts connected.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-black/5 dark:border-white/5 bg-neutral-50 dark:bg-zinc-950/30 flex items-center justify-between text-[10px] text-neutral-400">
              <div className="flex flex-col">
                <span className="font-semibold text-neutral-500 dark:text-neutral-400">AeroMail v1.0.0</span>
                <span>Powered by Tauri & React</span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
