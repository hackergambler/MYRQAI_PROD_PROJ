/**
 * ============================================================
 * VOID VAULT ENGINE v1.2.0 - STABLE BUILD
 * ============================================================
 * Features: Binary Steganography Extraction, Escalate AI, 
 * Deep Vault Layers, and DevTools Anti-Tamper.
 */

let __voidSession = {
    unlockedHints: new Set(),
    lastKey: null,
    wrongAttempts: 0,
    silenceTriggered: false
};

/* ===============================
   IMAGE DATA EXTRACTION
================================ */

/**
 * Extracts hidden text appended to a PNG binary (via copy /b)
 * @param {string} imgPath - Path to the encode_vault.png
 */
export async function loadVaultFromImage(imgPath) {
    try {
        const response = await fetch(imgPath);
        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder();
        const content = decoder.decode(buffer);
        
        // Find the end of the PNG file (IEND chunk)
        const endMarker = "IEND";
        const index = content.lastIndexOf(endMarker);
        
        if (index !== -1) {
            // Data exists after the IEND chunk + 4 bytes for CRC
            const vaultData = content.substring(index + 8).trim();
            if (vaultData) {
                parseVault(vaultData);
                showSystemMessage("binary signal stabilized");
            }
        }
    } catch (err) {
        console.error("🜏 Connection to void lost:", err);
        showSystemMessage("signal lost");
    }
}

/* ===============================
   CORE ACTIVATION & DECRYPTION
================================ */

export function activateVault(payload) {
    console.log("🜏 Vault Engine Activated");
    fakeConsoleMisdirection();

    const parts = payload.split("::");
    if (parts.length < 3) return;

    const key = parts[1];
    const data = parts[2];

    __voidSession.lastKey = key;
    __voidSession.wrongAttempts = 0;

    if (__voidSession.unlockedHints.has(key)) {
        showSystemMessage("memory fragment already observed");
        return;
    }

    __voidSession.unlockedHints.add(key);
    revealHint(data);
}

function revealHint(encryptedHint) {
    const hint = safeDecrypt(encryptedHint);
    if (!hint) {
        showVoidMessage("🜏 corrupted fragment detected");
        return;
    }
    showVoidHint(hint);
    showSystemMessage("fragment decrypted");
}

function safeDecrypt(text) {
    try {
        // Handle Base64 with UTF-8 support
        return decodeURIComponent(escape(atob(text)));
    } catch (e) {
        return null;
    }
}

/* ===============================
   UI RENDER ENGINE
================================ */

function getContainer() {
    return document.querySelector(".void-box") || document.body;
}

function showVoidHint(hint) {
    if (!hint) return;
    const container = getContainer();
    const box = document.createElement("div");
    box.className = "void-hint-box";
    // Check if it's a deep vault fragment
    if (hint.startsWith("⟡")) box.classList.add("deep-layer");
    
    container.appendChild(box);
    whisperText(box, hint);
}

function whisperText(el, text) {
    let i = 0;
    const interval = setInterval(() => {
        if (i >= text.length) {
            clearInterval(interval);
            return;
        }
        el.innerText += text[i++];
    }, 28 + Math.random() * 35);
}

function showVoidMessage(msg) {
    const container = getContainer();
    let box = document.getElementById("void-message");
    if (!box) {
        box = document.createElement("div");
        box.id = "void-message";
        box.className = "void-hint-box system-msg";
        container.appendChild(box);
    }
    box.innerText = msg;
}

function showSystemMessage(msg) {
    const el = document.getElementById("status");
    if (el) el.innerText = msg;
}

/* ===============================
   VAULT PARSER
================================ */

export function parseVault(vaultText) {
    const map = new Map();
    vaultText.split("\n").forEach(line => {
        const clean = line.trim();
        if (!clean || clean.startsWith("#")) return;

        const parts = clean.split("::");
        if (parts.length === 2) {
            map.set(parts[0].trim(), parts[1].trim());
        }
    });
    window.__VOID_HINT_MAP = map;
    console.log("🜏 Vault Loaded:", map.size, "hints");
}

