/* network.js - Firebase 초기화 및 DB */
import { firebaseConfig } from './firebaseConfig.js';

if (typeof firebase === 'undefined') {
    throw new Error("Firebase CDN을 먼저 로드해주세요.");
}
try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.error(e);
}
export const db = firebase.database();
