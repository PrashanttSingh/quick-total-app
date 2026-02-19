import os
import re
import cv2
import numpy as np
import pytesseract
from flask import Flask, render_template, request, jsonify
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'

def preprocess_image(img_pil):
    img_np = np.array(img_pil)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray)
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    sharpened = cv2.filter2D(denoised, -1, kernel)
    thresh = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return thresh

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
        img = Image.open(file.stream)
        x1 = request.form.get('x1', type=int)
        y1 = request.form.get('y1', type=int)
        x2 = request.form.get('x2', type=int)
        y2 = request.form.get('y2', type=int)
        if all([x1, y1, x2, y2]):
            img = img.crop((x1, y1, x2, y2))

        processed = preprocess_image(img)
        config = '--psm 6 -c tessedit_char_whitelist=0123456789+-x=(). '
        text = pytesseract.image_to_string(processed, config=config)

        # Only match expressions with AT LEAST ONE operator (no lone numbers)
        expressions = re.findall(r'(\d+(?:\s*[+\-x]\s*\d+)+)(?:\s*=\s*\d+)?', text)
        calculations = []
        total = 0
        for expr in expressions:
            expr_clean = re.sub(r'\s+', '', expr.replace('x', '*'))
            if re.match(r'^\d+(?:[+\-*]\d+)+$', expr_clean):
                try:
                    line_total = eval(expr_clean)
                    calculations.append({'expression': expr.strip(), 'result': round(line_total, 2)})
                    total += line_total
                except:
                    continue

        return jsonify({
            'calculations': calculations,
            'total': round(total, 2),
            'text': text.strip(),
            'method': 'Tesseract',
            'count': len(calculations)
        })

    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'})

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True)
