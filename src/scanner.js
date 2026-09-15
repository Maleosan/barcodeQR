import { SCAN_FORMATS } from './domain.js';

export const SCANNER_STATE = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  SCANNING: 'scanning',
  DETECTED: 'detected',
  ERROR: 'error'
});

export class ScannerError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'ScannerError';
    this.code = code;
  }
}

export class ScanFeedback {
  constructor({
    vibrate = pattern => globalThis.navigator?.vibrate?.(pattern),
    createAudioContext = () => {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    }
  } = {}) {
    this.vibrate = vibrate;
    this.createAudioContext = createAudioContext;
    this.audioContext = null;
  }

  prepare() {
    try {
      this.audioContext ||= this.createAudioContext?.() || null;
      if (this.audioContext?.state === 'suspended') void Promise.resolve(this.audioContext.resume()).catch(() => {});
    } catch { this.audioContext = null; }
  }

  notify() {
    try { this.vibrate?.(70); } catch {}
    try {
      const context = this.audioContext;
      if (!context || context.state === 'closed') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
    } catch {}
  }
}

export class BarcodeScanner {
  constructor({ getZXing = () => globalThis.ZXingBrowser, feedback = new ScanFeedback() } = {}) {
    this.getZXing = getZXing;
    this.feedback = feedback;
    this.reader = null;
    this.controls = null;
    this.video = null;
    this.state = SCANNER_STATE.IDLE;
    this.runId = 0;
    this.listeners = new Set();
  }

  get supportedFormats() { return SCAN_FORMATS; }
  get running() { return this.state === SCANNER_STATE.SCANNING; }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setState(state, detail) {
    this.state = state;
    this.listeners.forEach(listener => listener(state, detail));
  }

  prepareFeedback() { this.feedback?.prepare?.(); }

  async start(video, onResult, onError) {
    await this.stop();
    const runId = ++this.runId;
    const ZXing = this.getZXing();
    if (!ZXing?.BrowserMultiFormatReader) {
      const error = new ScannerError('DECODER_UNAVAILABLE', 'Decoder barcode belum tersedia.');
      this.setState(SCANNER_STATE.ERROR, error);
      onError?.(error);
      throw error;
    }

    this.video = video;
    this.setState(SCANNER_STATE.STARTING);
    try {
      const reader = this.reader ||= new ZXing.BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }, video, (result, error) => {
        if (runId !== this.runId || this.state !== SCANNER_STATE.SCANNING) return;
        if (result) {
          const value = this.acceptDecoded(result.getText());
          if (!value) return;
          this.setState(SCANNER_STATE.DETECTED, value);
          this.feedback?.notify?.();
          void this.stop({ preserveState: true }).then(() => onResult(value, result.getBarcodeFormat?.()));
          return;
        }
        // NotFoundException means the live decoder is still looking; it is not an error.
        if (error && error.name !== 'NotFoundException') {
          const scannerError = this.cameraError(error);
          void this.stop({ preserveState: true }).then(() => {
            this.setState(SCANNER_STATE.ERROR, scannerError);
            onError?.(scannerError);
          });
        }
      });

      if (runId !== this.runId) {
        controls?.stop();
        return false;
      }
      this.controls = controls;
      this.setState(SCANNER_STATE.SCANNING);
      return true;
    } catch (cause) {
      if (runId !== this.runId) return false;
      const error = cause instanceof ScannerError ? cause : this.cameraError(cause);
      await this.stop({ preserveState: true });
      this.setState(SCANNER_STATE.ERROR, error);
      onError?.(error);
      throw error;
    }
  }

  cameraError(cause) {
    const denied = cause?.name === 'NotAllowedError' || cause?.name === 'PermissionDeniedError';
    return new ScannerError(
      denied ? 'PERMISSION_DENIED' : 'CAMERA_UNAVAILABLE',
      denied ? 'Izin kamera ditolak. Izinkan akses kamera lalu coba lagi.' : 'Kamera tidak dapat diakses.',
      cause
    );
  }

  async stop({ preserveState = false } = {}) {
    ++this.runId;
    const controls = this.controls;
    const video = this.video;
    this.controls = null;
    this.video = null;
    try { controls?.stop(); } finally {
      const stream = video?.srcObject;
      stream?.getTracks?.().forEach(track => track.stop());
      if (video && 'srcObject' in video) video.srcObject = null;
      if (!preserveState) this.setState(SCANNER_STATE.IDLE);
    }
  }

  acceptDecoded(value) { return String(value ?? '').trim(); }
}
