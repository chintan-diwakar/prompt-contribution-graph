import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, ipcMain, Menu, ShareMenu, shell } from 'electron';
import { captureFromStandardInput } from '../src/capture.js';
import { DISPLAY_NAME } from '../src/config.js';
import { createDesktopHookCommand, installHook } from '../src/hooks.js';
import { startServer } from '../src/server.js';
import { buildXIntent, normalizeCaptureRect, screenshotFileName } from './share-utils.js';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectUrl = 'https://github.com/chintan-diwakar/prompt-contribution-graph';

const captureMode = process.argv.includes('--capture-hook');

if (captureMode) {
  try {
    await captureFromStandardInput();
  } catch (error) {
    process.stderr.write(`${DISPLAY_NAME} capture error: ${error.message}\n`);
  }
  process.stdout.write('{}');
  process.exit(0);
}

let mainWindow;
let localServer;
let dashboardUrl;
let isQuitting = false;
let activeShareMenu;

function safeShareText(value) {
  return String(value || `My coding-agent activity with ${DISPLAY_NAME}.`).slice(0, 500);
}

async function shareActivity(event, payload = {}) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner !== mainWindow || !event.sender.getURL().startsWith(dashboardUrl)) {
    throw new Error(`${DISPLAY_NAME} rejected an unknown share request.`);
  }

  const rect = normalizeCaptureRect(payload.rect, owner.getContentBounds());
  const image = await event.sender.capturePage(rect);
  if (image.isEmpty()) throw new Error(`${DISPLAY_NAME} could not capture the activity screen.`);

  const directory = path.join(app.getPath('pictures'), DISPLAY_NAME);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = path.join(directory, screenshotFileName());
  await fs.promises.writeFile(filePath, image.toPNG(), { mode: 0o600 });
  const text = safeShareText(payload.text);

  if (process.platform === 'darwin') {
    activeShareMenu = new ShareMenu({ texts: [text], filePaths: [filePath], urls: [projectUrl] });
    await new Promise((resolve) => activeShareMenu.popup({ browserWindow: owner, callback: resolve }));
    activeShareMenu = undefined;
    return { mode: 'native', filePath };
  }

  clipboard.writeImage(image);
  await shell.openExternal(buildXIntent(text, projectUrl));
  return { mode: 'x', filePath };
}

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
    title: DISPLAY_NAME,
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
      preload: path.join(desktopDirectory, 'preload.cjs'),
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
    app.setName(DISPLAY_NAME);
    ipcMain.handle('prompttrail:share-activity', shareActivity);
    createApplicationMenu();
    const started = await startServer({ port: 0 });
    localServer = started.server;
    dashboardUrl = started.url;

    if (app.isPackaged) {
      const executablePath = process.env.APPIMAGE || process.execPath;
      try {
        installHook({ command: createDesktopHookCommand({ executablePath }) });
      } catch (error) {
        process.stderr.write(`${DISPLAY_NAME} hook install error: ${error.message}\n`);
      }
    }
    createWindow();

    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  }).catch((error) => {
    process.stderr.write(`${DISPLAY_NAME} desktop error: ${error.message}\n`);
    app.quit();
  });
}

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || isQuitting) app.quit();
});
app.on('will-quit', () => {
  ipcMain.removeHandler('prompttrail:share-activity');
  if (localServer?.listening) localServer.close();
});
