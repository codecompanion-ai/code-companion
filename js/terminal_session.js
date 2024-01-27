const path = require('path');
const fs = require('graceful-fs');
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const { CanvasAddon } = require('xterm-addon-canvas');
const { Unicode11Addon } = require('xterm-addon-unicode11');
const interact = require('interactjs');
const { ipcRenderer, shell } = require('electron');
const { debounce } = require('lodash');
const { withTimeout } = require('./utils');

let FIXED_PROMPT = '\x91\x91\x91';
const PROMPT_TIMEOUT = 1000;

class TerminalSession {
  constructor() {
    this.terminal = null;
    this.outputData = '';
    this.commandBuffer = '';
    this.previousBuffer = '';
    this.fitAddon = new FitAddon();
    this.shellType = null;
    this.needToUpdateWorkingDir = false;
  }

  createShellSession() {
    if (!this.terminal) {
      this.createTerminal();
      this.handleTerminalResize();
    } else {
      this.interruptShellSession();
      this.clearTerminal();
    }
  }

  createTerminal() {
    //Added try-catch to handle potential exceptions
    try{
      this.terminal = new Terminal({
        fontFamily: 'FiraCodeNerdFont, monospace',
        fontWeight: 'normal',
        fontSize: 12,
        letterSpacing: 0,
        lineHeight: 1.25,
        rows: 12,
        windowsMode: isWindows,
        allowProposedApi: true,
        overviewRulerWidth: 20,
        theme: {
          foreground: '#c0c0c0',
          background: '#222222',
          black: '#000000',
          red: '#C51E14',
          green: '#DAA520',
          yellow: '#C7C329',
          blue: '#0A2FC4',
          magenta: '#C839C5',
          cyan: '#20C5C6',
          white: '#C7C7C7',
          lightRed: '#c0c0c0',
          lightGreen: '#20B2AA',
          lightYellow: '#708090',
          lightBlue: '#ba0e2e',
          lightMagenta: '#DAA520',
          lightCyan: '#008b8b',
          lightWhite: '#ba0e2e',
          lightBlack: '#708090',
        },
      });

      this.terminal.open(document.getElementById('terminal_output'));
      this.terminal.loadAddon(this.fitAddon);
      this.terminal.loadAddon(
        new WebLinksAddon((event, uri) => {
          shell.openExternal(uri);
        }),
      );
      this.terminal.loadAddon(new Unicode11Addon());
      this.terminal.unicode.activeVersion = '11';

      const terminalOutputHeight = settings.get('terminalOutputHeight');
      if (terminalOutputHeight) {
        document.querySelector('#terminal_output').style.height = `${terminalOutputHeight}px`;
      }

      ipcRenderer.send('start-shell', {
        cwd: chatController.codeAgent.currentWorkingDir,
      });
      ipcRenderer.on('shell-type', (event, data) => {
        this.shellType = data;
        chatController.chat.replaceSystemMessagePlaceholder('{shellType}', this.shellType);
        this.setPrompt();
      });
      ipcRenderer.on('shell-data', (event, data) => {
        this.writeToTerminal(data);
      });
      this.terminal.onData((data) => this.writeToShell(data));
    } catch(error) {
      console.error('Error while creating terminal:', error);
    }
  }

  clearTerminal() {
    //Added confirmation if terminal exists before clearing
    if(this.terminal){
      this.writeToShell('clear\r');
      this.terminal.clear();
    } else {
      console.error("Terminal doesn't exists.");
    }
  }

  async setPrompt(doNotClear = false) {
    try {
      switch (this.shellType) {
        case 'bash':
          this.writeToShell(`PROMPT_COMMAND='echo -n "${FIXED_PROMPT}"'\r`);
          break;
        case 'zsh':
          this.writeToShell(`precmd() { echo -n "${FIXED_PROMPT}"; }\r`);
          break;
        case 'fish':
          this.writeToShell('functions --copy fish_prompt original_fish_prompt\r');
          this.writeToShell(`function fish_prompt; original_fish_prompt; echo -n "${FIXED_PROMPT}"; end\r`);
          break;
        case 'powershell.exe':
          FIXED_PROMPT = 'CodeCompanion.AI: ';
          this.writeToShell(`function prompt { '${FIXED_PROMPT}' + (Get-Location) + '> ' }\r`);
          break;
        default:
          console.error(`Unsupported shell ${this.shellType}`);
      }
      if (!doNotClear) {
        setTimeout(() => {
          this.clearTerminal();
          this.resizeTerminalWindow();
        }, PROMPT_TIMEOUT);
      }
    } catch (error) {
      console.error('Error while setting prompt in terminal:', error);
    }
  }

  resizeTerminalWindow() {
    //Confirmed terminal exists
    if (this.terminal) {
      this.fitAddon.fit();
      ipcRenderer.send('resize-shell', {
        cols: this.terminal.cols,
        rows: this.terminal.rows,
      });
    } else {
      console.error("Terminal doesn't exists.");
    }
  }

