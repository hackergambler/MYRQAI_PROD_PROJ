#!/usr/bin/env python3
"""Generate sample puzzles for The Myrq Protocol: Ghost Signal.

Outputs JSON to stdout (or --out FILE). AES puzzle uses PBKDF2+AES-GCM matching enc:v1 format.
"""
import json, base64, argparse, secrets
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ALPH='ABCDEFGHIJKLMNOPQRSTUVWXYZ'

def b64(s: bytes) -> str:
    return base64.b64encode(s).decode('ascii')

def b64utf8(s: str) -> str:
    return b64(s.encode('utf-8'))

def caesar_encrypt(s: str, k: int) -> str:
    out=[]
    for ch in s.upper():
        if ch in ALPH:
            out.append(ALPH[(ALPH.index(ch)+k)%26])
        else:
            out.append(ch)
    return ''.join(out)

def enc_v1(plaintext: str, passphrase: str, iter_count: int = 120000) -> str:
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iter_count)
    key = kdf.derive(passphrase.encode('utf-8'))
    ct = AESGCM(key).encrypt(iv, plaintext.encode('utf-8'), None)
    obj = { 'v':1, 'alg':'AES-GCM', 'iter':iter_count, 'salt':b64(salt), 'iv':b64(iv), 'ct':b64(ct) }
    blob = b64(json.dumps(obj, separators=(',',':')).encode('utf-8'))
    return 'enc:v1:' + blob

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='')
    args = ap.parse_args()

    shift = 7
    p1_answer = 'SPECTER'
    p1_cipher = caesar_encrypt(p1_answer, shift)

    p2_answer = 'ECHO'
    p3_plain = 'MASTER MANIFEST • FRAGMENT 03\nThe server clock is lying.'
    p3 = enc_v1(p3_plain, p1_answer)

    puzzles = [
      { 'id':'p1', 'title':'The Handshake', 'difficulty':1, 'type':'caesar',
        'prompt': f'Decrypt the handshake. Caesar shift = {shift}. Ciphertext: {p1_cipher}',
        'answer': p1_answer,
        'secret_payload': f"p1::{b64utf8('HANDSHAKE CONFIRMED. Key recovered: SPECTER')}" },
      { 'id':'p2', 'title':'The Static', 'difficulty':2, 'type':'css-noise',
        'prompt':'The answer is hidden in the terminal’s CSS noise. Look for the ghost word in the noise layer.',
        'answer': p2_answer,
        'secret_payload': f"p2::{b64utf8('STATIC CLEARED. The noise whispered: ECHO')}" },
      { 'id':'p3', 'title':'The Deep Breach', 'difficulty':3, 'type':'aes',
        'prompt':'Decrypt the payload. The key was recovered earlier. Paste the fragment into the terminal and decrypt.',
        'answer':'DECRYPT',
        'secret_payload': f"p3::{p3}" },
    ]

    txt = json.dumps(puzzles, indent=2)
    if args.out:
        open(args.out,'w',encoding='utf-8').write(txt)
    else:
        print(txt)

if __name__ == '__main__':
    main()
