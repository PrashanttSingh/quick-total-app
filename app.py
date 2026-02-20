import os
import re
import cv2
import json
import base64
import requests
import numpy as np
import ollama
from io import BytesIO
from flask import Flask, render_template, request, jsonify
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

key = os.getenv('key')
if not key:
    print("⚠️  WARNING: No API key found in .env!")
else:
    print(f"✅ Key loaded: {key[:8]}...")

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

MODEL_NAMES = {
    "google/gemma-3-27b-it:free":                    "Gemma 3 27B",
    "nvidia/nemotron-nano-12b-v2-vl:free":           "Nemotron 12B",
    "meta-llama/llama-3.2-11b-vision-instruct:free": "Llama 3.2 11B",
}


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


# ✅ NEW: Ollama offline fallback (replaces Tesseract)
def ollama_fallback(img_pil, mode='bill'):
    if mode == 'bill':
        prompt = """Look at this image carefully.
List every item and its price you can see.
IMPORTANT: If the same item appears multiple times, list it multiple times.
Respond in this exact JSON format only, nothing else:
[{"item": "item name", "amount": 99.99}]
Do not include total, tax, GST rows.
If nothing found return exactly: []"""
    elif mode == 'math':
        prompt = """Look at this image carefully.
Find every math calculation visible (additions, subtractions, multiplications).
Include ALL problems on the page, even simple ones like 4 + 3.
Respond in this exact JSON format only, nothing else:
[{"item": "4 + 3", "amount": 7}]
If nothing found return exactly: []"""
    else:
        prompt = """Look at this image carefully.
If it has a bill/receipt: list items and prices. List repeated items multiple times.
If it has math: list ALL expressions and their answers.
Respond in this exact JSON format only, nothing else:
[{"item": "name or expression", "amount": 99.99}]
If nothing found return exactly: []"""

    img_b64 = img_to_base64(img_pil)

    try:
        print("Trying Ollama offline: llava:7b (fast)")
        response = ollama.chat(
            model='llava:7b',
            messages=[{
                'role': 'user',
                'content': prompt,
                'images': [img_b64]
            }]
        )
        raw = response['message']['content'].strip()
        print(f"Ollama raw: {raw[:150]}")

        raw = re.sub(r'```json\s*', '', raw)
        raw = re.sub(r'```\s*', '', raw).strip()

        try:
            data = json.loads(raw)
        except:
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if not match:
                print("Ollama: No JSON found")
                return [], 0
            data = json.loads(match.group())

        if not isinstance(data, list) or len(data) == 0:
            return [], 0

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
                    'type': 'ollama'
                })
                total += amount

        print(f"✅ Ollama success: {len(calculations)} items")
        return calculations, round(total, 2)

    except Exception as e:
        print(f"Ollama failed: {e}")
        return [], 0


def ai_fallback(img, mode='auto'):
    models = [
        "google/gemma-3-27b-it:free",
        "nvidia/nemotron-nano-12b-v2-vl:free",
        "meta-llama/llama-3.2-11b-vision-instruct:free",
    ]

    if mode == 'bill':
        prompt = """Look at this image carefully.
List every item and its price you can see.
IMPORTANT: If the same item appears multiple times, list it multiple times.
Respond in this exact JSON format only, nothing else:
[{"item": "item name", "amount": 99.99}]
Do not include total, tax, GST rows.
If nothing found return exactly: []"""
    elif mode == 'math':
        prompt = """Look at this image carefully.
Find every math calculation visible (additions, subtractions, multiplications).
Include ALL problems on the page, even simple ones like 4 + 3.
Respond in this exact JSON format only, nothing else:
[{"item": "4 + 3", "amount": 7}]
If nothing found return exactly: []"""
    else:
        prompt = """Look at this image carefully.
If it has a bill/receipt: list items and prices. List repeated items multiple times.
If it has math: list ALL expressions and their answers.
Respond in this exact JSON format only, nothing else:
[{"item": "name or expression", "amount": 99.99}]
If nothing found return exactly: []"""

    img_b64 = img_to_base64(img)

    for model in models:
        try:
            print(f"Trying model: {model}")
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

            raw = re.sub(r'```json\s*', '', raw)
            raw = re.sub(r'```\s*', '', raw).strip()

            try:
                data = json.loads(raw)
            except:
                match = re.search(r'\[.*\]', raw, re.DOTALL)
                if not match:
                    continue
                data = json.loads(match.group())

            if not isinstance(data, list) or len(data) == 0:
                continue

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
                        'type': 'ai'
                    })
                    total += amount

            if len(calculations) > 0:
                print(f"✅ Success with model: {model}")
                display_name = MODEL_NAMES.get(model, model)
                return calculations, round(total, 2), display_name

        except Exception as e:
            print(f"Model {model} exception: {e}")
            continue

    print("❌ All online models failed")
    return [], 0, None


def detect_mode(img_pil):
    # Mode detection via image shape only (no Tesseract needed)
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

        calculations = []
        total = 0
        method = 'AI'

        # Step 1: Try online AI (OpenRouter)
        calculations, total, used_model = ai_fallback(img, mode=mode)
        if used_model:
            method = used_model

        # Step 2: If online fails → Ollama offline
        if len(calculations) == 0:
            print("Online AI failed → trying Ollama offline...")
            calculations, total = ollama_fallback(img, mode=mode)
            if len(calculations) > 0:
                method = 'Ollama (Offline)'

        if len(calculations) == 0:
            return jsonify({
                'error': '⚠️ Both online AI and Ollama failed. Make sure Ollama is running: ollama serve'
            })

        return jsonify({
            'calculations': calculations,
            'total': round(total, 2),
            'method': method,
            'mode': mode,
            'count': len(calculations)
        })

    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'})


if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True)
