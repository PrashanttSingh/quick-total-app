// GLOBAL STATE
let filesToProcess = [];

// ELEMENTS
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const previewArea = document.getElementById("previewArea");
const thumbnailGrid = document.getElementById("thumbnailGrid");
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

// IMAGE MODAL ELEMENTS
const imageModal = document.getElementById("imageModal");
const modalTransformWrapper = document.getElementById("modalTransformWrapper");
const modalImage = document.getElementById("modalImage");
const modalCropCanvas = document.getElementById("modalCropCanvas");
const closeImageModal = document.getElementById("closeImageModal");// FIXED
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const toggleCropBtn = document.getElementById("toggleCropBtn");
const applyCropBtn = document.getElementById("applyCropBtn");

// CAMERA MODAL ELEMENTS
const cameraModal = document.getElementById("cameraModal");
const cameraStream = document.getElementById("cameraStream");
const openCameraBtn = document.getElementById("openCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");
let videoStream = null;

// ============================================================
// CAMERA LOGIC
// ============================================================
if (openCameraBtn) {
  openCameraBtn.addEventListener("click", async () => {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      cameraStream.srcObject = videoStream;
      cameraModal.style.display = "flex";
    } catch (err) {
      alert("Camera access denied or not available.");
      console.error(err);
    }
  });
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
  if (cameraModal) cameraModal.style.display = "none";
}

if (closeCameraBtn) closeCameraBtn.addEventListener("click", stopCamera);

// Helper to convert base64 to File object
function dataURLtoFile(dataurl, filename) {
  let arr = dataurl.split(","),
    mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

if (captureBtn) {
  captureBtn.addEventListener("click", () => {
    if (!videoStream) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = cameraStream.videoWidth;
    tempCanvas.height = cameraStream.videoHeight;
    tempCanvas.getContext("2d").drawImage(cameraStream, 0, 0);

    const base64Image = tempCanvas.toDataURL("image/jpeg");
    const newFile = dataURLtoFile(
      base64Image,
      `camera_capture_${Date.now()}.jpg`,
    );

    filesToProcess.push(newFile);
    updateUIState();
    stopCamera();
  });
}

// ============================================================
// MODAL & CROP LOGIC
// ============================================================
let currentZoom = 1,
  panX = 0,
  panY = 0;
let isDraggingImage = false,
  startDragX = 0,
  startDragY = 0;
let activeFileIndex = null;
let isCropMode = false;
let mCtx = modalCropCanvas ? modalCropCanvas.getContext("2d") : null;
let mStartX, mStartY, mEndX, mEndY;
let isModalDrawing = false;

function updateZoom() {
  if (modalTransformWrapper)
    modalTransformWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function openModal(file, index) {
  activeFileIndex = index;
  const reader = new FileReader();
  reader.onload = (e) => {
    modalImage.src = e.target.result;
    imageModal.style.display = "block";
    currentZoom = 1;
    panX = 0;
    panY = 0;
    updateZoom();
    exitCropMode();
  };
  reader.readAsDataURL(file);
}

// -- CROP TOOL TOGGLE --
if (toggleCropBtn) {
  toggleCropBtn.onclick = () => {
    isCropMode = !isCropMode;
    if (isCropMode) {
      toggleCropBtn.style.background = "var(--primary-solid)";
      applyCropBtn.style.display = "inline-block";
      modalCropCanvas.style.display = "block";

      modalCropCanvas.width = modalImage.clientWidth;
      modalCropCanvas.height = modalImage.clientHeight;

      mCtx.strokeStyle = "#8b5cf6";
      mCtx.lineWidth = 2;
      mCtx.fillStyle = "rgba(139, 92, 246, 0.2)";
    } else {
      exitCropMode();
    }
  };
}

function exitCropMode() {
  isCropMode = false;
  if (toggleCropBtn)
    toggleCropBtn.style.background = "rgba(255, 255, 255, 0.1)";
  if (applyCropBtn) applyCropBtn.style.display = "none";
  if (modalCropCanvas) modalCropCanvas.style.display = "none";
  if (mCtx) mCtx.clearRect(0, 0, modalCropCanvas.width, modalCropCanvas.height);
}

// -- CROP DRAWING EVENTS --
function getModalPos(e) {
  const rect = modalCropCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) / currentZoom,
    y: (clientY - rect.top) / currentZoom,
  };
}

