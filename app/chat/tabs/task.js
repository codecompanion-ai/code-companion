const path = require('path');
const marked = require('marked');
const { openFileLink } = require('../../utils');

class TaskTab {
  constructor(chatController) {
    this.chatController = chatController;
    this.contextProjectDetailsContainer = document.getElementById('contextProjectDetailsContainer');
    this.contextFilesContainer = document.getElementById('contextFilesContainer');
  }

  render() {
    const taskContext = this.chatController.chat.taskContext;
    this.contextProjectDetailsContainer.innerHTML = marked.parse(taskContext);
  }

  async renderContextFiles() {
    const taskContextFiles = this.chatController.chat.chatContextBuilder.taskContextFiles;
    if (!taskContextFiles || Object.keys(taskContextFiles).length === 0) {
      this.contextFilesContainer.innerHTML = '<p class="text-muted">No context files available.</p>';
      return;
    }

    const baseDirectory = await this.chatController.terminalSession.getCurrentDirectory();
    const relativePaths = this.getRelativePaths(taskContextFiles, baseDirectory);

    this.contextFilesContainer.innerHTML = await this.generateContextFilesHTML(relativePaths);
    this.setupContextFilesEventListener();
  }

  getRelativePaths(taskContextFiles, baseDirectory) {
    return Object.entries(taskContextFiles)
      .map(([file, enabled]) => ({
        path: path.relative(baseDirectory, file),
        enabled,
        fullPath: file,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async generateContextFilesHTML(relativePaths) {
    const listItems = await Promise.all(
      relativePaths.map(
        async ({ path: relativePath, enabled, fullPath }) => `
          <li class="list-group-item d-flex justify-content-between align-items-center px-0">
            ${await openFileLink(relativePath)}
            <div class="form-check form-switch">
              <input class="form-check-input context-file-checkbox" type="checkbox" role="switch" 
                data-full-path="${fullPath.replace(/\\/g, '\\\\')}" ${enabled ? 'checked' : ''}>
            </div>
          </li>
        `,
      ),
    );

    return `
    <ul class="list-group list-group-flush">
      ${listItems.join('')}
    </ul>
  `;
  }

  setupContextFilesEventListener() {
    this.contextFilesContainer.removeEventListener('change', this.handleContextFileChange);
    this.contextFilesContainer.addEventListener('change', this.handleContextFileChange);
  }

  handleContextFileChange = async (event) => {
    if (event.target.classList.contains('context-file-checkbox')) {
      const fullPath = event.target.dataset.fullPath;
      this.chatController.chat.chatContextBuilder.updateTaskContextFile(fullPath, event.target.checked);
    }
  };

  renderTask(task, taskTitle) {
    if (!task) {
      document.getElementById('taskTitle').innerText = 'New task';
      document.getElementById('taskContainer').innerHTML =
        '<div class="text-secondary">Provide task details in the chat input to start a new task</div>';
      this.contextProjectDetailsContainer.innerHTML = '';
      this.contextFilesContainer.innerHTML = '';
      return;
    }

    const displayTitle =
      taskTitle || (task.split(' ').length > 4 ? task.split(' ').slice(0, 4).join(' ') + '...' : task);
    document.getElementById('taskTitle').innerText = displayTitle;
    document.getElementById('taskContainer').innerHTML = marked.parse(task);
  }
}

module.exports = TaskTab;
