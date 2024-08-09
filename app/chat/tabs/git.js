const simpleGit = require('simple-git');
const fs = require('graceful-fs');
const path = require('path');
const { Diff2HtmlUI } = require('diff2html/lib/ui/js/diff2html-ui');
const diff = require('diff');

class Git {
  constructor(workingDirectory) {
    this.git = simpleGit(workingDirectory);
    this.workingDirectory = workingDirectory;
    this.selectedFile = null;
    this.updateTabIcon();
  }

  async isGitRepository() {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateTabIcon() {
    if (!(await this.isGitRepository())) {
      document.getElementById('gitIcon').innerHTML = '<i class="bi bi-git me-2"></i>';
      return;
    }

    const changedFiles = await this.getChangedFiles();
    document.getElementById('gitIcon').innerHTML =
      `<span class="badge bg-primary rounded-pill me-2">${changedFiles.length}</span>`;
  }

  async getChangedFiles() {
    const status = await this.git.status();
    return [
      ...status.modified.map((file) => ({ file, status: 'modified' })),
      ...status.not_added.map((file) => ({ file, status: 'not_added' })),
      ...status.deleted.map((file) => ({ file, status: 'deleted' })),
    ];
  }

  async getCurrentBranch() {
    const branchInfo = await this.git.branch();
    return branchInfo.current;
  }

  async getDiff() {
    return this.git.diff(['HEAD']);
  }

  async commit() {
    const message = document.getElementById('commit-message').value.trim();
    if (!message) {
      alert('Please enter a commit message');
      return;
    }
    try {
      await this.git.add('.');
      const result = await this.git.commit(message);
      alert(
        `Commit successful: ${result.summary.changes} file(s) changed, ${result.summary.insertions} insertion(s), ${result.summary.deletions} deletion(s)`,
      );
      await this.renderUI();
    } catch (error) {
      alert(`Error committing changes: ${error.message}`);
    }
  }

  async pull() {
    try {
      const currentBranch = await this.getCurrentBranch();
      const result = await this.git.pull('origin', currentBranch);
      alert(
        `Pull successful: ${result.summary.changes} file(s) changed, ${result.summary.insertions} insertion(s), ${result.summary.deletions} deletion(s)`,
      );
      await this.renderUI();
    } catch (error) {
      if (error.message.includes('ENOTFOUND')) {
        alert(
          'Error pulling changes: Unable to connect to the remote repository. Please check your internet connection.',
        );
      } else if (error.message.includes('Authentication failed')) {
        alert('Error pulling changes: Authentication failed. Please check your credentials.');
      } else {
        alert(`Error pulling changes: ${error.message}`);
      }
    }
  }

  async push() {
    try {
      const currentBranch = await this.getCurrentBranch();
      const result = await this.git.push('origin', currentBranch);
      alert(`Push successful: ${result.pushed.length} ref(s) pushed`);
      await this.renderUI();
    } catch (error) {
      if (error.message.includes('ENOTFOUND')) {
        alert(
          'Error pushing changes: Unable to connect to the remote repository. Please check your internet connection.',
        );
      } else if (error.message.includes('Authentication failed')) {
        alert('Error pushing changes: Authentication failed. Please check your credentials.');
      } else {
        alert(`Error pushing changes: ${error.message}`);
      }
    }
  }

  async discardChange(file) {
    try {
      const status = await this.git.status();
      const fileStatus = status.files.find((f) => f.path === file);

      if (fileStatus && fileStatus.index === '?' && fileStatus.working_dir === '?') {
        // Untracked file, delete it
        const filePath = path.join(this.workingDirectory, file);
        await fs.promises.unlink(filePath);
      } else {
        // Tracked file, use git checkout
        await this.git.checkout([file]);
      }

      await this.renderUI();
      return true;
    } catch (error) {
      alert(`Error discarding changes for ${file}: ${error.message}`);
      return false;
    }
  }

  async showChanges(selectedFile = null) {
    if (!(await this.isGitRepository())) {
      return;
    }

    const diffConfig = {
      drawFileList: false,
      highlight: true,
      matching: 'none',
      colorScheme: chatController.settings.theme,
      showDiffOnly: false,
      fileContentToggle: true,
      diffMaxChanges: 500,
      renderNothingWhenEmpty: false,
      maxLineSizeInBlockForComparison: 200,
      diffStyle: 'word',
    };

    let diffResult;
    if (selectedFile) {
      const status = await this.git.status();
      const fileStatus = status.files.find((f) => f.path === selectedFile);

      if (fileStatus) {
        const filePath = path.join(this.workingDirectory, selectedFile);
        let oldContent = '';
        let newContent = '';

        if (fileStatus.index === '?' && fileStatus.working_dir === '?') {
          // New file
          newContent = await fs.promises.readFile(filePath, 'utf8');
        } else if (fileStatus.working_dir === 'D') {
          // Deleted file
          oldContent = await this.git.show(['HEAD:' + selectedFile]);
        } else {
          // Modified file
          oldContent = await this.git.show(['HEAD:' + selectedFile]);
          newContent = await fs.promises.readFile(filePath, 'utf8');
        }

        diffResult = diff.createPatch(selectedFile, oldContent, newContent);
      }
    } else {
      // If no specific file is selected, show all changes
      diffResult = await this.getDiff();
    }

    this.renderDiff(diffResult, diffConfig);
  }

  renderDiff(diffResult, diffConfig) {
    if (!diffResult) {
      document.getElementById('diff-display').innerHTML =
        '<p class="text-secondary text-center mt-5">No changes to display</p>';
      return;
    }

    const targetElement = document.getElementById('diff-display');
    const diff2htmlUi = new Diff2HtmlUI(targetElement, diffResult, diffConfig);
    diff2htmlUi.draw();
    diff2htmlUi.highlightCode();
  }

  async renderUI() {
    let html = '';
    let changedFiles = [];
    if (await this.isGitRepository()) {
      changedFiles = await this.getChangedFiles();
      const branchName = await this.getCurrentBranch();
      const commitButtonDisabled = changedFiles.length === 0;
      html = `
        <div id="git-commit-ui" class="container-fluid">
          <div class="row">
            <div class="col-md-3 border-end py-3">
              <div class="d-flex justify-content-end mb-1">
                ${this.renderActions()}
              </div>
              <input id="commit-message" class="form-control mb-3" placeholder="Message for &quot;${branchName}&quot;" required>
              <button id="commit-button" class="btn btn-primary w-100 ${commitButtonDisabled ? 'disabled' : ''}" onclick="chatController.agent.projectController.git?.commit();">
                <i class="bi bi-check2-all"></i>
                Commit all
              </button>
              <div class="mt-3 text-secondary d-flex align-items-center justify-content-between">
                Changes
                <span class="badge rounded-pill bg-primary ms-2">${changedFiles.length}</span>
              </div>
              <ul class="list-group list-group-flush mt-2">
                ${changedFiles.map((file) => this.renderFileItem(file)).join('')}
              </ul>
            </div>
            <div class="col-md-9 py-3">
              <div id="diff-display" class="overflow-y-auto overflow-x-hidden" style="height: calc(100vh - 150px);"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      html = `
        <div class="d-flex justify-content-center align-items-center h-100">
          <p class="text-secondary text-center">
            Open a project with a Git repository to use Git features.
            <br>
            Or ask in chat to initialize a new repository.
          </p>
        </div>
      `;
    }

    viewController.activateTab('git-tab');
    document.getElementById('git_output').innerHTML = html;
    viewController.activateTooltips();
    await this.showChanges();
    this.updateTabIcon();
  }

  renderActions() {
    return `
      <button
        id="git-pull"
        class="btn btn-link-secondary p-0 ms-1"
        data-bs-toggle="tooltip"
        data-bs-title="Pull current branch from origin"
        onclick="chatController.agent.projectController.git?.pull();"
      >
        <i class="bi bi-arrow-down"></i>
      </button>
      <button
        id="git-push"
        class="btn btn-link-secondary p-0 ms-1"
        data-bs-toggle="tooltip"
        data-bs-title="Push current branch to origin"
        onclick="chatController.agent.projectController.git?.push();"
      >
        <i class="bi bi-arrow-up"></i>
      </button>
      <button
        id="git-refresh"
        class="btn btn-link-secondary p-0 ms-1"
        data-bs-toggle="tooltip"
        data-bs-title="Refresh"
        onclick="chatController.agent.projectController.git?.renderUI();"
      >
        <i class="bi bi-arrow-clockwise"></i>
      </button>
    `;
  }

  renderFileItem(file) {
    const normalizedPath = path.normalize(file.file).replace(/\\/g, '\\\\');
    const escapedPath = normalizedPath.replace(/"/g, '&quot;');
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center p-0 ps-1" data-file="${escapedPath}">
        <span class="text-truncate mw-75 file-name" style="cursor: pointer;" onclick="chatController.agent.projectController.git?.showFileChanges('${escapedPath}');">${path.basename(normalizedPath)}</span>
        <span class="ms-2 text-nowrap align-items-center d-flex">
          <span class="text-${file.status === 'modified' ? 'info' : file.status === 'not_added' ? 'success' : 'danger'} me-2 d-inline-block text-center">${file.status.charAt(0).toUpperCase()}</span>
          <button class="btn btn-link-secondary p-0" data-bs-toggle="tooltip" data-bs-title="Discard changes" onclick="chatController.agent.projectController.git?.discardChange('${escapedPath}');">
            <i class="bi bi-x-circle"></i>
          </button>
        </span>
      </li>
    `;
  }

  async showFileChanges(file) {
    const normalizedFile = path.normalize(file).replace(/\\/g, '\\\\');
    if (this.selectedFile === normalizedFile) {
      this.selectedFile = null;
      await this.showChanges();
      this.setActiveFile(null);
    } else {
      this.selectedFile = normalizedFile;
      await this.showChanges(file); // Note: we use the original file path here
      this.setActiveFile(normalizedFile);
    }
  }

  setActiveFile(file) {
    const fileItems = document.querySelectorAll('#git_output .list-group-item');
    const normalizedFile = file ? path.normalize(file).replace(/\\/g, '\\\\') : null;
    fileItems.forEach((item) => {
      if (normalizedFile === null || item.dataset.file === normalizedFile) {
        item.classList.toggle('active', item.dataset.file === normalizedFile);
      } else {
        item.classList.remove('active');
      }
    });
  }
}

module.exports = Git;
