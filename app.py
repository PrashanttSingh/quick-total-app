import os
import re
import cv2
import json
import base64
import requests
import time
from datetime import datetime
import numpy as np
from io import BytesIO
from flask import Flask, render_template, request, jsonify
from PIL import Image, ImageEnhance
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

# --- API KEYS ---
GEMINI_KEYS = [k for k in [os.getenv('GEMINI_KEY_1'), os.getenv('GEMINI_KEY_2'), os.getenv('GEMINI_KEY_3'), os.getenv('GEMINI_KEY_4'), os.getenv('GEMINI_KEY_5')] if k]
OPENROUTER_KEYS = [k for k in [os.getenv('OPENROUTER_KEY_1'), os.getenv('OPENROUTER_KEY_2'), os.getenv('OPENROUTER_KEY_3'), os.getenv('OPENROUTER_KEY_4'), os.getenv('OPENROUTER_KEY_5')] if k]
GITHUB_KEY = os.getenv('GITHUB_TOKEN')
GROQ_KEY = os.getenv('GROQ_API_KEY')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

MODEL_NAMES = {
    "openrouter:openai/gpt-4o": "GPT-4o (Premium)",
    "github:gpt-4o-mini": "GitHub GPT-4o-Mini",
    "groq:meta-llama/llama-4-scout-17b-16e-instruct": "Groq Llama 4 Scout",
    "openrouter:google/gemma-3-27b-it:free": "Gemma 3 27B",
    "openrouter:nvidia/nemotron-nano-12b-v2-vl:free": "Nemotron V2"
}

def get_latest_batch_id():
    log_file = "processing_logs.md"
    if not os.path.isfile(log_file): return 0
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            matches = re.findall(r'\|\s*(?:\*\*)?Batch (\d+)(?:\*\*)?\s*\|', f.read())
            if matches: return int(max(matches, key=int))
    except: pass
    return 0

def log_performance(batch_id, display_time, filename, image_count, status, timeline_list, time_taken, img_qual, ai_acc):
    log_file = "processing_logs.md"
    file_exists = os.path.isfile(log_file)
    timeline_str = "<br>".join(timeline_list)
    with open(log_file, mode='a', encoding='utf-8') as f:
        if not file_exists:
            f.write("# 📊 QuickTotal AI Journey Logs\n\n| Batch ID | Time & Date | File | Count | Status | Processing Timeline | Total Time | **Quality** | **Accuracy** |\n|---|---|---|---|---|---|---|---|---|\n")
        status_icon = "✅ Success" if status == "Success" else "❌ Failed"
        qual_display = f"<b>{img_qual}%</b>" if img_qual != "-" else "-"
        acc_display = f"<b>{ai_acc}</b>" if ai_acc != "-" else "-"
        f.write(f"| {batch_id} | {display_time} | `{filename}` | {image_count} | {status_icon} | {timeline_str} | {time_taken}s | {qual_display} | {acc_display} |\n")

def enhance_poor_image(img_pil):
    try:
        img_pil = ImageEnhance.Contrast(img_pil).enhance(1.3)
        return ImageEnhance.Sharpness(img_pil).enhance(1.5)
    except: return img_pil

def calculate_ink_density_score(img_pil):
    try:
        open_cv_image = np.array(img_pil.convert('RGB'))
        gray = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
        _, thresh = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY)
        total_pixels = thresh.size
        black_pixels = total_pixels - cv2.countNonZero(thresh)
        density_percent = (black_pixels / total_pixels) * 100
        return min(100, int(max(0, 100 - (density_percent * 2.5))))
    except: return 0

def img_to_base64(img_pil):
    img_pil.thumbnail((1200, 1200)) 
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=80)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

# =================================================================
# 🧠 ULTIMATE PROMPT: RECEIPTS + MATH + COLUMNS
# =================================================================
def build_prompt():
    return """You are an elite AI. Extract data from this image. Output ONLY a valid JSON object.

CRITICAL RULE FOR EXTRACTION ORDER (COLUMNS):
Warning: If this is a multi-column document, you MUST read Column 1 completely from top to bottom first. Then, move to Column 2 and read it completely from top to bottom. DO NOT read left-to-right across columns.

DOCUMENT TYPE RULES:
- IF RECEIPT: Extract item name as "item" and price as "amount". If messy, leave "item" as "" but extract "amount".
- IF MATH WORKSHEET: Extract equation (e.g. "2+3=") as "item", and numerical answer as "amount". If blank, use 0.0.

EXPECTED FORMAT:
{
  "image_readability_score": 85,
  "ai_confidence_score": 95,
  "total_elements_present": 2,
  "items": [{"item": "Coca-Cola", "amount": 40.0, "category": "Beverages"}, {"item": "2 + 3 =", "amount": 5.0, "category": "Math Problem"}]
}"""

def parse_response(raw):
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw).strip()
    try: return json.loads(raw)
    except: return None