  handleTerminalResize() {
    try {
      this.terminalOutput = document.querySelector('#terminal_output');
      this.debounceResizeTerminalWindow = debounce(this.resizeTerminalWindow.bind(this), 200);

      interact('#terminal_resize_handle').draggable({
        cursorChecker() {
          return 'ns-resize';
        },
        lockAxis: 'y',
        listeners: {
          move: (event) => {
            const newHeight = parseInt(window.getComputedStyle(this.terminalOutput).height) - event.dy;
            this.terminalOutput.style.height = `${newHeight}px`;
            settings.set('terminalOutputHeight', newHeight);
            this.debounceResizeTerminalWindow();
          },
        },
      });
    } catch (error) {
      console.error('Error while handling terminal resize:', error);
    }
  }

  interruptShellSession() {
    this.writeToShell('\x03');
  }

  writeToShell(data) {
    ipcRenderer.send('write-shell', data);
  }

  writeToTerminal(data) {
    try {
      this.terminal.write(data);

      this.commandBuffer += this.removeASCII(data);
      if (data.toString().endsWith('\r') || data.toString().endsWith('\n') || data.toString().endsWith('\r\n')) {
        const command = this.commandBuffer.trim();
        this.commandBuffer = '';
        if (command.match(/cd\s+(\S+)/i)) {
          this.needToUpdateWorkingDir = true;
        }
      }
    } catch(error) {
      console.error('Error while writing to terminal:', error);
    }
  }

  executeCommandWithoutOutput(command) {
    ipcRenderer.send('execute-command', command);
  }

  getTerminalOutput(command) {
    //Added try-catch to handle potential exceptions
    try {
      const buffer = this.terminal.buffer.active;
      const startLine = Math.max(buffer.length - 30, 0);
      let lines = [];
      let commandLine = 0;
      let lineNumber = 0;

      for (let i = startLine; i < buffer.length; i++) {
        const lineContent = buffer.getLine(i).translateToString(true);
        if (lineContent.trim() !== '') {
          lines.push(lineContent);
          lineNumber++;
          if (lineContent.endsWith(command)) {
            commandLine = lineNumber;
          }
        }
      }
      lines = lines.slice(commandLine, lines.length - 1);
      return lines.join('\n');
    } catch(error) {
      console.error('Error while getting terminal output:', error);
    }
  }

  async executeShellCommand(command) {
    return new Promise((resolve, reject) => {
      this.outputData = '';

      const shellDataListener = (event, data) => {
        this.outputData += data;

        if (this.outputData.includes(FIXED_PROMPT)) {
          ipcRenderer.removeListener('shell-data', shellDataListener);

          const bufferCheckInterval = setInterval(() => {
            const currentBuffer = this.terminal.buffer.active;
            if (currentBuffer === this.previousBuffer) {
              clearInterval(bufferCheckInterval);
              resolve(this.getTerminalOutput(command));
            } else {
              this.previousBuffer = currentBuffer;
            }
          }, 200);
        }
      };

      ipcRenderer.on('shell-data', shellDataListener);
      this.writeToShell(`${command}\r`);
    });
  }

  removeASCII(data) {
    return data.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  }

  async navigateToDirectory(dir) {
    // Added error handling for any rejected promise
    try {
      await this.executeShellCommand(`cd "${dir}"`)
      chatController.codeAgent.currentWorkingDir = dir;
      this.needToUpdateWorkingDir = false;
    } catch(err) {
      console.error(`Error navigating to directory: ${err}`);
    }  
  }

  async getCurrentDirectory() {
    if (!this.needToUpdateWorkingDir) {
      return chatController.codeAgent.currentWorkingDir;
    }

    let dir;
    try {
      dir = await withTimeout(await this.executeShellCommand('pwd'), 500);
    } catch (error) {
      // attempt to cancel running command first
      try {
        this.interruptShellSession();
        dir = await withTimeout(await this.executeShellCommand('pwd'), 500);
      } catch (error) {
        try {
          this.setPrompt(true);
        } catch (error) {
          chatController.chat.addFrontendMessage('error', 'Error occured when checking current directory path');
          return;
        }
      }
    }

    const lines = dir.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (this.directoryExists(lines[i])) {
        chatController.codeAgent.currentWorkingDir = lines[i];
        this.needToUpdateWorkingDir = false;
        return chatController.codeAgent.currentWorkingDir;
      }
    }

    chatController.chat.addFrontendMessage('error', 'Error occured when checking current directory path');
  }

  directoryExists(dirPath) {
    try {
      return fs.existsSync(path.normalize(dirPath));
    } catch (error) {
      console.error(`Error checking if directory exists [${dirPath}]: ${error}`);
      return false;
    }
  }
}

module.exports = TerminalSession;