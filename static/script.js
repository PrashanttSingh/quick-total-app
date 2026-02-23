// GLOBAL STATE
let filesToProcess = [];
let spendPieChart = null; // Global variable to hold our new Pie Chart

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

function getAccuracyInfo(score) {
  if (score >= 98) return { color: "#10b981", text: "Perfect" };
  if (score >= 94) return { color: "#34d399", text: "Excellent" };
  if (score >= 90) return { color: "#fbff00", text: "Very High" };
  if (score >= 80) return { color: "#facc15", text: "High" };
  if (score >= 70) return { color: "#fbbf24", text: "Good" };
  if (score >= 60) return { color: "#f59e0b", text: "Moderate" };
  if (score >= 50) return { color: "#ea580c", text: "Fair" };
  if (score >= 40) return { color: "#ef4444", text: "Low" };
  if (score >= 30) return { color: "#dc2626", text: "Very Low" };
  if (score >= 20) return { color: "#b91c1c", text: "Poor" };
  if (score >= 10) return { color: "#991b1b", text: "Highly Uncertain" };
  return { color: "#7f1d1d", text: "Failed" };
}

// ============================================================
// API SUBMISSION
// ============================================================
calculateBtn.addEventListener("click", async () => {
  if (filesToProcess.length === 0) return;

  loadingEl.style.display = "block";
  actionButtons.style.display = "none";
  resultsContainer.style.display = "block";
  receiptsList.innerHTML = "";
  grandTotalCard.style.display = "none";

  const oldBreakdown = document.getElementById("categoryBreakdown");
  if (oldBreakdown) oldBreakdown.style.display = "none";

  const oldExportBtn = document.getElementById("exportCsvBtn");
  if (oldExportBtn) oldExportBtn.style.display = "none";

  const oldPdfBtn = document.getElementById("exportPdfBtn");
  if (oldPdfBtn) oldPdfBtn.style.display = "none";

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
          const category = item.category || "Misc";

          itemsHtml += `
                        <div class="rc-item">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="editable-text" contenteditable="true" spellcheck="false" title="Click to edit name">${item.expression}</span>
                                <span class="cat-badge editable-text" contenteditable="true" spellcheck="false" title="Click to edit category">${category}</span>
                            </div>
                            <span class="rc-item-val editable-text price-edit ${isNeg ? "val-neg" : ""}" contenteditable="true" spellcheck="false" title="Click to edit price">${isNeg ? "-" : "+"}₹${Math.abs(item.result).toFixed(2)}</span>
                        </div>`;
        });

        let imgQualScore = result.image_quality || 0;
        let aiAccScore = result.ai_accuracy || 0;

        let imgInfo = getAccuracyInfo(imgQualScore);
        let accInfo = getAccuracyInfo(aiAccScore);
        let warningHtml = "";

        if (imgQualScore < 70 || aiAccScore < 70) {
          let warningColor =
            imgQualScore < aiAccScore ? imgInfo.color : accInfo.color;
          warningHtml = `
                        <div class="low-accuracy-warning" style="border-color:${warningColor}; color:${warningColor}; background: rgba(0,0,0,0.2); margin-top:12px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            <span><strong>Warning:</strong> Low confidence due to image clarity. Please double-check these numbers.</span>
                        </div>`;
        }

        let accuracyHtml = `
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 12px;">
                        <div>
                            <div class="accuracy-label">
                                <span>Image Quality: ${imgInfo.text}</span>
                                <span style="color: ${imgInfo.color}; text-shadow: 0 0 5px ${imgInfo.color};">${imgQualScore}%</span>
                            </div>
                            <div class="accuracy-bar-bg">
                                <div class="accuracy-bar-fill" style="width: ${imgQualScore}%; background: ${imgInfo.color}; box-shadow: 0 0 8px ${imgInfo.color};"></div>
                            </div>
                        </div>
                        <div>
                            <div class="accuracy-label">
                                <span>AI Accuracy: ${accInfo.text}</span>
                                <span style="color: ${accInfo.color}; text-shadow: 0 0 5px ${accInfo.color};">${aiAccScore}%</span>
                            </div>
                            <div class="accuracy-bar-bg">
                                <div class="accuracy-bar-fill" style="width: ${aiAccScore}%; background: ${accInfo.color}; box-shadow: 0 0 8px ${accInfo.color};"></div>
                            </div>
                        </div>
                        ${warningHtml}
                    </div>
                `;

        tempCard.innerHTML = `
                    <div class="rc-header">
                        <span>Document #${i + 1} <span class="entry-count" style="font-size:0.85em; font-weight:500; color:var(--text-muted);">(${itemCount} entries)</span></span>
                        <span class="rc-method-badge">${result.method}</span>
                    </div>
                    <div class="rc-items-list">${itemsHtml}</div>
                    <div style="text-align: center;">
                        <div class="add-row-btn" title="Did the AI miss an item? Add it here.">+ Add Missing Item</div>
                    </div>
                    <div class="rc-subtotal">
                        <span>Subtotal</span>
                        <span>₹${result.subtotal.toFixed(2)}</span>
                    </div>
                    ${accuracyHtml}
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
    loadingEl.style.display = "none";
    actionButtons.style.display = "flex";

    if (successfulDocs > 0) {
      grandTotalValue.textContent = `₹${grandTotal.toFixed(2)}`;
      grandTotalCard.style.display = "flex";

      recalculateLiveMath();

      window.scrollTo({
        top: grandTotalCard.offsetTop - 20,
        behavior: "smooth",
      });
    }
  }
});

// ============================================================
// LIVE MATH, CATEGORY BREAKDOWN & NEW ROW LOGIC
// ============================================================

receiptsList.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("editable-text")) {
    const text = e.target.textContent.trim();
    if (
      text === "New Item" ||
      text === "+₹0.00" ||
      text === "-₹0.00" ||
      text === "Misc"
    ) {
      e.target.textContent = "";
    }
  }
});

receiptsList.addEventListener("focusout", (e) => {
  if (
    e.target.classList.contains("price-edit") ||
    e.target.classList.contains("cat-badge")
  ) {
    recalculateLiveMath();
  }
});

receiptsList.addEventListener("keydown", (e) => {
  if (e.target.classList.contains("editable-text")) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  }
});

receiptsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("add-row-btn")) {
    const card = e.target.closest(".receipt-card");
    const itemsList = card.querySelector(".rc-items-list");

    const newRow = document.createElement("div");
    newRow.className = "rc-item animate-pop";
    newRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="editable-text" contenteditable="true" spellcheck="false" title="Click to edit name">New Item</span>
                <span class="cat-badge editable-text" contenteditable="true" spellcheck="false" title="Click to edit category">Misc</span>
            </div>
            <span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false" title="Click to edit price">+₹0.00</span>
        `;

    itemsList.appendChild(newRow);
    newRow.querySelector(".editable-text").focus();

    const countSpan = card.querySelector(".entry-count");
    if (countSpan) {
      const currentCount = itemsList.querySelectorAll(".rc-item").length;
      countSpan.textContent = `(${currentCount} entries)`;
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

      if (isNeg) {
        priceElement.classList.add("val-neg");
      } else {
        priceElement.classList.remove("val-neg");
      }

      cardSubtotal += value;

      let catName = catElement ? catElement.textContent.trim() : "Misc";
      if (catName === "") catName = "Misc";
      catName =
        catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
      if (catElement) catElement.textContent = catName;

      if (!categoryTotals[catName]) categoryTotals[catName] = 0;
      categoryTotals[catName] += value;
    });

    const subtotalElement = card.querySelector(".rc-subtotal span:last-child");
    if (subtotalElement) {
      subtotalElement.textContent = `₹${cardSubtotal.toFixed(2)}`;
    }

    newGrandTotal += cardSubtotal;
  });

  if (grandTotalValue) {
    grandTotalValue.textContent = `₹${newGrandTotal.toFixed(2)}`;
  }

  // --- CATEGORY BREAKDOWN LOGIC ---
  let breakdownContainer = document.getElementById("categoryBreakdown");

  if (!breakdownContainer) {
    breakdownContainer = document.createElement("div");
    breakdownContainer.id = "categoryBreakdown";
    breakdownContainer.className = "cat-breakdown-box glass-panel animate-pop";
    grandTotalCard.parentNode.insertBefore(
      breakdownContainer,
      grandTotalCard.nextSibling,
    );
  }

  if (newGrandTotal === 0 && Object.keys(categoryTotals).length === 0) {
    breakdownContainer.style.display = "none";
  } else {
    breakdownContainer.style.display = "block";
    let breakdownHtml = `<h3 style="margin: 0 0 15px 0; font-size: 1.1em; color: var(--primary-light);">📊 Spend by Category</h3>`;

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
                </div>
            `;
    });

    // Inject the empty canvas for our Pie Chart!
    breakdownHtml += `<div class="chart-wrapper"><canvas id="spendChart"></canvas></div>`;
    breakdownContainer.innerHTML = breakdownHtml;

    // --- DRAW THE CHART.JS PIE CHART ---
    const ctx = document.getElementById("spendChart");
    if (ctx) {
      if (spendPieChart) spendPieChart.destroy(); // Clear old chart if editing

      // Extract sorted labels and data for the chart
      const chartLabels = sortedCats.map((item) => item[0]);
      const chartData = sortedCats.map((item) => item[1]);

      // Beautiful modern colors
      const pieColors = [
        "#8b5cf6",
        "#ec4899",
        "#3b82f6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#14b8a6",
      ];

      spendPieChart = new Chart(ctx, {
        type: "doughnut", // Doughnut looks slightly more modern than full pie!
        data: {
          labels: chartLabels,
          datasets: [
            {
              data: chartData,
              backgroundColor: pieColors,
              borderWidth: 0, // Clean look
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

  // --- BUTTON GENERATION (CSV AND PDF) ---
  let exportBtn = document.getElementById("exportCsvBtn");
  if (!exportBtn) {
    exportBtn = document.createElement("div");
    exportBtn.id = "exportCsvBtn";
    exportBtn.className = "export-btn animate-pop";
    exportBtn.innerHTML = `⬇️ Download Excel (CSV)`;
    breakdownContainer.parentNode.insertBefore(
      exportBtn,
      breakdownContainer.nextSibling,
    );
    exportBtn.addEventListener("click", downloadCSV);
  }

  let pdfBtn = document.getElementById("exportPdfBtn");
  if (!pdfBtn) {
    pdfBtn = document.createElement("div");
    pdfBtn.id = "exportPdfBtn";
    pdfBtn.className = "pdf-btn animate-pop";
    pdfBtn.innerHTML = `📄 Download PDF Report`;
    breakdownContainer.parentNode.insertBefore(pdfBtn, exportBtn.nextSibling);
    pdfBtn.addEventListener("click", downloadPDF);
  }

  if (newGrandTotal === 0 && Object.keys(categoryTotals).length === 0) {
    exportBtn.style.display = "none";
    pdfBtn.style.display = "none";
  } else {
    exportBtn.style.display = "block";
    pdfBtn.style.display = "block";
  }
}

// ============================================================
// CSV / EXCEL DOWNLOAD GENERATOR (FIXED SERIAL NUMBERS)
// ============================================================
function downloadCSV() {
  // Added a proper S.No. column
  let csvContent = "S.No.,Document,Item Name,Category,Price\n";
  let serialNumber = 1; // Start counting from 1

  document.querySelectorAll(".receipt-card").forEach((card, index) => {
    const docName = `Document #${index + 1}`;

    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      const spans = itemEl.querySelectorAll(".editable-text");
      if (spans.length >= 3) {
        let itemName = spans[0].textContent.trim().replace(/,/g, "");
        let category = spans[1].textContent.trim().replace(/,/g, "");
        let priceRaw = spans[2].textContent.trim().replace(/[^\d.-]/g, "");

        // Now it prints 1, 2, 3, 4... properly!
        csvContent += `${serialNumber},${docName},${itemName},${category},${priceRaw}\n`;
        serialNumber++;
      }
    });
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const fileName = `QuickTotal_Export_${new Date().getTime()}.csv`;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================
// PDF DOWNLOAD GENERATOR (CLEAN PRO TABLE + SIDE LEGEND DATA)
// ============================================================
function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "pt", "a4");

  // 1. Draw the Document Header
  doc.setFontSize(22);
  doc.setTextColor(139, 92, 246);
  doc.text("QuickTotal Financial Report", 40, 50);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 70);

  // 2. Gather all the data for the Table natively
  const tableColumn = ["S.No.", "Item Name", "Category", "Price"];
  const tableRows = [];

  let sno = 1;
  document.querySelectorAll(".receipt-card").forEach((card) => {
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      const spans = itemEl.querySelectorAll(".editable-text");
      if (spans.length >= 3) {
        const itemName = spans[0].textContent.trim();
        const category = spans[1].textContent.trim();
        let price = spans[2].textContent.trim();

        price = `Rs. ${price.replace(/₹/g, "").trim()}`;
        tableRows.push([sno++, itemName, category, price]);
      }
    });
  });

  // 3. Draw the Table
  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 90,
    theme: "striped",
    headStyles: { fillColor: [139, 92, 246] },
    margin: { top: 90 },
    styles: { font: "helvetica", fontSize: 11 },
  });

  // 4. Calculate where the table ended
  const finalY = doc.lastAutoTable.finalY || 90;
  let grandTotalValue = document.getElementById("grandTotalValue").textContent;
  grandTotalValue = `Rs. ${grandTotalValue.replace(/₹/g, "").trim()}`;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`Grand Total: ${grandTotalValue}`, 40, finalY + 30);

  // 5. Embed the Chart Graphic (CLEAN LEGEND VERSION)
  if (spendPieChart) {
    // Save original settings
    const origColor = spendPieChart.options.plugins.legend.labels.color;
    const origSize =
      spendPieChart.options.plugins.legend.labels.font.size || 12;
    const origLabels = [...spendPieChart.data.labels];

    // Calculate percentages
    const dataArray = spendPieChart.data.datasets[0].data;
    const totalSum = dataArray.reduce((acc, val) => acc + Number(val), 0);

    // Update labels to include percentages
    spendPieChart.data.labels = origLabels.map((label, index) => {
      const value = Number(dataArray[index]);
      const percentage =
        totalSum > 0 ? ((value / totalSum) * 100).toFixed(1) : 0;
      return `${label}: ${percentage}%`;
    });

    // Make Legend Professional for PDF
    spendPieChart.options.plugins.legend.labels.color = "#000000";
    spendPieChart.options.plugins.legend.labels.font.size = 18; // Large but clean
    spendPieChart.options.plugins.legend.position = "right"; // Keep it strictly on the right
    spendPieChart.update("none");

    // Grab the image (High-res snapshot)
    const chartImg = spendPieChart.toBase64Image();

    // REVERT everything for the web UI immediately
    spendPieChart.options.plugins.legend.labels.color = origColor;
    spendPieChart.options.plugins.legend.labels.font.size = origSize;
    spendPieChart.data.labels = origLabels;
    spendPieChart.update("none");

    // Define dimensions for the PDF
    const chartWidth = 420; // Wide enough to show legend clearly
    const chartHeight = 180;
    const xPos = (595.28 - chartWidth) / 2;
    let yPos = finalY + 70;

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);

    if (yPos + chartHeight > 800) {
      doc.addPage();
      yPos = 60;
    }

    doc.text("Spend Analysis by Category", 40, yPos - 15);
    doc.addImage(chartImg, "PNG", xPos, yPos, chartWidth, chartHeight);
  }

  // 6. Professional Footer (Clean Branding)
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.line(40, 810, 555, 810); // Subtle horizontal line above footer

    doc.setTextColor(150, 150, 150);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text("Report generated by QuickTotal App", 595.28 / 2, 825, {
      align: "center",
    });
  }

  // 7. Save the file
  doc.save(`QuickTotal_Report_${new Date().getTime()}.pdf`);
}

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

  const breakdownContainer = document.getElementById("categoryBreakdown");
  if (breakdownContainer) breakdownContainer.style.display = "none";

  const exportBtn = document.getElementById("exportCsvBtn");
  if (exportBtn) exportBtn.style.display = "none";

  const pdfBtn = document.getElementById("exportPdfBtn");
  if (pdfBtn) pdfBtn.style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });
}
