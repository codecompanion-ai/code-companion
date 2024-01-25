const { app, BrowserWindow, globalShortcut, Menu, MenuItem, ipcMain, dialog, shell, systemPreferences, nativeTheme } = require('electron');

app.setName('CodeCompanion.AI');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const ElectronStore = require('electron-store');
const pty = require('node-pty');
const { debounce } = require('lodash');
const { initialize } = require('@aptabase/electron/main'); // for DAU tracking

ElectronStore.initRenderer();
const store = new ElectronStore();

let win;
let isUpdateInProgress = false;
let terminal;

if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
  setTimeout(() => {
    win.webContents.openDevTools();
  }, 1000);
}
initialize('A-US-5249376059');

function createWindow() {
  // window creation code

  ipcMain.on('gpt-4-vision', (event, command) => {
    // Handle GPT-4 Vision related IPC events here
  });
}

// rest of the code here...

// GPT-4 Vision related IPC event handlers
ipcMain.on('gpt-4-vision', (event, command) => {
  // Handle GPT-4 Vision related IPC events here
});
 
// rest of the existing code here...

app.commandLine.appendSwitch('disable-site-isolation-trials');

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Unhandled Error: ', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection: ', promise, ' reason: ', reason);
});