/* ===============================
   KEY UNLOCK LOGIC
================================ */

export function unlockHintByKey(key) {
    if (!key) return;

    // Check Layer 2 (Deep Vault)
    if (window.__VOID_DEEP_MAP && window.__VOID_DEEP_MAP.has(key)) {
        unlockDeepVault(key);
        return;
    }

    if (!window.__VOID_HINT_MAP) {
        showSystemMessage("signal not ready");
        return;
    }

    const encrypted = window.__VOID_HINT_MAP.get(key);
    if (!encrypted) {
        handleFailedAttempt();
        return;
    }

    activateVault(`VOID::${key}::${encrypted}`);
}

function handleFailedAttempt() {
    __voidSession.wrongAttempts++;
    if (Math.random() < 0.35) {
        showVoidMessage("🜏 corrupted fragment: " + corruptedHint());
    } else {
        showVoidMessage("🜏 " + escalateVoidResponse(__voidSession.wrongAttempts));
    }
    showSystemMessage("fragment mismatch");
}

/* ===============================
   NARRATIVE ELEMENTS (FLAVOR)
================================ */

function escalateVoidResponse(count) {
    const map = ["signal rejected", "observer detected", "pattern incomplete", "curiosity logged", "the vault is watching"];
    return map[Math.min(count - 1, map.length - 1)];
}

function corruptedHint() {
    const fake = ["rotate image 180°", "binary layer incomplete", "alpha channel missing", "mirror cipher detected"];
    return fake[Math.floor(Math.random() * fake.length)];
}

function fakeConsoleMisdirection() {
    setTimeout(() => {
        const fakeHints = ["🜏 Secret is in filename", "🜏 Use color invert", "🜏 Check network packets", "🜏 Look inside metadata"];
        console.log("%c" + fakeHints[Math.floor(Math.random() * fakeHints.length)], "color:#00ff9f;font-weight:bold");
    }, 1200);
}

/* ===============================
   DEEP VAULT (LAYER 2)
================================ */

function parseDeepVault() {
    if (!window.__VOID_DEEP_LAYER) return;
    const map = new Map();
    window.__VOID_DEEP_LAYER.split("\n").forEach(line => {
        const clean = line.trim();
        if (!clean || clean.startsWith("#")) return;
        const parts = clean.split("::");
        if (parts.length === 2) map.set(parts[0].trim(), parts[1].trim());
    });
    window.__VOID_DEEP_MAP = map;
    console.log("🜏 Deep Vault Loaded:", map.size);
}

function unlockDeepVault(key) {
    const encrypted = window.__VOID_DEEP_MAP.get(key);
    const hint = safeDecrypt(encrypted);
    if (!hint) {
        showVoidMessage("🜏 deep fragment corrupted");
        return;
    }
    console.log("%c🜏 Deep Vault Accessed", "color:#ff00ff");
    showVoidHint("⟡ " + hint);
}

/* ===============================
   SECURITY & AUTOMATION
================================ */

// Initialize Deep Vault after load
setTimeout(parseDeepVault, 1500);

// Auto-reveal a random fragment if the user is too quiet
setTimeout(() => {
    if (__voidSession.silenceTriggered || !window.__VOID_HINT_MAP) return;
    const keys = Array.from(window.__VOID_HINT_MAP.keys());
    if (keys.length) {
        __voidSession.silenceTriggered = true;
        unlockHintByKey(keys[Math.floor(Math.random() * keys.length)]);
    }
}, 25000);

// Persistence Check
if (sessionStorage.getItem("voidVisited")) {
    console.log("%c🜏 you returned", "color:#ff004c");
} else {
    sessionStorage.setItem("voidVisited", "1");
}

// Anti-Investigator Trap
setInterval(() => {
    const t = performance.now();
    debugger; // This pauses execution if DevTools is open
    if (performance.now() - t > 140) {
        console.log("%c🜏 Investigator detected", "color:red;font-weight:bold");
    }
}, 4000);