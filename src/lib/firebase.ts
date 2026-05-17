import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app, config.firestoreDatabaseId); 
export const googleProvider = new GoogleAuthProvider();

export const signIn = async () => {
  if (!auth) return;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error('Sign in error:', error);
  }
};

export const logout = async () => {
  if (!auth) return;
  await signOut(auth);
};

// Validate Connection
if (db && config.apiKey !== 'PLACEHOLDER') {
  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      }
    }
  };
  testConnection();
}
