// GLOBAL STATE
let filesToProcess = [];
let spendPieChart = null;
let draggedItemIndex = null;

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

function renderThumbnails() {
  thumbnailGrid.innerHTML = "";

  filesToProcess.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "thumbnail-item animate-pop";
    div.style.animationDelay = `${index * 0.05}s`;
    div.draggable = true;

    div.addEventListener("dragstart", (e) => {
      draggedItemIndex = index;
      setTimeout(() => (div.style.opacity = "0.4"), 0);
    });

    div.addEventListener("dragend", (e) => {
      div.style.opacity = "1";
      draggedItemIndex = null;
    });

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      div.style.transform = "scale(1.05)";
      div.style.border = "2px dashed #8b5cf6";
    });

    div.addEventListener("dragleave", (e) => {
      div.style.transform = "none";
      div.style.border = "none";
    });

    div.addEventListener("drop", (e) => {
      e.preventDefault();
      div.style.transform = "none";
      div.style.border = "none";

      if (draggedItemIndex === null || draggedItemIndex === index) return;

      const draggedFile = filesToProcess.splice(draggedItemIndex, 1)[0];
      filesToProcess.splice(index, 0, draggedFile);
      renderThumbnails();
    });

    div.addEventListener("click", (e) => {
      if (!e.target.classList.contains("thumb-delete")) {
        openModal(file, index);
      }
    });

    let qualityBadge = "";
    if (file.precalcQuality !== null) {
      qualityBadge = `<div class="thumb-quality" title="OpenCV Sharpness Score">👁️ ${file.precalcQuality}%</div>`;
    }

    div.innerHTML = `
      <span class="thumb-number">#${index + 1}</span>
      <img src="${file.previewUrl}" draggable="false" style="pointer-events: none;">
      ${qualityBadge}
      <div class="thumb-delete" onclick="removeFile(${index}, event)">×</div>
    `;
    thumbnailGrid.appendChild(div);
  });
}

function getAccuracyInfo(score) {
  const num = parseInt(score) || 0;
  if (num >= 90) return { color: "#fbbf24", text: "Excellent" };
  if (num >= 50) return { color: "#34d399", text: "Good" };
  return { color: "#ef4444", text: "Low Confidence" };
}

// 📌 UPDATED: Added comprehensive Hindi words to Categories
function guessCategory(text) {
  const lower = text.toLowerCase();

  if (
    /(doodh|milk|maggi|soybean|aata|atta|rice|sugar|tea|coffee|dal|pulse|paneer|bread|butter|snack|biscuit|oil|masala|spices|vegetable|fruit|drink|parle|lays|दूध|मैगी|आटा|चीनी|चाय|दाल|पनीर|ब्रेड|मक्खन|तेल|मसाला|सब्जी|फल)/i.test(
      lower,
    )
  )
    return "Groceries";

  if (
    /(shirt|kurta|pant|jeans|tshirt|shoes|clothing|fabric|suit|शर्ट|कुर्ता|पैंट|कपड़ा|जूते)/i.test(
      lower,
    )
  )
    return "Clothing";

  if (
    /(wire|cable|phone|battery|charger|usb|electronics|led|bulb|plug|adaptor|तार|केबल|बैटरी|चार्जर|बल्ब)/i.test(
      lower,
    )
  )
    return "Electronics";

  if (
    /(tablet|paracetamol|medicine|syrup|doctor|pharmacy|pill|medical|clinic|दवा|गोली|सिरप|डॉक्टर)/i.test(
      lower,
    )
  )
    return "Medical";

  if (
    /(auto|cab|uber|ola|bus|train|ticket|travel|petrol|fuel|diesel|ऑटो|कैब|बस|ट्रेन|टिकट|पेट्रोल|डीजल)/i.test(
      lower,
    )
  )
    return "Transport";

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
        tempCard.innerHTML = `
              <div class="rc-header p-3 border-bottom border-secondary">
                  <span>Document #${i + 1}</span>
                  <span class="val-neg">❌ Invalid Image</span>
              </div>
              <p class="p-3 text-muted" style="font-size: 0.9em; line-height: 1.6; color: #94a3b8;">
                  Skipped to save time and API costs. This image appears to be too messy, blurry, or not a receipt (Score: ${file.precalcQuality}%).
              </p>`;
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
            <div class="rc-item px-3">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="editable-text item-name-field" contenteditable="true" spellcheck="false" title="Click to edit name">${item.expression}</span>
                    <span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false" title="Click to edit category">${category}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="rc-item-val editable-text price-edit ${isNeg ? "val-neg" : ""}" contenteditable="true" spellcheck="false" title="Click to edit price">${isNeg ? "-" : "+"}₹${Math.abs(item.result).toFixed(2)}</span>
                    <span class="inline-mic-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Speak item and price (e.g., 'Doodh 40')">🎙️</span>
                    <span class="inline-insert-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Insert missing item below">➕</span>
                    <span class="inline-delete-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Delete mistake">🗑️</span>
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
                <div class="add-row-btn" title="Did the AI miss an item? Add it here.">+ Add Missing Item</div>
                <div class="save-train-btn" title="Save this perfect receipt to your training dataset.">✅ Approve & Save</div>
            </div>
            <div class="rc-subtotal px-3 py-2 border-top border-secondary border-opacity-25" style="position: relative; z-index: 2;"><span>Subtotal</span><span class="rc-subtotal-val">₹${result.subtotal.toFixed(2)}</span></div>
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
      grandTotalValue.textContent = `₹${grandTotal.toFixed(2)}`;
      grandTotalCard.style.display = "flex";
      recalculateLiveMath();
    }
  }
});

