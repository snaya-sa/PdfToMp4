import * as pdfjsLib from 'pdfjs-dist';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export class PDFRenderer {
  constructor() {
    this.pdf = null;
    this.pageCount = 0;
  }

  /**
   * Load a PDF file
   * @param {File} file - The PDF file to load
   * @returns {Promise<number>} - Number of pages
   */
  async loadPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    this.pdf = await loadingTask.promise;
    this.pageCount = this.pdf.numPages;
    return this.pageCount;
  }

  /**
   * Render a single page to canvas and return as image data
   * @param {number} pageNum - Page number (1-indexed)
   * @param {number} scale - Scale factor for quality
   * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
   */
  async renderPage(pageNum, scale = 2) {
    if (!this.pdf) throw new Error('لم يتم تحميل ملف PDF');

    const page = await this.pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return {
      canvas,
      width: viewport.width,
      height: viewport.height
    };
  }

  /**
   * Render a page and return as blob
   * @param {number} pageNum - Page number (1-indexed)
   * @param {number} targetWidth - Target width for the image
   * @param {string} format - Image format (image/png or image/jpeg)
   * @returns {Promise<Blob>}
   */
  async renderPageToBlob(pageNum, targetWidth = 1920, format = 'image/png') {
    if (!this.pdf) throw new Error('لم يتم تحميل ملف PDF');

    const page = await this.pdf.getPage(pageNum);
    const originalViewport = page.getViewport({ scale: 1 });

    // Calculate scale to achieve target width
    const scale = targetWidth / originalViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Fill with white background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return new Promise((resolve) => {
      canvas.toBlob(resolve, format, 0.95);
    });
  }

  /**
   * Render all pages to blobs
   * @param {number} targetWidth - Target width for images
   * @param {function} onProgress - Progress callback (pageNum, totalPages)
   * @returns {Promise<Blob[]>}
   */
  async renderAllPages(targetWidth = 1920, onProgress = null) {
    const blobs = [];

    for (let i = 1; i <= this.pageCount; i++) {
      const blob = await this.renderPageToBlob(i, targetWidth);
      blobs.push(blob);

      if (onProgress) {
        onProgress(i, this.pageCount);
      }
    }

    return blobs;
  }

  /**
   * Generate thumbnail for a page
   * @param {number} pageNum - Page number (1-indexed)
   * @param {number} maxWidth - Maximum width for thumbnail
   * @returns {Promise<string>} - Data URL of thumbnail
   */
  async generateThumbnail(pageNum, maxWidth = 200) {
    const { canvas } = await this.renderPage(pageNum, maxWidth / 100);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  /**
   * Generate thumbnails for all pages
   * @param {number} maxWidth - Maximum width for thumbnails
   * @param {function} onProgress - Progress callback
   * @returns {Promise<string[]>} - Array of data URLs
   */
  async generateAllThumbnails(maxWidth = 200, onProgress = null) {
    const thumbnails = [];

    for (let i = 1; i <= this.pageCount; i++) {
      const thumbnail = await this.generateThumbnail(i, maxWidth);
      thumbnails.push(thumbnail);

      if (onProgress) {
        onProgress(i, this.pageCount);
      }
    }

    return thumbnails;
  }

  /**
   * Get page dimensions
   * @param {number} pageNum - Page number (1-indexed)
   * @returns {Promise<{width: number, height: number}>}
   */
  async getPageDimensions(pageNum = 1) {
    if (!this.pdf) throw new Error('لم يتم تحميل ملف PDF');

    const page = await this.pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    return {
      width: viewport.width,
      height: viewport.height
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.pdf) {
      this.pdf.destroy();
      this.pdf = null;
      this.pageCount = 0;
    }
  }
}
