import os
import re
import cv2
import json
import base64
import requests
import numpy as np
import pytesseract
from io import BytesIO
from flask import Flask, render_template, request, jsonify
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

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
    gray = cv2.resize(gray, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    thresh = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return thresh


def is_clean_expression(expr_clean):
    ops = re.findall(r'[+\-*/]', expr_clean)
    if len(ops) > 3:
        return False
    if len(ops) >= 3 and len(set(ops)) > 1:
        return False
    return True


def extract_calculations(text):
    calculations = []
    total = 0
    seen = set()
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        match = re.search(r'(\d+\s*[+\-x*/÷]\s*\d+(?:\s*[+\-x*/÷]\s*\d+)*)', line)
        if match:
            expr = match.group(1)
            expr_clean = re.sub(r'\s+', '', expr.replace('x', '*').replace('÷', '/'))
            if re.match(r'^\d+(?:[+\-*/]\d+)+$', expr_clean):
                if expr_clean not in seen and is_clean_expression(expr_clean):
                    seen.add(expr_clean)
                    try:
                        line_total = eval(expr_clean)
                        if abs(line_total) > 99999:
                            continue
                        calculations.append({
                            'expression': expr.strip(),
                            'result': round(line_total, 2),
                            'type': 'math'
                        })
                        total += line_total
                    except:
                        continue
    return calculations, round(total, 2)


def extract_bill_items(text):
    items = []
    total = 0
    skip_words = ['total', 'subtotal', 'tax', 'gst', 'date',
                  'time', 'phone', 'bill no', 'invoice', 'thank']
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if any(w in line.lower() for w in skip_words):
            continue
        match = re.search(
            r'([a-zA-Z][\w\s]{0,25}?)\s+[₹Rs.]?\s*(\d{1,6}(?:\.\d{1,2})?)\s*$', line)
        if match:
            item_name = match.group(1).strip()
            amount = float(match.group(2))
            if 0 < amount < 100000:
                items.append({
                    'expression': item_name,
                    'result': amount,
                    'type': 'bill'
                })
                total += amount
    return items, round(total, 2)


def img_to_base64(img_pil):
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def ai_fallback(img, mode='auto'):
    models = [
        "google/gemma-3-27b-it:free",
        "nvidia/nemotron-nano-12b-v2-vl:free",
        "meta-llama/llama-3.2-11b-vision-instruct:free",
    ]

    if mode == 'bill':
        prompt = """Look at this image carefully.
List every item and its price you can see.
Respond in this exact JSON format only, nothing else:
[{"item": "item name", "amount": 99.99}]
Do not include total, tax, GST rows.
If nothing found return exactly: []"""

    elif mode == 'math':
        prompt = """Look at this image carefully.
Find every math calculation visible.
Respond in this exact JSON format only, nothing else:
[{"item": "4 + 2", "amount": 6}]
If nothing found return exactly: []"""

    else:
        prompt = """Look at this image carefully.
If it has a bill/receipt: list items and prices.
If it has math: list expressions and answers.
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
                    "max_tokens": 2048  # ✅ ADDED — prevents cutting off long lists
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
            raw = re.sub(r'```\s*', '', raw)
            raw = raw.strip()

            try:
                data = json.loads(raw)
            except:
                match = re.search(r'\[.*\]', raw, re.DOTALL)
                if not match:
                    print(f"Model {model}: No JSON found, trying next...")
                    continue
                data = json.loads(match.group())

            if not isinstance(data, list) or len(data) == 0:
                print(f"Model {model}: Empty result, trying next...")
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

    print("❌ All models failed")
    return [], 0, None


def detect_mode(text, img_pil):
    bill_keywords = ['rs', '₹', '$', '€', 'total', 'price', 'amount',
                     'qty', 'item', 'receipt', 'invoice', 'bill',
                     'tax', 'gst', 'mrp', 'rate', 'paid', 'cash']
    math_keywords = ['=', '+', '-', 'x', '÷', 'worksheet', 'exercise']

    text_lower = text.lower()
    bill_score = sum(1 for kw in bill_keywords if kw in text_lower)
    math_score = sum(1 for kw in math_keywords if kw in text_lower)

    w, h = img_pil.size
    if h > w * 1.5:
        bill_score += 2

    if bill_score == 0 and math_score == 0:
        return 'bill'

    return 'bill' if bill_score >= math_score else 'math'


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

        processed = preprocess_image(img)
        raw_text = pytesseract.image_to_string(processed, config='--psm 3')
        mode = detect_mode(raw_text, img)
        print(f"Detected mode: {mode}")

        calculations = []
        total = 0
        method = 'Tesseract'

        if mode == 'bill':
            calculations, total, used_model = ai_fallback(img, mode='bill')
            method = used_model or 'AI'

        else:
            calculations, total, used_model = ai_fallback(img, mode='math')
            method = used_model or 'AI'

            if len(calculations) == 0:
                print("AI failed, trying Tesseract...")
                for psm in [3, 6, 11]:
                    config = f'--psm {psm} -c tessedit_char_whitelist=0123456789+-x=()./÷ '
                    text = pytesseract.image_to_string(processed, config=config)
                    calcs, t = extract_calculations(text)
                    if len(calcs) >= 2 and all(
                        is_clean_expression(
                            re.sub(r'\s+', '', c['expression'].replace('x', '*'))
                        ) for c in calcs
                    ):
                        calculations, total = calcs, t
                        method = 'Tesseract'
                        break

        if len(calculations) == 0:
            print("Trying auto mode as last resort...")
            calculations, total, used_model = ai_fallback(img, mode='auto')
            method = used_model or 'AI'

        if len(calculations) == 0:
            return jsonify({
                'error': 'Nothing detected — ensure good lighting and image is not blurry'
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
