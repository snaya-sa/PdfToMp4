import { PDFRenderer } from './pdf-renderer.js';
import { VideoEncoder, QualityPresets } from './video-encoder.js';
import './style.css';

// App State
const state = {
  pdfFile: null,
  pdfRenderer: null,
  audioFile: null,
  audioDuration: null,
  thumbnails: [],
  videoBlob: null,
  isProcessing: false
};

// DOM Elements
const elements = {
  // PDF
  pdfDropZone: document.getElementById('pdf-drop-zone'),
  pdfInput: document.getElementById('pdf-input'),
  pdfInfo: document.getElementById('pdf-info'),
  removePdf: document.getElementById('remove-pdf'),

  // Preview
  previewSection: document.getElementById('preview-section'),
  previewGrid: document.getElementById('preview-grid'),
  pageCount: document.getElementById('page-count'),

  // Audio
  audioDropZone: document.getElementById('audio-drop-zone'),
  audioInput: document.getElementById('audio-input'),
  audioInfo: document.getElementById('audio-info'),
  audioOptions: document.getElementById('audio-options'),
  removeAudio: document.getElementById('remove-audio'),
  loopAudio: document.getElementById('loop-audio'),
  volume: document.getElementById('volume'),
  volumeValue: document.getElementById('volume-value'),

  // Settings
  duration: document.getElementById('duration'),
  durationMinus: document.getElementById('duration-minus'),
  durationPlus: document.getElementById('duration-plus'),
  autoDuration: document.getElementById('auto-duration'),
  autoDurationHint: document.getElementById('auto-duration-hint'),
  quality: document.getElementById('quality'),
  fps: document.getElementById('fps'),

  // Convert
  convertBtn: document.getElementById('convert-btn'),

  // Progress
  progressSection: document.getElementById('progress-section'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  progressPercent: document.getElementById('progress-percent'),
  stepLoad: document.getElementById('step-load'),
  stepRender: document.getElementById('step-render'),
  stepEncode: document.getElementById('step-encode'),
  stepAudio: document.getElementById('step-audio'),

  // Download
  downloadSection: document.getElementById('download-section'),
  fileSize: document.getElementById('file-size'),
  videoDuration: document.getElementById('video-duration'),
  downloadBtn: document.getElementById('download-btn'),
  newBtn: document.getElementById('new-btn'),

  // Error
  errorSection: document.getElementById('error-section'),
  errorMessage: document.getElementById('error-message'),
  retryBtn: document.getElementById('retry-btn'),

  // PWA
  pwaStatus: document.getElementById('pwa-status')
};

// Utility Functions
function toArabicNumbers(num) {
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(num).replace(/[0-9]/g, (d) => arabicNums[d]);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return toArabicNumbers(bytes) + ' بايت';
  if (bytes < 1024 * 1024) return toArabicNumbers((bytes / 1024).toFixed(1)) + ' ك.ب';
  return toArabicNumbers((bytes / (1024 * 1024)).toFixed(1)) + ' م.ب';
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return toArabicNumbers(secs) + ' ثانية';
  return toArabicNumbers(mins) + ' دقيقة ' + toArabicNumbers(secs) + ' ثانية';
}

function showSection(sectionId) {
  ['progress-section', 'download-section', 'error-section'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  if (sectionId) {
    document.getElementById(sectionId).classList.remove('hidden');
  }
}

function setProgress(percent, text) {
  elements.progressFill.style.width = percent + '%';
  elements.progressPercent.textContent = toArabicNumbers(percent) + '٪';
  if (text) elements.progressText.textContent = text;
}

function setStepStatus(stepId, status) {
  const step = document.getElementById(stepId);
  step.classList.remove('active', 'done');
  const icon = step.querySelector('.step-icon');

  if (status === 'active') {
    step.classList.add('active');
    icon.textContent = '⏳';
  } else if (status === 'done') {
    step.classList.add('done');
    icon.textContent = '✓';
  } else {
    icon.textContent = '⏳';
  }
}

function resetSteps() {
  ['step-load', 'step-render', 'step-encode', 'step-audio'].forEach(id => {
    setStepStatus(id, 'pending');
  });
}

function updateConvertButton() {
  elements.convertBtn.disabled = !state.pdfFile || state.isProcessing;
}

function updateAutoDurationHint() {
  if (!state.audioDuration || !state.pdfRenderer) {
    elements.autoDurationHint.textContent = '';
    return;
  }

  const pageCount = state.pdfRenderer.pageCount;
  const durationPerPage = state.audioDuration / pageCount;
  elements.autoDurationHint.textContent =
    `${toArabicNumbers(pageCount)} صفحات ÷ ${formatDuration(state.audioDuration)} = ${toArabicNumbers(durationPerPage.toFixed(1))} ثانية/صفحة`;
}

// PDF Handling
async function handlePDFFile(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('الرجاء اختيار ملف PDF صالح');
    return;
  }

  state.pdfFile = file;
  state.pdfRenderer = new PDFRenderer();

  try {
    const pageCount = await state.pdfRenderer.loadPDF(file);

    // Update UI
    elements.pdfInfo.classList.remove('hidden');
    elements.pdfInfo.querySelector('.file-name').textContent = file.name;
    elements.pdfInfo.querySelector('.file-pages').textContent = toArabicNumbers(pageCount) + ' صفحات';
    elements.pdfDropZone.classList.add('hidden');

    // Generate thumbnails
    elements.previewSection.classList.remove('hidden');
    elements.pageCount.textContent = toArabicNumbers(pageCount) + ' صفحات';
    elements.previewGrid.innerHTML = '';

    const thumbnails = await state.pdfRenderer.generateAllThumbnails(150, (current, total) => {
      // Could show loading progress here
    });

    state.thumbnails = thumbnails;

    thumbnails.forEach((thumb, index) => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `
        <img src="${thumb}" alt="صفحة ${index + 1}" />
        <span class="preview-number">${toArabicNumbers(index + 1)}</span>
      `;
      elements.previewGrid.appendChild(item);
    });

    updateConvertButton();
    updateAutoDurationHint();

  } catch (error) {
    console.error('Error loading PDF:', error);
    alert('حدث خطأ أثناء تحميل ملف PDF');
    removePDF();
  }
}

