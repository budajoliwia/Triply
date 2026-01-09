import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/client';
import { UserDoc } from '@triply/shared/src/models';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        try {
          console.log(`[AuthProvider] Checking role for user ${user.uid}...`);
          const userDocRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const userData = userSnap.data() as UserDoc;
            console.log(`[AuthProvider] User data:`, userData);
            const isUserAdmin = userData.role === 'admin';
            console.log(`[AuthProvider] isAdmin: ${isUserAdmin}`);
            setIsAdmin(isUserAdmin);
          } else {
            console.log(`[AuthProvider] User document not found for ${user.uid}`);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error('[AuthProvider] Error fetching user role:', error);
          setIsAdmin(false);
        }
      } else {
        console.log('[AuthProvider] No user logged in');
        setIsAdmin(false);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading }}>{children}</AuthContext.Provider>
  );
}
