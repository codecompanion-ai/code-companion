const fs = require('graceful-fs');
const CryptoJS = require('crypto-js');
const pathModule = require('path');
const Git = require('./chat/tabs/git');
const Store = require('electron-store');
const ignore = require('ignore');
const ccignoreTemplate = require('./static/embeddings_ignore_patterns');
const CodeEmbeddings = require('./tools/code_embeddings');
const { EMBEDDINGS_VERSION } = require('./static/models_config');

const LARGE_FILE_SIZE = 50000;
const addInstructionsModal = new bootstrap.Modal(document.getElementById('addInstructionsModal'));

class ProjectController {
  constructor(currentProject) {
    this.git = null;
    this.getProjects();
    this.openProject(currentProject?.path);
    this.filesList = [];
    this.traverseDirectory = this.traverseDirectory.bind(this);
  }

  openProject(path) {
    if (!path) {
      this.currentProject = null;
      return;
    }
    this.embeddings = null;
    this.filesList = [];

    if (!fs.existsSync(path)) {
      chatController.chat.addFrontendMessage('error', `The path '${path}' does not exist.`);
      return;
    }

    let project = this.projects.find((project) => project.path === path);
    if (!project) {
      let projectName = pathModule.basename(path);
      if (this.projects.find((project) => project.name === projectName)) {
        let i = 1;
        while (this.projects.find((project) => project.name === `${projectName} (${i})`)) {
          i++;
        }
        projectName = `${projectName} (${i})`;
      }
      project = this.saveProject(projectName, path, '');
    } else {
      this.updateProject(project);
    }
    if (chatController.terminalSession.terminal) {
      chatController.terminalSession.navigateToDirectory(path);
      chatController.terminalSession.clearTerminal();
    } else {
      console.error('No terminal session');
    }
    this.currentProject = project;
    document.title = project.name + ' - CodeCompanion';
    viewController.showWelcomeContent();
    this.git = new Git(project.path);
  }

