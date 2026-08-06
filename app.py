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
from flask import Flask, render_template, request, jsonify,Response
from PIL import Image, ImageEnhance
from dotenv import load_dotenv
import google.generativeai as genai
import tempfile

load_dotenv()

# --- API KEYS ---
GEMINI_KEYS = [
    k for k in [
        os.getenv('GEMINI_KEY_1'),
        os.getenv('GEMINI_KEY_2'),
        os.getenv('GEMINI_KEY_3'),
        os.getenv('GEMINI_KEY_4'),
        os.getenv('GEMINI_KEY_5'),
        os.getenv('GEMINI_KEY_6')
    ] if k
]

OPENROUTER_KEYS = [
    k for k in [
        os.getenv('OPENROUTER_KEY_1'),
        os.getenv('OPENROUTER_KEY_2'),
        os.getenv('OPENROUTER_KEY_3'),
        os.getenv('OPENROUTER_KEY_4'),
        os.getenv('OPENROUTER_KEY_5')
    ] if k
]

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
    if not os.path.isfile(log_file):
        return 0
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            matches = re.findall(r'\|\s*(?:\*\*)?Batch (\d+)(?:\*\*)?\s*\|', f.read())
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
            f.write("# 📊 QuickTotal AI Journey Logs\n\n| Batch ID | Time & Date | File | Count | Status | Processing Timeline | Total Time | **Quality** | **Accuracy** |\n|---|---|---|---|---|---|---|---|---| \n")
        status_icon = "✅ Success" if status == "Success" else "❌ Failed"
        qual_display = f"<b>{img_qual}%</b>" if img_qual != "-" else "-"
        acc_display = f"<b>{ai_acc}</b>" if ai_acc != "-" else "-"
        f.write(f"| {batch_id} | {display_time} | `{filename}` | {image_count} | {status_icon} | {timeline_str} | {time_taken}s | {qual_display} | {acc_display} |\n")

def enhance_poor_image(img_pil):
    try:
        img_pil = ImageEnhance.Contrast(img_pil).enhance(1.3)
        return ImageEnhance.Sharpness(img_pil).enhance(1.5)
    except Exception:
        return img_pil

def calculate_ink_density_score(img_pil):
    try:
        open_cv_image = np.array(img_pil.convert('RGB'))
        gray = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
        variance = cv2.Laplacian(gray, cv2.CV_64F).var()
        _, thresh = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY)
        total_pixels = thresh.size
        black_pixels = total_pixels - cv2.countNonZero(thresh)
        density_percent = (black_pixels / total_pixels) * 100
        
        if variance < 50 or density_percent < 1 or density_percent > 85:
            return 0
            
        score = min(100, int((variance / 800) * 100))
        return max(15, score)
    except Exception: 
        return 0

def img_to_base64(img_pil):
    img_pil.thumbnail((1200, 1200)) 
    buffer = BytesIO()
    img_pil.save(buffer, format='JPEG', quality=80)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

def parse_response(raw):
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw).strip()
    try:
        return json.loads(raw)
    except Exception:
        return None

def build_calculations(parsed_data, source_type):
    if not isinstance(parsed_data, dict):
        return [], 0, 0, "-"
    image_quality = parsed_data.get('image_readability_score', 0)
    ai_accuracy = parsed_data.get('ai_confidence_score', 0)
    calculations, subtotal = [], 0
    items_list = parsed_data.get('items', [])
    if isinstance(items_list, list):
        for entry in items_list:
            if not isinstance(entry, dict):
                continue
            item = str(entry.get('item', '')).strip()
            category = str(entry.get('category', 'Misc')).strip()
            try:
                amount = float(entry.get('amount', 0))
            except Exception:
                amount = 0.0
            calculations.append({'expression': item, 'category': category, 'result': round(amount, 2), 'type': source_type})
            subtotal += amount
    return calculations, round(subtotal, 2), image_quality, f"{ai_accuracy}%"

