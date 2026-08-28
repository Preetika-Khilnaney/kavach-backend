import { useState } from 'react';
import { LogIn, Settings, LogOut, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LoginModal } from './LoginModal';

interface LoginButtonProps {
  onOpenAccessibility: () => void;
  onOpenProvenance: () => void;
}

export function LoginButton({ onOpenAccessibility, onOpenProvenance }: LoginButtonProps) {
  const { isAuthenticated, user, logout } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLoginModalOpen(true)}
          data-interactive
          aria-label="Sign in"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default bg-surface hover:bg-canvas text-text-primary text-xs font-medium transition-colors"
        >
          <LogIn size={14} />
          <span className="hidden sm:inline">Sign in</span>
        </button>
        <LoginModal isOpen={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        onBlur={(e) => {
          // Close dropdown when focus leaves the button and dropdown
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
            setTimeout(() => setDropdownOpen(false), 100);
          }
        }}
        data-interactive
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border-default bg-surface hover:bg-canvas text-text-primary transition-colors"
      >
        {/* Avatar with Initials */}
        <div className="w-6 h-6 rounded-full bg-accent-indigo text-white flex items-center justify-center text-[10px] font-heading font-bold">
          {user?.initials || 'U'}
        </div>
        <div className="hidden md:flex flex-col items-start">
          <span className="text-xs font-medium leading-tight">{user?.name}</span>
          <span className="text-[10px] text-text-tertiary leading-tight">{user?.role}</span>
        </div>
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-56 bg-surface rounded-lg border border-border-default shadow-panel py-1 z-50"
          role="menu"
        >
          {/* User Info Header */}
          <div className="px-3 py-2 border-b border-border-default">
            <p className="text-xs font-medium text-text-primary">{user?.name}</p>
            <p className="text-[11px] text-text-secondary">{user?.email}</p>
          </div>

          {/* Menu Items */}
          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              onOpenProvenance();
            }}
            data-interactive
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-canvas transition-colors"
          >
            <FileText size={14} className="text-accent-teal" />
            Model Provenance
          </button>

          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              onOpenAccessibility();
            }}
            data-interactive
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-canvas transition-colors"
          >
            <Settings size={14} className="text-accent-indigo" />
            Accessibility Settings
          </button>

          <div className="h-px bg-border-default my-1" />

          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              logout();
            }}
            data-interactive
            role="menuitem"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-risk-red hover:bg-risk-red-subtle transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
