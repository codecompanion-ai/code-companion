const hljs = require('highlight.js/lib/common');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const autosize = require('autosize');
const { drawDiff } = require('./tools/code_diff');
const interact = require('interactjs');

class ViewController {
  initializeUIFormatting() {
    const renderer = new marked.Renderer();

    renderer.code = function (code, language) {
      if (typeof code === 'object' && code.type === 'code') {
        language = code.lang || '';
        code = code.text || '';
      }

      if (typeof code !== 'string') {
        code = '';
      }

      if (language && language === 'diff') {
        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-container';
        drawDiff(diffContainer, code);
        return diffContainer.outerHTML;
      }

      let highlightedCode;
      try {
        if (language && hljs.getLanguage(language)) {
          highlightedCode = hljs.highlight(code, { language }).value;
        } else {
          highlightedCode = hljs.highlightAuto(code).value;
        }
      } catch (error) {
        highlightedCode = code; // Fallback to raw code if highlighting fails
      }

      return `<pre class="hljs rounded border ${language || ''}"><code>${highlightedCode}</code></pre>`;
    };

    // Set options for marked
    marked.setOptions({
      renderer: renderer, // Use the custom renderer
      highlight: function (code, language) {
        if (language && hljs.getLanguage(language)) {
          return hljs.highlight(code, { language }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      langPrefix: 'language-',
      pedantic: false,
      gfm: true,
      breaks: true,
      smartypants: false,
      xhtml: false,
    });

    const messageInput = document.getElementById('messageInput');
    autosize(messageInput);
  }

  handleClick(event) {
    let targetElement = event.target;

    if (targetElement.tagName === 'I' && targetElement.parentElement && targetElement.parentElement.tagName === 'A') {
      targetElement = targetElement.parentElement;
    }

    if (targetElement.tagName === 'A' && targetElement.href.startsWith('http')) {
      event.preventDefault();
      shell.openExternal(targetElement.href);
    }
  }

  renderModelDropdowns() {
    const customModels = chatController.customModelsManager.getCustomModels();
    const largeModelOptions = MODEL_OPTIONS.concat(customModels);
    const smallModelOptions = SMALL_MODEL_OPTIONS.concat(customModels);
    this.buildModelDropdown('selectedModel', largeModelOptions, chatController.settings.selectedModel);
    this.buildModelDropdown('baseModel', largeModelOptions, chatController.settings.selectedModel);
    this.buildModelDropdown('selectedSmallModel', smallModelOptions, chatController.settings.selectedSmallModel);
    this.buildModelDropdown(
      'selectedEmbeddingsModel',
      EMBEDDINGS_MODEL_OPTIONS,
      chatController.settings.selectedEmbeddingsModel,
      'Do not use embeddings',
    );
  }

  buildModelDropdown(elementId, options, selectedOption, includeBlank = null) {
    const select = document.getElementById(elementId);
    select.innerHTML = ''; // Clear existing options

    if (includeBlank !== null) {
      const blankOption = document.createElement('option');
      blankOption.value = '';
      blankOption.textContent = includeBlank;
      select.appendChild(blankOption);
    }

    const groupedModels = this.groupModelsByProvider(options);

    for (const [provider, models] of Object.entries(groupedModels)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = provider;

      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.model;
        option.textContent = model.name;
        if (model.model === selectedOption) {
          option.selected = true;
        }
        optgroup.appendChild(option);
      });

      select.appendChild(optgroup);
    }
  }

  groupModelsByProvider(models) {
    const groupedModels = {};
    models.forEach((model) => {
      const provider = model.provider;
      if (!groupedModels[provider]) {
        groupedModels[provider] = [];
      }
      groupedModels[provider].push(model);
    });
    return groupedModels;
  }

  scrollToBottom() {
    const container = document.getElementById('chat_history_container');

    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  }

  async copyCode(block, button) {
    const code = block.querySelector('code');
    const text = code.innerText;
    await navigator.clipboard.writeText(text);
    button.innerHTML = '<i class="bi bi-clipboard-check"></i>';

    setTimeout(() => {
      button.innerHTML = '<i class="bi bi-clipboard"></i>';
    }, 1000);
  }

  addCopyCodeButtons() {
    const blocks = document.querySelectorAll('pre');
    blocks.forEach((block) => {
      if (navigator.clipboard) {
        const button = document.createElement('button');
        button.classList.add('btn', 'btn-sm', 'position-absolute');
        button.style.top = '8px';
        button.style.right = '8px';
        button.innerHTML = '<i class="bi bi-clipboard"></i>';
        block.style.position = 'relative';
        block.appendChild(button);

        button.addEventListener('click', async () => {
          await this.copyCode(block, button);
        });
      }
    });
  }

  formatResponse(item) {
    if (!item.content || item.content.trim() === '') {
      return '';
    }

    const copyButton = `<button class="btn btn-sm" id=copyMessage${item.id} onclick="chatController.chat.copyFrontendMessage(${item.id})" data-bs-toggle="tooltip" data-bs-title="Copy"><i class="bi bi-clipboard"></i></button>`;
    const deleteMessagesButton = `<button class="btn btn-sm" id=deleteMessage${item.id} onclick="chatController.chat.deleteMessagesAfterId(${item.id})" data-bs-toggle="tooltip" data-bs-title="Delete"><i class="bi bi-trash"></i></button>`;
    let buttons = '';

    if ((item.role === 'assistant' && item.content?.length > 10) || item.role === 'file') {
      buttons = `<div class="d-flex justify-content-start"><div class="rounded border" role="group">${copyButton}${deleteMessagesButton}</div></div>`;
    }

    const roleSettings = {
      user: { icon: 'person', rowClass: 'bg-light-subtle rounded mt-3', rowPadding: '3' },
      command: { icon: 'terminal', rowClass: 'mt-3', rowPadding: '3' },
      function: { icon: null, rowClass: 'text-muted ms-1 mt-2', rowPadding: '2' },
      error: { icon: 'exclamation-triangle text-warning', rowClass: 'mt-3', rowPadding: '3' },
      info: { icon: 'info-circle', rowClass: 'mt-3', rowPadding: '3' },
      file: { icon: 'paperclip', rowClass: 'mt-3', rowPadding: '3' },
      onboarding: { icon: 'info-circle', rowClass: 'mt-3', rowPadding: '3' },
      assistant: { icon: 'stars text-primary', rowClass: 'mt-3', rowPadding: '3' },
    };

    const roleSetting = roleSettings[item.role];
    return this.createMessageHTML(roleSetting, item.content, buttons);
  }

  createMessageHTML(roleSetting, content, buttons) {
    return `<div class="row ${roleSetting.rowClass} align-items-start flex-nowrap">
              <div class="col-auto pt-${roleSetting.rowPadding} flex-shrink-0">
                ${roleSetting.icon ? `<i class="bi bi-${roleSetting.icon}"></i>` : '&nbsp;'}
              </div>
              <div class="col pt-${roleSetting.rowPadding} flex-grow-1 min-width-0">
                <div class="overflow-hidden">${content ? marked.parse(content) : ''}</div>
                ${buttons}
              </div>
            </div>`;
  }

  changeTheme(theme) {
    const htmlElement = document.querySelector('html');
    htmlElement.setAttribute('data-bs-theme', theme);
    localStorage.set('theme', theme);

    const stylesheet = document.querySelector('link[href^="node_modules/highlight.js/styles/"]');
    if (theme === 'light') {
      stylesheet.href = 'node_modules/highlight.js/styles/github.min.css';
    } else {
      stylesheet.href = 'node_modules/highlight.js/styles/github-dark-dimmed.min.css';
    }

    ipcRenderer.send('theme-change', theme);
  }

  updateFooterMessage(message) {
    const formatTokens = (tokens) => (tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'K' : tokens);

    const usageMessage = this.getUsageMessage(formatTokens);
    const combinedMessage = this.combineMessages(message, usageMessage);

    this.setFooterMessage(combinedMessage);
  }

  getUsageMessage(formatTokens) {
    const { input_tokens, output_tokens, total_tokens } = chatController.usage;
    if (total_tokens > 0) {
      return `Last input: ${formatTokens(input_tokens)}, output: ${formatTokens(output_tokens)}. Total this task: ${formatTokens(total_tokens)} tokens`;
    }
    return '';
  }

  combineMessages(message, usageMessage) {
    if (message && usageMessage) {
      return `${message} | ${usageMessage}`;
    }
    return message || usageMessage;
  }

  setFooterMessage(message) {
    if (message) {
      document.getElementById('footerMessage').innerText = message;
    }
  }

  updateLoadingIndicator(show, message = 'Loading...') {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingIndicatorMessage = document.getElementById('loadingMessage');
    if (show) {
      loadingIndicator.removeAttribute('hidden');
      loadingIndicatorMessage.innerText = message;
    } else {
      loadingIndicator.setAttribute('hidden', true);
      loadingIndicatorMessage.innerText = '';
    }
  }

  onShow() {
    messageInput.focus();
  }

  selectDirectory() {
    ipcRenderer.send('open-directory');
  }

  openFileDialogue() {
    ipcRenderer.send('open-file-dialog');
  }

  openFileInIDE(filePath) {
    const terminalCommand = `${chatController.settings.commandToOpenFile} "${filePath.replace(/\\/g, '/')}"`;
    chatController.terminalSession.executeCommandWithoutOutput(terminalCommand);
  }

  activateTab(tabId) {
    const tab = new bootstrap.Tab(`#${tabId}`);
    tab.show();
  }

  handlePanelResize() {
    const container = document.querySelector('.container-fluid > .row');
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const resizeHandle = document.getElementById('resize_handle');
    const chatInputContainer = document.getElementById('chatInputContainer');
    let leftWidth = 50; // Initial left panel width in percentage
    const savedRatio = localStorage.get('panelSplitRatio');
    if (savedRatio) {
      leftWidth = parseFloat(savedRatio);
    }

    const updatePanels = () => {
      leftPanel.style.flexBasis = `${leftWidth}%`;
      chatInputContainer.style.width = `${leftWidth}%`;
      rightPanel.style.flexBasis = `calc(${100 - leftWidth}% - 3px)`;
    };

    updatePanels(); // Set initial sizes

    interact(resizeHandle).draggable({
      cursorChecker() {
        return 'ew-resize';
      },
      axis: 'x',
      listeners: {
        move: (event) => {
          const containerWidth = container.offsetWidth;
          leftWidth = ((leftPanel.offsetWidth + event.dx) / containerWidth) * 100;
          leftWidth = Math.max(30, Math.min(70, leftWidth));
          updatePanels();
        },
        end: () => {
          localStorage.set('panelSplitRatio', leftWidth);
        },
      },
    });
  }

  toogleChatInputContainer() {
    const chatInputContainer = document.getElementById('chatInputContainer');
    chatInputContainer.style.display =
      chatController.agent.projectController.currentProject === null ? 'none' : 'block';
  }

  activateTooltips() {
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].forEach((tooltipTriggerEl) => {
      const tooltip = new bootstrap.Tooltip(tooltipTriggerEl);
      tooltipTriggerEl.addEventListener('shown.bs.tooltip', () => {
        setTimeout(() => {
          tooltip.hide();
        }, 2000);
      });
    });
  }

