/**
 * MYRQAI GhostTrace Engine - CLOUDFLARE EDITION
 * Logic: XOR Encryption + 100-Char Limit + Idle Reset + 2m Hard Burn
 */

// 1. Audio Assets
const beep = new Audio('https://www.soundjay.com/buttons/button-20.mp3');
beep.volume = 0.1;

// 2. Identity & Room Setup
let secretKey = window.location.hash.substring(1);
if (!secretKey || secretKey.length < 10) {
    secretKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    window.location.hash = secretKey;
}
const roomId = secretKey.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
const chatBox = document.getElementById('chat-box');
const input = document.getElementById('msg-input');

if (input) {
    input.setAttribute('maxlength', '100');
}

// 3. Connection Config
const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const host = isLocal ? "127.0.0.1:8787" : window.location.host;
const socketUrl = `${protocol}${host}/api/ghost/${roomId}`;

let socket;
let isDead = false; 

// 4. Connection Handlers
function initSocket() {
    if (isDead) return;
    
    socket = new WebSocket(socketUrl);

    socket.onopen = () => {
        const light = document.getElementById('status-light');
        if (light) light.classList.add('online');
        systemMessage("ENCRYPTION ACTIVE: UPLINK ESTABLISHED");
        
        // Auto-Destruct Warning (at 90 seconds of the 120 second life)
        setTimeout(() => {
            if (!isDead) systemMessage("CRITICAL: 30 SECONDS UNTIL TERMINATION.");
        }, 90000); 
    };

    socket.onmessage = (event) => {
        try {
            const packet = JSON.parse(event.data);
            
            // Handle standard ghost messages
            if (packet.type === 'ghost-msg') {
                const decrypted = xorCipher(atob(packet.data), secretKey);
                beep.play().catch(() => {}); 
                displayMessage(decrypted, 'them');
            } 
            // Handle system errors (Idle kick, Expiry, etc.)
            else if (packet.type === 'sys-err') {
                systemMessage("ALERT: " + packet.data);
                if (packet.data.includes("TERMINATION") || packet.data.includes("EXPIRED") || packet.data.includes("VIOLATION")) {
                    terminateAndRedirect();
                }
            }
        } catch (e) {
            console.error("❌ INCOMING PACKET CORRUPT");
        }
    };

    socket.onclose = (e) => {
        const light = document.getElementById('status-light');
        if (light) light.classList.remove('online');
        
        // 1001 = Going Away, 1008 = Policy/Idle Violation
        if (e.code === 1001 || e.code === 1008 || isDead) {
            terminateAndRedirect();
        } else if (!isDead) {
            console.log("Reconnecting...");
            setTimeout(() => initSocket(), 2000);
        }
    };

    socket.onerror = (err) => console.error("WS_ERROR:", err);
}

// 5. Hard Exit Logic
function terminateAndRedirect() {
    if (isDead) return;
    isDead = true;
    if (socket) socket.close();
    
    if (chatBox) chatBox.innerHTML = '<div class="msg them">[SYSTEM] SIGNAL PURGED. REDIRECTING...</div>';
    window.location.hash = "";
    
    setTimeout(() => {
        window.location.href = "../index.html";
    }, 2000);
}

// 6. XOR Encryption
function xorCipher(text, key) {
    return text.split('').map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    ).join('');
}

// 7. Typewriter Effect
function typeEffect(element, text, speed = 20) {
    let i = 0;
    element.textContent = ''; 
    const timer = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            clearInterval(timer);
        }
    }, speed);
}

// 8. Transmit Logic
async function sendMessage() {
    if (isDead) return;

    if (!input || !socket || socket.readyState !== WebSocket.OPEN) {
        systemMessage("ERROR: NO ACTIVE UPLINK.");
        return;
    }

    const text = input.value.trim();
    if (!text) return;
    
    if (text.length > 100) {
        systemMessage("DATA OVERFLOW: 100 CHAR LIMIT");
        return;
    }

    try {
        // RESET the frontend idle timer in ghost.html
        if (typeof window.idleSeconds !== 'undefined') {
            window.idleSeconds = 0; 
        }

        // 1. Encrypt text
        // 2. Base64 encode the XOR result
        const encrypted = btoa(xorCipher(text, secretKey));
        
        // 3. SEND AS JSON (Worker expects this structure)
        const payload = JSON.stringify({ 
            type: 'ghost-msg', 
            data: encrypted 
        });
        
        socket.send(payload); 
        
        displayMessage(text, 'me');
        input.value = '';
        input.focus();
    } catch (e) {
        console.error("TRANSMIT_ERR:", e);
        systemMessage("TRANSMIT FAILED.");
    }
}

// 9. UI Binding
window.sendMessage = sendMessage;
window.initSocket = initSocket;

// 10. Display & 8-Second Fuel Burn
function displayMessage(text, type) {
    if (!chatBox) return;

    const div = document.createElement('div');
    div.className = `msg ${type}`;
    
    const content = document.createElement('div');
    div.appendChild(content);

    const fuelContainer = document.createElement('div');
    fuelContainer.className = 'fuel-container';
    const fuelBar = document.createElement('div');
    fuelBar.className = 'fuel-bar';
    fuelContainer.appendChild(fuelBar);
    div.appendChild(fuelContainer);

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    typeEffect(content, text);

    setTimeout(() => {
        fuelBar.style.transition = "width 8s linear";
        fuelBar.classList.add('empty');
    }, 50);

    setTimeout(() => {
        div.style.opacity = "0";
        div.style.transform = "translateX(10px)";
        setTimeout(() => div.remove(), 500);
    }, 8000); 
}

function systemMessage(text) {
    displayMessage("[SYS] " + text, 'them');
}