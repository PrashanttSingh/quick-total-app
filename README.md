# QuickTotal - AI Bill & Hisab Calculator

**Scan Indian/foreign bills, grocery lists, handwritten hisab → instant total.** Camera/upload → AI extracts items/prices → auto-sum. No manual entry.

# ✨ Current Features (Feb 2026)
✅ Camera (laptop/phone) + drag-drop + gallery upload
✅ Online AI first (<5s): OpenRouter vision models
✅ Offline fallback: Ollama llava:7b (10-40s CPU)
✅ Blurry fix: OpenCV preprocessing
✅ Itemized list + ₹ grand total
✅ Works offline/online


## 🚀 Updated Setup (2026)

### Prerequisites
- Python 3.8+
- VS Code
- Ollama (offline AI)

### Installation
```bash
git clone https://github.com/PrashanttSingh/quick-total-app.git
cd quicktotalapp

# Virtual Environment
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate

# Install Python packages
pip install flask pillow opencv-python requests python-dotenv ollama

# Offline AI (4.1GB, fastest CPU vision)
ollama pull llava:7b

# API Key (.env file)
echo "key=sk-or-v1-your-openrouter-key" > .env


Run
# Terminal 1
ollama serve

# Terminal 2  
python app.py

Open: http://127.0.0.1:5000  #in terminal after running  python app.py

📱 Test Flow
📷 Camera bill photo → AI detects: "Rice ₹120, Dal ₹85..."
💰 Auto total: "₹405" + itemized list
⚡ Online: <5s | Offline: 10-40s

🗑️ Removed (Slow/Old)
llava-phi3:3.8b → 3+ min lag

Tesseract math mode → wrong results

Gemini API → quota errors

📁 Project Structure

├── app.py           # Flask + OpenRouter + Ollama llava:7b
├── .env            # OpenRouter key
├── templates/
│   └── index.html  # Camera + modern UI
├── static/
│   ├── style.css   # Vyapar-inspired
│   └── script.js   # Drag-drop + canvas
├── uploads/        # Temp images
└── requirements.txt

🤖 AI Pipeline
Photo → OpenCV preprocess → 
OpenRouter (gemma/nemotron/llama3.2) → 
Ollama llava:7b → JSON items → Total

🎯 Target Users
Shopkeepers, students, households - India + global bills/groceries/hisab

