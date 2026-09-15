const FORMATS=['qr_code','ean_13','ean_8','upc_a','upc_e','code_128','code_39','codabar','itf','data_matrix','pdf417','aztec'];
export class WebScanner{
 constructor(video,onResult){this.video=video;this.onResult=onResult;this.stream=null;this.running=false;this.last={value:'',at:0}}
 static async support(){if(!('BarcodeDetector'in globalThis))return{available:false,formats:[]};const supported=await BarcodeDetector.getSupportedFormats();return{available:true,formats:FORMATS.filter(f=>supported.includes(f))}}
 async start(){const support=await WebScanner.support();if(!support.available||!support.formats.length)throw new Error('Browser ini belum menyediakan scanner barcode. Gunakan Chrome/Edge terbaru di Android atau desktop.');this.detector=new BarcodeDetector({formats:support.formats});this.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});this.video.srcObject=this.stream;await this.video.play();this.running=true;this.loop();return support}
 async loop(){if(!this.running)return;try{const codes=await this.detector.detect(this.video);const value=codes[0]?.rawValue?.trim();const now=Date.now();if(value&&(value!==this.last.value||now-this.last.at>1800)){this.last={value,at:now};this.onResult(value)}}catch{}if(this.running)requestAnimationFrame(()=>this.loop())}
 stop(){this.running=false;this.stream?.getTracks().forEach(track=>track.stop());this.video.srcObject=null}
}
