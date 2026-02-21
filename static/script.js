// GLOBAL STATE
let filesToProcess = [];
let startX, startY, endX, endY;
let isDrawing = false;
let ctx = null;

// ELEMENTS
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const previewArea = document.getElementById("previewArea");
const thumbnailGrid = document.getElementById("thumbnailGrid");
const singleImageContainer = document.getElementById("singleImageContainer");
const previewImage = document.getElementById("previewImage");
const selectionCanvas = document.getElementById("selectionCanvas");
const fileCountLabel = document.getElementById("fileCountLabel");
const calculateBtn = document.getElementById("calculateBtn");
const resetBtn = document.getElementById("resetBtn");
const actionButtons = document.getElementById("actionButtons");
const loadingEl = document.getElementById("loading");
const resultsContainer = document.getElementById("resultsContainer");
const receiptsList = document.getElementById("receiptsList");
const grandTotalCard = document.getElementById("grandTotalCard");
const grandTotalValue = document.getElementById("grandTotalValue");
const browseBtn = document.getElementById("browseBtn");

// MODAL ELEMENTS
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeModal = document.querySelector(".close-modal");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");

// ============================================================
// MODAL & ZOOM / PAN LOGIC
// ============================================================
let currentZoom = 1;
let panX = 0;
let panY = 0;
let isDraggingImage = false;
let startDragX = 0;
let startDragY = 0;

function updateZoom() {
  modalImage.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function openModal(imgSrc) {
  modalImage.src = imgSrc;
  imageModal.style.display = "block";
  currentZoom = 1;
  panX = 0;
  panY = 0;
  updateZoom();
}

zoomInBtn.onclick = () => {
  currentZoom = Math.min(currentZoom + 0.25, 4);
  updateZoom();
};
zoomOutBtn.onclick = () => {
  currentZoom = Math.max(currentZoom - 0.25, 0.5);
  updateZoom();
};
zoomResetBtn.onclick = () => {
  currentZoom = 1;
  panX = 0;
  panY = 0;
  updateZoom();
};

// Mouse Wheel Zoom
modalImage.addEventListener("wheel", (e) => {
  e.preventDefault();
  currentZoom = Math.min(
    Math.max(0.5, currentZoom + (e.deltaY > 0 ? -0.1 : 0.1)),
    4,
  );
  updateZoom();
});

// Click and Drag to Pan
modalImage.addEventListener("mousedown", (e) => {
  isDraggingImage = true;
  startDragX = e.clientX - panX;
  startDragY = e.clientY - panY;
  modalImage.style.cursor = "grabbing";
});

window.addEventListener("mouseup", () => {
  isDraggingImage = false;
  modalImage.style.cursor = "grab";
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingImage) return;
  e.preventDefault();
  panX = e.clientX - startDragX;
  panY = e.clientY - startDragY;
  updateZoom();
});

closeModal.onclick = () => (imageModal.style.display = "none");
window.onclick = (e) => {
  if (e.target == imageModal) imageModal.style.display = "none";
};

// ============================================================
// FILE HANDLING
// ============================================================
["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});
dropZone.addEventListener("dragover", () => dropZone.classList.add("dragover"));
dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("dragover"),
);
dropZone.addEventListener("drop", (e) => {
  dropZone.classList.remove("dragover");
  addFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
  fileInput.value = "";
});

function addFiles(newFiles) {
  if (!newFiles || newFiles.length === 0) return;
  filesToProcess = filesToProcess.concat(Array.from(newFiles));
  updateUIState();
}

function removeFile(index, event) {
  event.stopPropagation();
  filesToProcess.splice(index, 1);
  updateUIState();
}

function updateUIState() {
  const count = filesToProcess.length;
  fileCountLabel.textContent = `${count} Document${count !== 1 ? "s" : ""} Ready`;
  resultsContainer.style.display = "none";

  if (count === 0) {
    resetApp();
    return;
  }

  dropZone.style.display = "none";
  previewArea.style.display = "block";
  browseBtn.textContent = "Add More Documents";
  actionButtons.style.display = "flex";

  startX = startY = endX = endY = null;
  if (ctx) ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

  if (count === 1) {
    thumbnailGrid.style.display = "none";
    singleImageContainer.style.display = "block";
    renderSinglePreview(filesToProcess[0]);
  } else {
    singleImageContainer.style.display = "none";
    thumbnailGrid.style.display = "flex";
    renderThumbnails();
  }
}

function renderThumbnails() {
  thumbnailGrid.innerHTML = "";
  filesToProcess.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.className = "thumbnail-item animate-pop";
      // Stagger animation for multiple thumbnails
      div.style.animationDelay = `${index * 0.05}s`;
      div.onclick = () => openModal(e.target.result);
      div.innerHTML = `
                <span class="thumb-number">#${index + 1}</span>
                <img src="${e.target.result}">
                <div class="thumb-delete" onclick="removeFile(${index}, event)">×</div>
            `;
      thumbnailGrid.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

function renderSinglePreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImage.src = e.target.result;
    // Wait for image to render in DOM before setting canvas size
    setTimeout(initCanvas, 50);
  };
  reader.readAsDataURL(file);
}