  getProjects() {
    this.projects = [];
    const projects = localStorage.get('projects', []);
    projects.forEach((project) => {
      if (fs.existsSync(pathModule.normalize(project.path))) {
        this.projects.push(project);
      } else {
        localStorage.set(`project.${project.name}.embeddings`, '[]');
      }
    });
    this.projects = this.projects.sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened));
    localStorage.set('projects', this.projects);
    return this.projects;
  }

  saveProject(name, path, filesHash) {
    const project = { name, path, lastOpened: new Date(), filesHash };
    this.projects.push(project);
    localStorage.set('projects', this.projects);
    return project;
  }

  updateProject(project) {
    project.lastOpened = new Date();
    this.projects = this.projects.map((p) => (p.path === project.path ? project : p));
    localStorage.set('projects', this.projects);
  }

  updateListOfFiles() {
    this.filesList = [];
    const ignoreList = this.getIgnoreList(this.currentProject.path);
    this.traverseDirectory(this.currentProject.path, ignoreList);
  }

  showInstructionsModal(path) {
    let project = this.projects.find((project) => project.path === path);

    if (project) {
      addInstructionsModal.show();
      let instructions = localStorage.get(`project.${project.name}.instructions`, '');
      document.getElementById('customInstructions').value = instructions;
      this.instructionsProjectName = project.name;
    } else {
      viewController.updateFooterMessage('Project not found');
    }
  }

  saveInstructions() {
    const instructions = document.getElementById('customInstructions').value;
    localStorage.set(`project.${this.instructionsProjectName}.instructions`, instructions);
    viewController.updateFooterMessage('Instructions updated');
    addInstructionsModal.hide();
  }

  getCustomInstructions() {
    if (!this.currentProject) return;

    const instructions = localStorage.get(`project.${this.currentProject.name}.instructions`, '');
    return instructions ? '\n\n' + instructions : '';
  }

  async createEmbeddings() {
    if (!chatController.settings.selectedEmbeddingsModel) {
      return;
    }

    const openAIApiKey = chatController.settings.apiKey;
    if (!openAIApiKey) {
      return;
    }

    if (!this.embeddings) {
      this.embeddings = new CodeEmbeddings(
        this.currentProject.name,
        openAIApiKey,
        chatController.settings.selectedEmbeddingsModel,
      );
      await this.embeddings.load();
    }

    const filesHash = await this.getFilesHash();
    if (filesHash === this.currentProject.filesHash) {
      return;
    }

    const maxFilesToEmbed = chatController.settings.maxFilesToEmbed;
    if (this.filesList.length > maxFilesToEmbed) {
      console.error(`Too many files to index with vector embeddings. (${this.filesList.length})`);
      chatController.chat.addFrontendMessage(
        'error',
        `Too many files to index with vector embeddings.
        <br>Trying to index ${this.filesList.length} files:
        <code>
        ${this.countFiles()}
        </code>
        Exclude files that don't need to be indexed for search in <code>.ccignore</code> file and try again.
        Only first ${maxFilesToEmbed} files will be indexed.
        `,
      );
      this.filesList = this.filesList.slice(0, maxFilesToEmbed);
    }

    await this.embeddings.updateEmbeddingsForFiles(this.filesList);
    this.currentProject.filesHash = filesHash;
    this.updateProject(this.currentProject);
  }

  async searchEmbeddings({ query, count = 10, rerank = true, filenamesOnly = false }) {
    if (!chatController.settings.selectedEmbeddingsModel) {
      chatController.chat.addFrontendMessage(
        'error',
        `No embeddings model selected. Please select an embeddings model under settings.`,
      );
      return;
    }

    if (!this.currentProject) {
      chatController.chat.addFrontendMessage('error', `No project is open. To use search, open a project first.`);
      return;
    }

    if (!chatController.settings.apiKey) {
      const embeddingsErrorMessage = `Unable to calculate embeddings. Please add OpenAI API key under settings. Embeddings are required for code search and enable providing relevant source code for better chat context.`;
      if (chatController.chat.frontendMessages.find((message) => message.content === embeddingsErrorMessage)) {
        return;
      }
      chatController.chat.addFrontendMessage('error', embeddingsErrorMessage);
      return;
    }

    await this.createEmbeddings();
    const results = await this.embeddings.search({
      query,
      limit: count,
      basePath: this.currentProject.path,
      rerank,
      filenamesOnly,
    });
    return results;
  }

  getIgnoreList(path) {
    const gitignorePath = pathModule.join(path, '.gitignore');
    const ccignorePath = pathModule.join(path, '.ccignore');
    let ignoreList = [];
    let ccignoreList = [];
    if (fs.existsSync(gitignorePath)) {
      ignoreList = fs
        .readFileSync(gitignorePath, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    }
    if (fs.existsSync(ccignorePath)) {
      ccignoreList = fs
        .readFileSync(ccignorePath, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    } else {
      ccignoreList = ccignoreTemplate.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
    }
    ignoreList = ignoreList.concat(ccignoreList);
    return ignore().add(ignoreList);
  }

  traverseDirectory(path, ignoreList) {
    let files;
    try {
      files = fs.readdirSync(path);
    } catch (err) {
      console.error(`Failed to read directory ${path}: ${err}`);
      return;
    }

    for (const file of files) {
      const filePath = pathModule.join(path, file);
      const relativePath = pathModule.relative(this.currentProject.path, filePath);

      if (ignoreList.ignores(relativePath)) {
        continue;
      }

      let stats;
      try {
        stats = fs.statSync(filePath);
      } catch (err) {
        console.error(`Failed to get stats for ${filePath}: ${err}`);
        continue;
      }

      if (stats.isDirectory()) {
        this.traverseDirectory(filePath, ignoreList);
      } else {
        if (!this.shouldSkipFile(filePath, stats)) {
          this.filesList.push(filePath);
        }
      }
    }
  }

  shouldSkipFile(filePath, stats) {
    if (stats.size > LARGE_FILE_SIZE || stats.size === 0) {
      return true;
    }
    return false;
  }

  countFiles() {
    const pathSeparator = isWindows ? '\\' : '/';
    const folderCount = {};

    this.filesList.forEach((file) => {
      const formattedFilePath = pathModule.relative(this.currentProject.path, file);
      const pathParts = formattedFilePath.split(pathSeparator);

      let folderPath = '';
      for (let i = 0; i < pathParts.length - 1; i++) {
        // Iterate through all folders in the path
        folderPath += (i > 0 ? pathSeparator : '') + pathParts[i];
        folderCount[folderPath] = (folderCount[folderPath] || 0) + 1;
      }
    });

    return Object.entries(folderCount)
      .sort((a, b) => b[1] - a[1]) // Sort by count
      .map(([folder, count]) => `${folder}${count > 1 ? ` (${count} files)` : ''}`)
      .join('<br>');
  }

  async getFileHash(filePath) {
    const fileBuffer = await fs.promises.readFile(filePath);
    return (
      CryptoJS.SHA256(fileBuffer.toString()).toString() +
      EMBEDDINGS_VERSION +
      chatController.settings.selectedEmbeddingsModel
    );
  }

  async getFilesHash() {
    this.updateListOfFiles();
    const hashes = await Promise.all(this.filesList.map((filePath) => this.getFileHash(filePath)));

    return (
      CryptoJS.SHA256(hashes.join('')).toString() +
      EMBEDDINGS_VERSION +
      chatController.settings.selectedEmbeddingsModel +
      chatController.settings.maxFilesToEmbed.toString()
    );
  }

  getRecentModifiedFiles(sinceDateTime) {
    if (!this.currentProject) {
      return [];
    }

    this.updateListOfFiles();
    const recentFiles = this.filesList
      .map((filePath) => ({
        path: filePath,
        mtime: fs.statSync(filePath).mtime,
        isDirectory: fs.statSync(filePath).isDirectory(),
      }))
      .filter((file) => file.mtime > sinceDateTime && !file.isDirectory)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10)
      .map((file) => file.path);

    return recentFiles;
  }

  async getFolderStructure(fileLimit = 30, maxDepth = 2) {
    const ig = this.getIgnoreList(this.currentProject.path);
    const rootDir = chatController.agent.currentWorkingDir;

    // Recursive function to list files and directories
    const listEntries = async (dir, depth = 0, currentPath = '') => {
      if (depth > maxDepth) return [];

      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const filteredEntries = entries.filter((entry) => !ig.ignores(path.join(currentPath, entry.name)));

      const result = [];
      for (const entry of filteredEntries) {
        const entryPath = path.join(dir, entry.name);
        const relativePath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          result.push(`${'  '.repeat(depth)}- ${entry.name}/`);
          if (depth < maxDepth) {
            const subEntries = await listEntries(entryPath, depth + 1, relativePath);
            result.push(...subEntries);
          }
        } else {
          result.push(`${'  '.repeat(depth)}- ${entry.name}`);
        }
      }
      return result;
    };

    try {
      const structure = await listEntries(rootDir);

      if (structure.length === 0) {
        return 'The directory is empty.';
      } else if (structure.length <= fileLimit) {
        return structure.join('\n');
      } else {
        // If more than fileLimit entries, only show top-level entries
        const topLevelEntries = structure.filter((entry) => !entry.startsWith('  '));
        return topLevelEntries.join('\n');
      }
    } catch (error) {
      chatController.chat.addFrontendMessage(
        'error',
        `Error occurred while checking directory structure in ${rootDir}.
     <br>Please change directory where app can read/write files or update permissions for current directory.`,
      );
      return;
    }
  }
}

module.exports = ProjectController;
