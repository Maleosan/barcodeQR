import { SCAN_FORMATS } from './domain.js';
export class BarcodeScanner {
  constructor() { this.controls=null; }
  get supportedFormats() { return SCAN_FORMATS; }
  async start(video, onResult, onError) {
    if (!globalThis.ZXingBrowser) throw new Error('Decoder barcode belum tersedia. Muat ulang saat online untuk cache pertama.');
    this.stop(); const reader = new ZXingBrowser.BrowserMultiFormatReader();
    this.controls = await reader.decodeFromConstraints({ audio:false, video:{ facingMode:{ ideal:'environment' }, width:{ideal:1280}, height:{ideal:720} } }, video, (result,error)=>{ if(result) onResult(result.getText(), result.getBarcodeFormat?.()); else if(error && error.name !== 'NotFoundException') onError?.(error); });
  }
  stop() { this.controls?.stop(); this.controls=null; }
  acceptDecoded(value) { return String(value ?? '').trim(); }
}
