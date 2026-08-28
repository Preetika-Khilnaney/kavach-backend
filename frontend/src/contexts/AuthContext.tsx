import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * STUB AUTHENTICATION CONTEXT
 * 
 * This is a placeholder implementation for hackathon demo purposes only.
 * NOT production-ready - no real authentication, token management, or security.
 * 
 * In production, replace with proper authentication:
 * - Real backend auth endpoints
 * - JWT or session token management
 * - Secure password handling
 * - Account management features
 */

interface User {
  name: string;
  email: string;
  role: string;
  initials: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  loginAsDemo: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'kavach_auth_demo';

// Demo user for prototype
const DEMO_USER: User = {
  name: 'Security Analyst',
  email: 'analyst@kavach.demo',
  role: 'Demo Mode',
  initials: 'SA',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { isAuthenticated: auth, user: storedUser } = JSON.parse(stored);
        if (auth && storedUser) {
          setIsAuthenticated(true);
          setUser(storedUser);
        }
      } catch {
        // Invalid stored data, ignore
      }
    }
  }, []);

  // Persist session to localStorage
  useEffect(() => {
    if (isAuthenticated && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ isAuthenticated, user }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [isAuthenticated, user]);

  // STUB: Mock login function - accepts any credentials
  const login = async (_email: string, _password: string) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // In a real implementation, this would validate credentials against a backend
    // For demo purposes, we just accept anything and log them in as demo user
    setIsAuthenticated(true);
    setUser(DEMO_USER);
  };

  const loginAsDemo = () => {
    setIsAuthenticated(true);
    setUser(DEMO_USER);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, loginAsDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
