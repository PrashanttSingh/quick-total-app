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

DEV_MODE = False

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

# --- SYNCED: Realistic Image Quality Math from Benchmark ---
def calculate_real_image_quality(img_pil):
    try:
        open_cv_image = np.array(img_pil)
        if len(open_cv_image.shape) == 3:
            open_cv_image = open_cv_image[:, :, ::-1].copy()
            gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
        else: gray = open_cv_image
        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        quality = int((blur_score / 150.0) * 100) + 40 
        return min(100, max(0, quality))
    except: return 0

def img_to_base64(img_pil):
    # Added compression so Groq stops failing!
    img_pil.thumbnail((1200, 1200)) 
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=80)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

# --- SYNCED: Strict Counting Prompt ---
def build_prompt():
    return """You are an elite financial AI. Extract data from this image. Output ONLY a valid JSON object.
EXPECTED FORMAT EXACTLY:
{"total_elements_present": 20, "unreadable_elements": 0, "items": [{"item": "Data", "amount": 10.0, "category": "Misc"}]}"""

def parse_response(raw):
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw).strip()
    try: return json.loads(raw)
    except: return None

def build_calculations(parsed_data, source_type, img_qual):
    if not isinstance(parsed_data, dict): return [], 0, img_qual, "-"
    
    total_elements = parsed_data.get('total_elements_present', 0)
    unreadable = parsed_data.get('unreadable_elements', 0)
    ai_acc = f"{int(max(0, 100 - ((unreadable / total_elements) * 100)))}%" if total_elements > 0 else "-"
    
    calculations, subtotal = [], 0
    items_list = parsed_data.get('items', [])
    if isinstance(items_list, list):
        for entry in items_list:
            if not isinstance(entry, dict): continue
            item = str(entry.get('item', '')).strip()
            category = str(entry.get('category', 'Misc')).strip()
            try: amount = float(entry.get('amount', 0))
            except: continue
            if item:
                calculations.append({'expression': item, 'category': category, 'result': round(amount, 2), 'type': source_type})
                subtotal += amount
    return calculations, round(subtotal, 2), img_qual, ai_acc

def gemini_fallback(img, timeline, img_qual):
    if not GEMINI_KEYS:
        timeline.append("ℹ️ Gemini: Skipped")
        return [], 0, img_qual, "-", None
    prompt = build_prompt()
    for i, api_key in enumerate(GEMINI_KEYS):
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash') 
            # ENFORCING STRICT JSON MODE
            res = model.generate_content([prompt, img], generation_config=genai.GenerationConfig(temperature=0.1, response_mime_type="application/json"))
            data = parse_response(res.text)
            if data and data.get('items'):
                calcs, total, q, acc = build_calculations(data, 'gemini', img_qual)
                timeline.append(f"✅ Gemini 2.5 Flash: Success (Key {i+1})")
                return calcs, total, q, acc, "Gemini 2.5 Flash"
        except Exception as e:
            if "429" in str(e): timeline.append(f"⚠️ Gemini Key {i+1} Rate Limited")
            else: timeline.append(f"❌ Gemini Error")
            continue
    return [], 0, img_qual, "-", None

def ai_fallback(img, timeline, img_qual):
    prompt = build_prompt()
    img_b64 = img_to_base64(img)

    for full_model_id, model_name in MODEL_NAMES.items():
        try: provider, model_id = full_model_id.split(":", 1)
        except: continue
        
        keys_to_try = []
        if provider == "openrouter": keys_to_try = OPENROUTER_KEYS
        elif provider == "github" and GITHUB_KEY: keys_to_try = [GITHUB_KEY]
        elif provider == "groq" and GROQ_KEY: keys_to_try = [GROQ_KEY]
        
        if not keys_to_try: continue

        url = "https://openrouter.ai/api/v1/chat/completions" if provider == "openrouter" else "https://models.inference.ai.azure.com/chat/completions" if provider == "github" else "https://api.groq.com/openai/v1/chat/completions"

        for i, key in enumerate(keys_to_try):
            try:
                # ENFORCING STRICT JSON MODE FOR APIS
                payload = {
                    "model": model_id, 
                    "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}]}], 
                    "temperature": 0.1, "max_tokens": 2048,
                    "response_format": {"type": "json_object"} 
                }
                resp = requests.post(url=url, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json=payload, timeout=45)
                
                if resp.status_code == 429:
                    timeline.append(f"⚠️ {model_name} Key {i+1} Rate Limited")
                    continue
                elif resp.status_code != 200:
                    timeline.append(f"❌ {model_name}: API Error {resp.status_code}")
                    break

                data = parse_response(resp.json()['choices'][0]['message']['content'])
                if data and data.get('items'):
                    calcs, total, q, acc = build_calculations(data, 'ai', img_qual)
                    timeline.append(f"✅ {model_name}: Success")
                    return calcs, total, q, acc, model_name
                else:
                    timeline.append(f"❌ {model_name}: Format Error")
                    break
            except Exception as e:
                 timeline.append(f"❌ {model_name}: Connection Error")
                 break
    return [], 0, img_qual, "-", None

