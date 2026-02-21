import os
import re
import cv2
import json
import base64
import requests
import numpy as np
from io import BytesIO
from flask import Flask, render_template, request, jsonify
from PIL import Image
from dotenv import load_dotenv
import google.generativeai as genai


load_dotenv()

key = os.getenv('key')
HF_TOKEN = os.getenv('HF_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_KEY')

if not key:
    print("⚠️  WARNING: No OpenRouter API key found in .env!")
else:
    print(f"✅ OpenRouter Key loaded: {key[:8]}...")

if GEMINI_KEY:
    print(f"✅ Gemini Key loaded: {GEMINI_KEY[:8]}...")

if not HF_TOKEN:
    print("⚠️  WARNING: No HuggingFace token found in .env!")
else:
    print(f"✅ HuggingFace Token loaded: {HF_TOKEN[:8]}...")

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

MODEL_NAMES = {
      "google/gemma-3-27b-it:free":      "Gemma 3 27B",    # OpenRouter
     "nvidia/nemotron-nano-12b-vl:free": "Nemotron 12B",   # OpenRouter  
    }


HF_MODELS = [
    "llava-hf/llava-1.5-7b-hf",
    "Salesforce/blip2-opt-2.7b",
]


def preprocess_image(img_pil):
    img_np = np.array(img_pil)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    gray = cv2.resize(gray, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)

    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    is_blurry = laplacian_var < 500
    print(f"[Preprocess] Laplacian variance: {laplacian_var:.1f} → {'BLURRY' if is_blurry else 'CLEAR'}")

    if is_blurry:
        gray = cv2.bilateralFilter(gray, 9, 75, 75)
        blur = cv2.GaussianBlur(gray, (0, 0), 3)
        gray = cv2.addWeighted(gray, 1.5, blur, -0.5, 0)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        binary = cv2.adaptiveThreshold(gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
    else:
        gray = cv2.fastNlMeansDenoising(gray, h=5)
        _, binary = cv2.threshold(gray, 0, 255,
            cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return binary


def img_to_base64(img_pil):
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def build_prompt(mode):
    if mode == 'bill':
        return """Look at this image carefully.
Extract the financial data exactly following these strict rules:
1. EXTRACT ITEMS: List every individual purchased item and its price. If an item appears multiple times, list it multiple times.
2. HANDLE DISCOUNTS: If an item is a discount, coupon, savings, or offer, you MUST output the amount with a MINUS sign (e.g., -50.00).
3. IGNORE TOTALS: DO NOT include "Total", "Subtotal", "Cash given", "Change", "Tax", or "GST" rows.

Respond in this exact JSON format only, nothing else:
[{"item": "Milk", "amount": 50.00}, {"item": "Store Discount", "amount": -10.00}]
If nothing found return exactly: []"""
    elif mode == 'math':
        return """Look at this image carefully.
Find every math calculation visible (additions, subtractions, multiplications).
Include ALL problems on the page, even simple ones like 4 + 3.
Respond in this exact JSON format only, nothing else:
[{"item": "4 + 3", "amount": 7}]
If nothing found return exactly: []"""
    else:
        return """Look at this image carefully.
If it has a bill/receipt: list items and prices. Make discounts negative (e.g., -10.00) and DO NOT include the final total.
If it has math: list ALL expressions and their answers.
Respond in this exact JSON format only, nothing else:
[{"item": "name or expression", "amount": 99.99}]
If nothing found return exactly: []"""


def parse_response(raw):
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw).strip()
    try:
        return json.loads(raw)
    except:
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        return None


def build_calculations(data, source_type):
    calculations = []
    total = 0
    for entry in data:
        item = str(entry.get('item', '')).strip()
        try:
            amount = float(entry.get('amount', 0))
        except:
            continue
        if item and amount != 0:
            calculations.append({
                'expression': item,
                'result': round(amount, 2),
                'type': source_type
            })
            total += amount
    return calculations, round(total, 2)


def ai_fallback(img, mode='auto'):
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for model in MODEL_NAMES:
        try:
            print(f"Trying OpenRouter model: {model}")
            response = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {
                                "url": f"data:image/jpeg;base64,{img_b64}"
                            }}
                        ]
                    }],
                    "temperature": 0.1,
                    "max_tokens": 2048
                },
                timeout=40
            )

            resp_json = response.json()
            if 'error' in resp_json:
                print(f"Model {model} error: {resp_json['error']['message']}")
                continue

            raw = resp_json['choices'][0]['message']['content'].strip()
            print(f"Model {model} raw: {raw[:150]}")

            data = parse_response(raw)
            if not isinstance(data, list) or len(data) == 0:
                continue

            calculations, total = build_calculations(data, 'ai')
            if len(calculations) > 0:
                print(f"✅ OpenRouter success: {model}")
                return calculations, total, MODEL_NAMES[model]

        except Exception as e:
            print(f"Model {model} exception: {e}")
            continue

    print("❌ All OpenRouter models failed")
    return [], 0, None


