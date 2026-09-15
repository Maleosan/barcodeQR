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

export class BarcodeScanner {
  constructor({ getZXing = () => globalThis.ZXingBrowser } = {}) {
    this.getZXing = getZXing;
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
      const reader = new ZXing.BrowserMultiFormatReader();
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
