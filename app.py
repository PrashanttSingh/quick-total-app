import os
import re
from flask import Flask, render_template, request, jsonify
from PIL import Image
import google.generativeai as genai
from dotenv import load_dotenv
import base64
from io import BytesIO

# Load environment variables
load_dotenv()

# Configure Gemini API
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'

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
        # Load image
        img = Image.open(file.stream)
        
        # Get selection coordinates if provided
        x1 = request.form.get('x1', type=int)
        y1 = request.form.get('y1', type=int)
        x2 = request.form.get('x2', type=int)
        y2 = request.form.get('y2', type=int)
        
        # Crop if selection box drawn
        if all([x1, y1, x2, y2]):
            img = img.crop((x1, y1, x2, y2))
        
        # Initialize Gemini Vision model
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Create prompt for mathematical calculation extraction
        prompt = """
        Analyze this image and extract ALL mathematical calculations visible.
        
        For each calculation you find:
        1. Write the complete expression (e.g., "10 + 72")
        2. Calculate the result
        3. Format as: "expression = result"
        
        Rules:
        - Detect +, -, ×, ÷ operations
        - Handle both printed and handwritten numbers
        - If image is blurry, do your best to interpret
        - Ignore non-mathematical text
        - Return each calculation on a new line
        
        If no calculations found, respond with: "NO_CALCULATIONS"
        """
        
        # Generate response from Gemini
        response = model.generate_content([prompt, img])
        result_text = response.text.strip()
        
        # Parse response
        if "NO_CALCULATIONS" in result_text:
            return jsonify({
                'calculations': [],
                'text': 'No calculations detected in image',
                'total': 0
            })
        
        # Extract calculations from response
        calculations = []
        total = 0
        
        for line in result_text.split('\n'):
            line = line.strip()
            if '=' in line:
                # Parse expression and result
                parts = line.split('=')
                if len(parts) == 2:
                    expression = parts[0].strip()
                    try:
                        result_value = float(parts[1].strip())
                        calculations.append({
                            'expression': expression,
                            'result': result_value
                        })
                        total += result_value
                    except ValueError:
                        continue
        
        return jsonify({
            'calculations': calculations,
            'total': round(total, 2),
            'text': result_text,
            'count': len(calculations)
        })
        
    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'})

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    app.run(debug=True)
