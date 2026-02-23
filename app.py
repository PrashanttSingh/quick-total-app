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

# ==========================================
# 🛑 THE MAGIC DEVELOPER SWITCH 🛑
# REMEMBER TO CHANGE THIS TO False TO TEST REAL AI MODELS!
DEV_MODE = False
# ==========================================

# --- API KEYS ---
GEMINI_KEYS = [k for k in [os.getenv('GEMINI_KEY_1'),
                            os.getenv('GEMINI_KEY_2'),
                            os.getenv('GEMINI_KEY_3'),
                            os.getenv('GEMINI_API_4'),
                            os.getenv('GEMINI_API_5')
                            ] if k]
#GEMINI_KEYS=[]
OPENROUTER_KEYS = [k for k in [os.getenv('OPENROUTER_KEY_1'),
                            os.getenv('OPENROUTER_KEY_2'),
                            os.getenv('OPENROUTER_KEY_3'),
                            os.getenv('OPENROUTER_KEY_4'),
                            os.getenv('OPENROUTER_KEY_5')
                            ] if k]
GITHUB_KEY = os.getenv('GITHUB_TOKEN')
#GITHUB_KEY=[]
GROQ_KEY = os.getenv('GROQ_API_KEY')
#GROQ_KEY=[]

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

# --- SMART ROUTING MODELS DICTIONARY ---
# Note: EVERY model must start with openrouter:, groq:, or github:
MODEL_NAMES = {
    # 🥇 PREMIUM & EXCLUSIVE MODELS
    "openrouter:openai/gpt-4o": "GPT-4o (Premium)",
    "github:gpt-4o-mini": "GitHub GPT-4o-Mini",
    "groq:meta-llama/llama-4-scout-17b-16e-instruct": "Groq Llama 4 Scout",
    
    # 🥈 OPENROUTER FREE FALLBACKS
    "openrouter:google/gemma-3-27b-it:free": "Gemma 3 27B",
    "openrouter:nvidia/nemotron-nano-12b-v2-vl:free": "Nemotron V2"
}

def get_latest_batch_id():
    log_file = "processing_logs.md"
    if not os.path.isfile(log_file):
        return 0
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            content = f.read()
            # --- FIXED: Now ignores markdown asterisks ** so batches count up properly ---
            matches = re.findall(r'\|\s*(?:\*\*)?Batch (\d+)(?:\*\*)?\s*\|', content)
            if matches:
                return int(max(matches, key=int))
    except Exception:
        pass
    return 0

def log_performance(batch_id, display_time, filename, image_count, status, timeline_list, time_taken, img_qual, ai_acc):
    log_file = "processing_logs.md"
    file_exists = os.path.isfile(log_file)
    
    timeline_str = "<br>".join(timeline_list)
    
    with open(log_file, mode='a', encoding='utf-8') as f:
        if not file_exists:
            f.write("# 📊 QuickTotal AI Journey Logs\n\n")
            f.write("| Batch ID | Time & Date | File | Count | Status | Processing Timeline | Total Time | **Quality** | **Accuracy** |\n")
            f.write("|---|---|---|---|---|---|---|---|---|\n")
            
        status_icon = "✅ Success" if status == "Success" else "❌ Failed"
        qual_display = f"<b>{img_qual}%</b>" if img_qual > 0 else "-"
        acc_display = f"<b>{ai_acc}%</b>" if ai_acc > 0 else "-"

        row = f"| {batch_id} | {display_time} | `{filename}` | {image_count} | {status_icon} | {timeline_str} | {time_taken}s | {qual_display} | {acc_display} |\n"
        f.write(row)

def enhance_poor_image(img_pil):
    try:
        enhancer = ImageEnhance.Contrast(img_pil)
        img_pil = enhancer.enhance(1.3)
        enhancer = ImageEnhance.Sharpness(img_pil)
        img_pil = enhancer.enhance(1.5)
        return img_pil
    except Exception:
        return img_pil