// ============================================================
// CANVAS CROP LOGIC (FIXED ALIGNMENT)
// ============================================================
function initCanvas() {
  // Crucial fix: Match canvas internal resolution to the actual rendered image size
  selectionCanvas.width = previewImage.clientWidth;
  selectionCanvas.height = previewImage.clientHeight;
  ctx = selectionCanvas.getContext("2d");
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(139, 92, 246, 0.2)";
}

function getPos(e) {
  const rect = selectionCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

selectionCanvas.addEventListener("mousedown", (e) => {
  if (filesToProcess.length !== 1) return;
  isDrawing = true;
  const p = getPos(e);
  startX = p.x;
  startY = p.y;
  endX = p.x;
  endY = p.y;
});
selectionCanvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  e.preventDefault();
  const p = getPos(e);
  endX = p.x;
  endY = p.y;
  redrawCanvas();
});
["mouseup", "mouseout", "touchend"].forEach((evt) =>
  selectionCanvas.addEventListener(evt, () => (isDrawing = false)),
);

// Touch events for mobile cropping
selectionCanvas.addEventListener(
  "touchstart",
  (e) => {
    if (filesToProcess.length !== 1) return;
    isDrawing = true;
    const p = getPos(e);
    startX = p.x;
    startY = p.y;
    endX = p.x;
    endY = p.y;
  },
  { passive: false },
);
selectionCanvas.addEventListener(
  "touchmove",
  (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const p = getPos(e);
    endX = p.x;
    endY = p.y;
    redrawCanvas();
  },
  { passive: false },
);

function redrawCanvas() {
  ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
  ctx.fillRect(startX, startY, endX - startX, endY - startY);
  ctx.strokeRect(startX, startY, endX - startX, endY - startY);
}

// ============================================================
// API SUBMISSION
// ============================================================
calculateBtn.addEventListener("click", async () => {
  if (filesToProcess.length === 0) return;

  loadingEl.style.display = "block";
  actionButtons.style.display = "none";
  resultsContainer.style.display = "none";
  receiptsList.innerHTML = "";

  const formData = new FormData();
  filesToProcess.forEach((file) => formData.append("images", file));

  // Send crop coordinates relative to the natural image size
  if (
    filesToProcess.length === 1 &&
    startX !== null &&
    Math.abs(endX - startX) > 5
  ) {
    const scale = previewImage.naturalWidth / previewImage.clientWidth;
    formData.append("x1", Math.round(Math.min(startX, endX) * scale));
    formData.append("y1", Math.round(Math.min(startY, endY) * scale));
    formData.append("x2", Math.round(Math.max(startX, endX) * scale));
    formData.append("y2", Math.round(Math.max(startY, endY) * scale));
  }

  try {
    const res = await fetch("/calculate", { method: "POST", body: formData });
    const data = await res.json();

    loadingEl.style.display = "none";
    resultsContainer.style.display = "block";

    if (data.error) {
      receiptsList.innerHTML = `<div class="error-msg">${data.error}</div>`;
      grandTotalCard.style.display = "none";
      return;
    }

    data.results.forEach((result, index) => {
      const card = document.createElement("div");
      card.className = "receipt-card glass-panel animate-pop";
      // Stagger animation for results
      card.style.animationDelay = `${index * 0.1}s`;

      if (result.error) {
        card.innerHTML = `<div class="rc-header"><span>Document #${result.index}</span><span class="val-neg">Failed</span></div><p>${result.error}</p>`;
      } else {
        let itemsHtml = "";
        result.items.forEach((item) => {
          const isNeg = item.result < 0;
          itemsHtml += `
                        <div class="rc-item">
                            <span>${item.expression}</span>
                            <span class="rc-item-val ${isNeg ? "val-neg" : ""}">${isNeg ? "" : "+"}₹${Math.abs(item.result).toFixed(2)}</span>
                        </div>`;
        });

        card.innerHTML = `
                    <div class="rc-header">
                        <span>Document #${result.index}</span>
                        <span class="rc-method-badge">${result.method}</span>
                    </div>
                    <div class="rc-items-list">${itemsHtml}</div>
                    <div class="rc-subtotal">
                        <span>Subtotal</span>
                        <span>₹${result.subtotal.toFixed(2)}</span>
                    </div>
                `;
      }
      receiptsList.appendChild(card);
    });

    grandTotalValue.textContent = `₹${data.grand_total.toFixed(2)}`;
    grandTotalCard.style.display = "flex";

    window.scrollTo({
      top: grandTotalCard.offsetTop - 20,
      behavior: "smooth",
    });
  } catch (err) {
    loadingEl.style.display = "none";
    resultsContainer.style.display = "block";
    receiptsList.innerHTML = `<div class="error-msg glass-panel">Connection Error: ${err.message}</div>`;
  }
});

// ============================================================
// RESET
// ============================================================
resetBtn.addEventListener("click", resetApp);

function resetApp() {
  filesToProcess = [];
  startX = startY = endX = endY = null;
  if (ctx) ctx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
  fileInput.value = "";

  dropZone.style.display = "block";
  previewArea.style.display = "none";
  resultsContainer.style.display = "none";
  loadingEl.style.display = "none";
  browseBtn.textContent = "Browse Files";

  window.scrollTo({ top: 0, behavior: "smooth" });
}