def build_calculations(parsed_data, source_type):
    if not isinstance(parsed_data, dict): return [], 0, 0, "-"
    image_quality = parsed_data.get('image_readability_score', 0)
    ai_accuracy = parsed_data.get('ai_confidence_score', 0)
    calculations, subtotal = [], 0
    items_list = parsed_data.get('items', [])
    if isinstance(items_list, list):
        for entry in items_list:
            if not isinstance(entry, dict): continue
            item = str(entry.get('item', '')).strip()
            category = str(entry.get('category', 'Misc')).strip()
            try: amount = float(entry.get('amount', 0))
            except: amount = 0.0
            calculations.append({'expression': item, 'category': category, 'result': round(amount, 2), 'type': source_type})
            subtotal += amount
    return calculations, round(subtotal, 2), image_quality, f"{ai_accuracy}%"

def gemini_fallback(img, timeline):
    if not GEMINI_KEYS: return [], 0, 0, "-", None
    prompt = build_prompt()
    for i, api_key in enumerate(GEMINI_KEYS):
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash') 
            res = model.generate_content([prompt, img], generation_config=genai.GenerationConfig(temperature=0.1, response_mime_type="application/json"))
            data = parse_response(res.text)
            if data and data.get('items'):
                calcs, total, q, acc = build_calculations(data, 'gemini')
                timeline.append(f"✅ Gemini: Success")
                return calcs, total, q, acc, "Gemini 2.5 Flash"
        except: continue
    return [], 0, 0, "-", None

def ai_fallback(img, timeline):
    prompt = build_prompt()
    img_b64 = img_to_base64(img)
    for full_model_id, model_name in MODEL_NAMES.items():
        try:
            provider, model_id = full_model_id.split(":", 1)
            keys = OPENROUTER_KEYS if provider == "openrouter" else [GITHUB_KEY] if GITHUB_KEY else [GROQ_KEY]
            url = "https://openrouter.ai/api/v1/chat/completions" if provider == "openrouter" else "https://api.groq.com/openai/v1/chat/completions"
            for key in keys:
                resp = requests.post(url=url, headers={"Authorization": f"Bearer {key}"}, json={"model": model_id, "messages": [{"role": "user", "content": [{"type":"text","text":prompt}, {"type":"image_url","image_url":{"url":f"data:image/jpeg;base64,{img_b64}"}}]}], "temperature": 0.1}, timeout=45)
                data = parse_response(resp.json()['choices'][0]['message']['content'])
                if data and data.get('items'):
                    calcs, total, q, acc = build_calculations(data, 'ai')
                    timeline.append(f"✅ {model_name}: Success")
                    return calcs, total, q, acc, model_name
        except: continue
    return [], 0, 0, "-", None

@app.route('/')
def index(): return render_template('index.html')

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    try:
        file = request.files.get('image')
        img_raw = Image.open(file.stream).convert('RGB')
        return jsonify({'quality': calculate_ink_density_score(img_raw)})
    except: return jsonify({'quality': 0})

@app.route('/calculate', methods=['POST'])
def calculate():
    file = request.files.getlist('images')[0]
    image_index = int(request.form.get('image_index', 1))
    total_images = int(request.form.get('total_images', 1))
    batch_num = get_latest_batch_id() + (1 if image_index == 1 else 0)
    start_time = time.time()
    timeline = []
    img_raw = Image.open(file.stream).convert('RGB')
    img_raw.thumbnail((1600, 1600))
    img = enhance_poor_image(img_raw)
    calcs, subtotal, img_qual, ai_acc, model = gemini_fallback(img, timeline)
    if not model: calcs, subtotal, img_qual, ai_acc, model = ai_fallback(img, timeline)
    processing_time = round(time.time() - start_time, 2)
    log_performance(f"**Batch {batch_num}**", datetime.now().strftime('%H:%M:%S'), file.filename, f"{image_index}/{total_images}", "Success" if model else "Failed", timeline, processing_time, img_qual, ai_acc)
    return jsonify({'results': [{'index': image_index, 'items': calcs, 'subtotal': subtotal, 'image_quality': img_qual, 'ai_accuracy': ai_acc, 'method': model}]})

@app.route('/save_training_data', methods=['POST'])
def save_training_data():
    try:
        image_file = request.files.get('image')
        json_data = request.form.get('json_data')
        original_filename = request.form.get('original_filename', 'unknown_file')
        dataset_folder = 'training_dataset'
        os.makedirs(dataset_folder, exist_ok=True)
        base_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', os.path.splitext(original_filename)[0])
        image_path = os.path.join(dataset_folder, f"{base_name}.jpg")
        image_file.save(image_path)
        with open(os.path.join(dataset_folder, f"{base_name}.json"), 'w', encoding='utf-8') as f:
            json.dump(json.loads(json_data), f, indent=4, ensure_ascii=False)
        return jsonify({'success': True})
    except Exception as e: return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)