# =================================================================
# 🚀 BATCH AI PROMPTS & MULTIMODAL FUNCTIONS
# =================================================================

def build_batch_extraction_prompt(num_images):
    return f"""You are an elite AI data extractor for QuickTotal.
You are provided {num_images} image(s) in exact sequential order (Image 1 to Image {num_images}).
Extract the financial data from EACH image independently.

CRITICAL RULE FOR EXTRACTION ORDER (COLUMNS):
⚠️If a document has multiple columns, read Column 1 completely(it is not neccessory that price will be always on the right side of item name ,
it can be on left side also of the item name,so pelse be carefull ) top-to-bottom first, then Column 2 top-to-bottom. DO NOT read left-to-right across columns.

DOCUMENT TYPE RULES:
- IF RECEIPT, INVOICE, OR HANDWRITTEN LEDGER: Extract item name as "item", price as "amount".
- 🏷️ THE DIVERSE CATEGORY RULE: You MUST categorize every item using ONLY the following highly specific categories: "Pantry & Staples" (flour, rice, dal, oil, spices), "Dairy & Eggs" (milk, paneer, curd, butter), "Produce" (fresh fruits, vegetables), "Snacks & Beverages" (chips, biscuits, cold drinks), "Meat & Seafood", "Personal Care" (soap, shampoo, toothpaste), "Household & Cleaning" (detergent, cleaners), "Clothing & Apparels", "Electronics", "Medical", "Transport", "Bills & Utilities", "Education & Stationery", or "Misc". NEVER use a generic term like "Groceries".
- 🚫 THE STRIKETHROUGH RULE: If an individual line item has a specific pen strike-through or is explicitly crossed out, IGNORE IT and do not extract it. 
- 📝 THE GIANT 'X' RULE: However, if there is a massive 'X' drawn across the entire page or section, ignore the giant 'X' and aggressively extract all the legible items underneath it.
- 🚫 THE TOTALS RULE: NEVER extract summary calculation lines like "Total", "Subtotal", "Grand Total", "Kul" (कुल), or "Yog" (योग) as items.
- ⚖️ THE ADJUSTMENTS RULE: You MUST extract previous balances, old dues, arrears, or deposits (e.g., "Old Due", "Bakaya" (बकाया), "Purana", "Jama" (जमा), "Advance"). Set their category to "Adjustment". If the item is a deposit or payment (like "Jama" or "Advance"), make the amount a NEGATIVE number (e.g., -500.0). If it is a pending due, keep it positive.
- If an item name is completely unreadable but the price is clear, extract the "amount" and put "Unknown" for the item name.
- IF MATH WORKSHEET: Extract equation (e.g. "2+3=") as "item", numerical answer as "amount", and set "category" to "Math Problem".
- 🚨 THE ILLEGIBLE HANDWRITING (PLAN B) RULE: If you encounter a line where the item name is a complete scribble or completely unreadable due to terrible handwriting, DO NOT SKIP IT. You must execute Plan B: extract the clear price/amount, and set the item name exactly as "Unreadable Item". Your absolute highest priority is capturing 100% of the prices on the page so the math is perfect. No price gets left behind, even if the text is just messy ink.
-⚠️ Most important rule: try to extract all possible item names with there prices  and dont leave any item from calculation and if the total of the recipt is 
  in negative then ,re examine the recipt  and give total(extract all  items present in the whole photo)

Output ONLY a valid JSON object containing a "receipts" array for all {num_images} images in exact order:
{{
  "receipts": [
    {{
      "image_index": 1,
      "image_readability_score": 85,
      "ai_confidence_score": 95,
      "items": [
        {{"item": "Coca-Cola", "amount": 40.0, "category": "Snacks & Beverages"}},
        {{"item": "Jama / Advance", "amount": -500.0, "category": "Adjustment"}}
      ]
    }}
  ]
}}"""
def gemini_batch_extraction(img_list, timeline):
    """Processes ALL images in a single Gemini API call."""
    if not GEMINI_KEYS:
        return None, None
    
    prompt = build_batch_extraction_prompt(len(img_list))
    prompt_content = [prompt] + img_list

    for attempt, api_key in enumerate(GEMINI_KEYS):
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash') 
            res = model.generate_content(
                prompt_content, 
                generation_config=genai.GenerationConfig(temperature=0.1, response_mime_type="application/json")
            )
            data = parse_response(res.text)
            if data and isinstance(data, dict) and 'receipts' in data:
                timeline.append(f"✅ Gemini 2.5 Flash: Processed {len(img_list)} images in 1 API Call")
                return data['receipts'], "Gemini 2.5 Flash "
        except Exception as e:
            print(f"⚠️ [EXTRACTION BATCH] Key #{attempt + 1} failed: {e}. Trying next key...")
            continue
    return None, None

