// GLOBAL STATE
let filesToProcess = [];
let spendPieChart = null;
let draggedItemIndex = null;
// --- GLOBAL SETTINGS HELPERS ---
function getSym() {
  const map = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AUD: "A$",
    SAR: "SAR ",
  };
  return map[localStorage.getItem("settingsCurrency") || "INR"];
}
function getLang() {
  return localStorage.getItem("settingsLanguage") || "en-IN";
}

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
const closeImageModal = document.getElementById("closeImageModal");
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
    addFiles([newFile]);
    stopCamera();
  });
}

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
}
window.addEventListener("mouseup", () => {
  isModalDrawing = false;
});

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

    newFile.precalcQuality = filesToProcess[activeFileIndex].precalcQuality;
    filesToProcess[activeFileIndex] = newFile;

    renderThumbnails();
    exitCropMode();
    imageModal.style.display = "none";
  };
}

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

async function addFiles(newFiles) {
  if (!newFiles || newFiles.length === 0) return;

  const incomingFiles = Array.from(newFiles);

  for (let f of incomingFiles) {
    f.precalcQuality = null;
    f.previewUrl = URL.createObjectURL(f);
    filesToProcess.push(f);
  }
  updateUIState();

  for (
    let i = filesToProcess.length - incomingFiles.length;
    i < filesToProcess.length;
    i++
  ) {
    fetchQualityInBackground(filesToProcess[i], i);
  }
}

async function fetchQualityInBackground(fileObj, index) {
  const fd = new FormData();
  fd.append("image", fileObj);
  try {
    const res = await fetch("/analyze_image", { method: "POST", body: fd });
    const data = await res.json();
    fileObj.precalcQuality = data.quality;
    renderThumbnails();
  } catch (e) {
    console.log("Background check failed.");
  }
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
  renderThumbnails();
}

// ==========================================
// 💥 CLEAN THUMBNAIL RENDERER (SVG EDITION)
// ==========================================
function renderThumbnails() {
  const grid = document.getElementById("thumbnailGrid");
  if (!grid) return;

  grid.innerHTML = "";

  // Strictly check for your actual app data array
  if (!filesToProcess || filesToProcess.length === 0) return;

  filesToProcess.forEach((fileItem, index) => {
    try {
      const div = document.createElement("div");

      // This perfectly connects to your style.css!
      div.className = "thumbnail-item position-relative";

      let imgSrc = fileItem.previewUrl || "";

      let qualityBadge = "";
      let qualityScore = fileItem.precalcQuality;

      if (qualityScore !== null && qualityScore !== undefined) {
        qualityBadge = `
                <div class="thumb-quality" title="OpenCV Sharpness Score">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    ${qualityScore}%
                </div>`;
      }

      // Clean, original layout structure with premium SVGs
      div.innerHTML = `
                <span class="thumb-number">#${index + 1}</span>
                <img src="${imgSrc}" draggable="false" style="pointer-events: none;">
                ${qualityBadge}
                <div class="thumb-delete d-flex align-items-center justify-content-center" onclick="removeFile(${index}, event)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
            `;

      grid.appendChild(div);
    } catch (err) {
      console.error("QuickTotal Error appending thumbnail:", err);
    }
  });
}
function getAccuracyInfo(score) {
  const num = parseInt(score) || 0;
  if (num >= 90) return { color: "#fbbf24", text: "Excellent" };
  if (num >= 50) return { color: "#34d399", text: "Good" };
  return { color: "#ef4444", text: "Low Confidence" };
}

