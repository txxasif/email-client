import React from "react";
import {
  Inbox,
  Star,
  Send,
  Trash2,
  Archive,
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { Account } from "../types";

interface SidebarProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  activeLabel: string;
  setActiveLabel: (label: string) => void;
  setSelectedMessage: (msg: any) => void;
  activeAccount: Account | null;
  onComposeClick: () => void;
}

const Sidebar = React.memo(function Sidebar({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  activeLabel,
  setActiveLabel,
  setSelectedMessage,
  activeAccount,
  onComposeClick,
}: SidebarProps) {
  const folders = [
    { id: "INBOX", name: "Inbox", icon: Inbox },
    { id: "STARRED", name: "Starred", icon: Star },
    { id: "SENT", name: "Sent", icon: Send },
    { id: "DRAFT", name: "Drafts", icon: FileText },
    { id: "TRASH", name: "Trash", icon: Trash2 },
    { id: "SPAM", name: "Spam", icon: ShieldAlert },
    { id: "ALL", name: "All Mail", icon: Archive },
  ];

  return (
    <div
      className={`transition-all duration-300 relative h-full flex flex-col justify-between shrink-0 glass-panel-sidebar border-r border-black/5 dark:border-white/5 z-20 ${
        isSidebarCollapsed ? "w-[68px]" : "w-64"
      }`}
    >
      <div className="flex flex-col w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-5 h-16 border-b border-black/5 dark:border-white/5">
          {!isSidebarCollapsed && (
            <span className="font-sans text-sm font-bold tracking-wide uppercase text-neutral-500 dark:text-neutral-400">
              Mailboxes
            </span>
          )}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-all duration-200 ${
              isSidebarCollapsed ? "mx-auto" : ""
            }`}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Compose Button */}
        <div className="px-3 py-4 w-full">
          <button
            onClick={onComposeClick}
            disabled={!activeAccount}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold shadow-md transition-all duration-200 ${
              activeAccount
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/10 cursor-pointer"
                : "bg-neutral-300 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
            }`}
            title="Compose New Message ( c )"
          >
            <Plus size={15} />
            {!isSidebarCollapsed && <span>Compose</span>}
          </button>
        </div>

        {/* Mailboxes navigation */}
        <nav className="flex flex-col space-y-1 px-2 w-full">
          {folders.map((folder) => {
            const Icon = folder.icon;
            const isActive = activeLabel === folder.id;
            return (
              <button
                key={folder.id}
                onClick={() => {
                  setActiveLabel(folder.id);
                  setSelectedMessage(null);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white"
                } ${isSidebarCollapsed ? "justify-center" : ""}`}
                title={folder.name}
              >
                <Icon size={16} className="shrink-0" />
                {!isSidebarCollapsed && <span>{folder.name}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
});

export default Sidebar;
