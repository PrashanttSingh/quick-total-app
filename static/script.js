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
const thumbnailGrid = document.getElementById("thumbnailGrid"); // FIXED CAPITAL 'G'
const fileCountLabel = document.getElementById("fileCountLabel");
const fileCountLabelMobile = document.getElementById("fileCountLabelMobile");
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
const modalTransformWrapper = document.getElementById("imageZoomWrapper");
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
      // Safely request standard video. The browser will automatically pick the best available webcam.
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      cameraStream.srcObject = videoStream;
      cameraModal.style.display = "flex";
    } catch (err) {
      console.error("Camera Hardware Error:", err);
      alert(
        "Camera access denied or hardware is busy. Please refresh the page.",
      );
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

    // 1. Capture the current video frame
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = cameraStream.videoWidth;
    tempCanvas.height = cameraStream.videoHeight;
    tempCanvas.getContext("2d").drawImage(cameraStream, 0, 0);

    const base64Image = tempCanvas.toDataURL("image/jpeg");
    const newFile = dataURLtoFile(
      base64Image,
      `camera_capture_${Date.now()}.jpg`,
    );

    // 2. Add file to the batch array in the background
    addFiles([newFile]);

    // 3. WhatsApp-Style Visual Feedback (Screen Flash)
    cameraStream.style.transition = "opacity 0.1s ease";
    cameraStream.style.opacity = "0.3";

    const originalText = captureBtn.innerHTML;
    captureBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; margin-bottom: 2px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Captured!`;
    captureBtn.style.background = "#059669"; // Success green

    setTimeout(() => {
      cameraStream.style.opacity = "1";
    }, 150);

    setTimeout(() => {
      captureBtn.innerHTML = originalText;
      captureBtn.style.background = ""; // Revert to original styling
    }, 1200);

    // 🚫 WE REMOVED stopCamera() HERE!
    // The camera stays open so the user can snap 3 or 4 bills in a row.
    // They will just click the "X" (closeCameraBtn) when they are done.
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

  // ⚡ ADD THIS LINE HERE:
  resetInspectorZoom();

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
  const clientX =
    e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  const clientY =
    e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) / currentZoom,
    y: (clientY - rect.top) / currentZoom,
  };
}

if (modalCropCanvas) {
  const startDraw = (e) => {
    if (!isCropMode) return;
    isModalDrawing = true;
    const p = getModalPos(e);
    mStartX = p.x;
    mStartY = p.y;
    mEndX = p.x;
    mEndY = p.y;
  };

  const moveDraw = (e) => {
    if (!isModalDrawing) return;
    e.preventDefault(); // Stops mobile screen from scrolling while you draw
    const p = getModalPos(e);
    mEndX = p.x;
    mEndY = p.y;

    // Use Math.min to allow drawing the box backwards (bottom-right to top-left)
    const drawX = Math.min(mStartX, mEndX);
    const drawY = Math.min(mStartY, mEndY);
    const drawW = Math.abs(mEndX - mStartX);
    const drawH = Math.abs(mEndY - mStartY);

    // Punch a clear hole through the dark overlay to see the text
    mCtx.clearRect(0, 0, modalCropCanvas.width, modalCropCanvas.height);
    mCtx.fillStyle = "rgba(15, 23, 42, 0.6)";
    mCtx.fillRect(0, 0, modalCropCanvas.width, modalCropCanvas.height);
    mCtx.clearRect(drawX, drawY, drawW, drawH);

    // Draw the blue dashed border
    mCtx.strokeStyle = "#3b82f6";
    mCtx.lineWidth = 2.5;
    mCtx.setLineDash([6, 4]);
    mCtx.strokeRect(drawX, drawY, drawW, drawH);
  };

  // Desktop Mouse Support
  modalCropCanvas.addEventListener("mousedown", startDraw);
  modalCropCanvas.addEventListener("mousemove", moveDraw);

  // Mobile Touch Support
  modalCropCanvas.addEventListener("touchstart", startDraw, { passive: false });
  modalCropCanvas.addEventListener("touchmove", moveDraw, { passive: false });
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
  modalTransformWrapper.addEventListener(
    "wheel",
    (e) => {
      if (isCropMode) return;
      e.preventDefault();
      currentZoom = Math.min(
        Math.max(0.5, currentZoom + (e.deltaY > 0 ? -0.1 : 0.1)),
        4,
      );
      updateZoom();
    },
    { passive: false },
  );
}

// Mobile Pinch-to-Zoom Variables
let initialPinchDistance = null;
let initialZoomBeforePinch = 1;

if (modalImage) {
  // Desktop Click & Drag
  modalImage.addEventListener("mousedown", (e) => {
    if (isCropMode) return;
    isDraggingImage = true;
    startDragX = e.clientX - panX;
    startDragY = e.clientY - panY;
    modalImage.style.cursor = "grabbing";
  });

  // Mobile Touch & Pinch Start
  modalImage.addEventListener(
    "touchstart",
    (e) => {
      if (isCropMode) return;

      if (e.touches.length === 1) {
        // One finger: Panning
        isDraggingImage = true;
        startDragX = e.touches[0].clientX - panX;
        startDragY = e.touches[0].clientY - panY;
      } else if (e.touches.length === 2) {
        // Two fingers: Pinch to Zoom
        isDraggingImage = false; // Disable panning while zooming
        initialPinchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        initialZoomBeforePinch = currentZoom;
      }
    },
    { passive: false },
  );
}

// End Drag/Pinch Events
window.addEventListener("mouseup", () => {
  isDraggingImage = false;
  if (modalImage) modalImage.style.cursor = "crosshair";
});

window.addEventListener("touchend", () => {
  isDraggingImage = false;
  initialPinchDistance = null;
});

// Execute Drag/Pinch Movements
window.addEventListener("mousemove", (e) => {
  if (!isDraggingImage || isCropMode) return;
  e.preventDefault();
  panX = e.clientX - startDragX;
  panY = e.clientY - startDragY;
  updateZoom();
});

window.addEventListener(
  "touchmove",
  (e) => {
    if (isCropMode) return;

    if (isDraggingImage && e.touches.length === 1) {
      // One finger: Execute Panning
      e.preventDefault();
      panX = e.touches[0].clientX - startDragX;
      panY = e.touches[0].clientY - startDragY;
      updateZoom();
    } else if (e.touches.length === 2 && initialPinchDistance) {
      // Two fingers: Execute Pinch-to-Zoom
      e.preventDefault();
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const zoomFactor = currentDistance / initialPinchDistance;

      // Limits zoom between 0.5x and 4x
      currentZoom = Math.min(
        Math.max(0.5, initialZoomBeforePinch * zoomFactor),
        4,
      );
      updateZoom();
    }
  },
  { passive: false },
);
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

// ==========================================
// 📦 FILE UPLOAD & BATCH CAP SYSTEM
// ==========================================
const MAX_BATCH_LIMIT = 4; // Capped at 5 documents max

async function addFiles(newFiles) {
  if (!newFiles || newFiles.length === 0) return;
  const incomingFiles = Array.from(newFiles);

  const MAX_FILE_SIZE_MB = 5; // 🚨 5MB Limit per image

  // 🚨 BATCH CAP CHECK
  if (filesToProcess.length + incomingFiles.length > MAX_BATCH_LIMIT) {
    showPremiumError(
      `Maximum ${MAX_BATCH_LIMIT} documents allowed per batch. Please remove some files or process in smaller groups.`,
    );
    return;
  }

  let addedCount = 0;

  for (let f of incomingFiles) {
    // 🚨 SIZE LIMIT CHECK
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      // Clean up the filename so the error isn't too long
      let shortName =
        f.name.length > 15 ? f.name.substring(0, 15) + "..." : f.name;
      showPremiumError(
        `"${shortName}" is too large! Please upload images under ${MAX_FILE_SIZE_MB}MB.`,
      );
      continue; // Skip this oversized file and move to the next one
    }

    f.precalcQuality = null;
    f.previewUrl = URL.createObjectURL(f);
    filesToProcess.push(f);
    addedCount++;
  }

  // Only update UI and trigger background processing if valid files were actually added
  if (addedCount > 0) {
    updateUIState();

    for (
      let i = filesToProcess.length - addedCount;
      i < filesToProcess.length;
      i++
    ) {
      fetchQualityInBackground(filesToProcess[i], i);
    }
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
  if (fileCountLabelMobile) {
    fileCountLabelMobile.textContent = `${count} Document${count !== 1 ? "s" : ""} Ready`;
  }
  resultsContainer.style.display = "none";
  if (count === 0) {
    resetApp();
    return;
  }
  dropZone.style.display = "none";
  previewArea.style.display = "block";
  browseBtn.textContent = "Add More Documents";
  actionButtons.style.display = "flex";

  if (thumbnailGrid) thumbnailGrid.style.display = "flex";

  // 🚨 NEW LOGIC: Lock the Add More button at 4 images
  const addMoreBtn = document.getElementById("addMoreDropdownBtn");
  if (addMoreBtn) {
    if (count >= 4) {
      addMoreBtn.disabled = true;
      addMoreBtn.style.cursor = "not-allowed";
      addMoreBtn.style.opacity = "0.5";
      addMoreBtn.title = "Maximum limit of 4 documents reached.";
    } else {
      addMoreBtn.disabled = false;
      addMoreBtn.style.cursor = "pointer";
      addMoreBtn.style.opacity = "1";
      addMoreBtn.title = "";
    }
  }

  renderThumbnails();
}

let activeMobileIndex = 0; // Tracks which image is active on the phone

function renderThumbnails() {
  const grid = document.getElementById("thumbnailGrid");
  const mGrid = document.getElementById("mobileFilmstripGrid");
  const mImg = document.getElementById("mobileActiveImg");

  if (grid) grid.innerHTML = "";
  if (mGrid) mGrid.innerHTML = "";

  if (!filesToProcess || filesToProcess.length === 0) return;

  // Keep mobile tracker within bounds if a file is deleted
  if (activeMobileIndex >= filesToProcess.length) {
    activeMobileIndex = Math.max(0, filesToProcess.length - 1);
  }

  // Set Large Mobile Image
  if (mImg && filesToProcess[activeMobileIndex]) {
    mImg.src = filesToProcess[activeMobileIndex].previewUrl || "";
  }

  filesToProcess.forEach((fileItem, index) => {
    let imgSrc = fileItem.previewUrl || "";
    let qualityBadge = "";
    let qualityScore = fileItem.precalcQuality;

    if (qualityScore !== null && qualityScore !== undefined) {
      qualityBadge = `
      <div class="thumb-quality" style="position: absolute; bottom: 4px; right: 4px; background: rgba(0, 0, 0, 0.85); color: #34d399; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 8px; border: 1px solid rgba(52, 211, 153, 0.3); z-index: 3;">
          ${qualityScore}%
      </div>`;
    }

    // 💻 1. GENERATE DESKTOP GRID (Untouched Original Logic)
    if (grid) {
      const div = document.createElement("div");
      div.className = "thumbnail-item position-relative";
      div.dataset.index = index;
      div.innerHTML = `
          <span class="thumb-number" style="position: absolute; top: 4px; left: 4px; background: #3b82f6; color: white; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 6px; z-index: 3;">#${index + 1}</span>
          <img src="${imgSrc}" draggable="false" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;">
          ${qualityBadge}
          <div class="thumb-delete d-flex align-items-center justify-content-center" onclick="removeFile(${index}, event)" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; background: rgba(0, 0, 0, 0.7); color: #ef4444; border-radius: 50%; cursor: pointer; z-index: 3; transition: all 0.2s;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </div>`;
      grid.appendChild(div);
    }

    // 📱 2. GENERATE MOBILE FILMSTRIP
    if (mGrid) {
      const isActive = index === activeMobileIndex;
      const mDiv = document.createElement("div");
      mDiv.className = `position-relative flex-shrink-0 rounded-3 overflow-hidden ${isActive ? "border border-2 border-success" : "opacity-75 inactive-thumb"}`;
      mDiv.style =
        "width: 65px; height: 65px; cursor: pointer; transition: all 0.2s ease;";

      // Clicking a thumbnail updates the large image
      mDiv.onclick = () => {
        activeMobileIndex = index;
        renderThumbnails();
      };

      // 🚨 Ultra-compact #1, #2 badge (Moved to Top-Left, Checkmark Removed)
      let numberBadge = `<span style="position: absolute; top: 3px; left: 3px; background: rgba(59, 130, 246, 0.9); color: white; font-size: 10px; font-weight: 800; padding: 1px 4px; border-radius: 4px; z-index: 3; line-height: 1.2;">#${index + 1}</span>`;

      mDiv.innerHTML = `<img src="${imgSrc}" class="w-100 h-100" style="object-fit: cover; pointer-events:none;">${numberBadge}`;
      mGrid.appendChild(mDiv);
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

  // 1. Adjustments, Financials, Dues, Taxes & Banking
  if (
    /(jama|advance|bakaya|due|purana|arrear|deposit|discount|refund|return|fee|tax|cgst|sgst|igst|vat|gst|interest|penalty|surcharge|tip|gratuity|round off|rounding|udhar|loan|emi|forex|markup|commission|brokerage|dividend|royalty|stamp duty|cess|surcharge|cashback|rebate|chargeback|escrow|mortgage|wire transfer|swift|ach|sepa|neft|rtgs|imps|upi fee)/i.test(
      lower,
    )
  )
    return "Adjustment & Financials";

  // 2. Snacks, Bakery, Sweets, Confectionery & Beverages
  if (
    /(coca|cola|pepsi|sprite|fanta|limca|maza|maaza|cold drink|beverage|water|soda|juice|chai|coffee|tea|drink|piv|shikanji|maggi|biscuit|namkeen|chips|kurkure|lays|snack|chocolate|candy|sweet|mithai|parle|samosa|cake|pastry|brownie|muffin|donut|dairy milk|kitkat|snickers|mars|bounty|toffee|chewing gum|mint|tic tac|haldiram|bikanervala|rasgulla|gulab jamun|barfi|peda|laddu|jalebi|ice cream|gelato|popsicle|mirinda|thums up|mountain dew|slice|frooti|tropicana|real|nectar|squash|syrup|sharbat|rooh afza|nescafe|bru|espresso|latte|cappuccino|green tea|black tea|energy drink|red bull|monster|gatorade|bisleri|kinley|aquafina|tonic water|alcohol|beer|wine|whiskey|vodka|rum|gin|doritos|cheetos|bingo|bhujia|mixture|sev|mathri|britannia|good day|oreo|bourbon|marie|cracker|cookie|popcorn|pretzel|waffle|pancake|croissant|macaron|eclair|tart|tartlet|marshmallow|gummy|fudge|truffle|praline|energy bar|granola bar|protein bar)/i.test(
      lower,
    )
  )
    return "Snacks & Beverages";

  // 3. Dairy, Eggs & Plant-Based Alternatives
  if (
    /(doodh|milk|paneer|curd|dahi|butter|cheese|ghee|dairy|egg|anda|yogurt|cream|margarine|cottage cheese|tofu|buttermilk|chaach|lassi|makhan|amul|mozzarella|cheddar|parmesan|malai|omelette|mayonnaise|yakult|almond milk|soy milk|oat milk|coconut milk|rice milk|hemp milk|whipping cream|sour cream|condensed milk|evaporated milk|whey|casein|gouda|brie|camembert|feta|ricotta|provolone|blue cheese|swiss cheese)/i.test(
      lower,
    )
  )
    return "Dairy & Eggs";

  // 4. Produce, Agriculture & Fresh Foods
  if (
    /(vegetable|fruit|onion|potato|tomato|sabzi|pyaz|tamatar|aaloo|apple|banana|mango|grapes|orange|carrot|cabbage|spinach|garlic|ginger|lemon|salad|berries|phal|seb|kela|aam|santra|kinnow|angoor|papaya|papita|watermelon|tarbooz|melon|kharbuja|pomegranate|anar|guava|amrood|pineapple|ananas|strawberry|blueberry|kiwi|avocado|pear|nashpati|plum|peach|cherry|nimbu|lime|coconut|nariyal|lehsun|adrak|green chilli|hari mirch|coriander|dhaniya|mint|pudina|palak|patta gobhi|cauliflower|phool gobhi|broccoli|gajar|radish|mooli|beetroot|chukandar|cucumber|kheera|capsicum|shimla mirch|bell pepper|eggplant|brinjal|baingan|lady finger|okra|bhindi|bitter gourd|karela|bottle gourd|lauki|pumpkin|kaddu|peas|matar|mushroom|corn|bhutta|sweet corn|lettuce|celery|asparagus|zucchini|artichoke|leek|kale|microgreens|sprouts|turnip|yam|sweet potato|shakarkandi|fig|date|apricot|plum|raspberry|blackberry|cranberry|dragonfruit|passionfruit|lychee|jackfruit|custard apple|chikoo|rambutan|durian|mangosteen)/i.test(
      lower,
    )
  )
    return "Produce";

  // 5. Meat, Poultry, Seafood & Deli
  if (
    /(meat|chicken|mutton|fish|pork|beef|seafood|prawn|crab|shrimp|bacon|sausage|ham|murgh|gosht|lamb|veal|venison|machli|rohu|katla|pomfret|surmai|salmon|tuna|sardine|jhinga|kekda|lobster|squid|octopus|oyster|mussel|clam|scallop|salami|pepperoni|prosciutto|cold cut|keema|mince|turkey|duck|goose|quail|anchovy|cod|haddock|trout|halibut|bass|snapper|tilapia|caviar|roe|pate|pastrami|corned beef|chorizo|bratwurst|frankfurter)/i.test(
      lower,
    )
  )
    return "Meat & Seafood";

  // 6. Pantry, Staples, Grains, Oils, Spices & Baking
  if (
    /(aata|atta|rice|sugar|dal|pulse|oil|masala|spices|chini|salt|namak|flour|wheat|besan|maida|suji|mustard|tel|pasta|noodle|sauce|ketchup|vinegar|honey|jam|cereal|oats|gehun|sooji|semolina|gram flour|chawal|basmati|sela|brown rice|poha|murmura|lentil|toor|arhar|moong|masoor|chana|urad|rajma|chole|kabuli chana|lobia|soya bean|mustard oil|sarson|refined oil|sunflower oil|soybean oil|groundnut oil|olive oil|sesame oil|coconut oil|shakkar|jaggery|gur|sendha namak|rock salt|black salt|spice|turmeric|haldi|red chilli|lal mirch|coriander powder|dhaniya powder|cumin|jeera|mustard seed|rai|fenugreek|methi|fennel|saunf|carom|ajwain|cardamom|elaichi|clove|laung|cinnamon|dalchini|black pepper|kali mirch|bay leaf|tej patta|nutmeg|jaiphal|mace|javitri|star anise|asafoetida|hing|saffron|kesar|dry fruit|almond|badam|cashew|kaju|raisin|kishmish|walnut|akhrot|pistachio|pista|date|khajoor|fig|anjeer|apricot|khubani|makhana|peanut|moongfali|seed|chia|flax|pumpkin seed|sunflower seed|macaroni|spaghetti|hakka noodle|vermicelli|seviyan|soy sauce|chilli sauce|sirka|mustard sauce|dip|spread|marmalade|shahed|peanut butter|corn flakes|muesli|granola|pancake mix|baking powder|baking soda|yeast|cocoa powder|vanilla essence|food colour|sago|sabudana|quinoa|couscous|barley|jowar|bajra|ragi|millet|sorghum|canola oil|avocado oil|grapeseed oil|truffle oil|mayo|tahini|hummus|pesto|salsa|harissa|sriracha|wasabi|chutney|pickle|achar)/i.test(
      lower,
    )
  )
    return "Pantry & Staples";

  // 7. Personal Care, Cosmetics, Hygiene & Grooming
  if (
    /(soap|shampoo|toothpaste|brush|handwash|dettol|sunsilk|hair|skin|lotion|cream|powder|shave|razor|perfume|deo|makeup|lipstick|cosmetic|nail|body wash|conditioner|sanitizer|pad|diaper|sabun|shower gel|bath bomb|loofah|sponge|hair mask|hair oil|hair serum|hair color|dye|hair spray|gel|wax|pomade|comb|kanga|face wash|cleanser|scrub|toner|moisturizer|cold cream|lip balm|sunscreen|sunblock|talcum powder|antiperspirant|cologne|ittar|attar|body mist|blade|shaving cream|shaving gel|shaving foam|aftershave|trimmer|clipper|epilator|wax strip|hair removal|toothbrush|mouthwash|floss|tongue cleaner|foundation|concealer|blush|highlighter|bronzer|eyeshadow|eyeliner|mascara|kajal|lip gloss|lip liner|nail polish|nail paint|nail remover|cotton pad|cotton bud|swab|wet wipe|tissue|sanitary pad|tampon|menstrual cup|panty liner|nappy|baby wipe|baby powder|baby lotion|baby oil|pacifier|teether|bottle|formula|cerelac|deodorant|eau de parfum|eau de toilette|serum|essence|micellar water|face mask|sheet mask|beard oil|beard balm|hair removal cream|tweezers|nail clipper|nail file)/i.test(
      lower,
    )
  )
    return "Personal Care";

  // 8. Household, Cleaning, Laundry & Puja Items
  if (
    /(detergent|cleaner|harpic|vim|surf|tide|broom|mop|phenyl|tissue|toilet|bag|foil|wrap|sponge|bucket|wiper|washing powder|ariel|rin|wheel|fabric softener|comfort|bleach|stain remover|dish wash|pril|dish bar|scrub pad|scotch brite|steel wool|floor cleaner|lizol|domex|glass cleaner|colin|surface cleaner|multi purpose cleaner|wood polish|room freshener|odonil|air freshener|mosquito repellent|all out|good knight|hit|mortein|coil|chalk|rat poison|pest control|jhadu|pocha|dustpan|balti|mug|duster|microfiber cloth|trash bag|garbage bag|bin liner|polythene|aluminium foil|cling film|zip lock|parchment paper|baking paper|tissue roll|toilet paper|paper towel|napkin|matchbox|match stick|lighter|candle|agarbatti|incense stick|dhoop|camphor|kapoor|puja samagri|moli|kalawa|diya|batti|cotton wick|descaler|drain opener|drain cleaner|dishwasher tablet|rinse aid|laundry gel|fabric conditioner|mothballs|naphtalene|disinfectant spray|vacuum bag|dustbag|fly swatter|cockroach gel|ant bait|puja thali|gangajal|chandan|kumkum|sindoor|roli|haldi powder|dhoop batti|loban|guggal)/i.test(
      lower,
    )
  )
    return "Household & Cleaning";

  // 9. Apparel, Footwear, Fashion & Accessories
  if (
    /(shirt|kurta|pant|jeans|tshirt|shoes|clothing|fabric|suit|wear|garment|chappal|sandal|sneaker|sock|underwear|bra|jacket|coat|sweater|dress|skirt|tailor|apparel|hat|cap|polo|top|blouse|tunic|kurti|sherwani|lehenga|saree|sari|dupatta|chunni|stole|scarf|muffler|shawl|pullover|cardigan|hoodie|sweatshirt|blazer|waistcoat|vest|banyan|brief|trunk|panty|thong|bralette|lingerie|shapewear|nightwear|pyjama|pajama|nighty|gown|robe|swimsuit|bikini|short|half pant|knicker|trouser|jean|denim|legging|jegging|track pant|jogger|sweatpant|capri|frock|uniform|school dress|tie|bow tie|belt|suspender|stocking|tight|shoe|sports shoe|running shoe|casual shoe|formal shoe|boot|slipper|flip flop|heel|wedge|flat|loafer|moccasin|oxford|brogue|bag|backpack|handbag|purse|clutch|wallet|suitcase|luggage|trolley|duffel bag|sling bag|tote bag|briefcase|umbrella|chata|raincoat|sunglass|shade|goggle|spectacle|frame|lens|contact lens|watch|smartwatch|jewelry|jewellery|ring|earring|necklace|chain|bracelet|bangle|anklet|payal|nose pin|pendant|hair band|clip|scrunchie|pin|safety pin|cufflinks|tie pin|pocket square|brooch|beanie|beret|fedora|visor|turban|pagri|hijab|abaya|kimono|kaftan|parka|anorak|trench coat|overcoat|windbreaker|thermal|insole|shoelace|fanny pack|messenger bag)/i.test(
      lower,
    )
  )
    return "Clothing & Apparels";

  // 10. Electronics, Computing, Hardware, Software & Cloud
  if (
    /(wire|cable|phone|battery|charger|usb|electronics|led|bulb|plug|adaptor|mobile|laptop|earphone|headphone|computer|mouse|keyboard|screen|monitor|tv|speaker|software|app|subscription|cloud|hosting|domain|smartphone|cellphone|feature phone|tablet|ipad|e-reader|kindle|pc|desktop|macbook|imac|display|television|smart tv|projector|soundbar|home theater|earbud|tws|airpod|headset|mic|microphone|camera|dslr|mirrorless|action camera|gopro|cctv|security camera|webcam|fitness band|tracker|router|modem|switch|hub|dongle|wifi|pendrive|flash drive|usb drive|hard disk|hdd|ssd|memory card|sd card|micro sd|power bank|adapter|lightning cable|type c|micro usb|hdmi|vga|aux|otg|case|cover|screen protector|tempered glass|skin|pop socket|tripod|selfie stick|gimbal|mount|stand|trackpad|stylus|apple pencil|printer|scanner|ink|cartridge|toner|ups|inverter|cell|aa|aaa|button cell|extension board|spike buster|smart plug|smart bulb|smart switch|smart lock|iot|application|game|cd|dvd|blu ray|prime|netflix|hotstar|spotify|apple music|youtube|discord|server|aws|azure|gcp|api|saas|paas|iaas|license|anti virus|gpu|cpu|motherboard|ram|vram|power supply|psu|cooling fan|heat sink|liquid cooler|pc case|cabinet|nas|kvm|ethernet|cat6|fiber optic|transceiver|vr headset|ar glasses|smartwatch|docking station|capture card|vr glasses)/i.test(
      lower,
    )
  )
    return "Electronics & Tech";

  // 11. Medical, Pharmaceuticals, Biotech, Fitness & Clinical Services
  if (
    /(tablet|paracetamol|medicine|syrup|doctor|pharmacy|pill|medical|clinic|hospital|bandaid|vitamin|supplement|protein|health|drug|prescription|injection|bandage|mask|dawa|dawai|capsule|drop|ointment|cream|gel|lotion|spray|inhaler|syringe|vaccine|crocin|dolo|aspirin|ibuprofen|combiflam|diclofenac|volini|moov|iodex|zandu balm|vicks|cough syrup|antacid|digene|eno|pudin hara|laxative|isabgol|orsl|ors|electrol|band aid|cotton|gauze|surgical tape|crepe bandage|thermometer|bp monitor|sphygmomanometer|oximeter|glucometer|test strip|lancet|weighing scale|n95|surgical mask|face shield|gloves|ppe kit|sanitizer|disinfectant|first aid kit|multivitamin|calcium|iron|zinc|omega 3|whey protein|mass gainer|bcaa|creatine|pre workout|amino acid|herb|ashwagandha|shilajit|chyawanprash|hajmola|ayurvedic|homeopathic|allopathic|opd|ipd|consultation|checkup|test|blood test|urine test|x ray|mri|ct scan|ultrasound|sonography|ecg|eeg|surgery|operation|therapy|physiotherapy|psychotherapy|counseling|dentist|tooth extraction|root canal|braces|scaling|polishing|antibiotic|antihistamine|insulin|inhaler|nebulizer|catheter|stent|prosthetic|wheelchair|crutches|walker|cervical collar|heating pad|ice pack|compression sock|hearing aid|dialysis|chemotherapy|radiotherapy|biopsy|endoscopy|colonoscopy|dermatologist|cardiologist|neurologist|orthopedic|pediatrician|gynecologist|urologist|oncologist|ophthalmologist|ENT|psychiatrist)/i.test(
      lower,
    )
  )
    return "Medical & Health";

  // 12. Transport, Mobility, Automotive & Travel Services
  if (
    /(auto|cab|uber|ola|bus|train|ticket|travel|petrol|fuel|diesel|cng|parking|toll|flight|car|bike|scooter|repair|mechanic|tyre|tire|wash|transit|subway|metro|rickshaw|e-rickshaw|taxi|rapido|inDrive|volvo|sleeper|irctc|railway|tube|tram|airplane|aeroplane|airline|indigo|air india|vistara|spicejet|akasa|fare|pass|fastag|valet|gas|motorcycle|scooty|bicycle|cycle|helmet|riding gear|accessory|seat cover|mat|steering cover|dashcam|freshener|tube|puncture|alloy wheel|engine oil|coolant|brake fluid|wiper blade|battery|spare part|service|maintenance|garage|washing|cleaning|detailing|polishing|teflon coating|ceramic coating|denting|painting|insurance|puc|pollution certificate|rto|challan|fine|passport|visa|forex|travel agent|tour|package|hotel|resort|motel|hostel|airbnb|stay|accommodation|lodging|room|ev charging|charging station|battery swap|synthetic oil|transmission fluid|spark plug|air filter|cabin filter|brake pad|brake disc|shock absorber|suspension|clutch plate|gearbox|exhaust|muffler|radiator|alternator|starter motor|wheel alignment|wheel balancing|towing|roadside assistance)/i.test(
      lower,
    )
  )
    return "Transport & Auto";

  // 13. Education, Academics, Publishing, Stationery & Media
  if (
    /(book|pen|pencil|paper|notebook|stationary|eraser|school|college|fee|tuition|math|science|exam|course|class|training|art|marker|folder|kitab|textbook|reference book|guide|novel|fiction|non fiction|biography|autobiography|magazine|journal|comic|manga|newspaper|akhbar|copy|register|diary|planner|organizer|pad|a4|rim|ream|chart paper|craft paper|origami|file|binder|portfolio|envelope|ball pen|gel pen|fountain pen|rollerball|highlighter|sketch pen|colour pen|brush pen|calligraphy pen|lead|mechanical pencil|charcoal|pastel|crayon|colour|watercolor|acrylic|oil colour|brush|palette|canvas|rubber|sharpener|scale|ruler|compass|protractor|set square|divider|geometry box|math set|glue|fevicol|fevistick|adhesive|tape|cello tape|double sided tape|masking tape|duct tape|stapler|staple pin|punch|paper clip|binder clip|pin|board pin|push pin|sticky note|post it|tag|label|sticker|bookmark|calculator|globe|map|atlas|university|institute|coaching|certification|diploma|degree|admission|enrollment|library|laboratory|equipment|uniform|id card|whiteboard|chalkboard|blackboard|duster|easel|drafting board|tracing paper|graph paper|stamp pad|ink bottle|correction tape|whitener|correction fluid|index card|flashcard|diploma|transcript|syllabus|thesis|dissertation)/i.test(
      lower,
    )
  )
    return "Education & Stationery";

  // 14. Utilities, Housing, Telecom, Internet & Infrastructure
  if (
    /(bill|recharge|rent|emi|insurance|water|electricity|gas|internet|wifi|broadband|utility|postpaid|prepaid|dth|mortgage|lease|invoice|receipt|challan|memo|statement|top up|plan|validity|data pack|voice pack|sms pack|roaming|fiber|cable|tata sky|airtel digital|dish tv|sun direct|videocon d2h|ott|netflix|prime video|hotstar|zee5|sonyliv|disney|hulu|bijli|power|energy|jal|pani|lpg cylinder|piped gas|png|igl|mgl|kiraya|loan|installment|maintenance|society fee|property tax|municipal tax|water tax|house tax|premium|lic|term plan|health insurance|mediclaim|motor insurance|car insurance|bike insurance|travel insurance|life insurance|subscription|membership|club|gym|newspaper bill|milk bill|maid salary|servant|driver|cook|sweeper|guard|security|landline|optical fiber|bandwidth|sewerage|waste management|garbage collection|lift maintenance|elevator fee|generator fee|backup power|amenity fee|HOA fee|condo fee)/i.test(
      lower,
    )
  )
    return "Bills & Utilities";

  // 15. Home, Furniture, Interior Decor & Hardware
  if (
    /(bed|chair|table|decor|mattress|sofa|lamp|hardware|paint|furniture|pillow|blanket|cushion|rug|carpet|tool|drill|hammer|nail|screw|home|house|flat|apartment|villa|decoration|showpiece|idol|murti|vase|pot|planter|artificial plant|painting|frame|poster|wall art|clock|mirror|lampshade|chandelier|fairy light|led strip|candle stand|cover|takiya|kambal|quilt|razai|duvet|comforter|bedsheet|chadar|bedcover|gadda|protector|dari|mat|doormat|curtain|parda|blind|drape|towel|toliya|bathrobe|hand towel|face towel|cot|palang|couch|recliner|kursi|stool|bench|ottoman|mez|desk|dining table|coffee table|side table|wardrobe|almirah|cupboard|closet|cabinet|shelf|rack|shoe rack|bookshelf|tv unit|dressing table|hathoda|keel|nut|bolt|washer|hinge|handle|knob|lock|tala|key|chabi|padlock|door closer|stopper|latch|tower bolt|chain|wire|mesh|net|rope|rassi|string|twine|pipe|tube|fitting|pvc|cpvc|upvc|tap|faucet|shower|sink|basin|toilet|commode|flush|seat cover|accessory|primer|putty|distemper|enamel|emulsion|roller|thinner|polish|varnish|sandpaper|glue|adhesive|fevicol|araldite|mseal|cement|sand|brick|iron|steel|rod|bar|sheet|glass|plywood|board|mdf|particle board|laminate|sunmica|veneer|screwdriver|wrench|spanner|pliers|saw|level|tape measure|toolbox|ladder|scaffolding|silicone|sealant|grout|tile|marble|granite|terrazzo|parquet|flooring)/i.test(
      lower,
    )
  )
    return "Home & Hardware";

  // 16. Dining Out, Catering, Delivery & Food Services
  if (
    /(restaurant|cafe|dinner|lunch|tip|buffet|swiggy|zomato|delivery|pizza|burger|meal|combo|dine|eatery|food court|bistro|diner|dhaba|hotel|canteen|mess|bar|pub|club|lounge|brewery|taproom|nightclub|disco|uber eats|foodpanda|doordash|deliveroo|dunzo|blinkit|zepto|instamart|bbnow|takeaway|parcel|dine in|ala carte|breakfast|brunch|supper|thali|starter|appetizer|soup|salad|main course|side dish|bread|roti|naan|paratha|kulcha|rice|biryani|pulao|fried rice|noodle|pasta|sandwich|wrap|roll|shawarma|taco|burrito|hot dog|french fries|wedges|cutlet|kebab|tikka|tandoori|grill|roast|fry|bake|boil|steam|dimsum|momo|sushi|sashimi|dumpling|dessert|sweet|ice cream|sundae|shake|smoothie|mocktail|cocktail|drink|beverage|gratuity|service charge|cover charge|entry fee|catering|food truck|bakery cafe|steakhouse|pizzeria|trattoria|izakaya|ramen bar|coffee shop|tea room|juice bar|boba|bubble tea|ghost kitchen|cloud kitchen)/i.test(
      lower,
    )
  )
    return "Dining & Eating Out";

  // 17. Sports, Fitness, Outdoor Gear & Camping
  if (
    /(gym|fitness|bicycle|tent|racket|ball|bat|camp|outdoor|sport|yoga|dumbell|treadmill|workout|exercise|pilates|zumba|aerobics|crossfit|martial arts|karate|judo|taekwondo|boxing|mma|wrestling|equipment|machine|elliptical|cycle|bike|dumble|dumbbell|barbell|weight|plate|kettlebell|rod|bench|rack|mat|band|tube|roller|skipping rope|racquet|club|stick|cue|board|glove|pad|guard|helmet|shoe|cleat|spike|apparel|jersey|short|track suit|swim suit|costume|goggle|cap|towel|bottle|shaker|supplement|whey|protein|bcaa|creatine|pre workout|sleeping bag|mattress|stove|grill|bbq|charcoal|cooler|backpack|rucksack|trek|hike|climb|mountaineering|rope|carabiner|harness|headlamp|torch|binocular|telescope|compass|map|gps|watch|tracker|mountain bike|road bike|hybrid bike|bmx|gear|lock|light|pump|tool|spare part|service|repair|ride|event|marathon|race|tournament|match|competition|ticket|pass|entry fee|kayak|canoe|paddleboard|surfboard|wetsuit|snorkel|scuba|fins|life jacket|skates|rollerblades|skateboard|scooter|snowboard|skis|golf club|golf ball|bowling ball|darts|archery|bow|arrow|target)/i.test(
      lower,
    )
  )
    return "Sports & Outdoors";

  // 18. Toys, Gaming, Media, Hobbies & Live Events
  if (
    /(toy|game|movie|ticket|concert|netflix|premium|hobby|puzzle|lego|doll|board game|cinema|khilona|action figure|barbie|soft toy|teddy bear|plush|car|train|truck|plane|helicopter|drone|rc|remote control|track|set|block|building|construction|jigsaw|rubik|ludo|chess|carrom|monopoly|scrabble|uno|card|deck|magic|trick|prank|joke|balloon|bubble|clay|play dough|slime|kinetic sand|art|craft|kit|diy|science|experiment|telescope|microscope|binocular|globe|map|book|comic|coloring|sticker|stamp|coin|collection|model|scale|paint|brush|glue|tool|material|supply|instrument|guitar|piano|keyboard|drum|violin|flute|harmonium|tabla|sitar|accessory|string|pick|strap|stand|case|bag|cable|pedal|amp|amplifier|speaker|mic|microphone|interface|software|daw|plugin|sample|loop|sound|effect|lighting|stage|dj|controller|mixer|turntable|vinyl|record|cd|dvd|blu ray|cassette|tape|vhs|player|deck|system|home theater|soundbar|projector|screen|tv|television|console|playstation|ps4|ps5|xbox|nintendo|switch|wii|cartridge|disc|digital|download|dlc|expansion|pass|subscription|ps plus|xbox live|game pass|ea play|ubisoft|steam|epic|origin|gog|battlenet|riot|twitch|discord|youtube|prime video|hotstar|disney|zee5|sonyliv|voot|alt balaji|ullu|hoichoi|eros now|sun nxt|aha|chaupal|pvr|inox|cinepolis|carnival|miraj|theater|play|show|gig|festival|event|exhibition|fair|mela|circus|amusement park|theme park|water park|ride|entry|wristband|token|arcade|bowling|laser tag|paintball|go kart|escape room|vr|ar|casino|gamble|bet|lottery|scratch|bingo|tambola|housie|raffle|sweepstake|prize|reward|trophy|medal|certificate|badge|ribbon|sash|crown|tiara|party|celebration|birthday|anniversary|wedding|engagement|reception|haldi|mehendi|sangeet|cocktail|bachelor|bachelorette|baby shower|bridal shower|housewarming|griha pravesh|inauguration|opening|launch|farewell|retirement|graduation|convocation|alumni|reunion|get together|meetup|gathering|function|ceremony|ritual|puja|havan|katha|path|bhajan|kirtan|jagran|chowki|langar|bhandara|prasad|chadhaava|daan|dakshina|chanda)/i.test(
      lower,
    )
  )
    return "Toys & Entertainment";

  // 19. Pet Supplies, Veterinary & Livestock
  if (
    /(pet|dog|cat|vet|food|collar|aquarium|bird|fish food|leash|litter|puppy|kitten|parrot|pigeon|fish|turtle|tortoise|hamster|guinea pig|rabbit|bunny|mouse|rat|cage|coop|kennel|house|bed|mat|blanket|cushion|pillow|basket|carrier|crate|bag|backpack|stroller|pram|harness|chain|tie out|muzzle|halti|gentle leader|clothing|sweater|jacket|coat|raincoat|shirt|tshirt|dress|skirt|bow|tie|bandana|scarf|shoe|boot|sock|accessory|tag|id|bell|charm|pendant|light|tracker|gps|feed|meal|diet|kibble|dry food|wet food|gravy|pouch|can|tin|treat|snack|biscuit|cookie|chew|bone|raw hide|stick|strip|jerky|drop|paste|supplement|vitamin|mineral|calcium|joint|coat|skin|digestion|immunity|medicine|drug|pill|tablet|liquid|syrup|spray|ointment|cream|gel|lotion|shampoo|conditioner|wash|soap|wipe|towel|brush|comb|slicker|pin|bristle|rake|deshedder|furminator|glove|mitt|scissor|clipper|trimmer|file|grinder|nail|claw|paw|ear|eye|tear|tooth|dental|water additive|toy|ball|frisbee|disc|rope|tug|squeaky|plush|soft|branch|antler|horn|hoof|puzzle|interactive|treat dispenser|slow feeder|bowl|dish|plate|stand|elevated|automatic|fountain|bottle|waterer|sand|crystal|clay|clumping|non clumping|silica|paper|wood|pine|corn|wheat|walnut|box|tray|pan|scoop|liner|deodorizer|pad|pee pad|training pad|diaper|wrap|belly band|poop bag|dispenser|holder|scooper|cleaner|stain|odor|remover|enzyme|tool|part|filter|pump|heater|bulb|tube|hood|canopy|cabinet|decoration|plant|rock|cave|hide|background|gravel|substrate|soil|fertilizer|co2|test|kit|thermometer|hydrometer|net|breeder|trap|stress|slime|clear|algae|snail|parasite|ich|fungus|bacteria|flake|pellet|wafer|crisp|freeze dried|frozen|live|worm|shrimp|insect|fly|grub|cricket|mealworm|waxworm|superworm|roach|dubia|locust|grasshopper|mantis|spider|tarantula|scorpion|centipede|millipede|reptile|amphibian|snake|lizard|gecko|skink|dragon|iguana|chameleon|monitor|tegu|frog|toad|salamander|newt|axolotl|enclosure|terrarium|vivarium|paludarium|setup|horse|saddle|bridle|rein|bit|horseshoe|grooming kit|hoof pick|hay|straw|poultry|coop|chick|rooster|hen|incubator|egg tray|feeder|waterer|livestock|cattle|cow|buffalo|goat|sheep|pig|swine|feed|fodder|silage|chaff|dehorner|milking machine|ear tag|branding iron)/i.test(
      lower,
    )
  )
    return "Pet Supplies";

  // 20. Gifts, Donations, Charity, Religious & Cultural
  if (
    /(gift|donation|charity|flower|bouquet|wrapping|ribbon|present|ngo|return gift|favor|giveaway|prize|reward|award|trophy|medal|certificate|badge|sash|crown|tiara|floral|arrangement|bunch|stem|rose|lily|orchid|carnation|tulip|daisy|sunflower|marigold|jasmine|lotus|garland|mala|wreath|basket|hamper|box|bag|pot|vase|wrap|paper|sheet|roll|film|cello|foil|bow|tag|label|card|greeting card|note|letter|envelope|seal|stamp|sticker|tape|contribution|fund|relief|aid|help|support|sponsor|patron|trust|foundation|npo|society|association|club|rotary|lions|red cross|unicef|wvf|wwf|peta|cry|oxfam|save the children|goonj|akshaya patra|temple|mandir|mosque|masjid|church|gurudwara|ashram|math|dera|shrine|dargah|mazar|tomb|grave|cemetery|cremation|burial|funeral|shradh|terahvin|chautha|uthala|bhog|antim ardas|prayer|mass|service|ritual|ceremony|custom|tradition|offering|prasad|chadhaava|daan|dakshina|chanda|bhent|chadar|langar|bhandara|zakat|fitra|sadaqah|tithe|alms|votive|incense|holy water|rosary|tasbih|rudraksha|janeyu|yagnopavit|sindoor|kumkum|chandan|abir|gulal|pitar|shradha|tarpan|pind daan|kirtan|satsang|bajan|katha|paath|akhand paath|gurbani|qawwali|naat|nasheed|hymn|carol|gospel)/i.test(
      lower,
    )
  )
    return "Gifts & Donations";

  // 21. Business, Corporate, Industrial, Manufacturing, Freight & B2B Services
  if (
    /(advertising|marketing|seo|campaign|pr |legal|consulting|freelance|logistics|shipping|freight|postage|courier|business|company|firm|enterprise|corporation|llc|pvt ltd|inc|corp|startup|agency|consultancy|studio|shop|store|outlet|showroom|retail|wholesale|distributor|dealer|stockist|supplier|vendor|manufacturer|factory|plant|mill|workshop|godown|warehouse|depot|yard|hub|center|office|branch|hq|headquarters|franchise|rent|lease|emi|loan|interest|tax|gst|tds|tcs|income tax|corporate tax|professional tax|property tax|municipal tax|license|registration|fee|charge|penalty|fine|challan|audit|compliance|roc|mca|pf|esi|pt|lw|bonus|gratuity|salary|wage|stipend|incentive|commission|brokerage|royalty|retainer|honorarium|perk|allowance|reimbursement|ta|da|hra|lta|medical|conveyance|travel|stay|hotel|flight|train|cab|food|meal|entertainment|client|customer|guest|meeting|conference|seminar|workshop|training|exhibition|fair|trade show|expo|stall|booth|banner|flex|hoarding|billboard|sign|board|neon|led|glow|display|poster|standee|canopy|umbrella|tent|kiosk|ad|promotion|smo|sem|ppc|cpc|cpm|cpa|cpl|public relations|event|sponsorship|branding|logo|design|graphic|video|audio|content|copy|translation|voiceover|photography|shoot|portfolio|catalog|brochure|flyer|leaflet|pamphlet|menu|card|visiting card|business card|letterhead|envelope|diary|calendar|notepad|pen|pencil|folder|file|stationery|supply|print|xerox|copy|scan|binding|lamination|spiral|wiro|hardbound|softbound|packaging|box|carton|tape|bubble wrap|stretch film|shrink wrap|strap|clip|seal|label|tag|sticker|barcode|qr code|machinery|equipment|tool|implement|instrument|device|appliance|gadget|spare|part|component|raw material|consumable|fuel|diesel|petrol|cng|lpg|gas|electricity|power|water|utility|internet|broadband|telephone|mobile|communication|software|erp|crm|hrms|pos|tally|busy|marg|quickbooks|zoho|freshworks|hubspot|salesforce|aws|google|microsoft|azure|hosting|domain|server|cloud|ssl|security|firewall|antivirus|amc|maintenance|service|repair|installation|commissioning|testing|calibration|certification|iso|isi|bis|fssai|agmark|hallmark|transport|carriage|cartage|loading|unloading|forwarding|clearing|custom|duty|tariff|toll|octroi|entry tax|post|speed post|parcel|packet|mail|letter|pallet|crate|container|vessel|barge|cargo|air freight|ocean freight|truckload|less than truckload|ltl|ftl|drayage|warehousing|fulfillment|3pl|cross docking|inventory|stock|sku|bill of lading|manifest|packing list|proforma invoice|purchase order|po|debit note|credit note|remittance|factoring|letter of credit|lc|bank guarantee|bg|escrow|customs clearance|export|import|duty drawback|bond|free zone|epz|sez|incoterms|fob|cif|exw|ddp|ddu|fca|fas|cfr|cpt|cip|dap|dpu|machining|cnc|lathe|milling|grinding|drilling|boring|stamping|forging|casting|molding|extrusion|welding|soldering|brazing|heat treatment|plating|anodizing|powder coating|painting|galvanizing|assembly|fabrication|tooling|die|mold|jig|fixture|gauge|caliper|micrometer|spectrometer|hardness tester|tensile tester|cmm|3d printing|additive manufacturing|laser cutting|waterjet|plasma|punching|bending|shearing|rolling|slitting|stamping|die casting|sand casting|investment casting|injection molding|blow molding|thermoforming|rotomolding|compression molding)/i.test(
      lower,
    )
  )
    return "Business & Marketing";

  // 22. Scientific, Aerospace, Laboratory, Astronomical & Research Equipment
  if (
    /(microscope|telescope|spectrometer|centrifuge|pipette|beaker|flask|petri dish|autoclave|incubator|spectrophotometer|chromatography|hplc|gas chromatograph|mass spectrometer|titrator|ph meter|refractometer|viscometer|calorimeter|rheometer|fume hood|laminar flow|cleanroom|reagent|chemical|solvent|acid|base|catalyst|enzyme|buffer|isotope|assay|antibody|dna|rna|primer|polymerase|sequencer|pcr|electrophoresis|spectroscopy|interferometer|oscilloscope|spectrum analyzer|signal generator|multimeter|power supply|semiconductor|wafer|cleanroom garment|satellite|payload|propellant|rocket|avionics|telemetry|thruster|solar panel|star tracker|sun sensor|magnetometer|gyroscope|accelerometer|imu|radome|parabolic antenna|transponder|ground station|observatory|astronomy|astrophysics|particle accelerator|cyclotron|synchrotron|cryostat|dewar|liquid nitrogen|liquid helium|superconductor|vacuum pump|turbomolecular pump|mass flow controller|cleanroom filter|hepa|ulpa)/i.test(
      lower,
    )
  )
    return "Scientific & Research";

  // 23. Pure Mathematical Catch (Evaluates math expressions like "5+5=", "10x4", etc.)
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

  const loadingEl = document.getElementById("loading");
  const actionButtons = document.getElementById("actionButtons");
  const resultsContainer = document.getElementById("resultsContainer");
  const receiptsList = document.getElementById("receiptsList");
  const grandTotalCard = document.getElementById("grandTotalCard");
  const breakdownContainer = document.getElementById("categoryBreakdown");

  if (loadingEl) loadingEl.style.display = "block";
  if (actionButtons) actionButtons.style.display = "none";
  if (resultsContainer) resultsContainer.style.display = "none";
  if (receiptsList) receiptsList.innerHTML = "";
  if (grandTotalCard) grandTotalCard.style.display = "none";
  if (breakdownContainer) breakdownContainer.style.display = "none";

  let grandTotal = 0;
  let successfulDocs = 0;
  const totalFiles = filesToProcess.length;

  const batchFormData = new FormData();
  filesToProcess.forEach((file) => {
    batchFormData.append("images", file);
  });

  let gatekeeperResults = [];
  try {
    const batchRes = await fetch("/batch_gatekeeper", {
      method: "POST",
      body: batchFormData,
    });
    const batchData = await batchRes.json();
    gatekeeperResults = batchData.results || Array(totalFiles).fill(true);
  } catch (err) {
    console.warn("Batch gatekeeper failed to reach server. Bypassing check.");
    gatekeeperResults = Array(totalFiles).fill(true);
  }

  const calculateFormData = new FormData();
  let fileMapping = {};
  let validCount = 0;

  for (let i = 0; i < totalFiles; i++) {
    if (gatekeeperResults[i] === true) {
      calculateFormData.append("images", filesToProcess[i]);
      fileMapping[validCount] = i;
      validCount++;
    } else {
      const colWrap = document.createElement("div");
      colWrap.className = "col-12 col-md-6 mb-4";
      colWrap.innerHTML = `
        <div class="receipt-card glass-panel h-100 animate-pop rounded-4 shadow-sm" data-image-index="${i}">
            <div class="rc-header p-3 border-bottom border-secondary" style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #1e293b;">Document #${i + 1}</span>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn p-1 d-flex align-items-center justify-content-center border-0 d-md-none" onclick="openModal(filesToProcess[${i}], ${i}, true)" title="View Original Image" style="width: 28px; height: 28px; background: #f1f5f9; color: #3b82f6; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
                    </button>
                    <span class="val-neg" style="color: #e11d48; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                        Rejected
                    </span>
                </div>
            </div>
            <div class="p-3">
                <p style="color: #be123c; font-size: 14px; padding: 10px 16px; background: #fff1f2; border-radius: 8px; border: 1px solid #ffe4e6; margin: 0; font-weight: 500;">
                   Not a valid financial document. Blocked by AI Gatekeeper.
                </p>
            </div>
        </div>`;
      if (receiptsList) receiptsList.appendChild(colWrap);
    }
  }

  if (validCount === 0) {
    if (loadingEl) loadingEl.style.display = "none";
    if (actionButtons) actionButtons.style.display = "flex";
    showPremiumError(
      "None of the uploaded images look like valid financial documents.",
    );
    return;
  }

  try {
    const res = await fetch("/calculate", {
      method: "POST",
      body: calculateFormData,
    });
    const data = await res.json();

    if (data.error || !data.results) throw new Error("Processing failed");

    data.results.forEach((result, batchIdx) => {
      const originalIndex = fileMapping[batchIdx];
      const file = filesToProcess[originalIndex];

      const colWrap = document.createElement("div");
      colWrap.className = "col-12 col-md-6 mb-4";

      const tempCard = document.createElement("div");
      tempCard.className =
        "receipt-card glass-panel h-100 animate-pop rounded-4 shadow-sm";
      tempCard.dataset.imageIndex = originalIndex;
      tempCard.dataset.filename = file.name;

      if (file.precalcQuality !== null && parseInt(file.precalcQuality) < 2) {
        tempCard.innerHTML = `
          <div class="rc-header p-3 border-bottom border-secondary" style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: #1e293b;">Document #${originalIndex + 1}</span>
              <div class="d-flex align-items-center gap-2">
                  <button class="btn p-1 d-flex align-items-center justify-content-center border-0 d-md-none" onclick="openModal(filesToProcess[${originalIndex}], ${originalIndex}, true)" title="View Original Image" style="width: 28px; height: 28px; background: #f1f5f9; color: #3b82f6; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
                  </button>
                  <span class="val-neg" style="color: #e11d48; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                      Invalid Image
                  </span>
              </div>
          </div>
          <div class="p-3">
              <p style="color: #be123c; font-size: 14px; padding: 10px 16px; background: #fff1f2; border-radius: 8px; border: 1px solid #ffe4e6; margin: 0; font-weight: 500;">
                 We couldn't quite read this! Please try a clearer photo of your bill. <span style="font-size: 12px; opacity: 0.8; margin-left: 5px;">(Score: ${file.precalcQuality}%)</span>
              </p>
          </div>
        `;
      } else if (
        result.method === "Rejected by Gatekeeper" ||
        result.method === "Failed"
      ) {
        tempCard.innerHTML = `
          <div class="rc-header p-3 border-bottom border-secondary" style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: #1e293b;">Document #${originalIndex + 1}</span>
              <div class="d-flex align-items-center gap-2">
                  <button class="btn p-1 d-flex align-items-center justify-content-center border-0 d-md-none" onclick="openModal(filesToProcess[${originalIndex}], ${originalIndex}, true)" title="View Original Image" style="width: 28px; height: 28px; background: #f1f5f9; color: #3b82f6; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
                  </button>
                  <span class="val-neg">Failed</span>
              </div>
          </div><p class="p-3">Error processing image.</p>`;
      } else {
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
                    <span class="rc-item-val editable-text price-edit ${isNeg ? "val-neg" : ""}" data-raw-amount="${item.result}" contenteditable="true" spellcheck="false" title="Click to edit price">${isNeg ? "-" : "+"}${getSym()}${Math.abs(item.result).toFixed(2)}</span>
                    <button class="inline-mic-btn btn p-1 d-flex align-items-center justify-content-center" title="Speak item and price" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #64748b; transition: all 0.2s;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg></button>
                    <button class="inline-insert-btn btn p-1 d-flex align-items-center justify-content-center" title="Insert missing item below" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #3b82f6; transition: all 0.2s;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                    <button class="inline-delete-btn btn p-1 d-flex align-items-center justify-content-center" title="Delete mistake" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #fee2e2; background: #ffffff; color: #ef4444; transition: all 0.2s;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
            </div>`;
        });

        const imgScoreNum = parseInt(result.image_quality) || 0;
        const accScoreNum = parseInt(result.ai_accuracy) || 0;
        let imgInfo = getAccuracyInfo(imgScoreNum);
        let accInfo = getAccuracyInfo(accScoreNum);

        if (accScoreNum === 100) {
          tempCard.classList.add("notebooklm-card-glow");
          setTimeout(
            () => tempCard.classList.remove("notebooklm-card-glow"),
            4000,
          );
        }

        tempCard.innerHTML = `
            <div class="rc-header p-3 border-bottom border-secondary" style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center;">
                <span>Document #${originalIndex + 1} <span class="entry-count" style="font-size:0.85em; font-weight:500; color:var(--text-muted);">(${itemCount} entries)</span></span>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn p-1 d-flex align-items-center justify-content-center border-0 d-md-none" onclick="openModal(filesToProcess[${originalIndex}], ${originalIndex}, true)" title="View Original Image" style="width: 28px; height: 28px; background: #f1f5f9; color: #3b82f6; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
                    </button>
                    <span class="rc-method-badge">${result.method}</span>
                </div>
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
      }

      colWrap.appendChild(tempCard);
      if (receiptsList) receiptsList.appendChild(colWrap);
    });
  } catch (err) {
    console.error("Batch Calculation Error", err);
    showPremiumError("Failed to process the documents.");
  } finally {
    const mobilePreviewWrapper = document.querySelector(
      "#previewArea > .d-block.d-md-none",
    );
    const mainCard = document.querySelector(".main-card");
    const previewAreaContainer = document.getElementById("previewArea");

    if (successfulDocs > 0) {
      if (grandTotalValue)
        grandTotalValue.textContent = `${getSym()}${grandTotal.toFixed(2)}`;
      if (grandTotalCard) grandTotalCard.style.display = "flex";
      recalculateLiveMath();

      // 🚨 FIX: MOVE GRAND TOTAL EXACTLY BETWEEN WHITE BOX AND RECEIPTS
      if (resultsContainer && grandTotalCard && receiptsList) {
        resultsContainer.insertBefore(grandTotalCard, receiptsList);
        grandTotalCard.classList.remove("mt-4");
        grandTotalCard.classList.add("mb-4");
      }

      if (!document.getElementById("resultsResetBtn")) {
        const resetDiv = document.createElement("div");
        resetDiv.className = "w-100 text-center mt-4 mb-3 d-md-none";
        resetDiv.innerHTML = `<button id="resultsResetBtn" class="btn text-muted bg-transparent fw-bold" onclick="document.getElementById('resetBtn').click()" style="text-decoration: underline;">Start New Batch</button>`;
        if (resultsContainer) resultsContainer.appendChild(resetDiv);
      }

      // 🚨 LAPTOP VS MOBILE SPLIT 🚨
      // FIX: Lock the white box (mainCard) so it strictly disappears on mobile!
      if (mainCard) {
        mainCard.style.display = "";
        mainCard.classList.add("d-none", "d-md-block");
      }

      if (window.innerWidth <= 768) {
        // --- 📱 MOBILE VIEW (Elite Animation & Delete White Box) ---
        if (loadingEl) {
          loadingEl.style.transition = "opacity 0.4s ease, transform 0.4s ease";
          loadingEl.style.opacity = "0";
          loadingEl.style.transform = "translateY(-20px)";
        }

        if (mobilePreviewWrapper) {
          mobilePreviewWrapper.style.transition =
            "opacity 0.4s ease, transform 0.4s ease";
          mobilePreviewWrapper.style.opacity = "0";
          mobilePreviewWrapper.style.transform = "translateY(-20px)";
        }

        setTimeout(() => {
          if (loadingEl) loadingEl.style.display = "none";
          if (mobilePreviewWrapper) mobilePreviewWrapper.style.display = "none";
          if (previewAreaContainer) previewAreaContainer.style.display = "none";

          if (resultsContainer) {
            resultsContainer.style.display = "block";
            resultsContainer.style.opacity = "0";
            resultsContainer.style.transform = "translateY(30px)";
            resultsContainer.style.transition =
              "opacity 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

            setTimeout(() => {
              resultsContainer.style.opacity = "1";
              resultsContainer.style.transform = "translateY(0)";

              // 🚨 AUTO-SCROLL TO RESULTS ON MOBILE
              resultsContainer.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }, 50);
          }
        }, 400);
      } else {
        // --- 💻 DESKTOP VIEW (100% Restored & Protected) ---
        if (previewAreaContainer) previewAreaContainer.style.display = "block";
        if (loadingEl) loadingEl.style.display = "none";
        if (actionButtons) actionButtons.style.display = "flex";

        if (resultsContainer) {
          resultsContainer.style.display = "block";

          // 🚨 AUTO-SCROLL TO RESULTS ON LAPTOP
          setTimeout(() => {
            resultsContainer.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 100);
        }
      }
    } else {
      // IF AI FAILS: Put everything back to normal
      if (loadingEl) loadingEl.style.display = "none";
      if (actionButtons) actionButtons.style.display = "flex";

      // Ensure the box comes back if it fails
      if (mainCard) {
        mainCard.style.display = "block";
        mainCard.classList.remove("d-none", "d-md-block");
      }

      if (mobilePreviewWrapper) {
        mobilePreviewWrapper.style.display = "block";
        mobilePreviewWrapper.style.opacity = "1";
        mobilePreviewWrapper.style.transform = "translateY(0)";
      }
    }
  } // <--- Closes finally block
}); // <--- Closes calculateBtn.addEventListener