def ai_single_fallback(img, timeline):
    """Fallback if batch processing fails completely."""
    prompt = """Extract item as "item" and price as "amount" from this image in JSON format: {"image_readability_score": 80, "ai_confidence_score": 90, "items": [{"item": "Item", "amount": 10.0, "category": "Misc"}]}"""
    img_b64 = img_to_base64(img)
    for full_model_id, model_name in MODEL_NAMES.items():
        try:
            provider, model_id = full_model_id.split(":", 1)
            keys = OPENROUTER_KEYS if provider == "openrouter" else [GITHUB_KEY] if GITHUB_KEY else [GROQ_KEY]
            url = "https://openrouter.ai/api/v1/chat/completions" if provider == "openrouter" else "https://api.groq.com/openai/v1/chat/completions"
            for key in keys:
                resp = requests.post(
                    url=url,
                    headers={"Authorization": f"Bearer {key}"},
                    json={
                        "model": model_id,
                        "messages": [
                            {"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}]}
                        ],
                        "temperature": 0.1
                    },
                    timeout=45
                )
                data = parse_response(resp.json()['choices'][0]['message']['content'])
                if data and data.get('items'):
                    calcs, total, q, acc = build_calculations(data, 'ai')
                    timeline.append(f"✅ {model_name}: Success")
                    return calcs, total, q, acc, model_name
        except Exception:
            continue
    return [], 0, 0, "-", None

# =================================================================
# 🌐 ROUTES
# =================================================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze_image', methods=['POST'])
def analyze_image():
    try:
        file = request.files.get('image')
        img_raw = Image.open(file.stream).convert('RGB')
        return jsonify({'quality': calculate_ink_density_score(img_raw)})
    except Exception:
        return jsonify({'quality': 0})

@app.route('/batch_gatekeeper', methods=['POST'])
def batch_gatekeeper():
    """1 SINGLE API Call to classify ALL uploaded batch images at once."""
    files = request.files.getlist('images')
    if not files:
        return jsonify({'results': []})

    if not GEMINI_KEYS:
        return jsonify({'results': [True] * len(files)})

    # 🚀 SPEED FIX 1: Ultra-short prompt. Less text = faster processing.
    GATEKEEPER_PROMPT = """Analyze these images in order. Output ONLY a valid JSON array of booleans. 
true = Receipt, bill, invoice, handwritten ledger, or math sheet.
false = Selfie, meme, nature, wallpaper, or completely unrelated.
Example: [true, false, true]"""

    prompt_content = [GATEKEEPER_PROMPT]

    for file in files:
        raw_img = Image.open(file.stream).convert('RGB')
        # 🚀 SPEED FIX 2: Massive downscale. The AI doesn't need to read tiny text to recognize the shape of a bill!
        raw_img.thumbnail((300, 300))
        prompt_content.append(raw_img)

    for attempt, key in enumerate(GEMINI_KEYS):
        try:
            genai.configure(api_key=key)
            # You can also change this to 'gemini-1.5-flash-8b' later if you want Google's dedicated high-speed router model
            model = genai.GenerativeModel('gemini-2.5-flash')
            res = model.generate_content(
                prompt_content, 
                generation_config=genai.GenerationConfig(temperature=0.0, response_mime_type="application/json")
            )
            clean_text = res.text.replace("```json", "").replace("```", "").strip()
            parsed_res = json.loads(clean_text)
            
            if isinstance(parsed_res, list):
                results_array = [bool(x) for x in parsed_res]
            elif isinstance(parsed_res, dict) and "is_receipt" in parsed_res:
                results_array = [bool(parsed_res["is_receipt"])] * len(files)
            else:
                results_array = [True] * len(files)

            if len(results_array) < len(files):
                results_array.extend([True] * (len(files) - len(results_array)))
            results_array = results_array[:len(files)]

            print(f"🛡️ [BATCH GATEKEEPER - 1 CALL] Key #{attempt + 1} -> {results_array}")
            return jsonify({'results': results_array})
        except Exception as e:
            print(f"⚠️ [GATEKEEPER] Key #{attempt + 1} failed: {e}. Trying next key...")
            continue

    print("❌ [GATEKEEPER CRITICAL] All keys failed. Bypassing check.")
    return jsonify({'results': [True] * len(files)})



@app.route('/calculate', methods=['POST'])
def calculate():
    """1 SINGLE API Call to extract data from ALL uploaded batch images at once."""
    files = request.files.getlist('images')
    if not files:
        return jsonify({'error': 'No images provided'}), 400

    batch_num = get_latest_batch_id() + 1
    start_time = time.time()
    timeline = []
    
    img_objs = []
    filenames = []
    
    for f in files:
        filenames.append(f.filename)
        img_raw = Image.open(f.stream).convert('RGB')
        img_raw.thumbnail((1600, 1600))
        img_objs.append(enhance_poor_image(img_raw))

    # 💥 1 SINGLE API CALL FOR THE WHOLE BATCH 💥
    raw_receipts, model_used = gemini_batch_extraction(img_objs, timeline)
    
    results_list = []

    if raw_receipts:
        for idx, rdata in enumerate(raw_receipts):
            calcs, subtotal, img_qual, ai_acc = build_calculations(rdata, 'gemini')
            results_list.append({
                'index': idx + 1,
                'filename': filenames[idx] if idx < len(filenames) else f"image_{idx+1}",
                'items': calcs,
                'subtotal': subtotal,
                'image_quality': img_qual,
                'ai_accuracy': ai_acc,
                'method': model_used
            })
    else:
        # Fallback to single requests if Gemini batch processing failed entirely
        for idx, img in enumerate(img_objs):
            calcs, subtotal, img_qual, ai_acc, model = ai_single_fallback(img, timeline)
            results_list.append({
                'index': idx + 1,
                'filename': filenames[idx] if idx < len(filenames) else f"image_{idx+1}",
                'items': calcs,
                'subtotal': subtotal,
                'image_quality': img_qual,
                'ai_accuracy': ai_acc,
                'method': model or 'Failed'
            })

    processing_time = round(time.time() - start_time, 2)
    
    log_performance(
        f"**Batch {batch_num}**",
        datetime.now().strftime('%H:%M:%S'),
        f"Batch ({len(files)} files)",
        f"{len(files)} images",
        "Success" if model_used else "Fallback",
        timeline,
        processing_time,
        results_list[0]['image_quality'] if results_list else 0,
        results_list[0]['ai_accuracy'] if results_list else "0%"
    )
    
    return jsonify({'results': results_list})

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
    except Exception as e: 
        return jsonify({'error': str(e)}), 500

@app.route('/process_voice', methods=['POST'])
def process_voice():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided', 'fallback_to_browser': True}), 400

    audio_file = request.files['audio']
    lang_mode = request.form.get('lang', 'hi-IN')

    print("\n" + "="*55)
    print(f"🎙️  [VOICE ENGINE LOG] Processing Audio | Mode: '{lang_mode}'")
    print("="*55)

    if lang_mode == 'hi-only':
        whisper_lang = 'hi'
        prompt_text = "सामान की सूची: मिठाई 50, सूजी 20, डिटॉल 30, सनसिल्क 28, 10 रुपये।"
    elif lang_mode == 'en-IN':
        whisper_lang = 'en'
        prompt_text = "Item list in English: Sweet 50, Milk 20, Sugar 30."
    else:  
        whisper_lang = 'hi'
        prompt_text = "Transcribe spoken Indian items and numbers."

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        audio_file.save(temp_audio.name)
        temp_audio_path = temp_audio.name

    transcribed_text = None
    current_tier = "None"

    # TIER 1: DEEPGRAM
    try:
        dg_keys = [
            os.getenv("DEEPGRAM_API_KEY_1"),
            os.getenv("DEEPGRAM_API_KEY_2"),
            os.getenv("DEEPGRAM_API_KEY")
        ]
        valid_dg_keys = [k for k in dg_keys if k and "FAKE" not in k]

        if not valid_dg_keys:
            raise Exception("No valid DEEPGRAM keys found.")

        dg_lang = "hi" if lang_mode in ['hi-only', 'hi-IN'] else "en-IN"

        for attempt, dg_key in enumerate(valid_dg_keys):
            try:
                with open(temp_audio_path, "rb") as f:
                    response = requests.post(
                        f"https://api.deepgram.com/v1/listen?model=nova-2&language={dg_lang}&smart_format=true&numerals=true",
                        headers={"Authorization": f"Token {dg_key}", "Content-Type": "audio/webm"},
                        data=f.read(),
                        timeout=3.0
                    )
                    
                if response.status_code == 200:
                    transcribed_text = response.json()['results']['channels'][0]['alternatives'][0]['transcript']
                    current_tier = f"Deepgram API (Key #{attempt + 1})"
                    break
            except Exception:
                continue

        if not transcribed_text:
            raise Exception("All Deepgram keys failed.")

    except Exception as e1:
        # TIER 2: GROQ
        try:
            groq_key = os.getenv("GROQ_API_KEY") 
            if not groq_key or "FAKE" in groq_key:
                raise Exception("GROQ_API_KEY missing or invalid.")

            with open(temp_audio_path, "rb") as f:
                response = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {groq_key}"},
                    files={"file": (temp_audio_path, f)},
                    data={"model": "whisper-large-v3", "language": whisper_lang, "prompt": prompt_text, "temperature": "0.0"},
                    timeout=3.0
                )
                if response.status_code == 200:
                    transcribed_text = response.json().get('text')
                    current_tier = "Groq API"
                else:
                    raise Exception(f"HTTP {response.status_code}: {response.text}")

        except Exception as e2:
            # TIER 3: LOCAL CPU
            try:
                from faster_whisper import WhisperModel
                
                model = WhisperModel("base", device="cpu", compute_type="int8")
                segments, info = model.transcribe(
                    temp_audio_path, language=whisper_lang, task="transcribe",
                    beam_size=3, initial_prompt=prompt_text, temperature=0.0
                )
                transcribed_text = " ".join([segment.text for segment in segments]).strip()
                if transcribed_text:
                    current_tier = "Local CPU"
            except Exception:
                pass

    if os.path.exists(temp_audio_path):
        os.remove(temp_audio_path)

    if transcribed_text:
        clean_text = transcribed_text.replace("|", "").replace(".", "").strip()
        words = clean_text.split()
        if len(words) >= 3 and len(set(words)) == 1:
            clean_text = ""
        elif len(set(clean_text.replace(" ", ""))) == 1 and len(clean_text) > 3:
            clean_text = ""
        transcribed_text = clean_text

    if not transcribed_text:
        return jsonify({'success': False, 'fallback_to_browser': True}), 200

    return jsonify({
        'success': True, 
        'text': transcribed_text, 
        'tier_used': current_tier
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)