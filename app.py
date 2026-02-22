import os
import re
import cv2
import json
import base64
import requests
import numpy as np
from io import BytesIO
from flask import Flask, render_template, request, jsonify
from PIL import Image, ImageEnhance
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

# --- LOAD ALL API KEYS (INCLUDING BACKUPS & HUGGINGFACE) ---
GEMINI_KEYS = [k for k in [os.getenv('GEMINI_KEY'), os.getenv('GEMINI_KEY_BACKUP')] if k]
OPENROUTER_KEYS = [k for k in [os.getenv('key'), os.getenv('OPENROUTER_KEY_BACKUP')] if k]
HF_TOKEN = os.getenv('HF_TOKEN')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

MODEL_NAMES = {
      "google/gemma-3-27b-it:free":      "Gemma 3 27B",
     "nvidia/nemotron-nano-12b-vl:free": "Nemotron 12B",
}

HF_MODELS = [
    "llava-hf/llava-1.5-7b-hf",
    "Salesforce/blip2-opt-2.7b",
]

def enhance_poor_image(img_pil):
    """Mild contrast and sharpness enhancement. Safe for receipts and math sheets."""
    try:
        enhancer = ImageEnhance.Contrast(img_pil)
        img_pil = enhancer.enhance(1.3)
        
        enhancer = ImageEnhance.Sharpness(img_pil)
        img_pil = enhancer.enhance(1.5)
        return img_pil
    except Exception as e:
        print(f"Enhancement failed, using original: {e}")
        return img_pil

def img_to_base64(img_pil):
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

# --- THE GOLDEN PROMPT ---
def build_prompt(mode):
    return """You are an elite financial data extraction AI. Read the image carefully. It may be a printed receipt, a handwritten bill, a list of bare numbers, or math equations.

CRITICAL RULES:
1. UNIVERSAL EXTRACTION: Extract every single purchased item, service, or mathematical equation you see.
2. RECEIPTS & DUPLICATES: Extract every line item exactly as it appears. If an item appears multiple times, extract it multiple times. Do NOT group or remove duplicates.
3. BARE NUMBERS: If you see a vertical list of numbers, extract each one as "Entry 1", "Entry 2", etc., and the number as the amount.
4. MATH EQUATIONS: If you see equations (e.g., "10 + 35"), use the equation as the "item" and calculate the correct result as the "amount".
5. DISCOUNTS/COUPONS: If you see a discount, coupon, or savings, output the amount as a NEGATIVE number (e.g., -5.00).
6. EXCLUDE TOTALS: DO NOT extract summary lines. Ignore "Total", "Subtotal", "Tax", "Balance", "Cash", or "Change". 
7. OUTPUT: Return ONLY a valid JSON array of objects. Do NOT wrap in markdown or add explanations.

EXPECTED FORMAT:
[
    {"item": "Milk", "amount": 4.50},
    {"item": "Entry 1", "amount": 50.00},
    {"item": "10 + 35", "amount": 45.00},
    {"item": "Store Discount", "amount": -1.50}
]
If absolutely no data is found, return exactly: []"""

def parse_response(raw):
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw).strip()
    try:
        return json.loads(raw)
    except:
        match = re.search(r'\[.*?\]', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                return None
        return None

def build_calculations(data, source_type):
    calculations = []
    subtotal = 0
    if not isinstance(data, list):
        return [], 0

    for entry in data:
        if not isinstance(entry, dict): continue
        item = str(entry.get('item', '')).strip()
        try:
            amount = float(entry.get('amount', 0))
        except:
            continue
        if item:
            calculations.append({
                'expression': item,
                'result': round(amount, 2),
                'type': source_type
            })
            subtotal += amount
    return calculations, round(subtotal, 2)

# --- AI PROCESSING WITH FAILSAFES ---
def gemini_fallback(img, mode='auto'):
    if not GEMINI_KEYS: return [], 0, None
    prompt = build_prompt(mode)
    
    for api_key in GEMINI_KEYS:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash') 
            # Send the PIL image directly (Fastest & most stable for Gemini SDK)
            response = model.generate_content(
                [prompt, img], 
                generation_config=genai.GenerationConfig(temperature=0.1)
            )
            raw = response.text.strip()
            data = parse_response(raw)
            if isinstance(data, list) and data:
                calculations, total = build_calculations(data, 'gemini')
                return calculations, total, "Gemini 2.5 Flash"
        except Exception as e:
            print(f"Gemini Key failed: {e}")
            continue
    return [], 0, None

def ai_fallback(img, mode='auto'):
    if not OPENROUTER_KEYS: return [], 0, None
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for api_key in OPENROUTER_KEYS:
        for model in MODEL_NAMES:
            try:
                response = requests.post(
                    url="https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                        ]}],
                        "temperature": 0.1, 
                        "max_tokens": 2048
                    },
                    timeout=45
                )
                resp_json = response.json()
                if 'error' in resp_json: continue
                
                raw = resp_json['choices'][0]['message']['content'].strip()
                data = parse_response(raw)
                if not isinstance(data, list) or len(data) == 0: continue

                calculations, total = build_calculations(data, 'ai')
                if len(calculations) > 0:
                    return calculations, total, MODEL_NAMES[model]
            except Exception as e:
                continue
    return [], 0, None

def hf_fallback(img, mode='auto'):
    if not HF_TOKEN: return [], 0, None
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for model in HF_MODELS:
        try:
            response = requests.post(
                f"https://api-inference.huggingface.co/models/{model}/v1/chat/completions",
                headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
                    ]}],
                    "max_tokens": 2048
                },
                timeout=35
            )
            if response.status_code != 200: continue
            resp_json = response.json()
            raw = resp_json['choices'][0]['message']['content'].strip()
            data = parse_response(raw)
            if not isinstance(data, list) or len(data) == 0: continue

            calculations, total = build_calculations(data, 'hf')
            if len(calculations) > 0:
                return calculations, total, "HuggingFace AI"
        except Exception as e:
            continue
    return [], 0, None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    files = request.files.getlist('images')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'error': 'No files selected'})

    structured_results = []
    grand_total = 0.0
    used_methods = set()

    try:
        for i, file in enumerate(files):
            if file.filename == '': continue
                
            img = Image.open(file.stream).convert('RGB')
            img = enhance_poor_image(img)

            # TRY GEMINI -> THEN OPENROUTER -> THEN HUGGINGFACE
            calcs, subtotal, model = gemini_fallback(img)
            if not model:
                 calcs, subtotal, model = ai_fallback(img)
            if not model:
                 calcs, subtotal, model = hf_fallback(img)

            image_index = i + 1

            if model and calcs:
                used_methods.add(model)
                grand_total += subtotal
                structured_results.append({
                    'index': image_index,
                    'items': calcs,
                    'subtotal': subtotal,
                    'method': model
                })
            else:
                 structured_results.append({
                    'index': image_index,
                    'error': "Could not read data reliably. Please try cropping closer to the text."
                })

        if not structured_results:
             return jsonify({'error': 'No readable data found.'})

        return jsonify({
            'results': structured_results,
            'grand_total': round(grand_total, 2),
            'methods_used': list(used_methods)
        })

    except Exception as e:
        return jsonify({'error': f'Server error: {str(e)}'})

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True, port=5000)