receiptsList.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("editable-text")) {
    const text = e.target.textContent.trim();
    if (
      ["New Item", `+${getSym()}0.00`, `-${getSym()}0.00`, "Misc"].includes(
        text,
      )
    )
      e.target.textContent = "";
  }
});

receiptsList.addEventListener("input", (e) => {
  // 1. If the user edits the category field directly, LOCK IT so auto-guess stops
  if (e.target.classList.contains("item-cat-field")) {
    e.target.dataset.customEdited = "true";
  }

  // 2. If the user edits the item name, ONLY auto-guess if they haven't set a custom category
  if (e.target.classList.contains("item-name-field")) {
    const row = e.target.closest(".rc-item");
    const catField = row.querySelector(".item-cat-field");

    if (catField && catField.dataset.customEdited !== "true") {
      catField.textContent = guessCategory(e.target.textContent);
    }
  }

  // 3. Keep live math updated
  if (
    e.target.classList.contains("price-edit") ||
    e.target.classList.contains("item-cat-field") ||
    e.target.classList.contains("item-name-field")
  ) {
    if (e.target.classList.contains("price-edit")) {
      let cleanNumber =
        parseFloat(e.target.textContent.replace(/[^\d.-]/g, "")) || 0;
      e.target.dataset.rawAmount = cleanNumber;
    }
    recalculateLiveMath();
  }
});