function removePDF() {
  state.pdfFile = null;
  if (state.pdfRenderer) {
    state.pdfRenderer.destroy();
    state.pdfRenderer = null;
  }
  state.thumbnails = [];

  elements.pdfInfo.classList.add('hidden');
  elements.pdfDropZone.classList.remove('hidden');
  elements.previewSection.classList.add('hidden');
  elements.previewGrid.innerHTML = '';
  elements.pdfInput.value = '';

  updateConvertButton();
  updateAutoDurationHint();
}

// Audio Handling
async function handleAudioFile(file) {
  if (!file) return;

  const isAudio = file.type.startsWith('audio/');
  const isVideo = file.type.startsWith('video/');

  if (!isAudio && !isVideo) {
    alert('الرجاء اختيار ملف صوت أو فيديو صالح');
    return;
  }

  state.audioFile = file;

  try {
    const encoder = new VideoEncoder();
    state.audioDuration = await encoder.getMediaDuration(file);

    // Update UI
    elements.audioInfo.classList.remove('hidden');
    elements.audioOptions.classList.remove('hidden');
    elements.audioInfo.querySelector('.file-name').textContent = file.name;
    elements.audioInfo.querySelector('.file-duration').textContent = formatDuration(state.audioDuration);
    elements.audioDropZone.classList.add('hidden');

    // Enable auto-duration option
    elements.autoDuration.disabled = false;
    updateAutoDurationHint();

  } catch (error) {
    console.error('Error loading audio:', error);
    alert('حدث خطأ أثناء تحميل الملف الصوتي');
    removeAudio();
  }
}

function removeAudio() {
  state.audioFile = null;
  state.audioDuration = null;

  elements.audioInfo.classList.add('hidden');
  elements.audioOptions.classList.add('hidden');
  elements.audioDropZone.classList.remove('hidden');
  elements.audioInput.value = '';
  elements.autoDuration.checked = false;
  elements.autoDuration.disabled = true;
  elements.autoDurationHint.textContent = '';
}

