const path = require('path');

class TaskTab {
  constructor(chatController) {
    this.chatController = chatController;
    this.contextProjectDetailsContainer = document.getElementById('contextProjectDetailsContainer');
    this.contextFilesContainer = document.getElementById('contextFilesContainer');
  }

  async render(taskContext) {
    const projectContext = Object.fromEntries(
      Object.entries(taskContext).filter(([key]) => key !== 'task_relevant_files'),
    );
    const taskRelevantFiles = taskContext['task_relevant_files'];
    this.renderProjectContext(projectContext);
    await this.renderContextFiles(taskRelevantFiles?.directly_related_files);
  }

  showLoadingIndicator() {
    viewController.updateLoadingIndicator(true, 'Doing some research and planning...');
    this.contextProjectDetailsContainer.innerHTML = `
      <div class="d-flex justify-content-center align-items-center h-100">
        <div class="text-center">
          <div class="spinner-grow text-secondary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p class="mt-3 text-secondary">Analyzing task and creating a plan...</p>
        </div>
      </div>
    `;
  }

  renderProjectContext(projectContext) {
    let html = '';

    const formatTitle = (title) => {
      return title.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    for (const [key, value] of Object.entries(projectContext)) {
      html += `<h4>${formatTitle(key)}</h4><hr><div class="ms-3">`;
      if (typeof value === 'string') {
        html += `<p class="ms-3">${value}</p>`;
      } else if (Array.isArray(value)) {
        html += '<ul>';
        value.forEach((item) => {
          html += `<li>${item}</li>`;
        });
        html += '</ul>';
      } else if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          if (subValue === null) continue;
          html += `<h5>${formatTitle(subKey)}</h5>`;
          if (typeof subValue === 'string') {
            html += `<p class="ms-3">${subValue}</p>`;
          } else if (Array.isArray(subValue)) {
            html += '<ul>';
            subValue.forEach((item) => {
              if (typeof item === 'object') {
                html += '<li>';
                for (const [itemKey, itemValue] of Object.entries(item)) {
                  html += `<strong>${itemKey}:</strong> ${itemValue}<br>`;
                }
                html += '</li>';
              } else {
                html += `<li>${item}</li>`;
              }
            });
            html += '</ul>';
          }
        }
      }
      html += '</div>';
    }
    this.contextProjectDetailsContainer.innerHTML = html;
  }
  async renderContextFiles(files) {
    if (!files || files.length === 0) {
      this.contextFilesContainer.innerHTML = '<p class="text-muted">No context files available.</p>';
      return;
    }

    const baseDirectory = await this.chatController.terminalSession.getCurrentDirectory();
    const relativePaths = files.map((file) => path.relative(baseDirectory, file)).sort();

    let html = '<ul class="list-group list-group-flush">';
    relativePaths.forEach((relativePath) => {
      html += `<li class="list-group-item">${relativePath}</li>`;
    });
    html += '</ul>';
    this.contextFilesContainer.innerHTML = html;
  }
}

module.exports = TaskTab;