def img_to_base64(img_pil):
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def build_prompt(mode):
    return """You are an elite financial data extraction AI. Read the image carefully.

CRITICAL RULES:
1. Extract every purchased item/service and exact price.
2. Provide a logical 1-word or 2-word 'category' for each item (e.g., Groceries, Utility, Food, Tax, Fee).
3. Keep duplicates exactly as they appear.
4. Solve math equations (e.g., "10 + 35") for the amount.
5. Discounts are NEGATIVE numbers.
6. Ignore Totals, Subtotals. (Taxes should be extracted as a separate item with category 'Tax').
7. BALANCED SCORING (0-100):
   - "image_quality": Strictly legibility. Clear text = 85-100.
   - "ai_accuracy": Your confidence. Effortless read = 90-100.

EXPECTED FORMAT:
{"image_quality": 95, "ai_accuracy": 98, "items": [{"item": "Milk", "amount": 4.50, "category": "Groceries"}]}
If no data found, return exactly: {"image_quality": 0, "ai_accuracy": 0, "items": []}"""

def parse_response(raw):
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw).strip()
    try:
        return json.loads(raw)
    except:
        match = re.search(r'\{.*?\}', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                return None
        return None

def build_calculations(parsed_data, source_type):
    calculations = []
    subtotal = 0
    img_qual = 0
    ai_acc = 0
    
    if not isinstance(parsed_data, dict):
        return [], 0, 0, 0
        
    img_qual = parsed_data.get('image_quality', 0)
    ai_acc = parsed_data.get('ai_accuracy', parsed_data.get('accuracy', 0))
    items_list = parsed_data.get('items', [])
    
    if not isinstance(items_list, list):
        return [], 0, img_qual, ai_acc

    for entry in items_list:
        if not isinstance(entry, dict): continue
        item = str(entry.get('item', '')).strip()
        category = str(entry.get('category', 'Misc')).strip()
        try:
            amount = float(entry.get('amount', 0))
        except:
            continue
        if item:
            calculations.append({
                'expression': item,
                'category': category,
                'result': round(amount, 2),
                'type': source_type
            })
            subtotal += amount
    return calculations, round(subtotal, 2), img_qual, ai_acc

def gemini_fallback(img, timeline, mode='auto'):
    if not GEMINI_KEYS:
        timeline.append("ℹ️ Gemini: Skipped (Disabled)")
        return [], 0, 0, 0, None
    
    prompt = build_prompt(mode)
    for api_key in GEMINI_KEYS:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash') 
            response = model.generate_content([prompt, img], generation_config=genai.GenerationConfig(temperature=0.1))
            data = parse_response(response.text.strip())
            if isinstance(data, dict) and data.get('items'):
                calcs, total, img_qual, ai_acc = build_calculations(data, 'gemini')
                timeline.append("✅ Gemini 2.5 Flash: Success")
                return calcs, total, img_qual, ai_acc, "Gemini 2.5 Flash"
        except Exception as e:
            timeline.append(f"❌ Gemini Error: {str(e)[:45]}...")
            continue
    return [], 0, 0, 0, None

def ai_fallback(img, timeline, mode='auto'):
    prompt = build_prompt(mode)
    img_b64 = img_to_base64(img)

    for full_model_id, model_name in MODEL_NAMES.items():
        # Smart Router Logic: Parse the prefix
        try:
            provider, model_id = full_model_id.split(":", 1)
        except ValueError:
            continue
        
        if provider == "github" and GITHUB_KEY:
            api_url = "https://models.inference.ai.azure.com/chat/completions"
            api_key = GITHUB_KEY
        elif provider == "groq" and GROQ_KEY:
            api_url = "https://api.groq.com/openai/v1/chat/completions"
            api_key = GROQ_KEY
        elif provider == "openrouter" and OPENROUTER_KEYS:
            api_url = "https://openrouter.ai/api/v1/chat/completions"
            api_key = OPENROUTER_KEYS[0]
        else:
            timeline.append(f"ℹ️ {model_name}: Skipped (Missing {provider.capitalize()} API Key)")
            continue

        try:
            response = requests.post(
                url=api_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model_id,
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
            
            if 'error' in resp_json:
                err_msg = resp_json['error'].get('message', str(resp_json['error']))
                if "Rate limit" in err_msg or "429" in err_msg: err_msg = "Rate Limit Hit"
                elif "No endpoints" in err_msg: err_msg = "Model Offline"
                else: err_msg = err_msg[:40] + "..."
                    
                timeline.append(f"❌ {model_name}: {err_msg}")
                continue
            
            raw = resp_json['choices'][0]['message']['content'].strip()
            data = parse_response(raw)
            if not isinstance(data, dict) or not data.get('items'):
                timeline.append(f"❌ {model_name}: Format Error")
                continue

            calcs, total, img_qual, ai_acc = build_calculations(data, 'ai')
            if len(calcs) > 0:
                timeline.append(f"✅ {model_name}: Success")
                return calcs, total, img_qual, ai_acc, model_name
                
        except Exception as e:
             timeline.append(f"❌ {model_name}: Connection Error")
             continue
             
    return [], 0, 0, 0, None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    files = request.files.getlist('images')
    valid_files = [f for f in files if f.filename != '']
    
    image_index = int(request.form.get('image_index', 1))
    total_images = int(request.form.get('total_images', 1))

    # --- DEV MODE INTERCEPT ---
    if DEV_MODE:
        time.sleep(0.5) 
        return jsonify({
            'results': [{
                'index': image_index,
                'items': [
                    {'expression': 'Organic Milk', 'category': 'Groceries', 'result': 65.00, 'type': 'mock'},
                    {'expression': 'Printer Paper', 'category': 'Office', 'result': 120.00, 'type': 'mock'},
                    {'expression': 'Desk Lamp', 'category': 'Office', 'result': 450.00, 'type': 'mock'},
                    {'expression': 'State Tax (GST)', 'category': 'Tax', 'result': 25.50, 'type': 'mock'}
                ],
                'subtotal': 660.50,
                'image_quality': 99,
                'ai_accuracy': 99,
                'method': 'Developer Mode (Fake Data)'
            }],
            'grand_total': 660.50,
            'methods_used': ['Developer Mode']
        })

    if image_index == 1:
        batch_num = get_latest_batch_id() + 1
    else:
        batch_num = get_latest_batch_id()
        if batch_num == 0: batch_num = 1

    batch_id = f"**Batch {batch_num}**"
    
    batch_time = datetime.now().strftime("%I:%M:%S %p")
    batch_date = datetime.now().strftime("%d/%m/%y")
    formatted_datetime = f"{batch_time}<br>{batch_date}"

    structured_results = []
    grand_total = 0.0
    used_methods = set()

    try:
        for i, file in enumerate(valid_files):
            start_time = time.time()
            processing_timeline = []
                
            img = Image.open(file.stream).convert('RGB')
            img = enhance_poor_image(img)

            calcs, subtotal, img_qual, ai_acc, model = gemini_fallback(img, processing_timeline)
            if not model:
                 calcs, subtotal, img_qual, ai_acc, model = ai_fallback(img, processing_timeline)

            end_time = time.time()
            processing_time = round(end_time - start_time, 2)
            
            image_count_info = f"{image_index} of {total_images}" 
            safe_filename = file.filename if file.filename != "image" else f"Image_{image_index}"

            display_batch = batch_id if image_index == 1 else ""
            display_time = formatted_datetime if image_index == 1 else ""

            if model and calcs:
                used_methods.add(model)
                grand_total += subtotal
                structured_results.append({
                    'index': image_index,
                    'items': calcs,
                    'subtotal': subtotal,
                    'image_quality': img_qual,
                    'ai_accuracy': ai_acc,
                    'method': model
                })
                log_performance(display_batch, display_time, safe_filename, image_count_info, "Success", processing_timeline, processing_time, img_qual, ai_acc)
            else:
                 structured_results.append({
                    'index': image_index,
                    'error': "Could not read data reliably. Please try cropping closer to the text."
                })
                 log_performance(display_batch, display_time, safe_filename, image_count_info, "Failed", processing_timeline, processing_time, 0, 0)
            
            # Rate Limit safety delay: Give APIs a 4-second breather between images to prevent 429 Quota errors
            if len(valid_files) > 1 and i < len(valid_files) - 1:
                time.sleep(4)

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