import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Čia įklijuokite SAVO nustatymus iš Firebase konsolės
const firebaseConfig = {
  apiKey: "AIzaSyCeZmfFHSIwR2m-cDZSJCQeHKYJDIAZuWs",
  authDomain: "namu-inventorius.firebaseapp.com",
  projectId: "namu-inventorius",
  storageBucket: "namu-inventorius.appspot.com",
  messagingSenderId: "408191511462",
  appId: "1:408191511462:web:0c36d1738d9da01dbd3d67"
};

// Inicijuojame Firebase
const app = initializeApp(firebaseConfig);

// Eksportuojame duomenų bazę, kad ją galėtų naudoti mūsų App.jsx
export const db = getFirestore(app);