if (modalCropCanvas) {
  modalCropCanvas.addEventListener("mousedown", (e) => {
    if (!isCropMode) return;
    isModalDrawing = true;
    const p = getModalPos(e);
    mStartX = p.x;
    mStartY = p.y;
    mEndX = p.x;
    mEndY = p.y;
  });

  modalCropCanvas.addEventListener("mousemove", (e) => {
    if (!isModalDrawing) return;
    e.preventDefault();
    const p = getModalPos(e);
    mEndX = p.x;
    mEndY = p.y;

    mCtx.clearRect(0, 0, modalCropCanvas.width, modalCropCanvas.height);
    mCtx.fillRect(mStartX, mStartY, mEndX - mStartX, mEndY - mStartY);
    mCtx.strokeRect(mStartX, mStartY, mEndX - mStartX, mEndY - mStartY);
  });

  modalCropCanvas.addEventListener(
    "touchstart",
    (e) => {
      if (!isCropMode) return;
      isModalDrawing = true;
      const p = getModalPos(e);
      mStartX = p.x;
      mStartY = p.y;
      mEndX = p.x;
      mEndY = p.y;
    },
    { passive: false },
  );

  modalCropCanvas.addEventListener(
    "touchmove",
    (e) => {
      if (!isModalDrawing) return;
      e.preventDefault();
      const p = getModalPos(e);
      mEndX = p.x;
      mEndY = p.y;
      mCtx.clearRect(0, 0, modalCropCanvas.width, modalCropCanvas.height);
      mCtx.fillRect(mStartX, mStartY, mEndX - mStartX, mEndY - mStartY);
      mCtx.strokeRect(mStartX, mStartY, mEndX - mStartX, mEndY - mStartY);
    },
    { passive: false },
  );
}

window.addEventListener("mouseup", () => {
  isModalDrawing = false;
});
window.addEventListener("touchend", () => {
  isModalDrawing = false;
});

// -- SAVE CROPPED IMAGE --
if (applyCropBtn) {
  applyCropBtn.onclick = () => {
    if (Math.abs(mEndX - mStartX) < 10)
      return alert("Please draw a larger box to crop.");

    const scaleFactor = modalImage.naturalWidth / modalImage.clientWidth;

    const finalX = Math.min(mStartX, mEndX) * scaleFactor;
    const finalY = Math.min(mStartY, mEndY) * scaleFactor;
    const finalW = Math.abs(mEndX - mStartX) * scaleFactor;
    const finalH = Math.abs(mEndY - mStartY) * scaleFactor;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = finalW;
    tempCanvas.height = finalH;
    tempCanvas
      .getContext("2d")
      .drawImage(
        modalImage,
        finalX,
        finalY,
        finalW,
        finalH,
        0,
        0,
        finalW,
        finalH,
      );

    const base64Image = tempCanvas.toDataURL("image/jpeg");
    const newFile = dataURLtoFile(
      base64Image,
      `cropped_part_${Date.now()}.jpg`,
    );

    filesToProcess[activeFileIndex] = newFile;
    renderThumbnails();

    exitCropMode();
    imageModal.style.display = "none";
  };
}

// -- PANNING & ZOOMING --
if (zoomInBtn)
  zoomInBtn.onclick = () => {
    currentZoom = Math.min(currentZoom + 0.25, 4);
    updateZoom();
  };
if (zoomOutBtn)
  zoomOutBtn.onclick = () => {
    currentZoom = Math.max(currentZoom - 0.25, 0.5);
    updateZoom();
  };
if (zoomResetBtn)
  zoomResetBtn.onclick = () => {
    currentZoom = 1;
    panX = 0;
    panY = 0;
    updateZoom();
  };

if (modalTransformWrapper) {
  modalTransformWrapper.addEventListener("wheel", (e) => {
    if (isCropMode) return;
    e.preventDefault();
    currentZoom = Math.min(
      Math.max(0.5, currentZoom + (e.deltaY > 0 ? -0.1 : 0.1)),
      4,
    );
    updateZoom();
  });
}

if (modalImage) {
  modalImage.addEventListener("mousedown", (e) => {
    if (isCropMode) return;
    isDraggingImage = true;
    startDragX = e.clientX - panX;
    startDragY = e.clientY - panY;
    modalImage.style.cursor = "grabbing";
  });
}

