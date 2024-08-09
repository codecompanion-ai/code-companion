class Browser {
  constructor() {
    this.currentUrl = '';
    this.webview = document.querySelector('webview');
    this.urlInput = document.getElementById('urlInput');
    this.initEventListeners();
  }

  initEventListeners() {
    this.urlInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.loadUrl(this.urlInput.value);
      }
    });

    this.webview.addEventListener('did-fail-load', (event) => {
      this.handleLoadError(event);
    });

    this.webview.addEventListener('did-start-loading', () => {
      document.getElementById('browserIcon').innerHTML =
        '<span class="spinner-border spinner-border-sm text-secondary me-2" role="status" aria-hidden="true"></span>';
    });

    this.webview.addEventListener('did-stop-loading', () => {
      document.getElementById('browserIcon').innerHTML = '<i class="bi bi-globe me-2"></i>';
    });

    this.webview.addEventListener('did-frame-navigate', (event) => {
      if (event.isMainFrame) {
        this.updateUrlInput(event.url);
        this.handleHttpError(event.httpResponseCode, event.httpStatusText);
      }
    });
  }

  updateUrlInput(url) {
    if (url !== 'about:blank' && !url.startsWith('data:')) {
      this.currentUrl = url;
      this.urlInput.value = url;
    }
  }

  goBack() {
    this.webview.goBack();
  }

  goForward() {
    this.webview.goForward();
  }

  reload() {
    this.webview.reload();
    this.waitForPageLoadAndCollectOutput();
  }

  getCurrentUrl() {
    return this.webview.getURL();
  }

  async loadUrl(url) {
    this.webview.style.backgroundColor = 'white';
    if (
      !url.startsWith('http') &&
      !url.startsWith('file') &&
      !url.startsWith('about') &&
      !url.startsWith('chrome') &&
      !url.startsWith('data')
    ) {
      url = 'http://' + url;
    }
    this.urlInput.value = url.startsWith('data:') ? '' : url;
    this.currentUrl = url;
    return await this.waitForPageLoadAndCollectOutput(url);
  }

  waitForPageLoadAndCollectOutput(url) {
    return new Promise((resolve) => {
      this.consoleOutput = [];
      const consoleListener = (event) => {
        this.consoleOutput.push(`[${event.level}] ${event.message}`);
      };
      const httpErrorListener = (event) => {
        if (event.httpResponseCode >= 400) {
          this.consoleOutput.push(`[3] Error loading ${event.url}: ${event.httpResponseCode} ${event.httpStatusText}`);
        }
      };
      this.webview.addEventListener('console-message', consoleListener);
      this.webview.addEventListener('did-frame-navigate', httpErrorListener);
      this.webview.addEventListener(
        'did-stop-loading',
        () => {
          this.webview.removeEventListener('console-message', consoleListener);
          this.webview.removeEventListener('did-frame-navigate', httpErrorListener);
          this.indicateConsoleIssues(this.consoleOutput);
          resolve(this.consoleOutput.join('\n'));
        },
        { once: true },
      );
      this.webview.src = url;
    });
  }

  handleLoadError(event) {
    this.webview.style.backgroundColor = 'transparent';
    const { errorCode, errorDescription, validatedURL } = event;
    if (errorCode === -3) return;

    let userFriendlyMessage;
    switch (errorCode) {
      case -102:
        userFriendlyMessage = 'Connection refused. The server may be down or unreachable.';
        break;
      case -105:
        userFriendlyMessage = "Unable to resolve the server's DNS address.";
        break;
      case -106:
        userFriendlyMessage = 'Internet connection is offline.';
        break;
      case -501:
        userFriendlyMessage = "Insecure connection. The website's security certificate is not trusted.";
        break;
      default:
        userFriendlyMessage = `Failed to load the page: ${errorDescription}`;
    }

    this.showError(userFriendlyMessage);
    this.consoleOutput.push(`[3] ${userFriendlyMessage}`);
    this.indicateConsoleIssues(this.consoleOutput);
  }

  handleHttpError(httpResponseCode, httpStatusText) {
    if (httpResponseCode >= 400) {
      this.webview.style.backgroundColor = 'transparent';
      this.showError(`HTTP Error ${httpResponseCode}: ${httpStatusText}`);
    }
  }

  showError(message) {
    const errorHtml = `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #1e90ff;
        font-family: Arial, sans-serif;
        text-align: center;
      ">
        <p>${message}</p>
      </div>
    `;
    this.webview.executeJavaScript(`
      document.body.style.margin = '0';
      document.body.innerHTML = ${JSON.stringify(errorHtml)};
    `);
  }

  indicateConsoleIssues(consoleOutput) {
    const errors = consoleOutput.filter((msg) => msg.startsWith('[3]'));
    const warnings = consoleOutput.filter((msg) => msg.startsWith('[2]'));

    if (errors.length > 0) {
      document.getElementById('browserDevToolsIcon').innerHTML = `<i class="bi bi-bug text-danger ms-2"></i>`;
    } else if (warnings.length > 0) {
      document.getElementById('browserDevToolsIcon').innerHTML = `<i class="bi bi-bug text-warning ms-2"></i>`;
    } else {
      document.getElementById('browserDevToolsIcon').innerHTML = '<i class="bi bi-bug ms-2"></i>';
    }
  }

  openDevTools() {
    this.webview.openDevTools();
  }

  async handleSreenshot() {
    if (!this.currentUrl) {
      this.showError('No URL loaded to capture screenshot');
      return;
    }

    const base64Image = await this.getScreenshot();
    if (!base64Image) {
      chatController.chat.addFrontendMessage('error', 'Failed to capture screenshot');
      return;
    }

    const content = [
      {
        type: 'text',
        text: `Attaching browser screenshot for ${this.currentUrl}`,
      },
      {
        type: 'image_url',
        image_url: {
          url: base64Image,
          media_type: 'image/png',
        },
      },
    ];

    chatController.chat.addBackendMessage('user', content);
    chatController.chat.addFrontendMessage(
      'file',
      `<div class="d-flex justify-content-center"><img src="${base64Image}" class="img-fluid m-3 bg-white" alt="image preview" style="max-height: 350px;"></div>`,
    );
  }

  async getScreenshot() {
    if (!this.currentUrl) {
      return null;
    }

    try {
      const nativeImage = await this.webview.capturePage();
      const base64Image = nativeImage.toPNG().toString('base64');
      return base64Image ? `data:image/png;base64,${base64Image}` : null;
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      return null;
    }
  }
}

module.exports = Browser;
