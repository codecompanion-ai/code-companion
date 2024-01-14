const fs = require('graceful-fs');
const chatFunctions = require('./chat_functions');
const path = require('path');
const { withErrorHandling } = require('./utils');
const SmartContext = require('./smart_context');
const ProjectHandler = require('./project_handler');

class CodeAgent {
  constructor() {
    this.currentWorkingDir = os.homedir();
    this.projectState = {};
    this.smartContext = new SmartContext();
    this.projectHandler = new ProjectHandler();
    this.userDecision = null;
  }

  showWelcomeContent() {
    let recentProjectsContent = '';
    let currentProjectContent = '';
    const recentProjects = this.projectHandler.getProjects().slice(0, 10);

    recentProjects.forEach((project) => {
      recentProjectsContent += `
      <div class="row">
        <div class="col"><a href="#" class="card-link me-3 text-nowrap" onclick="event.preventDefault(); chatController.codeAgent.projectHandler.openProject('${project.path}');"><i class="bi bi-folder me-2"></i>${project.name}</a></div>
        <div class="col"><a href="#" class="card-link text-nowrap" onclick="event.preventDefault(); chatController.codeAgent.projectHandler.showInstructionsModal('${project.path}');"><i class="bi bi-pencil me-2"></i>Instructions</a></div>
        <div class="col-6 text-truncate text-secondary text-nowrap d-none d-md-block">${project.path}</div>
      </div>`;
    });

    if (this.projectHandler.currentProject) {
      currentProjectContent = `
        <p><span class="me-3">${this.projectHandler.currentProject.name}</span><span class="text-truncate text-secondary text-nowrap d-none d-md-inline">${this.projectHandler.currentProject.path}</span></p>
      `;
    }

    const welcomeContent = `
      <div class="card mt-5">
        <div class="card-body">
          <h5 class="card-title">Projects</h5>
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Current</h6>
          ${currentProjectContent || '<p class="text-secondary">Please select a project directory to proceed</p>'}
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Open project</h6>
          <a href="#" class="card-link text-decoration-none" onclick="event.preventDefault(); selectDirectory();"><i class="bi bi-folder-plus me-2"></i>Open</a>
          <h6 class="card-subtitle mt-4 mb-2 text-body-secondary">Recent</h6>
          <div class="container-fluid">
            ${recentProjectsContent || '<p class="text-secondary">No recent projects</p>'}
          </div>
        </div>
      </div>
    `;
    document.getElementById('output').innerHTML = welcomeContent;
  }

  async waitForDecision(functionName) {
    this.userDecision = null;
    const functionsRequiringApproval = ['create_or_overwrite_file', 'shell', 'replace'];
    if (chatController.approvalRequired && functionsRequiringApproval.includes(functionName)) {
      document.getElementById('messageInput').disabled = true;
      document.getElementById('approval_buttons').removeAttribute('hidden');
      return new Promise((resolve) => {
        const checkDecision = setInterval(() => {
          if (this.userDecision !== null) {
            clearInterval(checkDecision);
            document.getElementById('approval_buttons').setAttribute('hidden', true);
            document.getElementById('messageInput').disabled = false;
            document.getElementById('messageInput').focus();
            resolve(this.userDecision);
            this.userDecision = null;
          }
        }, 200);
      });
    } else {
      return Promise.resolve(true);
    }
  }

  async runCodeAgent(apiResponseMessage) {
    if (chatController.stopProcess || !apiResponseMessage) {
      return;
    }

    try {
      this.addAssistantMessages(apiResponseMessage);
      if (apiResponseMessage.function_call) {
        const decision = await this.waitForDecision(apiResponseMessage.function_call.name);
        if (decision) {
          const { frontendMessage, backendMessage } = await this.callFunction(apiResponseMessage.function_call);
          if (backendMessage) {
            chatController.chat.addBackendMessage('function', backendMessage, null, apiResponseMessage.function_call.name);
            if (frontendMessage) {
              chatController.chat.addFrontendMessage('function', frontendMessage);
            }
            this.smartContext.updateContext(chatController.chat);
            await chatController.process('', false);
          } else {
            updateLoadingIndicator(false);
            console.error('No output from function call');
          }
        } else {
          chatController.chat.addFrontendMessage('error', 'Action was rejected');
          chatController.chat.addBackendMessage('user', 'User rejected function call');
        }
        this.userDecision = null;
      }
    } catch (error) {
      chatController.handleError(error);
    }
  }

  async callFunction(functionCall) {
    updateLoadingIndicator(true);
    const functionName = functionCall.name;
    const args = this.parseArguments(functionCall);
    // Ensure that the targetFile parameter is included for functions that require it
    if (['replace'].includes(functionName) && (!args || !args.targetFile)) {
      throw new Error('targetFile parameter is missing for the replace function.');
    }
    let result = '';

    try {
      switch (functionName) {
        case 'create_or_overwrite_file':
          result = await chatFunctions.createFile(args);
          break;
        case 'replace':
          result = await chatFunctions.replaceInFile(args);
          break;
        case 'read':
          result = await chatFunctions.readFile(args);
          break;
        case 'shell':
          result = await chatFunctions.shell(args);
          break;
        case 'search_code':
          result = await chatFunctions.searchCode(args);
          break;
        case 'search_google':
          result = await chatFunctions.googleSearch(args);
          break;
        case 'search_url':
          result = await chatFunctions.searchURL(args);
          break;
        default:
          console.error(`Unsupported function ${functionName}`);
      }
    } catch (error) {
      console.error(error);
      chatController.chat.addFrontendMessage('error', `Error occurred. ${error.message}`);
      result = {
        frontendMessage: 'An error occurred',
        backendMessage: `Error: ${error.message}`,
      };
    } finally {
      updateLoadingIndicator(false);
      return result;
    }
  }

