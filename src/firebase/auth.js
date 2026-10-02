import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const REQUEST_KEY = 'stokqr-request-admin-after-login';

export class FirebaseAuthService {
  constructor(auth) {
    if (!auth) throw new Error('Firebase Authentication belum dikonfigurasi.');
    this.auth = auth;
    this.provider = new GoogleAuthProvider();
    this.provider.setCustomParameters({ prompt: 'select_account' });
  }

  async completeRedirect() {
    return getRedirectResult(this.auth);
  }

  subscribe(callback) {
    return onAuthStateChanged(this.auth, callback);
  }

  async signIn({ requestAdmin = false } = {}) {
    sessionStorage.setItem(REQUEST_KEY, requestAdmin ? 'true' : 'false');
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile) return signInWithRedirect(this.auth, this.provider);
    try {
      return await signInWithPopup(this.auth, this.provider);
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        return signInWithRedirect(this.auth, this.provider);
      }
      throw error;
    }
  }

  consumeAdminRequest() {
    const requested = sessionStorage.getItem(REQUEST_KEY) === 'true';
    sessionStorage.removeItem(REQUEST_KEY);
    return requested;
  }

  logout() {
    return signOut(this.auth);
  }
}
