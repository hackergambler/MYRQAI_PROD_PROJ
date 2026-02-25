// IMAGE VAULT EXTRACTOR
// Reads hidden vault appended after PNG safely

export async function loadImageVault(imgPath){

  try{
    const res = await fetch(imgPath);

    if(!res.ok){
      console.log("🜏 Image fetch failed");
      return null;
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const START = "MYRQAI_VAULT_START";
    const END   = "MYRQAI_VAULT_END";
    const DEEP  = "MYRQAI_VAULT_DEEP";

    const startIndex = findMarker(bytes, START);

    if(startIndex === -1){
      console.log("🜏 No vault start marker");
      return null;
    }

    const endIndex = findMarker(bytes, END);

    const vaultStart = startIndex + START.length;
    const vaultEnd   = endIndex !== -1 ? endIndex : bytes.length;

    if(vaultEnd <= vaultStart){
      console.log("🜏 Vault marker corrupted");
      return null;
    }

    const hiddenBytes = bytes.slice(vaultStart, vaultEnd);

    let hiddenText = "";

    try{
      hiddenText = new TextDecoder().decode(hiddenBytes).trim();
    }catch{
      console.log("🜏 Vault decode failed");
      return null;
    }

    if(!hiddenText){
      console.log("🜏 Empty vault");
      return null;
    }

    console.log("🜏 Vault extracted");

    /* ===============================
       DEEP VAULT DETECTION
    =============================== */

    if(hiddenText.includes(DEEP)){
      const deep = hiddenText.split(DEEP)[1]?.trim();

      if(deep){
        window.__VOID_DEEP_LAYER = deep;
        console.log("🜏 Deep vault detected");
      }
    }

    return hiddenText;

  }catch(err){
    console.log("🜏 Vault load error:", err);
    return null;
  }
}

/* ===============================
   OPTIONAL NOISE LAYER (future use)
================================ */

export function fakeLayer(canvas){
   const ctx = canvas.getContext("2d");
   ctx.fillStyle = "rgba(0,0,0,0.02)";
   ctx.fillRect(0,0,canvas.width,canvas.height);
   console.log("🜏 Noise layer detected");
}

/* ===============================
   MARKER SEARCH (binary safe)
================================ */

function findMarker(bytes, marker){

  const markerBytes = new TextEncoder().encode(marker);

  outer:
  for(let i=0; i <= bytes.length - markerBytes.length; i++){

    for(let j=0; j < markerBytes.length; j++){
      if(bytes[i+j] !== markerBytes[j]){
        continue outer;
      }
    }

    return i;
  }

  return -1;
}