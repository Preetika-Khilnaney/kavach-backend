import { useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, User, KeyRound, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import loginBackground from '../assets/login-background.png';
import clsx from 'clsx';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KAVACH_LETTERS = 'Kavach'.split('');
const FLY_IN_DURATION = 1.1;

/** Right-panel wordmark: flies in rotating from the top-right corner, settles
 * center, then each letter hops up in sequence and comes to rest. */
function AnimatedKavachWordmark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
      <motion.div
        initial={{ x: 140, y: -120, rotate: -70, opacity: 0 }}
        animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
        transition={{ duration: FLY_IN_DURATION, ease: [0.16, 1, 0.3, 1] }}
        className="flex"
      >
        {KAVACH_LETTERS.map((letter, idx) => (
          <motion.span
            key={idx}
            initial={{ y: 0 }}
            animate={{ y: [0, -16, 0] }}
            transition={{
              duration: 0.5,
              delay: FLY_IN_DURATION + idx * 0.1,
              times: [0, 0.5, 1],
              ease: 'easeOut',
            }}
            className="font-heading font-bold text-white text-6xl tracking-tight inline-block"
          >
            {letter}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
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
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const containerRef = useFocusTrap(isOpen);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // STUB: This accepts any credentials for demo purposes
      await login(email, password);
      onClose();
      navigate('/ingest');
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
    navigate('/ingest');
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" aria-hidden="true" />

      {/* Modal */}
      <div
        ref={containerRef}
        role="dialog"
        aria-label="Sign in to Kavach"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 bg-surface rounded-2xl border border-border-default shadow-panel w-full sm:w-[880px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col sm:flex-row"
      >
        {/* Left: Form */}
        <div className="relative w-full sm:w-[380px] shrink-0 p-8 overflow-y-auto">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close login dialog"
            data-interactive
            className="absolute top-4 left-4 p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-canvas transition-colors"
          >
            <X size={20} />
          </button>

          <div className="mt-10 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username / email */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border-default bg-canvas focus-within:ring-2 focus-within:ring-accent-indigo focus-within:border-transparent">
                <User size={16} className="text-text-tertiary shrink-0" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Username or email"
                  required
                  aria-label="Username or email"
                  className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                />
              </div>

              {/* Password */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border-default bg-canvas focus-within:ring-2 focus-within:ring-accent-indigo focus-within:border-transparent">
                <KeyRound size={16} className="text-text-tertiary shrink-0" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  aria-label="Password"
                  className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  data-interactive
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Remember me + Login */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-border-default text-accent-indigo focus:ring-accent-indigo"
                  />
                  Remember me
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  data-interactive
                  className={clsx(
                    'px-6 py-2 rounded-lg font-heading font-semibold text-xs tracking-wide text-white transition-colors',
                    loading ? 'bg-accent-indigo/60 cursor-not-allowed' : 'bg-accent-indigo hover:bg-accent-indigo-light',
                  )}
                >
                  {loading ? 'SIGNING IN…' : 'LOGIN'}
                </button>
              </div>
            </form>

            {/* Forgot password */}
            <div className="text-center">
              <button
                type="button"
                data-interactive
                className="text-xs text-accent-indigo hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {/* Demo shortcut -- kept since this app has no real backend auth */}
            <button
              type="button"
              onClick={handleDemoLogin}
              data-interactive
              className="w-full text-center text-[11px] text-text-tertiary hover:text-accent-indigo transition-colors"
            >
              Continue as demo analyst
            </button>

            <p className="text-[10px] text-text-tertiary text-center leading-relaxed pt-2 border-t border-border-default">
              Demo prototype — authentication is simulated for presentation purposes only.
            </p>
          </div>
        </div>

        {/* Right: Animated panel */}
        <div
          className="relative hidden sm:block flex-1 bg-cover bg-center overflow-hidden"
          style={{ backgroundImage: `url(${loginBackground})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#0F0B2E]/80 via-[#1B1464]/60 to-[#2D1B69]/70" aria-hidden="true" />
          <AnimatedKavachWordmark />
        </div>
      </div>
    </div>,
    document.body,
  );
}
