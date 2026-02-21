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

key = os.getenv('key')
HF_TOKEN = os.getenv('HF_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_KEY')

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

# --- IMAGE ENHANCEMENT FOR POOR PHOTOS ---
def enhance_poor_image(img_pil):
    """Enhances contrast and sharpness for messy or rough photos before AI processing."""
    try:
        # Boost contrast by 20%
        enhancer = ImageEnhance.Contrast(img_pil)
        img_pil = enhancer.enhance(1.2)
        
        # Boost sharpness by 50% to make text edges crisp
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

def build_prompt(mode):
    return """Look at this image carefully. It contains a bill or receipt, potentially handwritten.
Extract the financial data. If handwriting is messy, use context to infer items.

CRITICAL RULES:
1. NO REPETITION: Do NOT list the same item multiple times unless it is actually written multiple times on the document.
2. EXTRACT ITEMS: List individual purchased items and their exact prices.
3. HANDLE DISCOUNTS: If an item is clearly a discount or savings, output the amount with a MINUS sign (e.g., -50.00).
4. IGNORE TOTALS: Do NOT include sub-totals, grand totals, or tax summary lines.

Respond in this exact JSON format only:
[{"item": "Name of item 1", "amount": 50.00}, {"item": "Name of item 2", "amount": 120.00}]
If absolutely no item data can be found, return exactly: []"""

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
        if item and amount != 0:
            calculations.append({
                'expression': item,
                'result': round(amount, 2),
                'type': source_type
            })
            subtotal += amount
    return calculations, round(subtotal, 2)

def ai_fallback(img, mode='auto'):
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for model in MODEL_NAMES:
        try:
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
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for model in HF_MODELS:
        try:
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

def gemini_fallback(img, mode='auto'):
    if not GEMINI_KEY: return [], 0, None
    try:
        genai.configure(api_key=GEMINI_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash') 
    except Exception as e:
        return [], 0, None
        
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)
    
    try:
        response = model.generate_content([
            prompt, 
            {"mime_type": "image/jpeg", "data": img_b64}
        ], generation_config=genai.GenerationConfig(temperature=0.1))
        raw = response.text.strip()
        data = parse_response(raw)
        if isinstance(data, list) and data:
            calculations, total = build_calculations(data, 'gemini')
            return calculations, total, "Gemini 2.5 Flash"
    except Exception as e:
        print(f"Gemini error: {e}")
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

            # Crop if user selected an area
            if len(files) == 1 and request.form.get('x1'):
                try:
                    x1 = request.form.get('x1', type=int)
                    y1 = request.form.get('y1', type=int)
                    x2 = request.form.get('x2', type=int)
                    y2 = request.form.get('y2', type=int)
                    img = img.crop((min(x1,x2), min(y1,y2), max(x1,x2), max(y1,y2)))
                except: pass
            
            # --- APPLY IMAGE ENHANCEMENT ---
            img = enhance_poor_image(img)

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
                    'error': "Could not read data reliably."
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