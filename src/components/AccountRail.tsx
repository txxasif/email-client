import React from "react";
import { Plus, X, Sun, Moon, Settings } from "lucide-react";
import { Account } from "../types";

interface AccountRailProps {
  accounts: Account[];
  activeAccount: Account | null;
  onSwitchAccount: (acc: Account) => void;
  onAddAccount: () => void;
  onRemoveAccount: (id: string, e: React.MouseEvent) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
}

const AccountRail = React.memo(function AccountRail({
  accounts,
  activeAccount,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
  darkMode,
  onToggleDarkMode,
  onOpenSettings,
}: AccountRailProps) {
  return (
    <div
      id="account-rail"
      className="w-[68px] bg-neutral-900/40 dark:bg-neutral-950/60 backdrop-blur-xl flex flex-col items-center py-4 justify-between shrink-0 h-full border-r border-black/10 dark:border-white/10 z-30"
    >
      {/* Top Stack: Connected Accounts */}
      <div className="flex flex-col items-center space-y-4 w-full">
        <div className="flex flex-col space-y-3 items-center w-full max-h-[420px] overflow-y-auto no-scrollbar py-2">
          {accounts.map((acc) => {
            const isActive = activeAccount?.id === acc.id;
            return (
              <div key={acc.id} className="relative group flex items-center justify-center w-full">
                {/* Active side-indicator */}
                <div
                  className={`absolute left-0 w-1 bg-blue-500 rounded-r transition-all duration-200 ${
                    isActive ? "h-7" : "h-0 group-hover:h-3"
                  }`}
                />

                <button
                  onClick={() => onSwitchAccount(acc)}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 hover:rounded-xl relative overflow-hidden bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-sm font-semibold tracking-wide ${
                    isActive
                      ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-100 dark:ring-offset-zinc-950 scale-105"
                      : "hover:bg-neutral-300 dark:hover:bg-neutral-700"
                  }`}
                >
                  {acc.picture_url ? (
                    <img src={acc.picture_url} alt={acc.email} className="w-full h-full object-cover" />
                  ) : (
                    acc.email.substring(0, 2).toUpperCase()
                  )}
                </button>

                {/* Remove button */}
                <button
                  onClick={(e) => onRemoveAccount(acc.id, e)}
                  className="absolute top-0 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md hover:bg-red-600"
                  title="Remove Account"
                >
                  <X size={10} />
                </button>

                {/* Tooltip */}
                <div className="absolute left-16 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-150 bg-neutral-900 dark:bg-neutral-900 border border-neutral-800 text-neutral-100 font-sans text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-xl flex flex-col">
                  <span className="font-semibold text-white">{acc.display_name || acc.email}</span>
                  <span className="text-[10px] text-neutral-400 font-mono mt-0.5">{acc.email}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-8 h-[1px] bg-black/10 dark:bg-white/10" />

        {/* Add Account Button */}
        <div className="relative group flex items-center justify-center w-full">
          <button
            onClick={onAddAccount}
            className="w-11 h-11 rounded-2xl bg-black/5 dark:bg-white/5 border border-dashed border-black/20 dark:border-white/20 text-neutral-500 dark:text-neutral-400 hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 flex items-center justify-center transition-all duration-200 hover:rounded-xl"
            title="Link Google Account"
          >
            <Plus size={18} />
          </button>
          <div className="absolute left-16 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-150 bg-neutral-900 border border-neutral-800 text-neutral-200 font-sans text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-xl flex flex-col">
            <span className="font-semibold text-white">Link Account</span>
            <span className="text-[10px] text-neutral-400">Sign in with Google OAuth</span>
          </div>
        </div>
      </div>

      {/* Bottom Stack: Theme Switcher & Settings */}
      <div className="flex flex-col items-center space-y-4 w-full">
        <button
          onClick={onToggleDarkMode}
          className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          title="Toggle Theme"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={onOpenSettings}
          className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
});

export default AccountRail;
