# quick-total-app
in this repo we will be creating a fully fledged end to end app for doing calculations of  peaples simply by capturing the phtoto of the page .this repo will be directly trying to solve real world calcultions,like totalling  so that peaple are able to sum up there espenses and bills total in a jiffy..🙃🙃

# ⚡ QuickTotal - Smart Paper Calculator Scanner

Scan paper calculations and get instant totals using OCR + AI.

## 🚀 Setup Guide

### Prerequisites
- Python 3.8+
- VS Code
- Tesseract OCR

### Installation Steps

1. Clone Repository
```bash
git clone <https://github.com/PrashanttSingh/quick-total-app.git>
cd quicktotalapp

2. Create Virtual Environment
python -m venv .venv

3. Activate Environment
Windows PowerShell:
#if you using powershell in vs code
powershell
.\.venv\Scripts\Activate.ps1
#if you using powershell in vs code
Ubuntu/Linux:
source .venv/bin/activate

4. Install Python Dependencies
pip install -r requirements.txt

5. Install Tesseract OCR
Windows:
 winget install -e --id UB-Mannheim.TesseractOCR
#Then restart VS Code,after installation
linux:
 sudo apt update
 sudo apt install tesseract-ocr

6. Run Application
 python app.py 

7. Open Browser
 http://127.0.0.1:5000   #showing in your terminal

#important 
├── app.py
├── requirements.txt
├── .gitignore
├── static/
│   ├── style.css
│   └── script.js
├── templates/
│   └── index.html
└── uploads/
   
 

