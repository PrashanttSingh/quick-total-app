// GLOBAL STATE
let filesToProcess = [];
let spendPieChart = null;

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
    filesToProcess.push(newFile);
    updateUIState();
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
      div.innerHTML = `<span class="thumb-number">#${index + 1}</span><img src="${e.target.result}"><div class="thumb-delete" onclick="removeFile(${index}, event)">×</div>`;
      thumbnailGrid.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// REVERSED COLORS: 90+ = Yellow, 50+ = Green, Below 50 = Red
// ============================================================
function getAccuracyInfo(score) {
  const num = parseInt(score) || 0;

  if (num >= 90) return { color: "#fbbf24", text: "Excellent" }; // Yellow / Gold
  if (num >= 50) return { color: "#34d399", text: "Good" }; // Green
  return { color: "#ef4444", text: "Low Confidence" }; // Red
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

      const colWrap = document.createElement("div");
      colWrap.className = "col-12 col-md-6 mb-4";

      const tempCard = document.createElement("div");
      tempCard.className =
        "receipt-card glass-panel h-100 animate-pop rounded-4 shadow-sm";
      tempCard.dataset.imageIndex = i;
      tempCard.innerHTML = `<div class="rc-header p-3 border-bottom border-secondary"><span>Document #${i + 1}</span><span style="color:#8b5cf6;">Processing... ⏳</span></div>`;

      colWrap.appendChild(tempCard);
      receiptsList.appendChild(colWrap);

      try {
        const res = await fetch("/calculate", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.error || !data.results || data.results[0].error) {
          const errorMsg = data.error || data.results[0].error;
          tempCard.innerHTML = `<div class="rc-header p-3 border-bottom border-secondary"><span>Document #${i + 1}</span><span class="val-neg">Failed</span></div><p class="p-3">${errorMsg}</p>`;
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
                <span class="rc-item-val editable-text price-edit ${isNeg ? "val-neg" : ""}" contenteditable="true" spellcheck="false" title="Click to edit price">${isNeg ? "-" : "+"}₹${Math.abs(item.result).toFixed(2)}</span>
            </div>`;
        });

        const imgScoreNum = parseInt(result.image_quality) || 0;
        const accScoreNum = parseInt(result.ai_accuracy) || 0;

        let imgInfo = getAccuracyInfo(imgScoreNum);
        let accInfo = getAccuracyInfo(accScoreNum);

        // ==========================================
        // ✨ TRIGGER TEMPORARY NOTEBOOK LM GLOW ✨
        // ==========================================
        if (accScoreNum === 100) {
          tempCard.classList.add("notebooklm-card-glow");
          // Automatically remove the glow class after 4 seconds
          setTimeout(() => {
            tempCard.classList.remove("notebooklm-card-glow");
          }, 4000);
        }

        let accuracyHtml = `
            <div class="p-3" style="margin-top: 15px; border-top: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <div class="accuracy-label"><span>Image Quality</span><span style="color: ${imgInfo.color};">${imgScoreNum}%</span></div>
                    <div class="accuracy-bar-bg"><div class="accuracy-bar-fill" style="width: ${imgScoreNum}%; background: ${imgInfo.color};"></div></div>
                </div>
                <div>
                    <div class="accuracy-label"><span>AI Accuracy</span><span style="color: ${accInfo.color};">${accScoreNum}%</span></div>
                    <div class="accuracy-bar-bg"><div class="accuracy-bar-fill" style="width: ${accScoreNum}%; background: ${accInfo.color};"></div></div>
                </div>
            </div>`;

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
            <div class="rc-subtotal px-3 py-2 border-top border-secondary border-opacity-25" style="position: relative; z-index: 2;"><span>Subtotal</span><span>₹${result.subtotal.toFixed(2)}</span></div>
            <div style="position: relative; z-index: 2;">${accuracyHtml}</div>
        `;

        grandTotal += result.subtotal;
        successfulDocs++;
      } catch (err) {
        tempCard.innerHTML = `<div class="rc-header p-3"><span>Document #${i + 1}</span><span class="val-neg">Error</span></div><p class="px-3">Connection Error: ${err.message}</p>`;
      }
    }
  } catch (globalErr) {
    alert("An unexpected error occurred during processing.");
  } finally {
    loadingEl.style.display = "none";
    actionButtons.style.display = "flex";

    if (successfulDocs > 0) {
      grandTotalValue.textContent = `₹${grandTotal.toFixed(2)}`;
      grandTotalCard.style.display = "flex";
      recalculateLiveMath();
      window.scrollTo({
        top: document.getElementById("resultsContainer").offsetTop - 20,
        behavior: "smooth",
      });
    }
  }
});

// ============================================================
// INTERACTIVE EVENT LISTENERS
// ============================================================
receiptsList.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("editable-text")) {
    const text = e.target.textContent.trim();
    if (
      text === "New Item" ||
      text === "+₹0.00" ||
      text === "-₹0.00" ||
      text === "Misc"
    )
      e.target.textContent = "";
  }
});

receiptsList.addEventListener("focusout", (e) => {
  if (
    e.target.classList.contains("price-edit") ||
    e.target.classList.contains("cat-badge")
  )
    recalculateLiveMath();
});