receiptsList.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("editable-text")) {
    const text = e.target.textContent.trim();
    if (["New Item", "+₹0.00", "-₹0.00", "Misc"].includes(text))
      e.target.textContent = "";
  }
});

// 📌 UPDATED: Added LIVE Input Event to instantly guess Categories and update math as you type!
receiptsList.addEventListener("input", (e) => {
  if (e.target.classList.contains("item-name-field")) {
    const row = e.target.closest(".rc-item");
    const catField = row.querySelector(".item-cat-field");
    if (catField) {
      catField.textContent = guessCategory(e.target.textContent);
    }
  }

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
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    // 📌 UPDATED: Set language to hi-IN to recognize Hindi script natively
    recognition.lang = "hi-IN";
    recognition.continuous = false;

    micBtn.style.filter = "none";
    micBtn.textContent = "🔴";

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;

      const priceMatch = transcript.match(/[\d.]+/);
      let priceVal = 0;
      let itemName = transcript;

      if (priceMatch) {
        priceVal = parseFloat(priceMatch[0]);
        itemName = transcript
          .replace(priceMatch[0], "")
          .replace(
            /rupees|rupee|rs|rupaye|rupay|rupya|bucks|₹|रुपये|रुपया/gi,
            "",
          )
          .replace(/\s+/g, " ")
          .trim();
      }

      nameField.textContent = itemName;
      priceField.textContent = `+₹${priceVal.toFixed(2)}`;

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
      alert(
        "Voice not heard. Wait for the 🔴 red circle to appear before speaking.",
      );
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
    newRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span class="editable-text item-name-field" contenteditable="true" spellcheck="false" title="Click to edit name">New Item</span>
            <span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false" title="Click to edit category">Misc</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false" title="Click to edit price">+₹0.00</span>
            <span class="inline-mic-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Speak item and price (e.g., 'Doodh 40')">🎙️</span>
            <span class="inline-insert-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Insert missing item below">➕</span>
            <span class="inline-delete-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Delete mistake">🗑️</span>
        </div>
    `;
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
    newRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span class="editable-text item-name-field" contenteditable="true" spellcheck="false" title="Click to edit name">New Item</span>
            <span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false" title="Click to edit category">Misc</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false" title="Click to edit price">+₹0.00</span>
            <span class="inline-mic-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Speak item and price (e.g., 'Doodh 40')">🎙️</span>
            <span class="inline-insert-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Insert missing item below">➕</span>
            <span class="inline-delete-btn" style="cursor:pointer; filter: grayscale(1); transition: 0.2s;" onmouseover="this.style.filter='none'" onmouseout="this.style.filter='grayscale(1)'" title="Delete mistake">🗑️</span>
        </div>
    `;
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
      formData.append("json_data", JSON.stringify({ items: correctedItems }));

      const res = await fetch("/save_training_data", {
        method: "POST",
        body: formData,
      });
      // 📌 UPDATED: Changes to a clickable "Update Dataset" button!
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

function recalculateLiveMath() {
  let newGrandTotal = 0;
  let categoryTotals = {};

  document.querySelectorAll(".receipt-card").forEach((card) => {
    let cardSubtotal = 0;
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      const priceElement = itemEl.querySelector(".price-edit");
      const catElement = itemEl.querySelector(".cat-badge");

      let rawText = priceElement.textContent.replace(/[^\d.-]/g, "");
      let value = parseFloat(rawText) || 0;
      const isNeg = value < 0;
      priceElement.textContent = `${isNeg ? "-" : "+"}₹${Math.abs(value).toFixed(2)}`;

      if (isNeg) priceElement.classList.add("val-neg");
      else priceElement.classList.remove("val-neg");

      cardSubtotal += value;
      let catName = catElement.textContent.trim() || "Misc";
      catName =
        catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
      catElement.textContent = catName;
      categoryTotals[catName] = (categoryTotals[catName] || 0) + value;
    });
    const subVal = card.querySelector(".rc-subtotal-val");
    if (subVal) subVal.textContent = `₹${cardSubtotal.toFixed(2)}`;
    newGrandTotal += cardSubtotal;
  });
  if (grandTotalValue)
    grandTotalValue.textContent = `₹${newGrandTotal.toFixed(2)}`;

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
      breakdownHtml += `
        <div class="cat-row">
            <span style="font-weight: 500; color: #c4b5fd;">${cat}</span>
            <div style="flex-grow: 1; border-bottom: 1px dotted rgba(255,255,255,0.2); margin: 0 15px; position: relative; top: -4px;"></div>
            <span>₹${val.toFixed(2)} <span style="font-size:0.8em; color:var(--text-muted); margin-left:5px;">(${percentage}%)</span></span>
        </div>`;
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

function downloadCSV() {
  let csv = "S.No.,Document,Item,Category,Price\n";
  let sno = 1;
  document.querySelectorAll(".receipt-card").forEach((card, i) => {
    card.querySelectorAll(".rc-item").forEach((item) => {
      csv += `${sno++},Document #${i + 1},${item.querySelector(".item-name-field").textContent.replace(/,/g, "")},${item.querySelector(".item-cat-field").textContent.replace(/,/g, "")},${item.querySelector(".price-edit").textContent.replace(/[^\d.-]/g, "")}\n`;
    });
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `QuickTotal_Export_${Date.now()}.csv`;
  a.click();
}

function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "pt", "a4");

  doc.setFontSize(22);
  doc.setTextColor(139, 92, 246);
  doc.text("QuickTotal Financial Report", 40, 50);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 70);

  let docCursor = 90;

  document.querySelectorAll(".receipt-card").forEach((card, cardIndex) => {
    if (docCursor > 700) {
      doc.addPage();
      docCursor = 50;
    }

    const filename = card.dataset.filename || `Document #${cardIndex + 1}`;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(`Bill Source: ${filename}`, 40, docCursor);
    docCursor += 15;

    const subtotalText =
      card.querySelector(".rc-subtotal-val")?.textContent || "₹0.00";
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Subtotal: Rs. ${subtotalText.replace(/₹/g, "").trim()}`,
      40,
      docCursor,
    );
    docCursor += 15;

    const tableRows = [];
    let sno = 1;
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      tableRows.push([
        sno++,
        itemEl.querySelector(".item-name-field").textContent.trim(),
        itemEl.querySelector(".item-cat-field").textContent.trim(),
        `Rs. ${itemEl.querySelector(".price-edit").textContent.replace(/₹/g, "").trim()}`,
      ]);
    });

    doc.autoTable({
      head: [["S.No.", "Item Name", "Category", "Price"]],
      body: tableRows,
      startY: docCursor,
      theme: "striped",
      headStyles: { fillColor: [139, 92, 246] },
      styles: { font: "helvetica", fontSize: 11 },
      margin: { left: 40, right: 40 },
    });

    docCursor = doc.lastAutoTable.finalY + 40;
  });

  if (docCursor > 700) {
    doc.addPage();
    docCursor = 50;
  }

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(139, 92, 246);
  doc.text(
    `Overall Grand Total: Rs. ${document.getElementById("grandTotalValue").textContent.replace(/₹/g, "").trim()}`,
    40,
    docCursor,
  );
  docCursor += 50;

  if (spendPieChart) {
    const chartData = spendPieChart.data.datasets[0].data;
    const totalSum = chartData.reduce((acc, val) => acc + Number(val), 0);

    if (totalSum > 0) {
      const origLabels = [...spendPieChart.data.labels];
      spendPieChart.data.labels = origLabels.map(
        (label, index) =>
          `${label}: ${((Number(chartData[index]) / totalSum) * 100).toFixed(1)}%`,
      );

      spendPieChart.options.plugins.legend.labels.color = "#000000";
      spendPieChart.options.plugins.legend.labels.font.size = 18;
      spendPieChart.update("none");
      const chartImg = spendPieChart.toBase64Image();

      spendPieChart.options.plugins.legend.labels.color = "#e2e8f0";
      spendPieChart.options.plugins.legend.labels.font.size = 12;
      spendPieChart.data.labels = origLabels;
      spendPieChart.update("none");

      const chartWidth = 500;
      const chartHeight = 280;
      doc.addPage();
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text("Total Spend Analysis by Tag", 595.28 / 2, 120, {
        align: "center",
      });
      doc.addImage(
        chartImg,
        "PNG",
        (595.28 - chartWidth) / 2,
        180,
        chartWidth,
        chartHeight,
      );
    }
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.line(40, 810, 555, 810);
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text("Report generated by QuickTotal App", 595.28 / 2, 825, {
      align: "center",
    });
  }

  doc.save(`QuickTotal_Financial_Report_${new Date().getTime()}.pdf`);
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
