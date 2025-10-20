// Advanced PDF tools implementation with iLovePDF-like functionality
class PDFToolManager {
  constructor() {
    this.currentTool = null;
    this.pickedFiles = [];
    this.draggedItem = null;
    this.homeScrollPosition = 0; // Save homepage scroll position
    this.routes = this.setupRoutes();
    this.initializeElements();
    this.setupEventListeners();
    this.initializeRouter();
  }

  setupRoutes() {
    return {
      '/': 'home',
      '/home': 'home',
      '/merge_pdf': 'merge',
      '/split_pdf': 'split',
      '/compress_pdf': 'compress',
      '/pdf_to_images': 'pdf-to-images',
      '/images_to_pdf': 'images-to-pdf',
      '/rotate_pdf': 'rotate',
      '/organize_pdf': 'reorder',
      '/watermark_pdf': 'watermark',
      '/page_numbers': 'pagenum',
      '/protect_pdf': 'protect',
      '/unlock_pdf': 'unlock',
      '/extract_text': 'extract-text'
    };
  }

  initializeRouter() {
    // Handle initial page load
    this.handleRoute();
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      this.handleRoute();
    });
  }

  handleRoute() {
    const path = window.location.pathname;
    const toolKey = this.routes[path];
    
    // If currently on homepage and navigating to tool page, save scroll position
    if (this.currentTool === null && toolKey && toolKey !== 'home') {
      this.homeScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
    }
    
    if (toolKey && toolKey !== 'home') {
      this.setTool(toolKey);
    } else {
      this.goHome();
    }
  }

  navigateTo(path) {
    window.history.pushState({}, '', path);
    this.handleRoute();
  }

  goHome() {
    this.currentTool = null;
    this.clearFiles();
    this.switchView('home');
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    // Restore homepage scroll position
    if (this.homeScrollPosition > 0) {
      setTimeout(() => {
        window.scrollTo(0, this.homeScrollPosition);
      }, 0);
    }
  }

  initializeElements() {
    this.el = (q) => document.querySelector(q);
    this.viewHome = this.el('#home');
    this.viewPanel = this.el('#tool-panel');
    this.toolHeader = this.el('#tool-header');
    this.toolTitle = this.el('#tool-title');
    this.toolDescription = this.el('#tool-description');
    this.toolHeaderIcon = this.el('#toolHeaderIcon');
    this.backHome = this.el('#backHome');
    this.fileInput = this.el('#file-input');
    this.dropzone = this.el('#dropzone');
    this.dropzonePlaceholder = this.el('#dropzone-placeholder');
    this.dropzoneFiles = this.el('#dropzone-files');
    this.fileList = this.el('#file-list');
    this.options = this.el('#options');
    this.runBtn = this.el('#runBtn');
    this.btnText = this.el('#btnText');
    this.btnSpinner = this.el('#btnSpinner');
    this.statusEl = this.el('#status');
    this.browseBtn = this.el('#browseBtn');
    this.addMoreBtn = this.el('#addMoreBtn');
    
    // Preview related elements
    this.previewModal = this.el('#pdf-preview-modal');
    this.previewTitle = this.el('#pdf-preview-title');
    this.previewContent = this.el('#pdf-preview-content');
    this.previewClose = this.el('#pdf-preview-close');
  }

  setupEventListeners() {
    // Tool selection with routing
    document.querySelectorAll('.tool-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const toolKey = btn.dataset.open;
        const path = this.getPathForTool(toolKey);
        this.navigateTo(path);
      });
    });

    // Navigation
    this.backHome.addEventListener('click', (e) => {
      e.preventDefault();
      this.goHome();
    });
    
    // Hero logo click to go home
    const heroLogo = document.querySelector('.hero-logo');
    if (heroLogo) {
      heroLogo.style.cursor = 'pointer';
      heroLogo.addEventListener('click', (e) => {
        e.preventDefault();
        this.goHome();
      });
    }

    // File input
    this.browseBtn.addEventListener('click', () => this.fileInput.click());
    this.addMoreBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleAddFiles(e.target.files));

    // Drag and drop for dropzone
    ['dragenter', 'dragover'].forEach(ev => 
      this.dropzone.addEventListener(ev, e => {
        e.preventDefault();
        this.dropzone.classList.add('drag');
        this.dropzoneFiles.classList.add('drag');
      })
    );

    ['dragleave', 'drop'].forEach(ev => 
      this.dropzone.addEventListener(ev, e => {
        e.preventDefault();
        this.dropzone.classList.remove('drag');
        this.dropzoneFiles.classList.remove('drag');
      })
    );

    this.dropzone.addEventListener('drop', (e) => {
      if (!this.currentTool) return;
      this.handleAddFiles(e.dataTransfer.files);
    });

    // Process button
    this.runBtn.addEventListener('click', () => this.processFiles());
    
    // Preview modal events
    this.previewClose.addEventListener('click', () => this.closePreview());
    this.previewModal.addEventListener('click', (e) => {
      if (e.target === this.previewModal) {
        this.closePreview();
      }
    });
    
    // Close preview with ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.previewModal.classList.contains('show')) {
        this.closePreview();
      }
    });
  }

  getPathForTool(toolKey) {
    const pathMap = {
      'merge': '/merge_pdf',
      'split': '/split_pdf',
      'compress': '/compress_pdf',
      'pdf-to-images': '/pdf_to_images',
      'images-to-pdf': '/images_to_pdf',
      'rotate': '/rotate_pdf',
      'reorder': '/organize_pdf',
      'watermark': '/watermark_pdf',
      'pagenum': '/page_numbers',
      'protect': '/protect_pdf',
      'unlock': '/unlock_pdf',
      'extract-text': '/extract_text'
    };
    return pathMap[toolKey] || '/';
  }

  // Tool definitions with advanced functionality
  getTools() {
    return {
      'merge': {
        title: 'Merge PDF',
        description: 'Combine PDFs in the order you want with the easiest PDF merger available.',
        icon: 'fas fa-object-group',
        accept: 'application/pdf',
        multiple: true,
        setupUI: () => this.setupMergeUI(),
        run: async (files) => this.runMerge(files)
      },
      'split': {
        title: 'Split PDF',
        description: 'Separate one page or a whole set for easy conversion into independent PDF files.',
        icon: 'fas fa-cut',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupSplitUI(),
        run: async (files) => this.runSplit(files)
      },
      'compress': {
        title: 'Compress PDF',
        description: 'Reduce file size while optimizing for maximal PDF quality.',
        icon: 'fas fa-compress-arrows-alt',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupCompressUI(),
        run: async (files) => this.runCompress(files)
      },
      'pdf-to-images': {
        title: 'PDF to JPG',
        description: 'Convert each PDF page into a JPG or extract all images contained in a PDF.',
        icon: 'fas fa-image',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupPdfToImagesUI(),
        run: async (files) => this.runPdfToImages(files)
      },
      'images-to-pdf': {
        title: 'JPG to PDF',
        description: 'Convert JPG images to PDF in seconds. Easily adjust orientation and margins.',
        icon: 'fas fa-images',
        accept: 'image/*',
        multiple: true,
        setupUI: () => this.setupImagesToPdfUI(),
        run: async (files) => this.runImagesToPdf(files)
      },
      'rotate': {
        title: 'Rotate PDF',
        description: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!',
        icon: 'fas fa-sync-alt',
        accept: 'application/pdf',
        multiple: true,
        setupUI: () => this.setupRotateUI(),
        run: async (files) => this.runRotate(files)
      },
      'reorder': {
        title: 'Organize PDF',
        description: 'Sort pages of your PDF files however you like. Delete PDF pages or add PDF pages to your document.',
        icon: 'fas fa-sort',
        accept: 'application/pdf',
        multiple: true,
        setupUI: () => this.setupOrganizeUI(),
        run: async (files) => this.runOrganize(files)
      },
      'watermark': {
        title: 'Watermark',
        description: 'Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.',
        icon: 'fas fa-stamp',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupWatermarkUI(),
        run: async (files) => this.runWatermark(files)
      },
      'pagenum': {
        title: 'Page numbers',
        description: 'Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.',
        icon: 'fas fa-list-ol',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupPageNumbersUI(),
        run: async (files) => this.runPageNumbers(files)
      },
      'protect': {
        title: 'Protect PDF',
        description: 'Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.',
        icon: 'fas fa-lock',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupProtectUI(),
        run: async (files) => this.runProtect(files)
      },
      'unlock': {
        title: 'Unlock PDF',
        description: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.',
        icon: 'fas fa-unlock',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupUnlockUI(),
        run: async (files) => this.runUnlock(files)
      },
      'extract-text': {
        title: 'Extract Text',
        description: 'Extract text content from your PDF documents for easy editing and reuse.',
        icon: 'fas fa-file-alt',
        accept: 'application/pdf',
        multiple: false,
        setupUI: () => this.setupExtractTextUI(),
        run: async (files) => this.runExtractText(files)
      }
    };
  }

  // Core functionality
  switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('visible'));
    this.el(`#${id}`).classList.add('visible');
    
    // Show/hide tool header based on view
    if (id === 'tool-panel') {
      this.toolHeader.style.display = 'block';
      // Reset scroll position for tool pages
      window.scrollTo(0, 0);
    } else {
      this.toolHeader.style.display = 'none';
      // Reset title and scroll position when going home
      document.title = 'iLovePDF - Every PDF tool you need';
      window.scrollTo(0, 0);
    }
  }

  setTool(key) {
    // Clear organize mode state
    if (this.currentTool && this.currentTool.name === 'reorder') {
      this.fileList.classList.remove('organize-mode');
      this.organizePages = [];
    }
    
    const tools = this.getTools();
    this.currentTool = tools[key];
    if (!this.currentTool) return;
    
    // Add tool name
    this.currentTool.name = key;
    
    // Update document title
    document.title = `${this.currentTool.title} - iLovePDF`;
    
    // Update tool header
    this.toolTitle.textContent = this.currentTool.title;
    this.toolDescription.textContent = this.currentTool.description;
    this.toolHeaderIcon.innerHTML = `<i class="${this.currentTool.icon}"></i>`;
    
    this.fileInput.accept = this.currentTool.accept;
    this.fileInput.multiple = !!this.currentTool.multiple;
    
    // Update dropzone text
    const acceptText = this.currentTool.accept === 'application/pdf' ? 'PDF files' : 
                      this.currentTool.accept === 'image/*' ? 'image files' : 'files';
    const placeholder = this.dropzonePlaceholder.querySelector('.dropzone-content');
    placeholder.querySelector('h3').textContent = `Select ${acceptText}`;
    placeholder.querySelector('p').textContent = `or drop ${acceptText} here`;
    this.browseBtn.textContent = `Select ${acceptText}`;
    
    // Update add more button text
    this.addMoreBtn.innerHTML = `<i class="fas fa-plus"></i> Add more ${acceptText}`;
    
    // Update button text
    this.btnText.textContent = `Process ${this.currentTool.title}`;
    
    this.clearFiles();
    this.clearStatus(); // Clear previous status display
    if (this.currentTool.setupUI) {
      this.currentTool.setupUI();
    }
    this.switchView('tool-panel');
  }

  clearFiles() {
    this.pickedFiles = [];
    this.fileList.innerHTML = '';
    this.options.innerHTML = '';
    this.showUploadPlaceholder();
  }

  showUploadPlaceholder() {
    this.dropzonePlaceholder.style.display = 'block';
    this.dropzoneFiles.style.display = 'none';
  }

  showFilesView() {
    this.dropzonePlaceholder.style.display = 'none';
    this.dropzoneFiles.style.display = 'block';
  }

  handleAddFiles(list) {
    const files = Array.from(list);
    const acceptPattern = this.currentTool?.accept?.replace('*', '.*');
    
    // Clear previous status when adding new files
    this.clearStatus();
    
    // Show files view if we have files
    if (files.length > 0) {
      this.showFilesView();
    }
    
    for (const f of files) {
      if (this.currentTool && acceptPattern && !f.type.match(acceptPattern)) {
        this.showStatus(`File "${f.name}" is not accepted for this tool`, 'error');
        continue;
      }
      
      if (!this.currentTool.multiple && this.pickedFiles.length > 0) {
        this.pickedFiles = [f];
        this.fileList.innerHTML = '';
        this.addFileItem(f, 0);
        break;
      } else {
        this.pickedFiles.push(f);
        this.addFileItem(f, this.pickedFiles.length - 1);
      }
    }
    
    // Clear the file input so the same file can be selected again
    this.fileInput.value = '';
  }

  async addFileItem(file, index) {
    // If organize tool and file is PDF, expand to pages
    if (this.currentTool && this.currentTool.name === 'reorder' && file.type === 'application/pdf') {
      await this.addPdfAsPages(file, index);
      return;
    }

    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.index = index;
    
    // Make draggable for sortable tools
    if (this.fileList.classList.contains('sortable')) {
      item.draggable = true;
    }
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.onclick = () => this.removeFile(index);
    
    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    
    // File name and info
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;
    
    const info = document.createElement('div');
    info.className = 'file-info';
    info.textContent = this.formatFileSize(file.size);
    
    // Add preview click event
    item.addEventListener('click', (e) => {
      // If delete button is clicked, don't trigger preview
      if (e.target === removeBtn || removeBtn.contains(e.target)) {
        return;
      }
      this.previewFile(file);
    });
    
    item.appendChild(removeBtn);
    item.appendChild(thumb);
    item.appendChild(name);
    item.appendChild(info);
    
    this.fileList.appendChild(item);
    await this.renderFileThumb(file, thumb);
    
    // Update file count display
    this.updateFileCount();
  }

  async renderFileThumb(file, container) {
    if (file.type === 'application/pdf' && window['pdfjsLib']) {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const scale = 0.3;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        container.appendChild(canvas);
        
        // Add page count indicator
        const indicator = document.createElement('div');
        indicator.className = 'page-indicator';
        indicator.textContent = `${pdf.numPages} pages`;
        container.appendChild(indicator);
      } catch (e) {
        container.innerHTML = '<i class="fas fa-file-pdf" style="font-size:24px;color:#e53e3e;"></i>';
      }
    } else if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      container.appendChild(img);
    } else {
      container.innerHTML = '<i class="fas fa-file" style="font-size:24px;color:#6b7280;"></i>';
    }
  }

  removeFile(index) {
    this.pickedFiles.splice(index, 1);
    this.refreshFileList();
    
    // If no files left, show placeholder again
    if (this.pickedFiles.length === 0) {
      this.showUploadPlaceholder();
    }
  }

  refreshFileList() {
    this.fileList.innerHTML = '';
    this.pickedFiles.forEach((file, index) => {
      this.addFileItem(file, index);
    });
  }

  updateFileCount() {
    const countElements = document.querySelectorAll('.file-count');
    const count = this.pickedFiles.length;
    const fileType = this.currentTool?.accept === 'application/pdf' ? 'files' : 
                     this.currentTool?.accept === 'image/*' ? 'images' : 'files';
    countElements.forEach(el => {
      el.textContent = `${count} ${fileType}`;
    });
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  showStatus(message, type = 'success') {
    this.statusEl.textContent = message;
    this.statusEl.className = `status-message ${type}`;
  }

  clearStatus() {
    this.statusEl.textContent = '';
    this.statusEl.className = 'status-message';
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async processFiles() {
    if (!this.currentTool || this.pickedFiles.length === 0) {
      this.showStatus('Please select files first', 'error');
      return;
    }
    
    this.btnText.style.display = 'none';
    this.btnSpinner.style.display = 'inline-block';
    this.runBtn.disabled = true;
    this.showStatus('Processing...', 'processing');
    
    try {
      const result = await this.currentTool.run(this.pickedFiles);
      if (result.success) {
        this.showStatus('Processing complete!', 'success');
        // Auto clear success status after 3 seconds
        setTimeout(() => {
          this.clearStatus();
        }, 3000);
      } else {
        throw new Error(result.error || 'Processing failed');
      }
    } catch (e) {
      console.error(e);
      this.showStatus(e.message || 'Processing failed', 'error');
    } finally {
      this.btnText.style.display = 'inline';
      this.btnSpinner.style.display = 'none';
      this.runBtn.disabled = false;
    }
  }

  // Tool-specific UI setup methods
  setupMergeUI() {
    this.fileList.classList.add('sortable');
    this.enableFileDragSort();
    
    this.options.innerHTML = `
      <div class="merge-options">
        <h3><i class="fas fa-cogs"></i> Merge Options</h3>
        <div class="option-group">
          <div class="merge-list-header">
            <span>Files to merge (drag to reorder):</span>
            <span class="file-count">0 files</span>
          </div>
        </div>
      </div>
    `;
  }

  setupSplitUI() {
    this.options.innerHTML = `
      <div class="split-options">
        <h3><i class="fas fa-cut"></i> Split Options</h3>
        <div class="option-group">
          <label class="radio-option">
            <input type="radio" name="splitMode" value="ranges" checked>
            <div class="radio-content">
              <strong>Split by ranges</strong>
              <input type="text" id="optRanges" placeholder="e.g., 1-3,5,7-" />
              <small>Enter page ranges or leave empty to extract all pages</small>
            </div>
          </label>
          <label class="radio-option">
            <input type="radio" name="splitMode" value="extract">
            <div class="radio-content">
              <strong>Extract pages</strong>
              <input type="text" id="optPages" placeholder="e.g., 1,3,5" disabled />
              <small>Extract specific pages as separate files</small>
            </div>
          </label>
        </div>
      </div>
    `;
    
    // Setup radio selection styling
    this.setupRadioSelection('splitMode');
    
    // Enable/disable inputs based on radio selection
    const radios = this.options.querySelectorAll('input[name="splitMode"]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        document.getElementById('optRanges').disabled = radio.value !== 'ranges';
        document.getElementById('optPages').disabled = radio.value !== 'extract';
      });
    });
  }

  setupOrganizeUI() {
    this.options.innerHTML = `
      <div class="organize-options">
        <h3><i class="fas fa-sort"></i> Organize Pages</h3>
        <div class="option-group">
          <div class="organize-instructions">
            <p><i class="fas fa-info-circle"></i> Upload one or more PDF files to see individual pages. Drag pages to reorder them and combine content from multiple files.</p>
          </div>
        </div>
      </div>
    `;
    
    // Set file list for organize mode
    this.setupOrganizeMode();
  }

  setupRotateUI() {
    this.options.innerHTML = `
      <div class="rotate-options">
        <h3><i class="fas fa-sync-alt"></i> Rotation Options</h3>
        <div class="option-group">
          <label class="select-label">
            Rotation angle
            <select id="optDeg" class="select-input">
              <option value="90">90° clockwise</option>
              <option value="180">180°</option>
              <option value="270">270° clockwise (90° counter-clockwise)</option>
            </select>
          </label>
          <div class="rotation-preview">
            <div class="preview-box" data-rotation="0">
              <i class="fas fa-file-pdf"></i>
              <span>Original</span>
            </div>
            <i class="fas fa-arrow-right"></i>
            <div class="preview-box" data-rotation="90" id="rotationPreview">
              <i class="fas fa-file-pdf"></i>
              <span>90° rotated</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const select = document.getElementById('optDeg');
    const preview = document.getElementById('rotationPreview');
    select.addEventListener('change', () => {
      const deg = select.value;
      preview.dataset.rotation = deg;
      preview.querySelector('span').textContent = `${deg}° rotated`;
    });
  }

  setupWatermarkUI() {
    this.options.innerHTML = `
      <div class="watermark-options">
        <h3><i class="fas fa-stamp"></i> Watermark Settings</h3>
        <div class="option-group">
          <label class="input-label">
            Watermark text
            <input type="text" id="optWM" class="text-input" placeholder="Enter watermark text" />
          </label>
          <div class="option-row">
            <label class="select-label">
              Position
              <select id="optPosition" class="select-input">
                <option value="center">Center</option>
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </label>
            <label class="select-label">
              Transparency
              <select id="optOpacity" class="select-input">
                <option value="0.1">Very light (10%)</option>
                <option value="0.2" selected>Light (20%)</option>
                <option value="0.5">Medium (50%)</option>
                <option value="0.8">Strong (80%)</option>
              </select>
            </label>
          </div>
          <div class="watermark-preview">
            <div class="preview-document">
              <div class="watermark-overlay" id="watermarkPreview">SAMPLE</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Live preview
    const textInput = document.getElementById('optWM');
    const positionSelect = document.getElementById('optPosition');
    const opacitySelect = document.getElementById('optOpacity');
    const preview = document.getElementById('watermarkPreview');
    
    const updatePreview = () => {
      preview.textContent = textInput.value || 'SAMPLE';
      preview.style.opacity = opacitySelect.value;
      preview.className = `watermark-overlay ${positionSelect.value}`;
    };
    
    textInput.addEventListener('input', updatePreview);
    positionSelect.addEventListener('change', updatePreview);
    opacitySelect.addEventListener('change', updatePreview);
  }

  setupPageNumbersUI() {
    this.options.innerHTML = `
      <div class="pagenum-options">
        <h3><i class="fas fa-list-ol"></i> Page Number Settings</h3>
        <div class="option-group">
          <div class="option-row">
            <label class="select-label">
              Position
              <select id="optPos" class="select-input">
                <option value="bottom-right" selected>Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
                <option value="top-left">Top Left</option>
                <option value="bottom-center">Bottom Center</option>
                <option value="top-center">Top Center</option>
              </select>
            </label>
            <label class="select-label">
              Font size
              <select id="optFontSize" class="select-input">
                <option value="10">Small (10pt)</option>
                <option value="12" selected>Medium (12pt)</option>
                <option value="14">Large (14pt)</option>
                <option value="16">Extra Large (16pt)</option>
              </select>
            </label>
          </div>
          <div class="pagenum-preview">
            <div class="preview-page">
              <div class="page-number" id="pagenumPreview">1</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const posSelect = document.getElementById('optPos');
    const sizeSelect = document.getElementById('optFontSize');
    const preview = document.getElementById('pagenumPreview');
    
    const updatePreview = () => {
      preview.className = `page-number ${posSelect.value}`;
      preview.style.fontSize = `${sizeSelect.value}pt`;
    };
    
    posSelect.addEventListener('change', updatePreview);
    sizeSelect.addEventListener('change', updatePreview);
  }

  setupProtectUI() {
    this.options.innerHTML = `
      <div class="protect-options">
        <h3><i class="fas fa-lock"></i> Password Protection</h3>
        <div class="option-group">
          <label class="input-label">
            Password
            <input type="password" id="optPwd" class="text-input" placeholder="Enter password to protect PDF" />
          </label>
          <label class="input-label">
            Confirm password
            <input type="password" id="optPwdConfirm" class="text-input" placeholder="Confirm password" />
          </label>
          <div class="password-strength" id="strengthMeter">
            <div class="strength-bar"></div>
            <span class="strength-text">Enter a password</span>
          </div>
          <div class="protection-info">
            <i class="fas fa-info-circle"></i>
            <span>Your PDF will be encrypted and require this password to open</span>
          </div>
        </div>
      </div>
    `;
    
    // Password strength indicator
    const pwd = document.getElementById('optPwd');
    const confirm = document.getElementById('optPwdConfirm');
    const meter = document.getElementById('strengthMeter');
    
    pwd.addEventListener('input', () => {
      const strength = this.calculatePasswordStrength(pwd.value);
      meter.className = `password-strength ${strength.level}`;
      meter.querySelector('.strength-text').textContent = strength.text;
    });
    
    confirm.addEventListener('input', () => {
      if (confirm.value && pwd.value !== confirm.value) {
        confirm.setCustomValidity('Passwords do not match');
      } else {
        confirm.setCustomValidity('');
      }
    });
  }

  setupUnlockUI() {
    this.options.innerHTML = `
      <div class="unlock-options">
        <h3><i class="fas fa-unlock"></i> Remove Password</h3>
        <div class="option-group">
          <label class="input-label">
            Current password
            <input type="password" id="optPwd2" class="text-input" placeholder="Enter current password to unlock PDF" />
          </label>
          <div class="unlock-info">
            <i class="fas fa-info-circle"></i>
            <span>The password will be removed and the PDF will be freely accessible</span>
          </div>
        </div>
      </div>
    `;
  }

  setupCompressUI() {
    this.options.innerHTML = `
      <div class="compress-options">
        <h3><i class="fas fa-compress-arrows-alt"></i> Compression Settings</h3>
        <div class="option-group">
          <div class="compression-levels">
            <label class="radio-option">
              <input type="radio" name="compression" value="low">
              <div class="radio-content">
                <strong>Low compression</strong>
                <small>Best quality, larger file size</small>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="compression" value="medium" checked>
              <div class="radio-content">
                <strong>Recommended compression</strong>
                <small>Good balance of quality and size</small>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="compression" value="high">
              <div class="radio-content">
                <strong>Extreme compression</strong>
                <small>Smallest file size, reduced quality</small>
              </div>
            </label>
          </div>
        </div>
      </div>
    `;
    
    // Setup radio selection styling
    this.setupRadioSelection('compression');
  }

  setupPdfToImagesUI() {
    this.options.innerHTML = `
      <div class="convert-options">
        <h3><i class="fas fa-image"></i> Conversion Settings</h3>
        <div class="option-group">
          <label class="select-label">
            Image format
            <select id="optFormat" class="select-input">
              <option value="jpg" selected>JPG</option>
              <option value="png">PNG</option>
            </select>
          </label>
          <label class="select-label">
            Quality
            <select id="optQuality" class="select-input">
              <option value="low">Low (fast, smaller files)</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High (slow, larger files)</option>
            </select>
          </label>
        </div>
      </div>
    `;
  }

  setupImagesToPdfUI() {
    this.fileList.classList.add('sortable');
    this.enableFileDragSort();
    
    this.options.innerHTML = `
      <div class="convert-options">
        <h3><i class="fas fa-images"></i> PDF Creation Settings</h3>
        <div class="option-group">
          <div class="images-list-header">
            <span>Images to convert (drag to reorder):</span>
            <span class="file-count">0 images</span>
          </div>
          <label class="select-label">
            Page size
            <select id="optPageSize" class="select-input">
              <option value="auto" selected>Auto (fit to image)</option>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </label>
        </div>
      </div>
    `;
  }

  setupExtractTextUI() {
    this.options.innerHTML = `
      <div class="extract-options">
        <h3><i class="fas fa-file-alt"></i> Text Extraction Settings</h3>
        <div class="option-group">
          <div class="extract-info">
            <i class="fas fa-info-circle"></i>
            <span>Text will be extracted and saved as a .txt file</span>
          </div>
        </div>
      </div>
    `;
  }

  // Drag and sort functionality for file lists
  enableFileDragSort() {
    let draggedIndex = null;
    
    this.fileList.addEventListener('dragstart', (e) => {
      if (!e.target.closest('.file-item')) return;
      draggedIndex = parseInt(e.target.closest('.file-item').dataset.index);
      e.target.closest('.file-item').classList.add('dragging');
    });
    
    this.fileList.addEventListener('dragend', (e) => {
      if (!e.target.closest('.file-item')) return;
      e.target.closest('.file-item').classList.remove('dragging');
      draggedIndex = null;
    });
    
    this.fileList.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(e.clientY);
      const dragging = this.fileList.querySelector('.dragging');
      if (afterElement == null) {
        this.fileList.appendChild(dragging);
      } else {
        this.fileList.insertBefore(dragging, afterElement);
      }
    });
    
    this.fileList.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedIndex === null) return;
      
      // Reorder the files array
      const newOrder = Array.from(this.fileList.children).map(item => 
        parseInt(item.dataset.index)
      );
      
      const newFiles = newOrder.map(index => this.pickedFiles[index]);
      this.pickedFiles = newFiles;
      this.refreshFileList();
    });
  }

  getDragAfterElement(y) {
    const draggableElements = [...this.fileList.querySelectorAll('.file-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  calculatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
    if (score < 3) return { level: 'weak', text: 'Weak password' };
    if (score < 5) return { level: 'medium', text: 'Medium strength' };
    return { level: 'strong', text: 'Strong password' };
  }

  // Tool execution methods
  async runMerge(files) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch('/api/pdf/merge', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Merge failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'merged.pdf');
    return { success: true };
  }

  async runSplit(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    
    const splitMode = document.querySelector('input[name="splitMode"]:checked').value;
    if (splitMode === 'ranges') {
      const ranges = document.getElementById('optRanges')?.value;
      if (ranges) fd.append('ranges', ranges);
    } else {
      const pages = document.getElementById('optPages')?.value;
      if (pages) fd.append('ranges', pages);
    }
    
    const res = await fetch('/api/pdf/split', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Split failed');
    }
    
    const blob = await res.blob();
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'split_pages.zip';
    this.downloadBlob(blob, filename);
    return { success: true };
  }

  async runCompress(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    const level = document.querySelector('input[name="compression"]:checked').value;
    fd.append('level', level);
    
    const res = await fetch('/api/pdf/compress', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Compression failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'compressed.pdf');
    return { success: true };
  }

  async runRotate(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    fd.append('angle', document.getElementById('optDeg').value || '90');
    
    const res = await fetch('/api/pdf/rotate', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Rotation failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'rotated.pdf');
    return { success: true };
  }

  async runWatermark(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    
    const text = document.getElementById('optWM')?.value;
    if (!text) throw new Error('Please enter watermark text');
    
    fd.append('watermark_text', text);
    fd.append('opacity', document.getElementById('optOpacity').value || '0.2');
    
    const res = await fetch('/api/pdf/watermark', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Watermark failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'watermarked.pdf');
    return { success: true };
  }

  async runPageNumbers(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    fd.append('position', document.getElementById('optPos').value);
    
    const res = await fetch('/api/pdf/pagenum', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Page numbering failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'numbered.pdf');
    return { success: true };
  }

  async runProtect(files) {
    const pwd = document.getElementById('optPwd')?.value;
    const confirm = document.getElementById('optPwdConfirm')?.value;
    
    if (!pwd) throw new Error('Please enter a password');
    if (pwd !== confirm) throw new Error('Passwords do not match');
    
    const fd = new FormData();
    fd.append('file', files[0]);
    fd.append('password', pwd);
    
    const res = await fetch('/api/pdf/protect', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Protection failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'protected.pdf');
    return { success: true };
  }

  async runUnlock(files) {
    const pwd = document.getElementById('optPwd2')?.value;
    if (!pwd) throw new Error('Please enter the current password');
    
    const fd = new FormData();
    fd.append('file', files[0]);
    fd.append('password', pwd);
    
    const res = await fetch('/api/pdf/unlock', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Unlock failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'unlocked.pdf');
    return { success: true };
  }

  async runPdfToImages(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    
    // Add format and quality parameters
    const format = document.getElementById('optFormat')?.value || 'png';
    const quality = document.getElementById('optQuality')?.value || 'medium';
    fd.append('format', format);
    fd.append('quality', quality);
    
    const res = await fetch('/api/pdf/pdf-to-images', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Conversion failed');
    }
    
    const blob = await res.blob();
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'images.zip';
    this.downloadBlob(blob, filename);
    return { success: true };
  }

  async runImagesToPdf(files) {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    
    // Add page size parameter
    const pageSize = document.getElementById('optPageSize')?.value || 'auto';
    fd.append('page_size', pageSize);
    
    const res = await fetch('/api/pdf/images-to-pdf', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Conversion failed');
    }
    
    const blob = await res.blob();
    this.downloadBlob(blob, 'converted.pdf');
    return { success: true };
  }

  async runOrganize(files) {
    // Check if there are pages
    if (!this.organizePages || this.organizePages.length === 0) {
      throw new Error('Please upload PDF files first');
    }
    
    // Get current page order (by DOM order)
    const pageItems = [...this.fileList.querySelectorAll('.page-item')];
    
    // Only include selected pages, maintaining DOM order
    const selectedPageItems = pageItems.filter(item => item.querySelector('.page-checkbox').checked);
    
    if (selectedPageItems.length === 0) {
      throw new Error('Please select at least one page to include');
    }
    
    // Optimization: group consecutive pages from same file to reduce API calls
    const batches = [];
    let currentBatch = null;
    
    selectedPageItems.forEach(item => {
      const fileIndex = parseInt(item.dataset.fileIndex);
      const pageNum = parseInt(item.dataset.pageNum);
      const originalFile = this.organizePages.find(p => p.element.dataset.fileIndex == fileIndex).file;
      
      if (!currentBatch || currentBatch.fileIndex !== fileIndex) {
        // Start new batch
        currentBatch = {
          fileIndex: fileIndex,
          file: originalFile,
          pages: [pageNum]
        };
        batches.push(currentBatch);
      } else {
        // Add to current batch
        currentBatch.pages.push(pageNum);
      }
    });
    
    // Process each batch
    const extractedPdfs = [];
    
    for (const batch of batches) {
      const fd = new FormData();
      fd.append('file', batch.file);
      fd.append('order', batch.pages.join(','));
      
      const res = await fetch('/api/pdf/reorder', { method: 'POST', body: fd });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to extract pages');
      }
      
      const pdfBlob = await res.blob();
      extractedPdfs.push(pdfBlob);
    }
    
    // If only one batch, download directly
    if (extractedPdfs.length === 1) {
      this.downloadBlob(extractedPdfs[0], 'organized.pdf');
      return { success: true };
    }
    
    // Merge all PDFs (in batch order, i.e., DOM page order)
    const mergeFormData = new FormData();
    extractedPdfs.forEach((pdfBlob, index) => {
      mergeFormData.append('files', pdfBlob, `batch_${index}.pdf`);
    });
    
    const mergeRes = await fetch('/api/pdf/merge', { method: 'POST', body: mergeFormData });
    
    if (!mergeRes.ok) {
      const errorText = await mergeRes.text();
      throw new Error(errorText || 'Merge failed');
    }
    
    const finalBlob = await mergeRes.blob();
    this.downloadBlob(finalBlob, 'organized.pdf');
    return { success: true };
  }

  async runExtractText(files) {
    const fd = new FormData();
    fd.append('file', files[0]);
    
    const res = await fetch('/api/pdf/extract-text', { method: 'POST', body: fd });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Text extraction failed');
    }
    
    const json = await res.json();
    const blob = new Blob([json.text || ''], { type: 'text/plain' });
    this.downloadBlob(blob, 'extracted.txt');
    return { success: true };
  }

  // PDF preview functionality
  // Generic file preview method
  async previewFile(file) {
    if (file.type === 'application/pdf') {
      // Use PDF preview for PDF files
      await this.previewPDF(file);
    } else if (file.type.startsWith('image/')) {
      // Use image preview for image files
      await this.previewImage(file);
    } else {
      // Show unsupported preview info for other file types
      this.previewTitle.textContent = file.name;
      this.previewContent.innerHTML = `
        <div class="preview-unsupported">
          <i class="fas fa-file"></i>
          <h3>Preview not supported</h3>
          <p>This file type cannot be previewed.</p>
          <p>File type: ${file.type || 'Unknown'}</p>
          <p>Size: ${this.formatFileSize(file.size)}</p>
        </div>
      `;
      this.previewModal.classList.add('show');
    }
  }

  async previewPDF(file) {
    this.previewTitle.textContent = file.name;
    this.previewContent.innerHTML = '<div class="preview-loading"><i class="fas fa-spinner"></i><span>Loading...</span></div>';
    this.previewModal.classList.add('show');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      this.previewContent.innerHTML = '';
      
      // Render all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        
        // Page number label - changed to 1/8 format
        const pageLabel = document.createElement('div');
        pageLabel.className = 'pdf-page-label';
        pageLabel.textContent = `${pageNum}/${pdf.numPages}`;
        pageContainer.appendChild(pageLabel);
        
        // Create canvas container
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page';
        
        // Show loading placeholder first
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-page-placeholder';
        placeholder.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Loading...</span>';
        pageDiv.appendChild(placeholder);
        
        pageContainer.appendChild(pageDiv);
        this.previewContent.appendChild(pageContainer);
        
        // Render pages asynchronously to avoid blocking
        setTimeout(async () => {
          try {
            const page = await pdf.getPage(pageNum);
            const scale = 1.2; // Restore higher clarity
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Replace placeholder
            pageDiv.innerHTML = '';
            pageDiv.appendChild(canvas);
            
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;
            
          } catch (pageError) {
            console.error(`Failed to render page ${pageNum}:`, pageError);
            pageDiv.innerHTML = '<div class="pdf-page-error">Failed to load page</div>';
          }
        }, (pageNum - 1) * 50); // Shorten interval time
      }
      
    } catch (error) {
      console.error('PDF preview failed:', error);
      this.previewContent.innerHTML = '<div class="pdf-preview-error">Preview failed, please check file format</div>';
    }
  }

  async previewImage(file) {
    this.previewTitle.textContent = file.name;
    this.previewContent.innerHTML = '<div class="preview-loading"><i class="fas fa-spinner"></i><span>Loading...</span></div>';
    this.previewModal.classList.add('show');

    try {
      // Create image element
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        this.previewContent.innerHTML = '';
        
        // Create image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-preview-container';
        
        // Add image information
        const imageInfo = document.createElement('div');
        imageInfo.className = 'image-preview-info';
        imageInfo.innerHTML = `
          <div class="image-info-item"><strong>File:</strong> ${file.name}</div>
          <div class="image-info-item"><strong>Size:</strong> ${this.formatFileSize(file.size)}</div>
          <div class="image-info-item"><strong>Dimensions:</strong> ${img.naturalWidth} × ${img.naturalHeight}px</div>
          <div class="image-info-item"><strong>Type:</strong> ${file.type}</div>
        `;
        
        // Create image display area
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'image-preview-wrapper';
        
        img.className = 'preview-image';
        img.alt = file.name;
        
        imageWrapper.appendChild(img);
        imageContainer.appendChild(imageInfo);
        imageContainer.appendChild(imageWrapper);
        this.previewContent.appendChild(imageContainer);
        
        // Clean up URL object
        URL.revokeObjectURL(url);
      };
      
      img.onerror = () => {
        this.previewContent.innerHTML = `
          <div class="preview-error">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Image preview failed</h3>
            <p>Unable to load the image file.</p>
          </div>
        `;
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
      
    } catch (error) {
      console.error('Image preview failed:', error);
      this.previewContent.innerHTML = `
        <div class="preview-error">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Preview failed</h3>
          <p>An error occurred while loading the image.</p>
        </div>
      `;
    }
  }

  closePreview() {
    this.previewModal.classList.remove('show');
  }

  // Organize page functionality
  setupOrganizeMode() {
    // Set file list to page mode
    this.fileList.classList.add('organize-mode');
    this.organizePages = [];
  }

  async addPdfAsPages(file, fileIndex) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // Create an item for each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await this.addPdfPageItem(pdf, file, fileIndex, pageNum);
      }
      
      // Set page sorting
      this.setupPageDragSort();
      
    } catch (error) {
      console.error('Failed to load PDF pages:', error);
      // If failed, add regular file item
      this.addRegularFileItem(file, fileIndex);
    }
  }

  async addPdfPageItem(pdf, originalFile, fileIndex, pageNum) {
    try {
      const page = await pdf.getPage(pageNum);
      const scale = 0.25;
      const viewport = page.getViewport({ scale });
      
      const item = document.createElement('div');
      item.className = 'file-item page-item';
      item.dataset.fileIndex = fileIndex;
      item.dataset.pageNum = pageNum;
      item.draggable = true;
      
      // Page checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'page-checkbox';
      checkbox.checked = true;
      
      // Thumbnail container
      const thumb = document.createElement('div');
      thumb.className = 'file-thumb page-thumb';
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      thumb.appendChild(canvas);
      
      // Page information
      const name = document.createElement('div');
      name.className = 'file-name page-name';
      name.textContent = `${originalFile.name} - Page ${pageNum}`;
      
      const info = document.createElement('div');
      info.className = 'file-info';
      info.innerHTML = `
        <span>Page ${pageNum}/${pdf.numPages}</span>
        <span class="page-size">${Math.round(viewport.width)}×${Math.round(viewport.height)}</span>
      `;
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.removePage(item);
      };
      
      // Preview click event
      item.addEventListener('click', (e) => {
        if (e.target === removeBtn || removeBtn.contains(e.target) || e.target === checkbox) {
          return;
        }
        this.previewPdfPage(pdf, pageNum, `${originalFile.name} - Page ${pageNum}`);
      });
      
      // Drag events
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', '');
        item.classList.add('dragging');
      });
      
      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
      });
      
      item.appendChild(checkbox);
      item.appendChild(removeBtn);
      item.appendChild(thumb);
      item.appendChild(name);
      item.appendChild(info);
      
      this.fileList.appendChild(item);
      
      // Render page
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      // Store page information
      this.organizePages.push({
        element: item,
        file: originalFile,
        pageNum: pageNum,
        selected: true
      });
      
    } catch (error) {
      console.error(`Failed to render page ${pageNum}:`, error);
    }
  }

  addRegularFileItem(file, index) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.index = index;
    
    // Make draggable for sortable tools
    if (this.fileList.classList.contains('sortable')) {
      item.draggable = true;
    }
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.onclick = () => this.removeFile(index);
    
    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    
    // File name and info
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;
    
    const info = document.createElement('div');
    info.className = 'file-info';
    info.textContent = this.formatFileSize(file.size);
    
    // Add preview click event
    item.addEventListener('click', (e) => {
      // Don't trigger preview if delete button is clicked
      if (e.target === removeBtn || removeBtn.contains(e.target)) {
        return;
      }
      this.previewFile(file);
    });
    
    item.appendChild(removeBtn);
    item.appendChild(thumb);
    item.appendChild(name);
    item.appendChild(info);
    
    this.fileList.appendChild(item);
    this.renderFileThumb(file, thumb);
  }

  setupPageDragSort() {
    let draggedElement = null;
    
    this.fileList.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('page-item')) {
        draggedElement = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }
    });
    
    this.fileList.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('page-item')) {
        e.target.classList.remove('dragging');
        draggedElement = null;
      }
    });
    
    this.fileList.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedElement) {
        const afterElement = this.getDragAfterElement(this.fileList, e.clientY);
        if (afterElement == null) {
          this.fileList.appendChild(draggedElement);
        } else {
          this.fileList.insertBefore(draggedElement, afterElement);
        }
      }
    });
  }

  removePage(pageItem) {
    const pageNum = pageItem.dataset.pageNum;
    const fileIndex = pageItem.dataset.fileIndex;
    
    // Remove from page array
    this.organizePages = this.organizePages.filter(p => p.element !== pageItem);
    
    // Remove from DOM
    pageItem.remove();
    
    // Update file count
    this.updateFileCount();
  }

  setupOrganizeDropZone() {
    const dropZone = document.getElementById('organizeDropZone');
    const pagePreview = document.getElementById('pagePreview');
    
    // Set up drag event listeners
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      
      // Check if it's a PDF dragged from the file list
      const draggedFileIndex = e.dataTransfer.getData('text/plain');
      if (draggedFileIndex !== '') {
        const fileIndex = parseInt(draggedFileIndex);
        const file = this.currentFiles[fileIndex];
        if (file && file.type === 'application/pdf') {
          this.loadPdfForOrganize(file);
        }
      }
    });
  }

  async loadPdfForOrganize(file) {
    const pagePreview = document.getElementById('pagePreview');
    
    // Save source file reference
    this.organizeSourceFile = file;
    
    pagePreview.innerHTML = '<div class="preview-loading"><i class="fas fa-spinner"></i><span>Loading PDF pages...</span></div>';
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // Create page grid container
      pagePreview.innerHTML = `
        <div class="organize-pages-grid" id="pagesGrid">
          <div class="organize-header">
            <h4><i class="fas fa-file-pdf"></i> ${file.name}</h4>
            <span class="page-count">${pdf.numPages} pages</span>
          </div>
          <div class="pages-container" id="pagesContainer"></div>
        </div>
      `;
      
      const pagesContainer = document.getElementById('pagesContainer');
      this.organizePages = []; // Store page information
      
      // Render all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await this.renderOrganizePage(pdf, pageNum, pagesContainer);
      }
      
      // Show control bottons
      controls.style.display = 'flex';
      
      // Set up page sorting
      this.setupPageSorting();
      
    } catch (error) {
      console.error('Failed to load PDF for organizing:', error);
      pagePreview.innerHTML = `
        <div class="organize-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load PDF pages</p>
        </div>
      `;
    }
  }

  async renderOrganizePage(pdf, pageNum, container) {
    try {
      const page = await pdf.getPage(pageNum);
      const scale = 0.2; // Small thumbnail
      const viewport = page.getViewport({ scale });
      
      const pageItem = document.createElement('div');
      pageItem.className = 'organize-page-item';
      pageItem.dataset.pageNum = pageNum;
      pageItem.draggable = true;
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const pageLabel = document.createElement('div');
      pageLabel.className = 'organize-page-label';
      pageLabel.textContent = pageNum;
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'organize-page-checkbox';
      checkbox.checked = true;
      
      pageItem.appendChild(checkbox);
      pageItem.appendChild(canvas);
      pageItem.appendChild(pageLabel);
      
      // Click to preview
      pageItem.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          this.previewPdfPage(pdf, pageNum, `Page ${pageNum}`);
        }
      });
      
      container.appendChild(pageItem);
      
      // Render page thumbnail
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      // Store page info
      this.organizePages.push({
        pageNum: pageNum,
        element: pageItem,
        selected: true
      });
      
    } catch (error) {
      console.error(`Failed to render page ${pageNum}:`, error);
    }
  }

  setupPageSorting() {
    const container = document.getElementById('pagesContainer');
    let draggedElement = null;
    
    container.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('organize-page-item')) {
        draggedElement = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }
    });
    
    container.addEventListener('dragend', (e) => {
      if (e.target.classList.contains('organize-page-item')) {
        e.target.classList.remove('dragging');
        draggedElement = null;
      }
    });
    
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = this.getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(draggedElement);
      } else {
        container.insertBefore(draggedElement, afterElement);
      }
    });
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.organize-page-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }



  async previewPdfPage(pdf, pageNum, title) {
    this.previewTitle.textContent = title;
    this.previewContent.innerHTML = '<div class="preview-loading"><i class="fas fa-spinner"></i><span>Loading...</span></div>';
    this.previewModal.classList.add('show');

    try {
      const page = await pdf.getPage(pageNum);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      
      this.previewContent.innerHTML = '';
      this.previewContent.appendChild(canvas);
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
    } catch (error) {
      console.error('Page preview failed:', error);
      this.previewContent.innerHTML = '<div class="preview-error">Page preview failed</div>';
    }
  }

  // General radio button selection handling
  setupRadioSelection(radioName) {
    const radios = this.options.querySelectorAll(`input[name="${radioName}"]`);
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Update selected class
        this.options.querySelectorAll(`input[name="${radioName}"]`).forEach(r => {
          r.closest('.radio-option').classList.remove('selected');
        });
        radio.closest('.radio-option').classList.add('selected');
      });
      
      // Set initial state
      if (radio.checked) {
        radio.closest('.radio-option').classList.add('selected');
      }
    });
  }
}

// Initialize the application
const pdfManager = new PDFToolManager();