@app.route('/')
def index(): return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    files = request.files.getlist('images')
    valid_files = [f for f in files if f.filename != '']
    image_index = int(request.form.get('image_index', 1))
    total_images = int(request.form.get('total_images', 1))

    if image_index == 1: batch_num = get_latest_batch_id() + 1
    else: batch_num = max(1, get_latest_batch_id())
    batch_id = f"**Batch {batch_num}**"
    formatted_datetime = f"{datetime.now().strftime('%I:%M:%S %p')}<br>{datetime.now().strftime('%d/%m/%y')}"

    structured_results, grand_total, used_methods = [], 0.0, set()

    try:
        for i, file in enumerate(valid_files):
            start_time = time.time()
            processing_timeline = []
            img = Image.open(file.stream).convert('RGB')
            img = enhance_poor_image(img)
            
            # 1. Calculate the Real Image Quality FIRST
            real_img_qual = calculate_real_image_quality(img)

            # 2. Send image and quality score to the AIs
            calcs, subtotal, img_qual, ai_acc, model = gemini_fallback(img, processing_timeline, real_img_qual)
            if not model:
                 calcs, subtotal, img_qual, ai_acc, model = ai_fallback(img, processing_timeline, real_img_qual)

            processing_time = round(time.time() - start_time, 2)
            display_batch = batch_id if image_index == 1 else ""
            display_time = formatted_datetime if image_index == 1 else ""

            if model and calcs:
                used_methods.add(model)
                grand_total += subtotal
                structured_results.append({
                    'index': image_index, 'items': calcs, 'subtotal': subtotal,
                    'image_quality': img_qual, 'ai_accuracy': ai_acc, 'method': model
                })
                log_performance(display_batch, display_time, file.filename, f"{image_index} of {total_images}", "Success", processing_timeline, processing_time, img_qual, ai_acc)
            else:
                 structured_results.append({'index': image_index, 'error': "Could not read data reliably."})
                 log_performance(display_batch, display_time, file.filename, f"{image_index} of {total_images}", "Failed", processing_timeline, processing_time, real_img_qual, "-")
            
            if len(valid_files) > 1 and i < len(valid_files) - 1: time.sleep(4)

        if not structured_results: return jsonify({'error': 'No readable data found.'})
        return jsonify({'results': structured_results, 'grand_total': round(grand_total, 2), 'methods_used': list(used_methods)})

    except Exception as e: return jsonify({'error': f'Server error: {str(e)}'})

# --- NEW VAULT ROUTE: SAVES DATA FOR FUTURE TRAINING ---
@app.route('/save_training_data', methods=['POST'])
def save_training_data():
    try:
        image_file = request.files.get('image')
        json_data = request.form.get('json_data')

        if not image_file or not json_data:
            return jsonify({'error': 'Missing image or data'}), 400

        # Create the vault folder if it doesn't exist yet
        dataset_folder = 'training_dataset'
        os.makedirs(dataset_folder, exist_ok=True)

        # Generate a unique ID using the precise millisecond time
        unique_id = f"receipt_{int(time.time() * 1000)}"

        # Save Image
        image_ext = os.path.splitext(image_file.filename)[1]
        if not image_ext: image_ext = '.jpg'
        image_path = os.path.join(dataset_folder, f"{unique_id}{image_ext}")
        image_file.save(image_path)

        # Save JSON
        json_path = os.path.join(dataset_folder, f"{unique_id}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            parsed_data = json.loads(json_data)
            json.dump(parsed_data, f, indent=4, ensure_ascii=False)

        return jsonify({'success': True, 'message': 'Saved to dataset!'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True, port=5000)