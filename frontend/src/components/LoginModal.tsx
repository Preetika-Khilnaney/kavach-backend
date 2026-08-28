import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, LogIn, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import clsx from 'clsx';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * STUB LOGIN MODAL
 * 
 * UI-only login form for demo purposes. No real authentication backend.
 * In production, this would connect to real auth endpoints with proper
 * validation, error handling, and security measures.
 */
export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, loginAsDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const containerRef = useFocusTrap(isOpen);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // STUB: This accepts any credentials for demo purposes
      await login(email, password);
      onClose();
      setEmail('');
      setPassword('');
    } catch (error) {
      // In production, handle errors properly
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    loginAsDemo();
    onClose();
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={containerRef}
        role="dialog"
        aria-labelledby="login-modal-title"
        aria-modal="true"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-surface rounded-2xl border border-border-default shadow-panel w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-indigo flex items-center justify-center text-white shadow-glow-indigo">
              <LogIn size={20} />
            </div>
            <div>
              <h2 id="login-modal-title" className="font-heading font-bold text-base text-text-primary">
                Sign in to Kavach
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Predictive Intrusion Forecasting System
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close login dialog"
            data-interactive
            className="p-1 rounded hover:bg-canvas text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Demo Mode Button - Primary CTA */}
          <button
            type="button"
            onClick={handleDemoLogin}
            data-interactive
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-indigo text-white font-medium text-sm hover:bg-accent-indigo-light transition-colors shadow-sm"
          >
            <Sparkles size={16} />
            Continue as Analyst (Demo Mode)
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border-default" />
            <span className="text-xs text-text-tertiary font-medium">OR</span>
            <div className="flex-1 h-px bg-border-default" />
          </div>

          {/* STUB: Login Form - accepts any credentials for demo */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@organization.com"
                required
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-canvas text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-indigo focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-canvas text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-indigo focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-interactive
              className={clsx(
                'w-full px-4 py-2.5 rounded-lg border border-border-default font-medium text-sm transition-colors',
                loading
                  ? 'bg-canvas text-text-tertiary cursor-not-allowed'
                  : 'bg-canvas text-text-primary hover:bg-surface hover:border-accent-indigo'
              )}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Disclaimer */}
          <div className="mt-6 pt-4 border-t border-border-default">
            <p className="text-xs text-text-tertiary text-center leading-relaxed">
              Demo prototype — authentication is simulated for presentation purposes only.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
