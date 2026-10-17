// MSOP Hosting — Firebase client init (web config is public by design).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_LSzDIy75KsxrAttbjkROCWuTyl8JlUQ",
  authDomain: "meowsamopdzn.firebaseapp.com",
  projectId: "meowsamopdzn",
  storageBucket: "meowsamopdzn.firebasestorage.app",
  messagingSenderId: "861864558161",
  appId: "1:861864558161:web:f138025399dbd784ae8270",
  measurementId: "G-HGLRFNG6CQ",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
