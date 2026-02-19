// ═══════════════════════════════════════════
//  ELEMENT REFS
// ═══════════════════════════════════════════
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const cameraInput     = document.getElementById('cameraInput');
const cameraBtn       = document.getElementById('cameraBtn');
const previewArea     = document.getElementById('previewArea');
const previewImage    = document.getElementById('previewImage');
const selectionCanvas = document.getElementById('selectionCanvas');
const calculateBtn    = document.getElementById('calculateBtn');
const resetBtn        = document.getElementById('resetBtn');
const loadingEl       = document.getElementById('loading');
const resultEl        = document.getElementById('result');
const cameraModal     = document.getElementById('cameraModal');
const webcamVideo     = document.getElementById('webcamVideo');
const snapCanvas      = document.getElementById('snapCanvas');
const snapBtn         = document.getElementById('snapBtn');
const closeCameraBtn  = document.getElementById('closeCameraBtn');
const modalBackdrop   = document.getElementById('modalBackdrop');

let selectedFile = null;
let startX, startY, endX, endY;
let isDrawing = false;
let ctx = null;
let webcamStream = null;

// ═══════════════════════════════════════════
//  DEVICE DETECTION
// ═══════════════════════════════════════════
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ═══════════════════════════════════════════
//  DRAG & DROP
// ═══════════════════════════════════════════
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget))
        dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
    else showToast('⚠️ Please drop an image file');
});

dropZone.addEventListener('click', (e) => {
    if (e.target === cameraBtn || cameraBtn.contains(e.target)) return;
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});

// ═══════════════════════════════════════════
//  CAMERA — WebRTC (laptop) / native (mobile)
// ═══════════════════════════════════════════
cameraBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMobile()) {
        cameraInput.click();
    } else {
        openWebcam();
    }
});

cameraInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});

function openWebcam() {
    cameraModal.classList.add('active');
    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
    })
    .then(stream => {
        webcamStream = stream;
        webcamVideo.srcObject = stream;
    })
    .catch(err => {
        closeWebcam();
        showToast('❌ Camera access denied: ' + err.message);
    });
}

function closeWebcam() {
    cameraModal.classList.remove('active');
    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }
    webcamVideo.srcObject = null;
}

// Snap photo from webcam
snapBtn.addEventListener('click', () => {
    snapCanvas.width  = webcamVideo.videoWidth;
    snapCanvas.height = webcamVideo.videoHeight;
    snapCanvas.getContext('2d').drawImage(webcamVideo, 0, 0);
    snapCanvas.toBlob(blob => {
        const file = new File([blob], 'webcam_capture.jpg', { type: 'image/jpeg' });
        closeWebcam();
        handleFile(file);
    }, 'image/jpeg', 0.95);
});

closeCameraBtn.addEventListener('click', closeWebcam);
modalBackdrop.addEventListener('click', closeWebcam);

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cameraModal.classList.contains('active')) closeWebcam();
});

// ═══════════════════════════════════════════
//  FILE HANDLER
// ═══════════════════════════════════════════
function handleFile(file) {
    // Validate size (max 16MB)
    if (file.size > 16 * 1024 * 1024) {
        showToast('❌ File too large — max 16MB');
        return;
    }

    selectedFile = file;
    const reader = new FileReader();

    reader.onload = (e) => {
        previewImage.src = e.target.result;
        dropZone.style.display = 'none';
        previewArea.style.display = 'block';

        // Animate preview card in
        previewArea.style.opacity = '0';
        previewArea.style.transform = 'translateY(16px)';
        requestAnimationFrame(() => {
            previewArea.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
            previewArea.style.opacity = '1';
            previewArea.style.transform = 'translateY(0)';
        });

        previewImage.onload = () => {
            setupCanvas();
            // Auto-scroll to preview
            previewArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
    };

    reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════
function setupCanvas() {
    selectionCanvas.width  = previewImage.clientWidth;
    selectionCanvas.height = previewImage.clientHeight;
    ctx = selectionCanvas.getContext('2d');
    startX = startY = endX = endY = null;
}

// Resize canvas if window resizes
window.addEventListener('resize', () => {
    if (previewArea.style.display !== 'none') setupCanvas();
});

// ═══════════════════════════════════════════
//  SELECTION BOX — MOUSE
// ═══════════════════════════════════════════
selectionCanvas.addEventListener('mousedown', (e) => {
    const rect = selectionCanvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    endX = endY = null;
    isDrawing = true;
    ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
});

selectionCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = selectionCanvas.getBoundingClientRect();
    endX = e.clientX - rect.left;
    endY = e.clientY - rect.top;
    drawSelectionBox();
});

