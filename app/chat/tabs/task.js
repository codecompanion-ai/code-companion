const path = require('path');
const marked = require('marked');
const { openFileLink } = require('../../utils');

class TaskTab {
  constructor(chatController) {
    this.chatController = chatController;
    this.contextProjectDetailsContainer = document.getElementById('contextProjectDetailsContainer');
    this.contextFilesContainer = document.getElementById('contextFilesContainer');
    this.filesContextLabel = document.getElementById('filesContextLabel');
    this.taskPlanContainer = document.getElementById('taskPlanContainer');
    this.taskPlanProgressContainer = document.getElementById('taskPlanProgressContainer');
  }

  render() {
    const taskContext = this.chatController.chat.taskContext;
    this.renderTask(this.chatController.chat.task, this.chatController.chat.taskTitle);
    this.renderTaskPlan();
    this.renderContextFiles();
    if (taskContext) {
      this.contextProjectDetailsContainer.innerHTML = marked.parse(taskContext);
    } else {
      this.contextProjectDetailsContainer.innerHTML = '<span class="text-secondary">Not available</span>';
    }
  }

  async renderContextFiles() {
    const taskContextFiles = this.chatController.chat.chatContextBuilder.taskContextFiles;
    const enabledFiles = Object.values(taskContextFiles)?.filter((enabled) => enabled) || [];
    if (!taskContextFiles || Object.keys(taskContextFiles).length === 0) {
      this.filesContextLabel.innerText = 'Files context (0)';
      this.contextFilesContainer.innerHTML = '<span class="text-secondary">Not available</span>';
      return;
    }

    const baseDirectory = await this.chatController.terminalSession.getCurrentDirectory();
    const relativePaths = this.getRelativePaths(taskContextFiles, baseDirectory);

    this.contextFilesContainer.innerHTML = await this.generateContextFilesHTML(relativePaths);
    this.filesContextLabel.innerText = `Files context (${enabledFiles.length})`;
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
            <div class="text-truncate mw-75">
              ${await openFileLink(relativePath)}
            </div>
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

  renderTaskPlan() {
    const taskPlan = this.chatController.chat.taskPlan;
    if (!taskPlan) {
      this.taskPlanContainer.innerHTML = '<span class="text-secondary">Not available</span>';
      this.taskPlanProgressContainer.innerHTML = '';
      return;
    }

    this.renderProgressBar();
    this.taskPlanContainer.innerHTML = this.planHtml();
  }

  planHtml(preview = false) {
    const taskPlan = this.chatController.chat.taskPlan;
    if (!taskPlan) return '';

    const reviewMessage = preview ? '<div class="mb-2">Review the plan and click approve to start the task:</div>' : '';
    const result = taskPlan
      .map(
        (step, index) => `
      <div class="card mb-2">
        <div class="card-header d-flex justify-content-between align-items-center" data-bs-toggle="collapse" data-bs-target="#${preview ? 'preview-' : ''}collapse-${index}" aria-expanded="false" aria-controls="${preview ? 'preview-' : ''}collapse-${index}" style="cursor: pointer;">
          <div class="${preview ? '' : 'form-check'}">
            ${
              preview
                ? `<span class="me-2">${index + 1}.</span>`
                : `<input class="form-check-input" type="checkbox" id="${preview ? 'preview-' : ''}step-${index}" ${step.completed ? 'checked' : ''} disabled>`
            }
            <label for="${preview ? 'preview-' : ''}step-${index}">
              ${step.step_title}
            </label>
          </div>
          <div class="d-flex align-items-center">
            ${
              preview
                ? ''
                : `<button class="btn btn-link p-0 me-2" onclick="event.preventDefault(); chatController.taskTab.deleteTaskPlanItem(${index})">
                <i class="bi bi-trash text-secondary"></i>
              </button>`
            }
            <i class="bi bi-chevron-down collapse-icon"></i>
          </div>
        </div>
        <div id="${preview ? 'preview-' : ''}collapse-${index}" class="collapse">
          <div class="card-body">
            ${marked.parse(step.step_detailed_description)}
          </div>
        </div>
      </div>
    `,
      )
      .join('');

    return `${reviewMessage}${result}`;
  }

  deleteTaskPlanItem(index) {
    const taskPlan = this.chatController.chat.taskPlan;
    taskPlan.splice(index, 1);
    this.renderTaskPlan();
  }

  renderProgressBar() {
    const taskPlan = this.chatController.chat.taskPlan;
    if (!taskPlan || taskPlan.length === 0) {
      this.taskPlanProgressContainer.innerHTML = '';
      return;
    }

    const totalTasks = taskPlan.length;
    const completedTasks = taskPlan.filter((step) => step.completed).length;
    const progressPercentage = Math.round((completedTasks / totalTasks) * 100);

    const progressBarHtml = `
      <div class="progress mb-3">
        <div class="progress-bar" role="progressbar" style="width: ${progressPercentage}%;" 
             aria-valuenow="${progressPercentage}" aria-valuemin="0" aria-valuemax="100">
          ${progressPercentage}%
        </div>
      </div>
    `;

    this.taskPlanProgressContainer.innerHTML = progressBarHtml;
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
      document.getElementById('taskContainer').innerHTML = `
      <div class="text-secondary">
        Provide task details in the chat input to start a new task<br>
        Keep the task small. Break it down into smaller tasks if necessary
      </div > `;
      this.contextProjectDetailsContainer.innerHTML = '';
      this.contextFilesContainer.innerHTML = '';
      return;
    }

    const displayTitle =
      taskTitle || (task.split(' ').length > 4 ? task.split(' ').slice(0, 4).join(' ') + '...' : task);
    document.getElementById('taskTitle').innerHTML = displayTitle;
    document.getElementById('taskContainer').innerHTML = marked.parse(task);
  }
}

module.exports = TaskTab;