def hf_fallback(img, mode='auto'):
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for model in HF_MODELS:
        try:
            print(f"Trying HuggingFace model: {model}")
            response = requests.post(
                f"https://api-inference.huggingface.co/models/{model}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {HF_TOKEN}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {
                                "url": f"data:image/jpeg;base64,{img_b64}"
                            }}
                        ]
                    }],
                    "max_tokens": 2048
                },
                timeout=30
            )

            if response.status_code == 503:
                print(f"HF model {model} loading, skipping...")
                continue

            resp_json = response.json()
            raw = resp_json['choices'][0]['message']['content'].strip()
            print(f"HF model {model} raw: {raw[:150]}")

            data = parse_response(raw)
            if not isinstance(data, list) or len(data) == 0:
                continue

            calculations, total = build_calculations(data, 'hf')
            if len(calculations) > 0:
                print(f"✅ HuggingFace success: {model}")
                return calculations, total, "HuggingFace AI"

        except Exception as e:
            print(f"HF model {model} exception: {e}")
            continue

    print("❌ All HuggingFace models failed")
    return [], 0, None

def gemini_fallback(img, mode='auto'):
    if not GEMINI_KEY:
        print("❌ No GEMINI_KEY")
        return [], 0, None
    
    try:
        genai.configure(api_key=GEMINI_KEY)
        # FIX 1: Use a current model instead of the deprecated 1.5 versions
        model = genai.GenerativeModel('gemini-2.5-flash') 
    except Exception as e:
        print(f"Gemini init error: {e}")
        return [], 0, None
        
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)
    
    try:
        response = model.generate_content([
            prompt, 
            # FIX 2: Remove the "inline_data" nested wrapper
            {"mime_type": "image/jpeg", "data": img_b64}
        ])
        raw = response.text.strip()
        print(f"✅ Gemini OK: {raw[:100]}...")
        
        data = parse_response(raw)
        if isinstance(data, list) and data:
            calculations, total = build_calculations(data, 'gemini')
            return calculations, total, "Gemini 2.5 Flash"
    except Exception as e:
        print(f"Gemini error: {e}")
    
    return [], 0, None



def detect_mode(img_pil):
    w, h = img_pil.size
    if h > w * 1.5:
        return 'bill'
    return 'auto'


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/calculate', methods=['POST'])
def calculate():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'})
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'})

    try:
        img = Image.open(file.stream).convert('RGB')

        x1 = request.form.get('x1', type=int)
        y1 = request.form.get('y1', type=int)
        x2 = request.form.get('x2', type=int)
        y2 = request.form.get('y2', type=int)
        if all(v is not None for v in [x1, y1, x2, y2]):
            img = img.crop((min(x1,x2), min(y1,y2), max(x1,x2), max(y1,y2)))

        mode = detect_mode(img)
        print(f"Detected mode: {mode}")

        # Step 1: OpenRouter (online)
        calculations, total, used_model = ai_fallback(img, mode=mode)
        if used_model:
            return jsonify({
                'calculations': calculations,
                'total': round(total, 2),
                'method': used_model,
                'mode': mode,
                'count': len(calculations)
            })

        # Step 2: Gemini (faster than HF)
        calculations, total, used_model = gemini_fallback(img, mode=mode)
        if used_model:
           return jsonify({
                  'calculations': calculations,
                  'total': round(total, 2),
                  'method': used_model,
                  'mode': mode,
                  'count': len(calculations)
            })
        # Step 3: HuggingFace (slowest)
        calculations, total, used_model = hf_fallback(img, mode=mode)
        if used_model:
          return jsonify({
                'calculations': calculations,
                'total': round(total, 2),
                'method': used_model,
                'mode': mode,
                'count': len(calculations)
            })

        # Step 3: Everything failed
        return jsonify({
            'error': '⚠️ All AI models failed. Please try a clearer image or check your internet connection.'
        })

    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'})


if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True)