selectionCanvas.addEventListener('mouseup', () => { isDrawing = false; });
selectionCanvas.addEventListener('mouseleave', () => { isDrawing = false; });

// ═══════════════════════════════════════════
//  SELECTION BOX — TOUCH (mobile)
// ═══════════════════════════════════════════
selectionCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = selectionCanvas.getBoundingClientRect();
    const t = e.touches[0];
    startX = t.clientX - rect.left;
    startY = t.clientY - rect.top;
    isDrawing = true;
    ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
}, { passive: false });

selectionCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const rect = selectionCanvas.getBoundingClientRect();
    const t = e.touches[0];
    endX = t.clientX - rect.left;
    endY = t.clientY - rect.top;
    drawSelectionBox();
}, { passive: false });

selectionCanvas.addEventListener('touchend', () => { isDrawing = false; });

// ═══════════════════════════════════════════
//  DRAW SELECTION BOX
// ═══════════════════════════════════════════
function drawSelectionBox() {
    ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    const w = endX - startX;
    const h = endY - startY;

    // Dim outside selection
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    // Clear inside (bright)
    ctx.clearRect(startX, startY, w, h);

    // Selection fill
    ctx.fillStyle = 'rgba(99,102,241,0.08)';
    ctx.fillRect(startX, startY, w, h);

    // Border
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(startX, startY, w, h);
    ctx.setLineDash([]);

    // Corner handles
    const corners = [
        [startX, startY], [startX + w, startY],
        [startX, startY + h], [startX + w, startY + h]
    ];
    corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#6366f1';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    // Size label
    const pw = previewImage.naturalWidth / previewImage.clientWidth;
    const ph = previewImage.naturalHeight / previewImage.clientHeight;
    const realW = Math.round(Math.abs(w) * pw);
    const realH = Math.round(Math.abs(h) * ph);
    ctx.fillStyle = 'rgba(99,102,241,0.9)';
    ctx.font = '11px Inter, sans-serif';
    const label = `${realW} × ${realH}px`;
    const lx = Math.min(startX, endX) + 6;
    const ly = Math.min(startY, endY) - 8;
    ctx.fillText(label, lx, ly > 14 ? ly : Math.max(startY, endY) + 18);
}