  parseArguments(functionCall) {
    try {
      return JSON.parse(functionCall.arguments);
    } catch (error) {
      if (functionCall.name === 'shell') {
        return {
          command: functionCall.arguments,
        };
      }
      console.error(error);
      throw error;
    }
  }

  async getFolderStructure() {
    let files = [];
    try {
      files = await fs.promises.readdir(this.currentWorkingDir);
    } catch (error) {
      chatController.chat.addFrontendMessage(
        'error',
        `Error occurred while checking directory structure in ${this.currentWorkingDir}.
         <br>Please change directory where app can read/write files or update permissions for current directory.`,
      );
      return;
    }

    const folderStructure = [];
    for (const file of files) {
      const stats = await fs.promises.stat(path.join(this.currentWorkingDir, file));
      if (stats.isDirectory()) {
        folderStructure.push(`- ${file}/`);
      } else {
        folderStructure.push(`- ${file}`);
      }
    }

    if (folderStructure.length > 30) {
      folderStructure.splice(30);
      return `${folderStructure.join('\n')}\n... and more`;
    }

    if (folderStructure.length == 0) {
      return 'directory is empty';
    }

    return folderStructure.join('\n');
  }

  async updateProjectState() {
    this.projectState.currentWorkingDir = await chatController.terminalSession.getCurrentDirectory();
    const filesInFolder = await withErrorHandling(this.getFolderStructure.bind(this));
    this.projectState.folderStructure = filesInFolder;

    const projectStateText = await this.projectStateToText();
    chatController.chat.deleteMessagesThatStartWith('In case this information is helpfull. You are already located in the ');
    chatController.chat.addProjectStateMessage(projectStateText);
  }

  async projectStateToText() {
    const dirName = path.basename(this.currentWorkingDir);
    let projectStateText = '';
    projectStateText += `In case this information is helpfull. You are already located in the '${dirName}' directory (don't navigate to or add '${dirName}' to file path). The full path to this directory is '${this.currentWorkingDir}'.`;
    if (this.projectState.folderStructure) {
      projectStateText += `\nThe contents of this top-level directory: \n${this.projectState.folderStructure}`;
    }

    projectStateText +=
      '\n\nDo not provide created or updated code and do not include function call name that you will use in the message content, only in the function call arguments. Do not provide instructions how to complete the task to user, instead always call a function yourself. Do not stop until all requirements are completed and everything is fully functional.';
    projectStateText += this.projectHandler.getCustomInstructions();
    return projectStateText;
  }

  addAssistantMessages(apiResponseMessage) {
    const messageContent = apiResponseMessage.content;

    if (!apiResponseMessage.function_call && messageContent) {
      chatController.chat.addMessage('assistant', messageContent);
      return;
    }
    if (!apiResponseMessage.function_call) {
      return;
    }

    const functionName = apiResponseMessage.function_call.name;
    const args = this.parseArguments(apiResponseMessage.function_call);
    let codeToShow = '';
    let commandDescription = '';

    switch (functionName) {
      case 'create_or_overwrite_file':
        commandDescription = `Creating a file ${args.targetFile}`;
        codeToShow = `\n\n\`\`\`\n${args.createText}\n\`\`\``;
        break;
      case 'replace':
        commandDescription = `Updating ${args.targetFile}`;
        for (const change of args.items) {
          codeToShow += `\n\nReplacing:\n\`\`\`\n${change.findString}\n\`\`\`` + `\n\nWith:\n\`\`\`\n${change.replaceWith}\n\`\`\``;
        }
        break;
      case 'read':
        commandDescription = `Reading files ${args.targetFiles.join(', ')}`;
        break;
      case 'shell':
        commandDescription = 'Executing shell command:';
        codeToShow = `\n\n\`\`\`console\n${args.command}\n\`\`\``;
        break;
      case 'search_code':
        commandDescription = `Searching project code for: '${args.query}'`;
        break;
      case 'search_google':
        commandDescription = `Searching web for: '${args.queries[0]}'`;
        break;
      case 'search_url':
        commandDescription = `Fetching webpage`;
        break;
      default:
        console.error(`Unsupported function ${functionName}`);
    }

    chatController.chat.addBackendMessage('assistant', apiResponseMessage.content, apiResponseMessage.function_call);
    chatController.chat.addFrontendMessage('assistant', `${apiResponseMessage.content ? apiResponseMessage.content : commandDescription}\n${codeToShow}`);
  }
}

module.exports = CodeAgent;
