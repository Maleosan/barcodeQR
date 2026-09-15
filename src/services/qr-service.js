const SIZE=21, DATA_COUNT=19, ERROR_COUNT=7;
export function qrMatrix(identifier) {
  const bytes=[...new TextEncoder().encode(String(identifier))]; if(!bytes.length||bytes.length>17)throw new Error('Kode QR harus berisi 1–17 byte.');
  const bits=[]; append(bits,4,4);append(bits,bytes.length,8);bytes.forEach(byte=>append(bits,byte,8));
  for(let index=0;index<4&&bits.length<DATA_COUNT*8;index++)bits.push(0);
  while(bits.length<DATA_COUNT*8&&bits.length%8)bits.push(0);
  while(bits.length<DATA_COUNT*8)append(bits,((bits.length/8)%2)?0x11:0xec,8);
  const data=Array.from({length:DATA_COUNT},(_,index)=>Number.parseInt(bits.slice(index*8,index*8+8).join(''),2));const words=[...data,...errorCorrection(data)];
  const modules=Array.from({length:SIZE},()=>Array(SIZE).fill(false));const reserved=Array.from({length:SIZE},()=>Array(SIZE).fill(false));const set=(row,column,value)=>{if(row>=0&&column>=0&&row<SIZE&&column<SIZE){modules[row][column]=value;reserved[row][column]=true;}};
  finder(set,3,3);finder(set,3,SIZE-4);finder(set,SIZE-4,3);for(let index=8;index<SIZE-8;index++){set(6,index,index%2===0);set(index,6,index%2===0);}set(SIZE-8,8,true);format(set);
  let bit=0,up=true;for(let right=SIZE-1;right>0;right-=2){if(right===6)right--;for(let vertical=0;vertical<SIZE;vertical++){const row=up?SIZE-1-vertical:vertical;for(let offset=0;offset<2;offset++){const column=right-offset;if(reserved[row][column])continue;const value=bit<words.length*8?(words[bit>>>3]>>>(7-(bit&7)))&1:0;modules[row][column]=Boolean(value^((row+column)%2===0));bit++;}}up=!up;}return modules;
}
function append(bits,value,length){for(let bit=length-1;bit>=0;bit--)bits.push((value>>>bit)&1);}
function finder(set,row,column){for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){const distance=Math.max(Math.abs(x),Math.abs(y));set(row+y,column+x,distance!==2&&distance!==4);}}
function format(set){const value=0x77c4;for(let bit=0;bit<15;bit++){const dark=Boolean((value>>>bit)&1);if(bit<6)set(bit,8,dark);else if(bit<8)set(bit+1,8,dark);else set(SIZE-15+bit,8,dark);if(bit<8)set(8,SIZE-bit-1,dark);else if(bit===8)set(8,7,dark);else set(8,14-bit,dark);}}
function errorCorrection(data){const exp=Array(512),log=Array(256);let value=1;for(let i=0;i<255;i++){exp[i]=value;log[value]=i;value<<=1;if(value&256)value^=0x11d;}for(let i=255;i<512;i++)exp[i]=exp[i-255];const multiply=(a,b)=>a&&b?exp[log[a]+log[b]]:0;let polynomial=[1];for(let i=0;i<ERROR_COUNT;i++){const next=Array(polynomial.length+1).fill(0);polynomial.forEach((part,index)=>{next[index]^=part;next[index+1]^=multiply(part,exp[i]);});polynomial=next;}const message=[...data,...Array(ERROR_COUNT).fill(0)];data.forEach((_,index)=>{const factor=message[index];if(factor)polynomial.forEach((part,offset)=>message[index+offset]^=multiply(part,factor));});return message.slice(-ERROR_COUNT);}
export function qrSvg(identifier,pixels=480){const matrix=qrMatrix(identifier),quiet=4;let path='';matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;}));return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE+quiet*2} ${SIZE+quiet*2}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;}
export function downloadQr(identifier){const url=URL.createObjectURL(new Blob([qrSvg(identifier)],{type:'image/svg+xml'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`QR-${identifier}.svg`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
