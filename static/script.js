const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const cameraBtn = document.getElementById('cameraBtn');
const previewArea = document.getElementById('previewArea');
const previewImage = document.getElementById('previewImage');
const selectionCanvas = document.getElementById('selectionCanvas');
const calculateBtn = document.getElementById('calculateBtn');
const resetBtn = document.getElementById('resetBtn');

let selectedFile = null;
let startX, startY, endX, endY;
let isDrawing = false;
let ctx = null;

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#4299e1';
    dropZone.style.background = '#ebf8ff';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#cbd5e0';
    dropZone.style.background = 'white';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e0';
    dropZone.style.background = 'white';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
});

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

cameraBtn.addEventListener('click', () => cameraInput.click());

cameraInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewArea.style.display = 'block';
        previewImage.onload = () => {
            // Match canvas to displayed image size (NOT natural size)
            selectionCanvas.width = previewImage.clientWidth;
            selectionCanvas.height = previewImage.clientHeight;
            ctx = selectionCanvas.getContext('2d');
            // Reset selection on new image
            startX = startY = endX = endY = null;
        };
    };
    reader.readAsDataURL(file);
}

// Selection box drawing
selectionCanvas.addEventListener('mousedown', (e) => {
    const rect = selectionCanvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    isDrawing = true;
    ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
});

selectionCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = selectionCanvas.getBoundingClientRect();
    endX = e.clientX - rect.left;
    endY = e.clientY - rect.top;
    ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    ctx.strokeStyle = '#4299e1';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(66, 153, 225, 0.1)';
    ctx.fillRect(startX, startY, endX - startX, endY - startY);
    ctx.strokeRect(startX, startY, endX - startX, endY - startY);
});

selectionCanvas.addEventListener('mouseup', () => {
    isDrawing = false;
});

// Calculate
calculateBtn.addEventListener('click', () => {
    if (!selectedFile) {
        alert('Please select an image first!');
        return;
    }

    const loadingElement = document.getElementById('loading');
    if (loadingElement) loadingElement.style.display = 'block';

    const resultElement = document.getElementById('result');
    if (resultElement) resultElement.innerHTML = '';

    const formData = new FormData();
    formData.append('image', selectedFile);

    // Scale coordinates from displayed size → actual image size
    if (startX != null && endX != null) {
        const scaleX = previewImage.naturalWidth / previewImage.clientWidth;
        const scaleY = previewImage.naturalHeight / previewImage.clientHeight;
        formData.append('x1', Math.round(Math.min(startX, endX) * scaleX));
        formData.append('y1', Math.round(Math.min(startY, endY) * scaleY));
        formData.append('x2', Math.round(Math.max(startX, endX) * scaleX));
        formData.append('y2', Math.round(Math.max(startY, endY) * scaleY));
    }

    fetch('/calculate', { method: 'POST', body: formData })
    .then(response => response.json())
    .then(data => {
        if (loadingElement) loadingElement.style.display = 'none';
        if (!resultElement) return;

        if (data.error) {
            resultElement.innerHTML = `<p style="color: red;">❌ Error: ${data.error}</p>`;
            return;
        }

        if (data.calculations && data.calculations.length > 0) {
            let resultHTML = `<h2 style="color: #4299e1;">📊 Found ${data.count} Calculation(s)</h2>`;
            resultHTML += '<div style="background: #f7fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">';
            data.calculations.forEach((calc, index) => {
                resultHTML += `
                    <p style="font-size: 18px; margin: 10px 0; padding: 10px; background: white; border-radius: 6px; border-left: 4px solid #4299e1;">
                        <strong>${index + 1}. ${calc.expression} = ${calc.result}</strong>
                    </p>`;
            });
            resultHTML += '</div>';
            resultHTML += `<h2 style="color: #38a169; font-size: 32px; margin-top: 20px;">💰 Total: ${data.total}</h2>`;
            resultElement.innerHTML = resultHTML;
        } else {
            resultElement.innerHTML = `<p style="color: orange;">⚠️ ${data.text || 'No calculations detected - try clearer image'}</p>`;
        }
    })
    .catch(error => {
        if (loadingElement) loadingElement.style.display = 'none';
        if (resultElement) resultElement.innerHTML = `<p style="color: red;">❌ Network error: ${error.message}</p>`;
    });
});

// Reset
resetBtn.addEventListener('click', () => {
    previewArea.style.display = 'none';
    const resultElement = document.getElementById('result');
    if (resultElement) resultElement.innerHTML = '';
    const loadingElement = document.getElementById('loading');
    if (loadingElement) loadingElement.style.display = 'none';
    selectedFile = null;
    startX = startY = endX = endY = null;
    fileInput.value = '';
    cameraInput.value = '';
    if (ctx) ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
});