window.addEventListener("mouseup", () => {
  isDraggingImage = false;
  if (modalImage) modalImage.style.cursor = "crosshair";
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingImage || isCropMode) return;
  e.preventDefault();
  panX = e.clientX - startDragX;
  panY = e.clientY - startDragY;
  updateZoom();
});

if (closeImageModal)
  closeImageModal.onclick = () => (imageModal.style.display = "none");

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
  thumbnailGrid.style.display = "flex";

  // Hide the old single canvas UI explicitly
  const singleImgCont = document.getElementById("singleImageContainer");
  if (singleImgCont) singleImgCont.style.display = "none";

  renderThumbnails();
}

function renderThumbnails() {
  thumbnailGrid.innerHTML = "";
  filesToProcess.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.className = "thumbnail-item animate-pop";
      div.style.animationDelay = `${index * 0.05}s`;
      div.onclick = () => openModal(file, index);
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

// ============================================================
// API SUBMISSION (FIXED ONE-BY-ONE PROCESSING)
// ============================================================
calculateBtn.addEventListener("click", async () => {
  if (filesToProcess.length === 0) return;

  // HIDE BUTTONS & SHOW LOADING
  loadingEl.style.display = "block";
  actionButtons.style.display = "none";
  resultsContainer.style.display = "block";
  receiptsList.innerHTML = "";
  grandTotalCard.style.display = "none";

  let grandTotal = 0;
  let successfulDocs = 0;

  try {
    // ONE BY ONE PROCESSING PREVENTS SERVER CRASHES
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const formData = new FormData();
      formData.append("images", file);

      const tempCard = document.createElement("div");
      tempCard.className = "receipt-card glass-panel animate-pop";
      tempCard.innerHTML = `<div class="rc-header"><span>Document #${i + 1}</span><span style="color:#8b5cf6;">Processing... ⏳</span></div>`;
      receiptsList.appendChild(tempCard);

      try {
        const res = await fetch("/calculate", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.error || !data.results || data.results[0].error) {
          const errorMsg = data.error || data.results[0].error;
          tempCard.innerHTML = `<div class="rc-header"><span>Document #${i + 1}</span><span class="val-neg">Failed</span></div><p>${errorMsg}</p>`;
          continue;
        }

        const result = data.results[0];
        const itemCount = result.items.length;
        let itemsHtml = "";

        result.items.forEach((item) => {
          const isNeg = item.result < 0;
          itemsHtml += `
                        <div class="rc-item">
                            <span>${item.expression}</span>
                            <span class="rc-item-val ${isNeg ? "val-neg" : ""}">${isNeg ? "" : "+"}₹${Math.abs(item.result).toFixed(2)}</span>
                        </div>`;
        });

        tempCard.innerHTML = `
                    <div class="rc-header">
                        <span>Document #${i + 1} <span style="font-size:0.85em; font-weight:500; color:var(--text-muted);">(${itemCount} entries)</span></span>
                        <span class="rc-method-badge">${result.method}</span>
                    </div>
                    <div class="rc-items-list">${itemsHtml}</div>
                    <div class="rc-subtotal">
                        <span>Subtotal</span>
                        <span>₹${result.subtotal.toFixed(2)}</span>
                    </div>
                `;

        grandTotal += result.subtotal;
        successfulDocs++;
      } catch (err) {
        tempCard.innerHTML = `<div class="rc-header"><span>Document #${i + 1}</span><span class="val-neg">Error</span></div><p>Connection Error: ${err.message}</p>`;
      }
    }
  } catch (globalErr) {
    console.error("Global processing error:", globalErr);
    alert("An unexpected error occurred during processing.");
  } finally {
    // THIS IS THE CRITICAL FIX: IT ALWAYS PUTS THE BUTTONS BACK!
    loadingEl.style.display = "none";
    actionButtons.style.display = "flex";

    if (successfulDocs > 0) {
      grandTotalValue.textContent = `₹${grandTotal.toFixed(2)}`;
      grandTotalCard.style.display = "flex";
      window.scrollTo({
        top: grandTotalCard.offsetTop - 20,
        behavior: "smooth",
      });
    }
  }
});

// ============================================================
// RESET
// ============================================================
resetBtn.addEventListener("click", resetApp);

function resetApp() {
  filesToProcess = [];
  fileInput.value = "";
  dropZone.style.display = "block";
  previewArea.style.display = "none";
  resultsContainer.style.display = "none";
  loadingEl.style.display = "none";
  browseBtn.textContent = "Browse Files";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