function guessCategory(text) {
  const lower = text.toLowerCase();
  if (
    /(coca|cola|pepsi|sprite|fanta|limca|maza|cold drink|beverage|water|soda|juice|chai|coffee|tea|drink|piv|shikanji)/i.test(
      lower,
    )
  )
    return "Beverages";
  if (/(doodh|milk|paneer|curd|dahi|butter|cheese|ghee|dairy)/i.test(lower))
    return "Dairy";
  if (
    /(maggi|biscuit|namkeen|chips|kurkure|lays|snack|chocolate|candy|sweet|mithai|parle|samosa)/i.test(
      lower,
    )
  )
    return "Snacks";
  if (
    /(aata|atta|rice|sugar|dal|pulse|oil|masala|spices|vegetable|fruit|onion|potato|tomato|grocery|kirana|sabzi|chini|salt|namak)/i.test(
      lower,
    )
  )
    return "Groceries";
  if (
    /(shirt|kurta|pant|jeans|tshirt|shoes|clothing|fabric|suit|wear|garment|chappal|sandal)/i.test(
      lower,
    )
  )
    return "Clothing & Footwear";
  if (
    /(wire|cable|phone|battery|charger|usb|electronics|led|bulb|plug|adaptor|mobile|laptop|earphone|headphone)/i.test(
      lower,
    )
  )
    return "Electronics";
  if (
    /(tablet|paracetamol|medicine|syrup|doctor|pharmacy|pill|medical|clinic|hospital|bandaid)/i.test(
      lower,
    )
  )
    return "Medical";
  if (
    /(auto|cab|uber|ola|bus|train|ticket|travel|petrol|fuel|diesel|cng|parking|toll|flight)/i.test(
      lower,
    )
  )
    return "Transport";
  if (
    /(book|pen|pencil|paper|notebook|stationary|eraser|school|college|fee|tuition|math|science|exam)/i.test(
      lower,
    )
  )
    return "Education & Stationery";
  if (
    /(bill|recharge|tax|rent|emi|insurance|water bill|electricity|gas)/i.test(
      lower,
    )
  )
    return "Bills & Utilities";
  if (
    /^[0-9+\-/*=xX\s()]+$/.test(text) ||
    text.includes("+") ||
    text.includes("-") ||
    text.includes("=")
  )
    return "Math Problem";
  return "Misc";
}

calculateBtn.addEventListener("click", async () => {
  if (filesToProcess.length === 0) return;

  loadingEl.style.display = "block";
  actionButtons.style.display = "none";
  resultsContainer.style.display = "block";
  receiptsList.innerHTML = "";
  grandTotalCard.style.display = "none";

  const breakdownContainer = document.getElementById("categoryBreakdown");
  if (breakdownContainer) breakdownContainer.style.display = "none";

  let grandTotal = 0;
  let successfulDocs = 0;
  const totalFiles = filesToProcess.length;

  try {
    for (let i = 0; i < totalFiles; i++) {
      const file = filesToProcess[i];
      const formData = new FormData();
      formData.append("images", file);
      formData.append("image_index", i + 1);
      formData.append("total_images", totalFiles);
      formData.append("precalculated_quality", file.precalcQuality);

      const colWrap = document.createElement("div");
      colWrap.className = "col-12 col-md-6 mb-4";

      const tempCard = document.createElement("div");
      tempCard.className =
        "receipt-card glass-panel h-100 animate-pop rounded-4 shadow-sm";
      tempCard.dataset.imageIndex = i;
      tempCard.dataset.filename = file.name;
      tempCard.innerHTML = `<div class="rc-header p-3 border-bottom border-secondary"><span>Document #${i + 1}</span><span style="color:#8b5cf6;">Processing... ⏳</span></div>`;

      colWrap.appendChild(tempCard);
      receiptsList.appendChild(colWrap);

      if (file.precalcQuality !== null && parseInt(file.precalcQuality) < 2) {
        tempCard.innerHTML = `<div class="rc-header p-3 border-bottom border-secondary"><span>Document #${i + 1}</span><span class="val-neg">❌ Invalid Image</span></div><p class="p-3 text-muted" style="font-size: 0.9em; line-height: 1.6; color: #94a3b8;">Skipped to save time and API costs. This image appears to be too messy, blurry, or not a receipt (Score: ${file.precalcQuality}%).</p>`;
        continue;
      }

      try {
        const res = await fetch("/calculate", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error || !data.results || data.results[0].error) {
          tempCard.innerHTML = `<div class="rc-header p-3 border-bottom border-secondary"><span>Document #${i + 1}</span><span class="val-neg">Failed</span></div><p class="p-3">Error processing image.</p>`;
          continue;
        }

        const result = data.results[0];
        const itemCount = result.items.length;
        let itemsHtml = "";

        result.items.forEach((item) => {
          const isNeg = item.result < 0;
          const category = item.category || "Misc";
          itemsHtml += `
            <div class="rc-item px-3 py-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 border-bottom border-light">
                <div class="d-flex align-items-center gap-2 flex-wrap flex-grow-1" style="max-width: 100%;">
                    <span class="editable-text item-name-field text-wrap" contenteditable="true" spellcheck="false" title="Click to edit name" style="word-break: break-word; min-width: 100px;">${item.expression}</span>
                    <span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false" title="Click to edit category">${category}</span>
                </div>
                <div class="d-flex align-items-center justify-content-end gap-2 ms-auto ms-sm-0 utils-wrapper">
                    <span class="rc-item-val editable-text price-edit ${isNeg ? "val-neg" : ""}" contenteditable="true" spellcheck="false" title="Click to edit price">${isNeg ? "-" : "+"}${getSym()}${Math.abs(item.result).toFixed(2)}</span>
                    
                    <button class="inline-mic-btn btn p-1 d-flex align-items-center justify-content-center" title="Speak item and price" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #64748b; transition: all 0.2s;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></button>
                    
                    <button class="inline-insert-btn btn p-1 d-flex align-items-center justify-content-center" title="Insert missing item below" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #3b82f6; transition: all 0.2s;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                    
                    <button class="inline-delete-btn btn p-1 d-flex align-items-center justify-content-center" title="Delete mistake" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #fee2e2; background: #ffffff; color: #ef4444; transition: all 0.2s;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </div>`;
        });

        const imgScoreNum = parseInt(result.image_quality) || 0;
        const accScoreNum = parseInt(result.ai_accuracy) || 0;
        let imgInfo = getAccuracyInfo(imgScoreNum);
        let accInfo = getAccuracyInfo(accScoreNum);

        if (accScoreNum === 100) {
          tempCard.classList.add("notebooklm-card-glow");
          setTimeout(() => {
            tempCard.classList.remove("notebooklm-card-glow");
          }, 4000);
        }

        tempCard.innerHTML = `
            <div class="rc-header p-3 border-bottom border-secondary" style="position: relative; z-index: 2;">
                <span>Document #${i + 1} <span class="entry-count" style="font-size:0.85em; font-weight:500; color:var(--text-muted);">(${itemCount} entries)</span></span>
                <span class="rc-method-badge">${result.method}</span>
            </div>
            <div class="rc-items-list" style="position: relative; z-index: 2;">${itemsHtml}</div>
            <div style="position: relative; z-index: 2; text-align: center; display: flex; justify-content: center; gap: 10px;" class="my-3 flex-wrap px-2">
                <div class="add-row-btn" title="Add Missing Item">+ Add Missing Item</div>
                <div class="save-train-btn" title="Save to training dataset.">✅ Approve & Save</div>
            </div>
            <div class="rc-subtotal px-3 py-2 border-top border-secondary border-opacity-25" style="position: relative; z-index: 2;"><span>Subtotal</span><span class="rc-subtotal-val">${getSym()}${result.subtotal.toFixed(2)}</span></div>
            <div class="p-3 border-top border-secondary border-opacity-25" style="position: relative; z-index: 2;">
                <div class="accuracy-label"><span>Image Quality</span><span style="color: ${imgInfo.color};">${imgScoreNum}%</span></div>
                <div class="accuracy-bar-bg"><div class="accuracy-bar-fill" style="width: ${imgScoreNum}%; background: ${imgInfo.color};"></div></div>
                <div class="accuracy-label mt-2"><span>AI Accuracy</span><span style="color: ${accInfo.color};">${accScoreNum}%</span></div>
                <div class="accuracy-bar-bg"><div class="accuracy-bar-fill" style="width: ${accScoreNum}%; background: ${accInfo.color};"></div></div>
            </div>
        `;
        grandTotal += result.subtotal;
        successfulDocs++;
      } catch (err) {
        tempCard.innerHTML = `<div class="rc-header p-3"><span>Document #${i + 1}</span><span class="val-neg">Error</span></div><p class="px-3">Server Error.</p>`;
      }
    }
  } finally {
    loadingEl.style.display = "none";
    actionButtons.style.display = "flex";
    if (successfulDocs > 0) {
      grandTotalValue.textContent = `${getSym()}${grandTotal.toFixed(2)}`;
      grandTotalCard.style.display = "flex";
      recalculateLiveMath();
    }
  }
});

receiptsList.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("editable-text")) {
    const text = e.target.textContent.trim();
    if (
      ["New Item", "+${getSym()}0.00", "-${getSym()}0.00", "Misc"].includes(
        text,
      )
    )
      e.target.textContent = "";
  }
});

// 📌 THE CURSOR FIX: Safe Live Updates
receiptsList.addEventListener("input", (e) => {
  // 1. Instant Category Update while typing
  if (e.target.classList.contains("item-name-field")) {
    const row = e.target.closest(".rc-item");
    const catField = row.querySelector(".item-cat-field");
    // Ensure we don't overwrite if the user is somehow editing the category manually
    if (catField && document.activeElement !== catField) {
      catField.textContent = guessCategory(e.target.textContent);
    }
  }

  // 2. Trigger recalculation but safely
  if (
    e.target.classList.contains("price-edit") ||
    e.target.classList.contains("cat-badge") ||
    e.target.classList.contains("item-name-field")
  ) {
    recalculateLiveMath();
  }
});

receiptsList.addEventListener("keydown", (e) => {
  if (e.target.classList.contains("editable-text") && e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
});

receiptsList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("inline-mic-btn")) {
    const micBtn = e.target;
    const row = micBtn.closest(".rc-item");
    const nameField = row.querySelector(".item-name-field");
    const priceField = row.querySelector(".price-edit");
    const catField = row.querySelector(".item-cat-field");
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice input not supported.");
    const recognition = new SpeechRecognition();
    recognition.lang = getLang();
    micBtn.style.filter = "none";
    micBtn.textContent = "🔴";
    recognition.onresult = (event) => {
      let transcript = event.results[0][0].transcript;
      const priceMatch = transcript.match(/[\d.]+/);
      let priceVal = 0;
      let itemName = transcript;
      if (priceMatch) {
        priceVal = parseFloat(priceMatch[0]);
        itemName = transcript
          .replace(priceMatch[0], "")
          .replace(
            /rupees|rupee|rs|rupaye|rupay|rupya|bucks|₹|\$|€|£|sar|रुपये|रुपया/gi,
            "",
          )
          .replace(/[।.,]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        itemName = itemName.replace(/[।.,]/g, "").trim();
      }
      const enDict = {
        मिल्क: "Milk",
        ब्रेड: "Bread",
        बिस्किट: "Biscuit",
        बटर: "Butter",
        सॉस: "Sauce",
        चीज: "Cheese",
        पनीर: "Paneer",
        मैगी: "Maggi",
        "कोका कोला": "Coca-Cola",
        पेप्सी: "Pepsi",
        "कोल्ड ड्रिंक": "Cold Drink",
      };
      for (const [hiWord, enWord] of Object.entries(enDict)) {
        itemName = itemName.replace(new RegExp(hiWord, "gi"), enWord);
      }
      nameField.textContent = itemName;
      priceField.textContent = `+${getSym()}${priceVal.toFixed(2)}`;
      if (catField) {
        catField.textContent = guessCategory(itemName);
      }
      recalculateLiveMath();
      micBtn.textContent = "🎙️";
      micBtn.style.filter = "grayscale(1)";
    };
    recognition.onerror = () => {
      micBtn.textContent = "🎙️";
      micBtn.style.filter = "grayscale(1)";
    };
    recognition.onend = () => {
      micBtn.textContent = "🎙️";
      micBtn.style.filter = "grayscale(1)";
    };
    recognition.start();
  }

  if (e.target.classList.contains("inline-insert-btn")) {
    const currentRow = e.target.closest(".rc-item");
    const newRow = document.createElement("div");
    newRow.className = "rc-item animate-pop px-3";
    newRow.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span class="editable-text item-name-field" contenteditable="true" spellcheck="false">New Item</span><span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false">Misc</span></div><div style="display: flex; align-items: center; gap: 12px;"><span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false">+${getSym()}0.00</span><span class="inline-mic-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;">🎙️</span><span class="inline-insert-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;">➕</span><span class="inline-delete-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;">🗑️</span></div>`;
    currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
    newRow.querySelector(".item-name-field").focus();
    const card = e.target.closest(".receipt-card");
    const countSpan = card.querySelector(".entry-count");
    if (countSpan)
      countSpan.textContent = `(${card.querySelectorAll(".rc-item").length} entries)`;
    recalculateLiveMath();
  }

  if (e.target.classList.contains("inline-delete-btn")) {
    const row = e.target.closest(".rc-item");
    const card = row.closest(".receipt-card");
    row.remove();
    const countSpan = card.querySelector(".entry-count");
    if (countSpan)
      countSpan.textContent = `(${card.querySelectorAll(".rc-item").length} entries)`;
    recalculateLiveMath();
  }

  if (e.target.classList.contains("add-row-btn")) {
    const card = e.target.closest(".receipt-card");
    const itemsList = card.querySelector(".rc-items-list");
    const newRow = document.createElement("div");
    newRow.className = "rc-item animate-pop px-3";
    newRow.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span class="editable-text item-name-field" contenteditable="true" spellcheck="false">New Item</span><span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false">Misc</span></div><div style="display: flex; align-items: center; gap: 12px;"><span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false">+${getSym()}0.00</span><span class="inline-mic-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;">🎙️</span><span class="inline-insert-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;">➕</span><span class="inline-delete-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;">🗑️</span></div>`;
    itemsList.appendChild(newRow);
    newRow.querySelector(".item-name-field").focus();
    const countSpan = card.querySelector(".entry-count");
    if (countSpan)
      countSpan.textContent = `(${itemsList.querySelectorAll(".rc-item").length} entries)`;
    recalculateLiveMath();
  }

  if (e.target.classList.contains("save-train-btn")) {
    const btn = e.target;
    const card = btn.closest(".receipt-card");
    const imageIndex = parseInt(card.dataset.imageIndex);
    const fileToSave = filesToProcess[imageIndex];
    let correctedItems = [];
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      correctedItems.push({
        item: itemEl.querySelector(".item-name-field").textContent.trim(),
        category: itemEl.querySelector(".item-cat-field").textContent.trim(),
        amount:
          parseFloat(
            itemEl
              .querySelector(".price-edit")
              .textContent.replace(/[^\d.-]/g, ""),
          ) || 0,
      });
    });
    btn.textContent = "Saving... ⏳";
    btn.style.pointerEvents = "none";
    try {
      const formData = new FormData();
      formData.append("image", fileToSave);
      formData.append("original_filename", fileToSave.name);
      formData.append("json_data", JSON.stringify({ items: correctedItems }));
      const res = await fetch("/save_training_data", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        btn.textContent = "Update Dataset 🔄";
        btn.style.background = "rgba(59, 130, 246, 0.4)";
        btn.style.color = "white";
        btn.style.border = "none";
        btn.style.pointerEvents = "auto";
      } else throw new Error("Failed");
    } catch (err) {
      alert("Error saving training data.");
      btn.textContent = "✅ Approve & Save";
      btn.style.pointerEvents = "auto";
    }
  }
});

// 📌 THE SECOND PART OF THE CURSOR FIX: Only rewrite text Content if NOT actively typed on!
function recalculateLiveMath() {
  let newGrandTotal = 0;
  let categoryTotals = {};

  document.querySelectorAll(".receipt-card").forEach((card) => {
    let cardSubtotal = 0;
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      const nameElement = itemEl.querySelector(".item-name-field");
      const priceElement = itemEl.querySelector(".price-edit");
      const catElement = itemEl.querySelector(".cat-badge");

      let rawText = priceElement.textContent.replace(/[^\d.-]/g, "");
      let value = parseFloat(rawText) || 0;
      const isNeg = value < 0;

      // ✅ This strictly prevents the cursor jump by checking if the user is typing in it!
      if (document.activeElement !== priceElement) {
        priceElement.textContent = `${isNeg ? "-" : "+"}${getSym()}${Math.abs(value).toFixed(2)}`;
      }

      if (isNeg) priceElement.classList.add("val-neg");
      else priceElement.classList.remove("val-neg");

      cardSubtotal += value;
      let catName = catElement.textContent.trim() || "Misc";

      // ✅ Also protect the category badge cursor if the user is manually editing it
      if (document.activeElement !== catElement) {
        catName =
          catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
        catElement.textContent = catName;
      }

      categoryTotals[catName] = (categoryTotals[catName] || 0) + value;
    });
    const subVal = card.querySelector(".rc-subtotal-val");
    if (subVal) subVal.textContent = `${getSym()}${cardSubtotal.toFixed(2)}`;
    newGrandTotal += cardSubtotal;
  });
  if (grandTotalValue)
    grandTotalValue.textContent = `${getSym()}${newGrandTotal.toFixed(2)}`;

  let breakdownContainer = document.getElementById("categoryBreakdown");
  if (newGrandTotal === 0 && Object.keys(categoryTotals).length === 0) {
    breakdownContainer.style.display = "none";
  } else {
    breakdownContainer.style.display = "block";
    let breakdownHtml = `<h3>📊 Spend by Category</h3>`;
    const sortedCats = Object.entries(categoryTotals).sort(
      (a, b) => b[1] - a[1],
    );
    sortedCats.forEach(([cat, val]) => {
      if (val === 0) return;
      const percentage =
        newGrandTotal !== 0
          ? Math.abs((val / newGrandTotal) * 100).toFixed(1)
          : 0;
      breakdownHtml += `<div class="cat-row"><span style="font-weight: 500; color: #c4b5fd;">${cat}</span><div style="flex-grow: 1; border-bottom: 1px dotted rgba(255,255,255,0.2); margin: 0 15px; position: relative; top: -4px;"></div><span>${getSym()}${val.toFixed(2)} <span style="font-size:0.8em; color:var(--text-muted); margin-left:5px;">(${percentage}%)</span></span></div>`;
    });
    breakdownHtml += `<div class="chart-wrapper"><canvas id="spendChart"></canvas></div>`;
    breakdownContainer.innerHTML = breakdownHtml;
    const ctx = document.getElementById("spendChart");
    if (ctx) {
      if (spendPieChart) spendPieChart.destroy();
      spendPieChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: sortedCats.map((item) => item[0]),
          datasets: [
            {
              data: sortedCats.map((item) => item[1]),
              backgroundColor: [
                "#8b5cf6",
                "#ec4899",
                "#3b82f6",
                "#10b981",
                "#f59e0b",
                "#ef4444",
                "#14b8a6",
              ],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "right",
              labels: { color: "#e2e8f0", font: { size: 12 } },
            },
          },
        },
      });
    }
  }
}

// ==========================================
// 1. REPLACEMENT: EXPORT CSV FUNCTION
// ==========================================
function downloadCSV() {
  // Prevent the default href="#" jump
  const e = window.event;
  if (e) e.preventDefault();

  try {
    // \uFEFF is the UTF-8 BOM which forces Excel to read Hindi characters properly
    let csvContent = "\uFEFF" + "S.No.,Item Name,Category,Price\n";
    let sno = 1;

    // Notice: The 'Document' column is completely removed here!
    document.querySelectorAll(".receipt-card").forEach((card) => {
      card.querySelectorAll(".rc-item").forEach((item) => {
        let name = item
          .querySelector(".item-name-field")
          .textContent.replace(/,/g, "")
          .trim();
        let cat = item
          .querySelector(".item-cat-field")
          .textContent.replace(/,/g, "")
          .trim();
        let price = item
          .querySelector(".price-edit")
          .textContent.replace(/[^\d.-]/g, "")
          .trim();

        csvContent += `${sno},"${name}","${cat}",${price}\n`;
        sno++;
      });
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `QuickTotal_Export_${new Date().getTime()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("CSV Export Error:", error);
    alert("Something went wrong downloading the CSV.");
  }
}

// ==========================================
// 2. REPLACEMENT: EXPORT PDF FUNCTION
// ==========================================
async function downloadPDF() {
  // Prevent the default href="#" jump
  const e = window.event;
  if (e) e.preventDefault();

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "pt", "a4");
    let docCursor = 50;

    // A. Dynamically load a Hindi-supporting font to stop the jibberish
    try {
      const fontUrl =
        "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf";
      const response = await fetch(fontUrl);
      const buffer = await response.arrayBuffer();
      const base64String = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );
      doc.addFileToVFS("NotoSansDevanagari.ttf", base64String);
      doc.addFont("NotoSansDevanagari.ttf", "NotoSansDevanagari", "normal");
      doc.setFont("NotoSansDevanagari");
    } catch (err) {
      console.warn("Could not load Hindi font. Falling back to default.");
      doc.setFont("helvetica");
    }

    // B. Setup Headers
    doc.setFontSize(22);
    doc.setTextColor(139, 92, 246);
    doc.text("QuickTotal Financial Report", 40, docCursor);
    docCursor += 20;

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, docCursor);
    docCursor += 40;

    // C. Inject the Pie Chart
    const chartCanvas = document.getElementById("spendChart");
    if (chartCanvas) {
      const imgData = chartCanvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", 180, docCursor, 200, 200);
      docCursor += 230;
    }

    // D. Build the Table Data (Using Global Currency)
    let sno = 1;
    let tableRows = [];
    document.querySelectorAll(".receipt-card").forEach((card) => {
      card.querySelectorAll(".rc-item").forEach((itemEl) => {
        tableRows.push([
          sno++,
          itemEl.querySelector(".item-name-field").textContent.trim(),
          itemEl.querySelector(".item-cat-field").textContent.trim(),
          `${getSym()} ${itemEl
            .querySelector(".price-edit")
            .textContent.replace(/[^\d.-]/g, "")
            .trim()}`,
        ]);
      });
    });

    // E. Print Table
    doc.autoTable({
      head: [["S.No.", "Item Name", "Category", "Price"]],
      body: tableRows,
      startY: docCursor,
      theme: "striped",
      headStyles: { fillColor: [139, 92, 246] },
      styles: { font: "NotoSansDevanagari", fontSize: 11 },
      margin: { left: 40, right: 40 },
    });

    docCursor = doc.lastAutoTable.finalY + 40;

    // F. Page break logic
    if (docCursor > 700) {
      doc.addPage();
      docCursor = 50;
    }

    // G. Add Grand Total Safely (Using Global Currency)
    const grandTotalEl = document.getElementById("grandTotalValue");
    const grandTotalText = grandTotalEl
      ? grandTotalEl.textContent.replace(/[^\d.-]/g, "").trim()
      : "0";

    doc.setFontSize(16);
    doc.setTextColor(139, 92, 246);
    doc.text(
      `Overall Grand Total: ${getSym()} ${grandTotalText}`,
      40,
      docCursor,
    );

    doc.save(`QuickTotal_Financial_Report_${new Date().getTime()}.pdf`);
  } catch (error) {
    console.error("PDF Export Error:", error);
    alert(
      "Something went wrong downloading the PDF. Please check the console.",
    );
  }
}
resetBtn.addEventListener("click", resetApp);
function resetApp() {
  filesToProcess = [];
  thumbnailGrid.innerHTML = "";
  receiptsList.innerHTML = "";
  previewArea.style.display = "none";
  dropZone.style.display = "block";
  resultsContainer.style.display = "none";
  loadingEl.style.display = "none";
  browseBtn.textContent = "Browse Files";
  grandTotalCard.style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==========================================
// CUSTOM UI CONTROLS & LOCAL STORAGE ENGINE
// ==========================================

// Maps to remember what text goes with what value
const langMap = {
  "hi-IN": "HINDI / English (Default)",
  "en-IN": "Pure English Only",
};

// Expanded Global Currencies
const currencyMap = {
  INR: "Indian Rupee (₹)",
  USD: "US Dollar ($)",
  EUR: "Euro (€)",
  GBP: "British Pound (£)",
  AUD: "Australian Dollar (A$)",
  SAR: "Saudi Riyal (SAR)",
};

function selectOption(event, buttonId, inputId, text, value) {
  if (event) event.preventDefault();

  const buttonSpan = document.querySelector(`#${buttonId} span`);
  // ✨ MICRO-INTERACTION: Premium SVG "Saved!" flash
  if (event) {
    // Inject a crisp SVG checkmark instead of a cartoony emoji
    buttonSpan.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span style="font-weight: 700; letter-spacing: 0.3px;">Saved</span>
            </div>
        `;
    buttonSpan.style.color = "#10b981"; // Premium success green

    // Revert back to the selected text after 1.2 seconds
    setTimeout(() => {
      buttonSpan.innerText = text;
      buttonSpan.style.color = ""; // Reset to default color
    }, 1200);
  } else {
    // If the app is just loading from memory, update text instantly without flashing
    buttonSpan.innerText = text;
  }
  document.getElementById(inputId).value = value;
  localStorage.setItem(inputId, value);

  if (event) {
    const menu = event.target.closest(".dropdown-menu");
    const items = menu.querySelectorAll(".dropdown-item");
    items.forEach((item) => item.classList.remove("active"));
    event.target.classList.add("active");
  }
  // Instantly update the UI if receipts are on the screen
  if (typeof recalculateLiveMath === "function") recalculateLiveMath();
}

// Initialize the app and load saved settings on startup
document.addEventListener("DOMContentLoaded", () => {
  const savedLang = localStorage.getItem("settingsLanguage");
  if (savedLang && langMap[savedLang]) {
    selectOption(
      null,
      "langBtn",
      "settingsLanguage",
      langMap[savedLang],
      savedLang,
    );
    const links = document.querySelectorAll(
      "#langBtn + .dropdown-menu .dropdown-item",
    );
    links.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("onclick").includes(savedLang))
        link.classList.add("active");
    });
  }

  const savedCurrency = localStorage.getItem("settingsCurrency");
  if (savedCurrency && currencyMap[savedCurrency]) {
    selectOption(
      null,
      "currencyBtn",
      "settingsCurrency",
      currencyMap[savedCurrency],
      savedCurrency,
    );
    const links = document.querySelectorAll(
      "#currencyBtn + .dropdown-menu .dropdown-item",
    );
    links.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("onclick").includes(savedCurrency))
        link.classList.add("active");
    });
  }
});
