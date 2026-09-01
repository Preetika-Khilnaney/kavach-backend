import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type TextSize = 'small' | 'default' | 'large';
export type ContrastMode = 'normal' | 'high';

interface AccessibilitySettings {
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
}

interface AccessibilityContextValue extends AccessibilitySettings {
  setTextSize: (size: TextSize) => void;
  setHighContrast: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  toggleHighContrast: () => void;
  toggleReduceMotion: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

const STORAGE_KEY = 'kavach_accessibility_settings';

function getInitialSettings(): AccessibilitySettings {
  // Check localStorage first
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Fall through to defaults
    }
  }

  // Default to system preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  return {
    textSize: 'default',
    highContrast: false,
    reduceMotion: prefersReducedMotion,
  };
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(getInitialSettings);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // Apply settings to document
  useEffect(() => {
    const root = document.documentElement;

    // Text size
    root.classList.remove('text-small', 'text-large');
    if (settings.textSize === 'small') root.classList.add('text-small');
    if (settings.textSize === 'large') root.classList.add('text-large');

    // High contrast
    if (settings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Reduce motion
    if (settings.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [settings]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-update if user hasn't explicitly set a preference
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setSettings(prev => ({ ...prev, reduceMotion: e.matches }));
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const value: AccessibilityContextValue = {
    ...settings,
    setTextSize: (size) => setSettings(prev => ({ ...prev, textSize: size })),
    setHighContrast: (enabled) => setSettings(prev => ({ ...prev, highContrast: enabled })),
    setReduceMotion: (enabled) => setSettings(prev => ({ ...prev, reduceMotion: enabled })),
    toggleHighContrast: () => setSettings(prev => ({ ...prev, highContrast: !prev.highContrast })),
    toggleReduceMotion: () => setSettings(prev => ({ ...prev, reduceMotion: !prev.reduceMotion })),
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}
