import { BARCODE_FORMATS } from '../core/constants.js';
const ZXING_URL='https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';
export class ScannerService {
  constructor(video,onResult) { this.video=video; this.onResult=onResult; this.stopHandle=null; this.lastValue=''; this.lastAt=0; }
  async start() {
    await this.stop();
    try { return await this.startZxing(); }
    catch (zxingError) {
      if ('BarcodeDetector' in globalThis) return this.startNative(zxingError);
      throw new Error(`Decoder barcode tidak dapat dimuat. Periksa koneksi internet pertama kali. ${zxingError.message}`);
    }
  }
  async startZxing() {
    const zxing=await import(ZXING_URL); const reader=new zxing.BrowserMultiFormatReader();
    const controls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},this.video,(result,error)=>{if(result)this.emit(result.getText());else if(error && error.name!=='NotFoundException') console.debug('Scanner frame:',error.name);});
    this.stopHandle=()=>controls.stop(); return {engine:'ZXing Browser',formats:BARCODE_FORMATS};
  }
  async startNative(zxingError) {
    const supported=await BarcodeDetector.getSupportedFormats(); const formats=BARCODE_FORMATS.filter(format=>supported.includes(format));
    if (!formats.length) throw zxingError; const detector=new BarcodeDetector({formats});
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
    this.video.srcObject=stream; await this.video.play(); let running=true;
    const loop=async()=>{if(!running)return;try{const result=(await detector.detect(this.video))[0];if(result)this.emit(result.rawValue);}catch{}requestAnimationFrame(loop);}; loop();
    this.stopHandle=()=>{running=false;stream.getTracks().forEach(track=>track.stop());}; return {engine:'BarcodeDetector fallback',formats};
  }
  emit(rawValue) { const value=String(rawValue??'').trim(); const now=Date.now(); if (!value||(value===this.lastValue&&now-this.lastAt<1800)) return; this.lastValue=value;this.lastAt=now;this.onResult(value); }
  async stop() { this.stopHandle?.(); this.stopHandle=null; if(this.video?.srcObject){this.video.srcObject.getTracks().forEach(track=>track.stop());this.video.srcObject=null;} }
}
export { ZXING_URL };