receiptsList.addEventListener("keydown", (e) => {
  if (e.target.classList.contains("editable-text") && e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
});
// ==========================================
// 🎙️ MEDIA RECORDER & AI VOICE ENGINE HANDLER
// ==========================================
let activeMediaRecorder = null;
let currentAudioChunks = [];

async function toggleVoiceRecording(micBtn, onSuccessCallback) {
  // If currently recording on this button -> Stop and process audio
  if (activeMediaRecorder && activeMediaRecorder.state === "recording") {
    activeMediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeMediaRecorder = new MediaRecorder(stream);
    currentAudioChunks = [];

    micBtn.innerHTML = "🔴";

    activeMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) currentAudioChunks.push(event.data);
    };

    activeMediaRecorder.onstop = async () => {
      micBtn.innerHTML = "⏳";
      const audioBlob = new Blob(currentAudioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append(
        "lang",
        typeof getLang === "function" ? getLang() : "hi-IN",
      );

      try {
        const res = await fetch("/process_voice", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.success && data.text) {
          onSuccessCallback(data.text);
        } else {
          showPremiumError(
            "Voice recognition failed. Please try speaking again.",
          );
        }
      } catch (err) {
        console.error("Voice processing error:", err);
        showPremiumError("Error processing voice audio.");
      } finally {
        micBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
        stream.getTracks().forEach((track) => track.stop());
        activeMediaRecorder = null;
      }
    };

    activeMediaRecorder.start();
  } catch (err) {
    console.error("Mic access denied:", err);
    showPremiumError("Microphone access denied or unsupported.");
    micBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
  }
}