receiptsList.addEventListener("keydown", (e) => {
  if (e.target.classList.contains("editable-text") && e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
});

receiptsList.addEventListener("click", async (e) => {
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
        <span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false" title="Click to edit price">+₹0.00</span>
    `;
    itemsList.appendChild(newRow);
    newRow.querySelector(".editable-text").focus();
    const countSpan = card.querySelector(".entry-count");
    if (countSpan)
      countSpan.textContent = `(${itemsList.querySelectorAll(".rc-item").length} entries)`;
  }

  if (e.target.classList.contains("save-train-btn")) {
    const btn = e.target;
    const card = btn.closest(".receipt-card");
    const imageIndex = parseInt(card.dataset.imageIndex);
    const fileToSave = filesToProcess[imageIndex];

    let correctedItems = [];
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      let itemName = itemEl
        .querySelector(".item-name-field")
        .textContent.trim();
      let itemCat = itemEl.querySelector(".item-cat-field").textContent.trim();
      let itemAmountRaw = itemEl
        .querySelector(".price-edit")
        .textContent.replace(/[^\d.-]/g, "");
      let itemAmount = parseFloat(itemAmountRaw) || 0;

      correctedItems.push({
        item: itemName,
        category: itemCat,
        amount: itemAmount,
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

      if (res.ok) {
        btn.textContent = "Saved to Dataset 🎉";
        btn.style.background = "rgba(16, 185, 129, 0.4)";
        btn.style.color = "white";
        btn.style.border = "none";
      } else {
        throw new Error("Failed to save");
      }
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
      let catName = catElement ? catElement.textContent.trim() : "Misc";
      if (catName === "") catName = "Misc";
      catName =
        catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
      if (catElement) catElement.textContent = catName;

      if (!categoryTotals[catName]) categoryTotals[catName] = 0;
      categoryTotals[catName] += value;
    });

    const subtotalElement = card.querySelector(".rc-subtotal span:last-child");
    if (subtotalElement)
      subtotalElement.textContent = `₹${cardSubtotal.toFixed(2)}`;
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
      const chartLabels = sortedCats.map((item) => item[0]);
      const chartData = sortedCats.map((item) => item[1]);
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
        type: "doughnut",
        data: {
          labels: chartLabels,
          datasets: [
            { data: chartData, backgroundColor: pieColors, borderWidth: 0 },
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
  let csvContent = "S.No.,Document,Item Name,Category,Price\n";
  let serialNumber = 1;
  document.querySelectorAll(".receipt-card").forEach((card, index) => {
    const docName = `Document #${index + 1}`;
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      const spans = itemEl.querySelectorAll(".editable-text");
      if (spans.length >= 3) {
        let itemName = spans[0].textContent.trim().replace(/,/g, "");
        let category = spans[1].textContent.trim().replace(/,/g, "");
        let priceRaw = spans[2].textContent.trim().replace(/[^\d.-]/g, "");
        csvContent += `${serialNumber},${docName},${itemName},${category},${priceRaw}\n`;
        serialNumber++;
      }
    });
  });
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.setAttribute("href", URL.createObjectURL(blob));
  link.setAttribute(
    "download",
    `QuickTotal_Export_${new Date().getTime()}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

  const tableRows = [];
  let sno = 1;
  document.querySelectorAll(".receipt-card").forEach((card) => {
    card.querySelectorAll(".rc-item").forEach((itemEl) => {
      const spans = itemEl.querySelectorAll(".editable-text");
      if (spans.length >= 3) {
        tableRows.push([
          sno++,
          spans[0].textContent.trim(),
          spans[1].textContent.trim(),
          `Rs. ${spans[2].textContent.trim().replace(/₹/g, "").trim()}`,
        ]);
      }
    });
  });

  doc.autoTable({
    head: [["S.No.", "Item Name", "Category", "Price"]],
    body: tableRows,
    startY: 90,
    theme: "striped",
    headStyles: { fillColor: [139, 92, 246] },
    margin: { top: 90 },
    styles: { font: "helvetica", fontSize: 11 },
  });

  const finalY = doc.lastAutoTable.finalY || 90;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Grand Total: Rs. ${document.getElementById("grandTotalValue").textContent.replace(/₹/g, "").trim()}`,
    40,
    finalY + 30,
  );

  if (spendPieChart) {
    const origColor = spendPieChart.options.plugins.legend.labels.color;
    const origSize =
      spendPieChart.options.plugins.legend.labels.font.size || 12;
    const origLabels = [...spendPieChart.data.labels];
    const dataArray = spendPieChart.data.datasets[0].data;
    const totalSum = dataArray.reduce((acc, val) => acc + Number(val), 0);

    spendPieChart.data.labels = origLabels.map(
      (label, index) =>
        `${label}: ${totalSum > 0 ? ((Number(dataArray[index]) / totalSum) * 100).toFixed(1) : 0}%`,
    );
    spendPieChart.options.plugins.legend.labels.color = "#000000";
    spendPieChart.options.plugins.legend.labels.font.size = 18;
    spendPieChart.update("none");
    const chartImg = spendPieChart.toBase64Image();

    // Revert web UI settings
    spendPieChart.options.plugins.legend.labels.color = origColor;
    spendPieChart.options.plugins.legend.labels.font.size = origSize;
    spendPieChart.data.labels = origLabels;
    spendPieChart.update("none");

    // --- FULL PAGE CHART LOGIC ---
    const chartWidth = 500;
    const chartHeight = 280;

    doc.addPage();

    const xPos = (595.28 - chartWidth) / 2;
    const yPos = 180;

    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("Spend Analysis by Category", 595.28 / 2, 120, {
      align: "center",
    });

    doc.addImage(chartImg, "PNG", xPos, yPos, chartWidth, chartHeight);
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

  doc.save(`QuickTotal_Report_${new Date().getTime()}.pdf`);
}

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
  window.scrollTo({ top: 0, behavior: "smooth" });
}