// ═══════════════════════════════════════════
//  CALCULATE
// ═══════════════════════════════════════════
calculateBtn.addEventListener('click', async () => {
    if (!selectedFile) { showToast('⚠️ Please select an image first'); return; }

    // Animate button
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = `<svg class="spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        stroke="white" stroke-width="2" stroke-linecap="round"/></svg> Analyzing...`;

    loadingEl.style.display = 'flex';
    resultEl.innerHTML = '';

    const formData = new FormData();
    formData.append('image', selectedFile);

    if (startX != null && endX != null) {
        const scaleX = previewImage.naturalWidth  / previewImage.clientWidth;
        const scaleY = previewImage.naturalHeight / previewImage.clientHeight;
        formData.append('x1', Math.round(Math.min(startX, endX) * scaleX));
        formData.append('y1', Math.round(Math.min(startY, endY) * scaleY));
        formData.append('x2', Math.round(Math.max(startX, endX) * scaleX));
        formData.append('y2', Math.round(Math.max(startY, endY) * scaleY));
    }

    try {
        const response = await fetch('/calculate', { method: 'POST', body: formData });
        const data = await response.json();
        loadingEl.style.display = 'none';
        renderResults(data);
    } catch (err) {
        loadingEl.style.display = 'none';
        resultEl.innerHTML = `<div class="error-box">❌ Network error: ${err.message}</div>`;
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/>
            <path d="M12 8v4l3 3" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg> Analyze & Calculate Total`;
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});

// ═══════════════════════════════════════════
//  RENDER RESULTS
// ═══════════════════════════════════════════
function renderResults(data) {
    if (data.error) {
        resultEl.innerHTML = `<div class="error-box">❌ ${data.error}</div>`;
        return;
    }

    if (!data.calculations || data.calculations.length === 0) {
        resultEl.innerHTML = `<div class="error-box">⚠️ No items detected — try a clearer image or better lighting</div>`;
        return;
    }

    const modeIcon  = data.mode === 'bill' ? '🧾' : '🧮';
    const modeLabel = data.mode === 'bill' ? 'Bill / Grocery' : 'Math Sheet';

    // Build items HTML with staggered animation
    const itemsHTML = data.calculations.map((calc, i) => `
        <div class="calc-item" style="animation-delay:${i * 0.05}s">
            <span class="calc-expr">${i + 1}. ${escapeHTML(calc.expression)}</span>
            <span class="calc-result">₹${calc.result % 1 === 0 ? calc.result : calc.result.toFixed(2)}</span>
        </div>
    `).join('');

    // Animated count-up for total
    resultEl.innerHTML = `
        <div class="result-card">
            <div class="result-header">
                <div class="result-title">${modeIcon} ${modeLabel} — ${data.count} item(s)</div>
                <div class="method-badge">⚡ ${data.method}</div>
            </div>
            ${itemsHTML}
            <div class="total-box">
                <span class="total-label">💰 Grand Total</span>
                <span class="total-value" id="totalDisplay">₹0</span>
            </div>
        </div>`;

    // Count-up animation for total
    animateCountUp(document.getElementById('totalDisplay'), data.total);
}

// ═══════════════════════════════════════════
//  COUNT-UP ANIMATION (JS superpower 💥)
// ═══════════════════════════════════════════
function animateCountUp(el, target) {
    const duration = 900;
    const start = performance.now();
    const isDecimal = target % 1 !== 0;

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out curve
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = eased * target;
        el.textContent = `₹${isDecimal ? current.toFixed(2) : Math.round(current)}`;
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ═══════════════════════════════════════════
//  TOAST NOTIFICATION (JS superpower 💥)
// ═══════════════════════════════════════════
function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%) translateY(20px);
        background: rgba(20,20,40,0.95); border: 1px solid rgba(255,255,255,0.12);
        color: white; padding: 12px 22px; border-radius: 40px;
        font-size: 14px; font-weight: 500; z-index: 9999;
        backdrop-filter: blur(12px); opacity: 0;
        transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ═══════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════
resetBtn.addEventListener('click', () => {
    previewArea.style.display = 'none';
    dropZone.style.display = 'block';
    resultEl.innerHTML = '';
    loadingEl.style.display = 'none';
    selectedFile = null;
    startX = startY = endX = endY = null;
    fileInput.value = '';
    cameraInput.value = '';
    if (ctx) ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

    // Animate upload zone back in
    dropZone.style.opacity = '0';
    requestAnimationFrame(() => {
        dropZone.style.transition = 'opacity 0.3s ease';
        dropZone.style.opacity = '1';
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ═══════════════════════════════════════════
//  SECURITY: escape HTML
// ═══════════════════════════════════════════
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════
//  SPIN ANIMATION for button (add to CSS)
// ═══════════════════════════════════════════
const style = document.createElement('style');
style.textContent = `.spin-icon { animation: spinRing 0.8s linear infinite; }`;
document.head.appendChild(style);