receiptsList.addEventListener("click", async (e) => {
  if (
    e.target.classList.contains("inline-mic-btn") ||
    e.target.closest(".inline-mic-btn")
  ) {
    const micBtn = e.target.classList.contains("inline-mic-btn")
      ? e.target
      : e.target.closest(".inline-mic-btn");
    const row = micBtn.closest(".rc-item");
    const nameField = row.querySelector(".item-name-field");
    const priceField = row.querySelector(".price-edit");
    const catField = row.querySelector(".item-cat-field");

    if (micBtn.dataset.recording === "true") {
      if (window.currentActiveRecorder) window.currentActiveRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      window.currentActiveRecorder = recorder;
      let audioChunks = [];

      const audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = Date.now();
      let hasSpoken = false;
      let vadInterval = null;
      let absoluteStartTime = Date.now();

      micBtn.dataset.recording = "true";
      micBtn.innerHTML = "🔴";

      vadInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        let averageVolume = sum / dataArray.length;

        if (averageVolume > 10) {
          hasSpoken = true;
          silenceStart = Date.now();
        }

        const timeSinceSpoken = Date.now() - silenceStart;
        const totalRecordTime = Date.now() - absoluteStartTime;

        if ((hasSpoken && timeSinceSpoken > 800) || totalRecordTime > 4000) {
          clearInterval(vadInterval);
          if (recorder.state === "recording") recorder.stop();
        }
      }, 100);

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) audioChunks.push(evt.data);
      };

      recorder.onstop = async () => {
        if (vadInterval) clearInterval(vadInterval);
        if (audioContext.state !== "closed") audioContext.close();

        micBtn.innerHTML = "⏳";
        micBtn.dataset.recording = "false";

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob);
        formData.append(
          "lang",
          typeof getLang === "function" ? getLang() : "hi-IN",
        );

        try {
          const res = await fetch("/process_voice", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();

          if (data.success && data.text) {
            // TIERS 1, 2, or 3 SUCCEEDED
            applyTranscriptToRow(data.text, nameField, priceField, catField);
          } else if (data.fallback_to_browser || !data.success) {
            // 🚨 TIER 4: BROWSER NATIVE FALLBACK TRIGGERED
            console.warn(
              "⚠️ All Backend AI Tiers failed. Launching Tier 4 Browser Native Speech...",
            );
            runBrowserNativeSpeech(micBtn, nameField, priceField, catField);
          }
        } catch (err) {
          console.error(
            "Backend voice network error. Launching Tier 4 Browser Fallback:",
            err,
          );
          runBrowserNativeSpeech(micBtn, nameField, priceField, catField);
        } finally {
          micBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.start();
    } catch (err) {
      alert("Microphone permission denied.");
    }
  }
  if (
    e.target.classList.contains("inline-insert-btn") ||
    e.target.closest(".inline-insert-btn")
  ) {
    const currentRow = e.target.closest(".rc-item");
    const newRow = document.createElement("div");
    newRow.className =
      "rc-item px-3 py-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 border-bottom border-light animate-pop";
    newRow.innerHTML = `
        <div class="d-flex align-items-center gap-2 flex-wrap flex-grow-1" style="max-width: 100%;">
            <span class="editable-text item-name-field text-wrap" contenteditable="true" spellcheck="false" style="word-break: break-word; min-width: 100px;">New Item</span>
            <span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false">Misc</span>
        </div>
        <div class="d-flex align-items-center justify-content-end gap-2 ms-auto ms-sm-0 utils-wrapper">
            <span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false">+${getSym()}0.00</span>
            <button class="inline-mic-btn btn p-1 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #64748b;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg></button>
            <button class="inline-insert-btn btn p-1 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #3b82f6;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
            <button class="inline-delete-btn btn p-1 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #fee2e2; background: #ffffff; color: #ef4444;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
        </div>`;
    currentRow.parentNode.insertBefore(newRow, currentRow.nextSibling);
    newRow.querySelector(".item-name-field").focus();
    const card = e.target.closest(".receipt-card");
    const countSpan = card.querySelector(".entry-count");
    if (countSpan)
      countSpan.textContent = `(${card.querySelectorAll(".rc-item").length} entries)`;
    recalculateLiveMath();
  }

  if (
    e.target.classList.contains("inline-delete-btn") ||
    e.target.closest(".inline-delete-btn")
  ) {
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
    newRow.className =
      "rc-item px-3 py-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2 border-bottom border-light animate-pop";
    newRow.innerHTML = `
        <div class="d-flex align-items-center gap-2 flex-wrap flex-grow-1" style="max-width: 100%;">
            <span class="editable-text item-name-field text-wrap" contenteditable="true" spellcheck="false" style="word-break: break-word; min-width: 100px;">New Item</span>
            <span class="cat-badge editable-text item-cat-field" contenteditable="true" spellcheck="false">Misc</span>
        </div>
        <div class="d-flex align-items-center justify-content-end gap-2 ms-auto ms-sm-0 utils-wrapper">
            <span class="rc-item-val editable-text price-edit" contenteditable="true" spellcheck="false">+${getSym()}0.00</span>
            <button class="inline-mic-btn btn p-1 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #64748b;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg></button>
            <button class="inline-insert-btn btn p-1 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #3b82f6;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
            <button class="inline-delete-btn btn p-1 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid #fee2e2; background: #ffffff; color: #ef4444;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
        </div>`;
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
      const priceEl = itemEl.querySelector(".price-edit");

      // 🛡️ READ RAW AMOUNT FIRST
      let rawVal = priceEl.dataset.rawAmount
        ? parseFloat(priceEl.dataset.rawAmount)
        : parseFloat(priceEl.textContent.replace(/[^\d.-]/g, "")) || 0;

      correctedItems.push({
        item: itemEl.querySelector(".item-name-field").textContent.trim(),
        category: itemEl.querySelector(".item-cat-field").textContent.trim(),
        amount: rawVal,
      });
    });

    btn.textContent = "Saving... ⏳";
    btn.style.pointerEvents = "none";
    try {
      const formData = new FormData();
      formData.append("image", fileToSave);
      formData.append("original_filename", fileToSave.name);
      formData.append("json_data", JSON.stringify({ items: correctedItems }));
      fetch("/save_training_data", { method: "POST", body: formData }).then(
        (res) => {
          if (res.ok) {
            btn.textContent = "Update Dataset 🔄";
            btn.style.background = "rgba(59, 130, 246, 0.4)";
            btn.style.color = "white";
            btn.style.border = "none";
            btn.style.pointerEvents = "auto";
          } else throw new Error("Failed");
        },
      );
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

      if (document.activeElement !== priceElement) {
        priceElement.textContent = `${isNeg ? "-" : "+"}${getSym()}${Math.abs(value).toFixed(2)}`;
      }

      if (isNeg) priceElement.classList.add("val-neg");
      else priceElement.classList.remove("val-neg");

      cardSubtotal += value;
      let catName = catElement.textContent.trim() || "Misc";

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

    // 🚨 FIX 1: Matched the header style to the rest of the sidebar
    let breakdownHtml = `<h6 class="fw-bold mb-3 mt-4 text-uppercase text-muted small" style="letter-spacing: 0.5px;">📊 Spend by Category</h6>`;

    const sortedCats = Object.entries(categoryTotals).sort(
      (a, b) => b[1] - a[1],
    );

    sortedCats.forEach(([cat, val]) => {
      if (val === 0) return;
      const percentage =
        newGrandTotal !== 0
          ? Math.abs((val / newGrandTotal) * 100).toFixed(1)
          : 0;

      // 🚨 FIX 2: Changed text to dark slate and made the dotted line a visible gray
      breakdownHtml += `
        <div class="d-flex align-items-end mb-2">
            <span style="font-weight: 600; color: #334155; font-size: 14px;">${cat}</span>
            <div style="flex-grow: 1; border-bottom: 2px dotted #cbd5e1; margin: 0 10px; position: relative; top: -6px;"></div>
            <span style="font-weight: 700; color: #1e293b; font-size: 14px;">${getSym()}${val.toFixed(2)} 
                <span style="font-size:12px; color:#64748b; margin-left:4px; font-weight: 500;">(${percentage}%)</span>
            </span>
        </div>`;
    });

    breakdownHtml += `<div class="chart-wrapper mt-4" style="height: 180px;"><canvas id="spendChart"></canvas></div>`;
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
              // 🚨 FIX 3: Changed the chart legend text to a readable dark slate
              labels: {
                color: "#475569",
                font: { size: 12, family: "'Inter', sans-serif" },
                boxWidth: 12,
              },
            },
          },
        },
      });
    }
  }
} // <--- End of recalculateLiveMath() function
function downloadCSV() {
  // GUARD CLAUSE: Prevent exporting if there are no valid extracted items
  if (document.querySelectorAll(".rc-item").length === 0) {
    showPremiumError(
      "No valid data to export. Please process a clear receipt first.",
    );
    return; // Stops the function from downloading a blank file
  }
  const e = window.event;
  if (e) e.preventDefault();
  try {
    let csvContent = "\uFEFF" + "S.No.,Item Name,Category,Price\n";
    let sno = 1;
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
    link.href = URL.createObjectURL(blob);
    link.download = `QuickTotal_Export_${new Date().getTime()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    alert("Something went wrong downloading the CSV.");
  }
}

async function downloadPDF() {
  // GUARD CLAUSE: Prevent exporting if there are no valid extracted items
  if (document.querySelectorAll(".rc-item").length === 0) {
    showPremiumError(
      "No valid data to export. Please process a clear receipt first.",
    );
    return; // Stops the function from downloading a blank file
  }
  const e = window.event;
  if (e) e.preventDefault();
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "pt", "a4");
    let docCursor = 50;

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
      doc.setFont("helvetica");
    }

    doc.setFontSize(22);
    doc.setTextColor(139, 92, 246);
    doc.text("QuickTotal Financial Report", 40, docCursor);
    docCursor += 20;

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, docCursor);
    docCursor += 40;

    const chartCanvas = document.getElementById("spendChart");
    if (chartCanvas) {
      doc.addImage(
        chartCanvas.toDataURL("image/png"),
        "PNG",
        180,
        docCursor,
        200,
        200,
      );
      docCursor += 230;
    }

    let sno = 1,
      tableRows = [];
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
    if (docCursor > 700) {
      doc.addPage();
      docCursor = 50;
    }

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
    alert("Something went wrong downloading the PDF.");
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

  // ADD THIS: Restore the upload card for mobile devices
  const mainCard = document.querySelector(".main-card");
  if (mainCard) {
    mainCard.classList.remove("d-none", "d-md-block");
    mainCard.style.display = "block";
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

const langMap = {
  "hi-IN": "Hindi / English (Default)",
  "hi-only": "Hindi",
  "en-IN": "English",
};
const currencyMap = {
  INR: "Indian Rupee (₹)",
  USD: "US Dollar ($)",
  EUR: "Euro (€)",
  GBP: "British Pound (£)",
  AUD: "Australian Dollar (A$)",
  SAR: "Saudi Riyal (SAR)",
};

// ==========================================
// ⚙️ SETTINGS & LIVE CURRENCY CONVERSION
// ==========================================
async function selectOption(event, buttonId, inputId, text, value) {
  if (event) event.preventDefault();

  const buttonSpan = document.querySelector(`#${buttonId} span`);
  const inputEl = document.getElementById(inputId);

  // Remember the old currency before we change it
  const oldValue = localStorage.getItem(inputId);

  if (buttonSpan) buttonSpan.innerText = text;
  if (inputEl) inputEl.value = value;
  localStorage.setItem(inputId, value);

  // Clear '.active' class from all links in this specific dropdown
  const parentDropdown = document.querySelector(`#${buttonId}`).parentElement;
  if (parentDropdown) {
    const allItems = parentDropdown.querySelectorAll(".dropdown-item");
    allItems.forEach((item) => item.classList.remove("active"));

    // Highlight the selected element
    if (event && event.target) {
      const clickedItem = event.target.closest(".dropdown-item");
      if (clickedItem) clickedItem.classList.add("active");
    }
  }

  // 💱 THE MAGIC LIVE CONVERTER
  // If the user changed the currency AND there are receipts on the screen
  const itemsExist = document.querySelectorAll(".price-edit").length > 0;

  if (
    inputId === "settingsCurrency" &&
    oldValue &&
    oldValue !== value &&
    itemsExist
  ) {
    const btn = document.querySelector(`#${buttonId}`);
    btn.innerHTML = `<span>Converting... ⏳</span>`;

    try {
      // Fetch completely free, keyless live exchange rates
      const res = await fetch(`https://open.er-api.com/v6/latest/${oldValue}`);
      const data = await res.json();
      const rate = data.rates[value];

      if (rate) {
        document.querySelectorAll(".price-edit").forEach((el) => {
          // Extract the raw number, ignoring old currency symbols
          let rawPrice =
            parseFloat(el.textContent.replace(/[^\d.-]/g, "")) || 0;

          // Multiply by the live exchange rate
          let newPrice = rawPrice * rate;
          const isNeg = rawPrice < 0;

          // Temporarily set the raw converted math
          el.textContent = `${isNeg ? "-" : "+"}${Math.abs(newPrice).toFixed(2)}`;
        });
      }
    } catch (err) {
      console.error("Live FX conversion failed:", err);
    } finally {
      btn.innerHTML = `<span>${text}</span>`;
    }
  }

  // Recalculate will automatically grab the new math and apply the new symbol!
  if (typeof recalculateLiveMath === "function") recalculateLiveMath();
}

document.addEventListener("DOMContentLoaded", () => {
  const savedLang = localStorage.getItem("settingsLanguage") || "hi-IN";
  if (langMap[savedLang]) {
    const inputEl = document.getElementById("settingsLanguage");
    if (inputEl) inputEl.value = savedLang;

    const buttonSpan = document.querySelector("#langBtn span");
    if (buttonSpan) buttonSpan.innerText = langMap[savedLang];

    // Highlight active item on page load
    const langItems = document.querySelectorAll(
      "#langBtn + .dropdown-menu .dropdown-item",
    );
    langItems.forEach((link) => {
      link.classList.remove("active");
      if (
        link.getAttribute("onclick") &&
        link.getAttribute("onclick").includes(savedLang)
      ) {
        link.classList.add("active");
      }
    });
  }

  const savedCurrency = localStorage.getItem("settingsCurrency") || "INR";
  if (currencyMap[savedCurrency]) {
    const currInput = document.getElementById("settingsCurrency");
    if (currInput) currInput.value = savedCurrency;

    const currBtnSpan = document.querySelector("#currencyBtn span");
    if (currBtnSpan) currBtnSpan.innerText = currencyMap[savedCurrency];

    const currItems = document.querySelectorAll(
      "#currencyBtn + .dropdown-menu .dropdown-item",
    );
    currItems.forEach((link) => {
      link.classList.remove("active");
      if (
        link.getAttribute("onclick") &&
        link.getAttribute("onclick").includes(savedCurrency)
      ) {
        link.classList.add("active");
      }
    });
  }
});
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

function showPremiumError(message) {
  // Remove existing alert if one is already showing
  const existing = document.getElementById("premium-alert");
  if (existing) existing.remove();

  // Create the premium error toast
  const alertDiv = document.createElement("div");
  alertDiv.id = "premium-alert";
  alertDiv.style.cssText =
    "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #be123c; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px rgba(190, 18, 60, 0.2); z-index: 9999; opacity: 0; transition: opacity 0.3s ease; display: flex; align-items: center; gap: 8px;";

  alertDiv.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${message}`;

  document.body.appendChild(alertDiv);

  // Fade it in
  setTimeout(() => (alertDiv.style.opacity = "1"), 10);

  // Fade it out and remove after 3 seconds
  setTimeout(() => {
    alertDiv.style.opacity = "0";
    setTimeout(() => alertDiv.remove(), 300);
  }, 3000);
}
// --- HELPER FUNCTION 1: PARSE & APPLY TRANSCRIPT ---
function applyTranscriptToRow(transcript, nameField, priceField, catField) {
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

  if (itemName) nameField.textContent = itemName;

  if (priceMatch && priceVal > 0) {
    priceField.textContent = `+${getSym()}${priceVal.toFixed(2)}`;
    priceField.classList.remove("val-neg");
  } else {
    priceField.textContent = `+${getSym()}0.00`;
    priceField.classList.remove("val-neg");
  }

  if (catField && itemName) catField.textContent = guessCategory(itemName);
  recalculateLiveMath();
}

// --- HELPER FUNCTION 2: TIER 4 BROWSER NATIVE FALLBACK ---
function runBrowserNativeSpeech(micBtn, nameField, priceField, catField) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition not supported on this browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  const selectedLangMode = typeof getLang === "function" ? getLang() : "hi-IN";
  recognition.lang = selectedLangMode === "en-IN" ? "en-IN" : "hi-IN";

  micBtn.innerHTML = "🌐"; // Shows Globe icon to indicate Tier 4 Browser engine

  recognition.onresult = (event) => {
    let transcript = event.results[0][0].transcript;
    applyTranscriptToRow(transcript, nameField, priceField, catField);
  };

  recognition.onerror = () => {
    console.error("Tier 4 Browser Speech Recognition error.");
  };

  recognition.onend = () => {
    micBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
  };

  recognition.start();
}
// ==========================================
// PREMIUM IMAGE VIEWER & CROP ENGINE (Clean)
// ==========================================

document.addEventListener("click", function (e) {
  const thumbCard = e.target.closest("#thumbnailGrid > div");
  if (thumbCard) {
    if (e.target.closest(".thumb-delete") || e.target.tagName === "BUTTON")
      return;
    const index = parseInt(thumbCard.dataset.index);
    if (!isNaN(index) && filesToProcess[index]) {
      openModal(filesToProcess[index], index);
    }
  }
});

const closeBtn = document.getElementById("closeImageModal");
if (closeBtn) {
  closeBtn.addEventListener("click", function () {
    document.getElementById("imageModal").style.display = "none";
    document.body.style.overflow = "auto";
  });
}

const cropCanvas = document.getElementById("modalCropCanvas");
const cropCtx = cropCanvas ? cropCanvas.getContext("2d") : null;
const cropBtn = document.getElementById("toggleCropBtn");
const saveBtn = document.getElementById("saveCropBtn");
const modalImgEl = document.getElementById("modalImage");

// We need these variables to track your mouse!
let isDrawing = false;
let startX = 0,
  startY = 0;
let cropX = 0,
  cropY = 0,
  cropW = 0,
  cropH = 0;

if (cropBtn && cropCanvas && modalImgEl) {
  cropBtn.addEventListener("click", function (e) {
    e.preventDefault();
    cropCanvas.style.display = "block";
    cropCanvas.width = modalImgEl.clientWidth;
    cropCanvas.height = modalImgEl.clientHeight;
    cropCtx.fillStyle = "rgba(15, 23, 42, 0.5)";
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  });
}

// THIS IS WHAT WAS MISSING: The drawing mechanics
if (cropCanvas) {
  // Start Drawing (Mouse & Touch)
  const startDraw = function (e) {
    isDrawing = true;
    const rect = cropCanvas.getBoundingClientRect();

    // Support both Mouse and Mobile Touch
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // 🚨 FIX: Divide by currentZoom so the crop box stays under your cursor when zoomed!
    startX = (clientX - rect.left) / currentZoom;
    startY = (clientY - rect.top) / currentZoom;
  };

  // Draw Box (Mouse & Touch)
  const moveDraw = function (e) {
    if (!isDrawing) return;
    e.preventDefault(); // Stops mobile screen from scrolling while you draw

    const rect = cropCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const currentX = (clientX - rect.left) / currentZoom;
    const currentY = (clientY - rect.top) / currentZoom;

    cropX = Math.min(startX, currentX);
    cropY = Math.min(startY, currentY);
    cropW = Math.abs(currentX - startX);
    cropH = Math.abs(currentY - startY);

    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.fillStyle = "rgba(15, 23, 42, 0.6)";
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.clearRect(cropX, cropY, cropW, cropH);

    cropCtx.strokeStyle = "#3b82f6";
    cropCtx.lineWidth = 2.5;
    cropCtx.setLineDash([6, 4]);
    cropCtx.strokeRect(cropX, cropY, cropW, cropH);
  };

  const stopDraw = function () {
    isDrawing = false;
  };

  // Desktop Mouse Events
  cropCanvas.addEventListener("mousedown", startDraw);
  cropCanvas.addEventListener("mousemove", moveDraw);
  window.addEventListener("mouseup", stopDraw);

  // 📱 Mobile Touch Events Added!
  cropCanvas.addEventListener("touchstart", startDraw, { passive: false });
  cropCanvas.addEventListener("touchmove", moveDraw, { passive: false });
  window.addEventListener("touchend", stopDraw);
}
window.addEventListener("mouseup", function () {
  isDrawing = false;
});

if (saveBtn) {
  saveBtn.addEventListener("click", function () {
    if (cropW < 10 || cropH < 10) {
      alert("Please draw a larger crop box over the document.");
      return;
    }

    try {
      // 1. Calculate letterboxing offsets to ignore empty screen space
      const scale = Math.min(
        cropCanvas.width / modalImgEl.naturalWidth,
        cropCanvas.height / modalImgEl.naturalHeight,
      );

      const renderedWidth = modalImgEl.naturalWidth * scale;
      const renderedHeight = modalImgEl.naturalHeight * scale;

      const offsetX = (cropCanvas.width - renderedWidth) / 2;
      const offsetY = (cropCanvas.height - renderedHeight) / 2;

      // 2. Map coordinates exactly to the high-res image
      const imageScaleX = modalImgEl.naturalWidth / renderedWidth;
      const imageScaleY = modalImgEl.naturalHeight / renderedHeight;

      // Prevent extracting pixels outside the image bounds
      const rawSourceX = (cropX - offsetX) * imageScaleX;
      const rawSourceY = (cropY - offsetY) * imageScaleY;

      const sourceX = Math.max(0, rawSourceX);
      const sourceY = Math.max(0, rawSourceY);
      const sourceW = Math.min(
        cropW * imageScaleX,
        modalImgEl.naturalWidth - sourceX,
      );
      const sourceH = Math.min(
        cropH * imageScaleY,
        modalImgEl.naturalHeight - sourceY,
      );

      if (sourceW <= 0 || sourceH <= 0) {
        alert("Crop area is outside the image boundaries.");
        return;
      }

      // 3. Extract exact pixels
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = sourceW;
      finalCanvas.height = sourceH;
      const finalCtx = finalCanvas.getContext("2d");

      finalCtx.drawImage(
        modalImgEl,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        sourceW,
        sourceH,
      );

      const croppedImageUrl = finalCanvas.toDataURL("image/jpeg", 0.9);

      // 4. Update Memory & Recalculate OpenCV Score
      if (activeFileIndex !== null && filesToProcess[activeFileIndex]) {
        const croppedFile = dataURLtoFile(
          croppedImageUrl,
          `cropped_${Date.now()}.jpg`,
        );

        // Show loading state for quality badge while backend calculates
        croppedFile.precalcQuality = "...";
        croppedFile.previewUrl = croppedImageUrl;

        filesToProcess[activeFileIndex] = croppedFile;
        renderThumbnails();

        // 🚨 YOUR NEW FEATURE: Recalculate CV score for the new cropped image!
        if (typeof fetchQualityInBackground === "function") {
          fetchQualityInBackground(croppedFile, activeFileIndex);
        }
      }

      // 5. Cleanup & Close
      cropW = 0;
      cropH = 0;
      cropCanvas.style.display = "none";
      if (cropCtx) cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      document.getElementById("imageModal").style.display = "none";
      document.body.style.overflow = "auto";
    } catch (error) {
      console.error("Crop failed:", error);
      alert("Crop failed. Please try drawing the box again.");
    }
  });
}
// --- HELPER FUNCTION 1: PARSE & APPLY TRANSCRIPT TO UI ---
function applyTranscriptToRow(transcript, nameField, priceField, catField) {
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

  if (itemName) nameField.textContent = itemName;

  if (priceMatch && priceVal > 0) {
    priceField.textContent = `+${getSym()}${priceVal.toFixed(2)}`;
    priceField.classList.remove("val-neg");
  } else {
    priceField.textContent = `+${getSym()}0.00`;
    priceField.classList.remove("val-neg");
  }

  if (catField && itemName) catField.textContent = guessCategory(itemName);
  recalculateLiveMath();
}

// --- HELPER FUNCTION 2: TIER 4 BROWSER NATIVE SPEECH RECOGNITION ---
function runBrowserNativeSpeech(micBtn, nameField, priceField, catField) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is not supported on this browser.");
    return;
  }

  const recognition = new SpeechRecognition();
  const selectedLangMode = typeof getLang === "function" ? getLang() : "hi-IN";
  recognition.lang = selectedLangMode === "en-IN" ? "en-IN" : "hi-IN";

  micBtn.innerHTML = "🌐"; // Shows Globe icon indicating Tier 4 Browser Speech API is active

  recognition.onresult = (event) => {
    let transcript = event.results[0][0].transcript;
    applyTranscriptToRow(transcript, nameField, priceField, catField);
  };

  recognition.onerror = (err) => {
    console.error("Tier 4 Browser Speech Error:", err);
  };

  recognition.onend = () => {
    micBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
  };

  recognition.start();
}

// ==========================================
// 🚀 FIRST-TIME USER ONBOARDING MODAL
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const hasOnboarded = localStorage.getItem("quickTotalOnboarded");
  const onboardModal = document.getElementById("onboardingModal");
  const finishBtn = document.getElementById("finishOnboardingBtn");
  const skipBtn = document.getElementById("skipOnboardingBtn"); // 👈 NEW SKIP BTN

  // If they have never visited the site before, show the modal
  if (!hasOnboarded && onboardModal) {
    onboardModal.style.display = "flex";

    // 1. SAVE PREFERENCE LOGIC
    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        const selectEl = document.getElementById("onboardCurrency");
        const selectedCurr = selectEl.value;
        const selectedText = selectEl.options[selectEl.selectedIndex].text;

        localStorage.setItem("settingsCurrency", selectedCurr);
        localStorage.setItem("quickTotalOnboarded", "true"); // Mark as done

        // Update UI dropdown instantly
        const currInput = document.getElementById("settingsCurrency");
        if (currInput) currInput.value = selectedCurr;

        const currBtnSpan = document.querySelector("#currencyBtn span");
        if (currBtnSpan) currBtnSpan.innerText = selectedText;

        const currItems = document.querySelectorAll(
          "#currencyBtn + .dropdown-menu .dropdown-item",
        );
        currItems.forEach((link) => {
          link.classList.remove("active");
          if (
            link.getAttribute("onclick") &&
            link.getAttribute("onclick").includes(selectedCurr)
          ) {
            link.classList.add("active");
          }
        });

        onboardModal.style.display = "none";
      });
    }

    // 2. SKIP LOGIC
    if (skipBtn) {
      skipBtn.addEventListener("click", () => {
        // Mark as onboarded so we don't annoy them again next time
        localStorage.setItem("quickTotalOnboarded", "true");

        // Modal closes, app naturally defaults to INR as programmed
        onboardModal.style.display = "none";
      });
    }
  }
});

// ==========================================
// 🔍 UNIFORM STAGE ZOOM CONTROLLER (Cleaned)
// ==========================================

// Reset zoom whenever a new image is opened in the inspector
function resetInspectorZoom() {
  currentZoom = 1;
  panX = 0;
  panY = 0;
  if (modalTransformWrapper) {
    modalTransformWrapper.style.transform = `translate(0px, 0px) scale(1)`;
  }
}

// ==========================================
// 📱 MOBILE-SPECIFIC BUTTON LISTENERS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Mobile "Process Documents" Button
  const calcBtnMobile = document.getElementById("calculateBtnMobile");
  if (calcBtnMobile) {
    calcBtnMobile.addEventListener("click", () => {
      // Secretly clicks the hidden desktop button to run your main AI logic
      const mainCalcBtn = document.getElementById("calculateBtn");
      if (mainCalcBtn) mainCalcBtn.click();
    });
  }

  // 2. Mobile "Clear All" Button
  const rstBtnMobile = document.getElementById("resetBtnMobile");
  if (rstBtnMobile) {
    rstBtnMobile.addEventListener("click", () => {
      // Secretly clicks the hidden desktop reset button
      const mainResetBtn = document.getElementById("resetBtn");
      if (mainResetBtn) mainResetBtn.click();
    });
  }

  // 3. Mobile "Remove Image" (Cross) Button
  const mobRemoveBtn = document.getElementById("mobileRemoveActiveBtn");
  if (mobRemoveBtn) {
    mobRemoveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // activeMobileIndex tracks which image is currently showing on the phone
      if (
        typeof activeMobileIndex !== "undefined" &&
        filesToProcess.length > 0
      ) {
        removeFile(activeMobileIndex, e);
      }
    });
  }

  // 4. Mobile "Full Screen" (Expand) Button
  const mobExpandBtn = document.getElementById("mobileExpandBtn");
  if (mobExpandBtn) {
    mobExpandBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // Opens your premium Image Viewer / Crop modal for the active image
      if (
        typeof activeMobileIndex !== "undefined" &&
        filesToProcess.length > 0
      ) {
        openModal(filesToProcess[activeMobileIndex], activeMobileIndex);
      }
    });
  }
});
