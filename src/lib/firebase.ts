import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDocFromServer,
  getFirestore
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Safety check for empty or placeholder config
const isConfigValid = !!(
  firebaseConfig && 
  firebaseConfig.apiKey && 
  firebaseConfig.projectId &&
  !firebaseConfig.apiKey.includes('INVALID_PLACEHOLDER') &&
  !firebaseConfig.apiKey.includes('MY_GEMINI_API_KEY')
);

// We initialize app with a dummy if config is invalid to prevent errors in other SDK components
const app = getApps().length === 0 
  ? initializeApp(isConfigValid ? firebaseConfig : { 
      apiKey: 'dummy-api-key', 
      projectId: 'dummy-project-id',
      authDomain: 'dummy.firebaseapp.com' // Required for Auth SDK initialization
    }) 
  : getApp();

export const db = isConfigValid 
  ? getFirestore(app) // Using default Firestore without persistence for stability in iframes
  : getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Connection Test
async function testConnection() {
  if (!isConfigValid) {
    console.warn("Firebase configuration is invalid or placeholder. Firebase features (Auth/Firestore) will remain disabled.");
    return;
  }
  try {
    // Only attempt if we have a real config
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful.");
  } catch (error) {
    console.warn("Firestore connection check failed. Ensure rules are deployed and Firestore is provisioned.");
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
