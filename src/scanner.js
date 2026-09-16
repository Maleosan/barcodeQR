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

const RECOVERABLE_DECODE_ERRORS = new Set(['NotFoundException', 'ChecksumException', 'FormatException']);
const RECOVERABLE_DECODE_MESSAGES = [
  /No MultiFormat Readers were able to detect the code/i,
  /No barcode or QR code detected/i
];
const CAMERA_CONSTRAINTS = Object.freeze([
  { audio: false, video: { facingMode: { exact: 'environment' } } },
  { audio: false, video: { facingMode: { ideal: 'environment' } } },
  { audio: false, video: true }
]);

const errorName = error => String(error?.name || error?.constructor?.name || 'Error');

export class BarcodeScanner {
  constructor({
    getZXing = () => globalThis.ZXingBrowser,
    getMediaDevices = () => globalThis.navigator?.mediaDevices,
    getPermissions = () => globalThis.navigator?.permissions,
    feedback = new ScanFeedback(),
    logger = globalThis.console
  } = {}) {
    this.getZXing = getZXing;
    this.getMediaDevices = getMediaDevices;
    this.getPermissions = getPermissions;
    this.feedback = feedback;
    this.logger = logger;
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

  log(level, event, detail) {
    const method = this.logger?.[level] || this.logger?.log;
    if (!method) return;
    detail === undefined ? method.call(this.logger, `[Scanner] ${event}`) : method.call(this.logger, `[Scanner] ${event}`, detail);
  }

  prepareFeedback() { this.feedback?.prepare?.(); }

  prepareVideo(video) {
    if (!video) throw new ScannerError('VIDEO_ELEMENT_MISSING', 'Tampilan kamera tidak tersedia. Muat ulang halaman.');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute?.('autoplay', '');
    video.setAttribute?.('muted', '');
    video.setAttribute?.('playsinline', '');
  }

  async inspectPermission(runId) {
    const permissions = this.getPermissions?.();
    if (!permissions?.query) return;
    try {
      const status = await permissions.query({ name: 'camera' });
      if (runId === this.runId) this.log('info', 'permission state', status?.state || 'unknown');
    } catch (error) {
      this.log('debug', 'Permissions API unavailable', errorName(error));
    }
  }

  isRecoverableDecodeError(error) {
    const name = errorName(error);
    if (RECOVERABLE_DECODE_ERRORS.has(name)) return true;
    const description = `${name} ${error?.message || ''}`;
    return /NotFoundException|ChecksumException|FormatException/.test(description) ||
      RECOVERABLE_DECODE_MESSAGES.some(pattern => pattern.test(description));
  }

  canFallback(error) {
    return ['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError', 'DevicesNotFoundError', 'TypeError'].includes(errorName(error));
  }

  async start(video, onResult, onError) {
    await this.stop();
    const runId = ++this.runId;
    this.log('info', 'start', { runId });

    const mediaDevices = this.getMediaDevices?.();
    if (!mediaDevices?.getUserMedia) {
      const error = new ScannerError('MEDIA_API_UNSUPPORTED', 'Browser ini tidak mendukung akses kamera.');
      this.log('error', 'camera error', { code: error.code, message: error.message });
      this.setState(SCANNER_STATE.ERROR, error);
      onError?.(error);
      throw error;
    }
    this.log('info', 'mediaDevices available');

    const ZXing = this.getZXing?.();
    if (!ZXing?.BrowserMultiFormatReader) {
      const error = new ScannerError('DECODER_UNAVAILABLE', 'Scanner tidak dapat dimuat. Periksa koneksi internet.');
      this.log('error', 'camera error', { code: error.code, message: error.message });
      this.setState(SCANNER_STATE.ERROR, error);
      onError?.(error);
      throw error;
    }

    this.prepareVideo(video);
    this.video = video;
    this.setState(SCANNER_STATE.STARTING);
    void this.inspectPermission(runId);

    try {
      const reader = this.reader ||= new ZXing.BrowserMultiFormatReader();
      this.log('info', 'ZXing initialized');
      const callback = (result, decodeError) => {
        if (runId !== this.runId) return;
        if (result) {
          if (this.state !== SCANNER_STATE.SCANNING) return;
          const value = this.acceptDecoded(result.getText());
          if (!value) return;
          this.setState(SCANNER_STATE.DETECTED, value);
          this.feedback?.notify?.();
          void this.stop({ preserveState: true }).then(() => onResult?.(value, result.getBarcodeFormat?.()));
          return;
        }
        if (!decodeError || this.isRecoverableDecodeError(decodeError)) return;
        if (this.state !== SCANNER_STATE.STARTING && this.state !== SCANNER_STATE.SCANNING) return;
        const scannerError = new ScannerError('SCANNER_RUNTIME_ERROR', `Scanner berhenti: ${decodeError.message || errorName(decodeError)}.`, decodeError);
        this.log('error', 'camera error', { name: errorName(decodeError), message: decodeError.message || '' });
        void this.stop({ preserveState: true }).then(() => {
          this.setState(SCANNER_STATE.ERROR, scannerError);
          onError?.(scannerError);
        });
      };

      let controls;
      let lastError;
      for (let attempt = 0; attempt < CAMERA_CONSTRAINTS.length; attempt += 1) {
        if (runId !== this.runId) return false;
        const constraints = CAMERA_CONSTRAINTS[attempt];
        this.log('info', 'getUserMedia', { attempt: attempt + 1, constraints });
        try {
          controls = await reader.decodeFromConstraints(constraints, video, callback);
          break;
        } catch (error) {
          lastError = error;
          this.cleanupVideoStream(video);
          if (attempt < CAMERA_CONSTRAINTS.length - 1 && this.canFallback(error)) {
            this.log('warn', 'camera constraint fallback', { name: errorName(error), attempt: attempt + 1 });
            continue;
          }
          throw error;
        }
      }
      if (!controls && lastError) throw lastError;

      if (runId !== this.runId) {
        try { controls?.stop?.(); } catch {}
        this.cleanupVideoStream(video);
        return false;
      }
      this.controls = controls;
      const stream = video.srcObject;
      this.log('info', 'camera stream acquired', { tracks: stream?.getVideoTracks?.().length ?? stream?.getTracks?.().length ?? 0 });
      this.setState(SCANNER_STATE.SCANNING);
      this.log('info', 'decode started', { runId });
      if (video.paused) void Promise.resolve(video.play?.()).catch(error => this.log('warn', 'video play deferred', errorName(error)));
      return true;
    } catch (cause) {
      if (runId !== this.runId) return false;
      const error = cause instanceof ScannerError ? cause : this.cameraError(cause);
      this.log('error', 'camera error', { name: errorName(cause), code: error.code, message: cause?.message || error.message, constraint: cause?.constraint });
      await this.stop({ preserveState: true });
      this.setState(SCANNER_STATE.ERROR, error);
      onError?.(error);
      throw error;
    }
  }

  cameraError(cause) {
    const name = errorName(cause);
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) {
      return new ScannerError('PERMISSION_DENIED', 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser.', cause);
    }
    if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(name)) {
      return new ScannerError('CAMERA_BUSY', 'Kamera sedang digunakan aplikasi lain.', cause);
    }
    if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(name)) {
      return new ScannerError('CAMERA_UNAVAILABLE', 'Kamera tidak tersedia di perangkat ini.', cause);
    }
    if (['NotSupportedError', 'TypeError'].includes(name)) {
      return new ScannerError('MEDIA_API_UNSUPPORTED', 'Browser ini tidak mendukung akses kamera.', cause);
    }
    const detail = String(cause?.message || name).trim();
    return new ScannerError('CAMERA_ERROR', `Kamera gagal dibuka: ${detail}.`, cause);
  }

  cleanupVideoStream(video) {
    const stream = video?.srcObject;
    stream?.getTracks?.().forEach(track => {
      try { track.stop(); } catch {}
    });
    if (video && 'srcObject' in video) video.srcObject = null;
  }

  async stop({ preserveState = false } = {}) {
    const runId = ++this.runId;
    this.log('info', 'stop', { runId });
    const controls = this.controls;
    const video = this.video;
    this.controls = null;
    this.video = null;
    try { controls?.stop?.(); } catch (error) { this.log('warn', 'controls stop failed', errorName(error)); }
    this.cleanupVideoStream(video);
    if (!preserveState) this.setState(SCANNER_STATE.IDLE);
  }

  acceptDecoded(value) { return String(value ?? '').trim(); }
}