// Drag and Drop
function setupDropZone(dropZone, input, handler) {
  dropZone.addEventListener('click', () => input.click());

  input.addEventListener('change', (e) => {
    if (e.target.files[0]) handler(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
  });
}

// Conversion
async function startConversion() {
  if (!state.pdfFile || state.isProcessing) return;

  state.isProcessing = true;
  updateConvertButton();
  showSection('progress-section');
  resetSteps();
  setProgress(0, 'جاري التجهيز...');

  const encoder = new VideoEncoder();

  try {
    // Step 1: Load FFmpeg
    setStepStatus('step-load', 'active');
    setProgress(5, 'جاري تحميل المكتبات...');

    await encoder.load((percent) => {
      setProgress(5 + percent * 0.15, 'جاري تحميل المكتبات...');
    });

    setStepStatus('step-load', 'done');
    setProgress(20, 'تم تحميل المكتبات');

    // Step 2: Render PDF pages
    setStepStatus('step-render', 'active');
    setProgress(25, 'جاري تحويل الصفحات...');

    const quality = QualityPresets[elements.quality.value];
    const imageBlobs = await state.pdfRenderer.renderAllPages(quality.width, (current, total) => {
      const percent = 25 + (current / total) * 25;
      setProgress(Math.round(percent), `تحويل الصفحة ${toArabicNumbers(current)} من ${toArabicNumbers(total)}`);
    });

    setStepStatus('step-render', 'done');
    setProgress(50, 'تم تحويل الصفحات');

    // Calculate duration
    let duration = parseFloat(elements.duration.value);
    if (elements.autoDuration.checked && state.audioDuration) {
      duration = state.audioDuration / state.pdfRenderer.pageCount;
    }

    // Step 3: Create video
    setStepStatus('step-encode', 'active');
    setProgress(55, 'جاري إنشاء الفيديو...');

    let videoBlob = await encoder.createVideoFromImages(imageBlobs, {
      duration: duration,
      fps: parseInt(elements.fps.value),
      width: quality.width,
      height: quality.height
    }, (text, percent) => {
      setProgress(50 + percent * 0.3, text);
    });

    setStepStatus('step-encode', 'done');
    setProgress(80, 'تم إنشاء الفيديو');

    // Step 4: Add audio (if provided)
    if (state.audioFile) {
      setStepStatus('step-audio', 'active');
      setProgress(82, 'جاري إضافة الصوت...');

      videoBlob = await encoder.addAudioToVideo(videoBlob, state.audioFile, {
        loop: elements.loopAudio.checked,
        volume: parseInt(elements.volume.value) / 100
      }, (text, percent) => {
        setProgress(80 + percent * 0.18, text);
      });

      setStepStatus('step-audio', 'done');
    } else {
      setStepStatus('step-audio', 'done');
    }

    setProgress(100, 'اكتمل التحويل!');

    // Store result
    state.videoBlob = videoBlob;

    // Get video duration
    const videoDuration = await encoder.getVideoDuration(videoBlob);

    // Show download section
    elements.fileSize.textContent = formatFileSize(videoBlob.size);
    elements.videoDuration.textContent = formatDuration(videoDuration);
    showSection('download-section');

  } catch (error) {
    console.error('Conversion error:', error);
    elements.errorMessage.textContent = error.message || 'حدث خطأ أثناء التحويل';
    showSection('error-section');
  } finally {
    encoder.terminate();
    state.isProcessing = false;
    updateConvertButton();
  }
}

function downloadVideo() {
  if (!state.videoBlob) return;

  const fileName = state.pdfFile.name.replace('.pdf', '') + '.mp4';
  const url = URL.createObjectURL(state.videoBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

function resetApp() {
  state.videoBlob = null;
  removePDF();
  removeAudio();
  showSection(null);
  elements.duration.value = 3;
  elements.quality.value = 'medium';
  elements.fps.value = '30';
  elements.volume.value = 100;
  elements.volumeValue.textContent = '١٠٠٪';
}

// Event Listeners
function initEventListeners() {
  // PDF drop zone
  setupDropZone(elements.pdfDropZone, elements.pdfInput, handlePDFFile);
  elements.removePdf.addEventListener('click', removePDF);

  // Audio drop zone
  setupDropZone(elements.audioDropZone, elements.audioInput, handleAudioFile);
  elements.removeAudio.addEventListener('click', removeAudio);

  // Duration controls
  elements.durationMinus.addEventListener('click', () => {
    const current = parseInt(elements.duration.value);
    if (current > 1) elements.duration.value = current - 1;
  });

  elements.durationPlus.addEventListener('click', () => {
    const current = parseInt(elements.duration.value);
    if (current < 60) elements.duration.value = current + 1;
  });

  elements.autoDuration.addEventListener('change', () => {
    elements.duration.disabled = elements.autoDuration.checked;
  });

  // Volume control
  elements.volume.addEventListener('input', () => {
    elements.volumeValue.textContent = toArabicNumbers(elements.volume.value) + '٪';
  });

  // Convert button
  elements.convertBtn.addEventListener('click', startConversion);

  // Download button
  elements.downloadBtn.addEventListener('click', downloadVideo);

  // New conversion button
  elements.newBtn.addEventListener('click', resetApp);

  // Retry button
  elements.retryBtn.addEventListener('click', () => {
    showSection(null);
    startConversion();
  });
}

// PWA Status
function checkPWAStatus() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => {
      elements.pwaStatus.classList.remove('hidden');
    });
  }
}

// Initialize
function init() {
  initEventListeners();
  checkPWAStatus();
  updateConvertButton();
}

// Start app
init();
