import { app, BrowserWindow, Menu, shell } from 'electron';
import { captureFromStandardInput } from '../src/capture.js';
import { createDesktopHookCommand, installHook } from '../src/hooks.js';
import { startServer } from '../src/server.js';

const captureMode = process.argv.includes('--capture-hook');

if (captureMode) {
  try {
    await captureFromStandardInput();
  } catch (error) {
    process.stderr.write(`PromptTrail capture error: ${error.message}\n`);
  }
  process.stdout.write('{}');
  process.exit(0);
}

let mainWindow;
let localServer;
let dashboardUrl;
let isQuitting = false;

function createApplicationMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'PromptTrail',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f0ebe2',
    transparent: process.platform === 'darwin',
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== dashboardUrl && !url.startsWith(`${dashboardUrl}#`)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`${dashboardUrl}/?desktop=1&platform=${process.platform}`);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setName('PromptTrail');
    createApplicationMenu();
    const started = await startServer({ port: 0 });
    localServer = started.server;
    dashboardUrl = started.url;

    if (app.isPackaged) {
      const executablePath = process.env.APPIMAGE || process.execPath;
      try {
        installHook({ command: createDesktopHookCommand({ executablePath }) });
      } catch (error) {
        process.stderr.write(`PromptTrail hook install error: ${error.message}\n`);
      }
    }
    createWindow();

    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  }).catch((error) => {
    process.stderr.write(`PromptTrail desktop error: ${error.message}\n`);
    app.quit();
  });
}

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isQuitting) app.quit();
});
app.on('will-quit', () => {
  if (localServer?.listening) localServer.close();
});
