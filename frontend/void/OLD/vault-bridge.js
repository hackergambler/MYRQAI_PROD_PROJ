// VOID BRIDGE
// Silent listener — does nothing unless vault signature detected

(function(){

  window.__voidBridge = {
    inspect(payload){
      if(!payload) return;

      // vault signature check
      if(typeof payload === "string" && payload.startsWith("VOID::")){
        console.log("🜏 VOID artifact detected");
        import("/void/vault-engine.js").then(v=>{
          v.activateVault(payload);
        });
      }
    }
  };

})();