  showWelcomeContent() {
    const chat = chatController.chat;
    if (chat.frontendMessages.length !== 0 || chat.task !== null) {
      document.getElementById('projectsCard').innerHTML = '';
      return;
    }

    let recentProjectsContent = '';
    let currentProjectContent = '';
    const projectController = chatController.agent.projectController;
    const recentProjects = projectController.getProjects().slice(0, 10);

    recentProjects.forEach((project) => {
      const projectPath = JSON.stringify(project.path).slice(1, -1);
      const projectName =
        project.name === projectController.currentProject?.name ? `<strong>${project.name}</strong>` : project.name;
      recentProjectsContent += `
        <div class="row align-items-center">
          <div class="col-12 col-sm-4 mb-2 mb-sm-0">
            <a href="#" class="card-link text-nowrap text-truncate" onclick="event.preventDefault(); chatController.agent.projectController.openProject('${projectPath}');">
              <i class="bi bi-folder me-2"></i>${projectName}
            </a>
          </div>
          <div class="col-12 col-sm-3 mb-2 mb-sm-0">
            <a href="#" class="card-link text-nowrap" onclick="event.preventDefault(); chatController.agent.projectController.showInstructionsModal('${projectPath}');">
              <i class="bi bi-pencil me-2"></i> Instructions
            </a>
          </div>
          <div class="col-12 col-sm-5 text-truncate text-secondary text-nowrap">
            ${projectPath}
          </div>
        </div>`;
    });

    if (projectController.currentProject) {
      currentProjectContent = `
        <p><span class="me-3 fw-bold">${projectController.currentProject.name}</span><span class="text-truncate text-secondary text-nowrap d-none d-md-inline">${projectController.currentProject.path}</span></p>
      `;
    }

    const welcomeContent = `
      <div class="card mt-5">
        <div class="card-body">
          <h5 class="card-title">Projects</h5>
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Current</h6>
          ${currentProjectContent || '<p class="text-secondary">Please select a project directory to proceed.<br>Do not use the chat in the root directory. Instead, create a working directory.</p>'}
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Open project (working directory)</h6>
          <a href="#" class="card-link text-decoration-none" onclick="event.preventDefault(); viewController.selectDirectory();"><i class="bi bi-folder-plus me-2"></i>Open</a>
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Recent</h6>
          <div class="container-fluid">
            ${recentProjectsContent || '<p class="text-secondary">No recent projects</p>'}
          </div>
        </div>
      </div>
    `;
    document.getElementById('projectsCard').innerHTML = welcomeContent;
  }
}

module.exports = ViewController;
