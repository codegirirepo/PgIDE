const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

function startBackend() {
  backendProcess = spawn('node', ['--loader', 'tsx', '../backend/src/index.ts'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe',
  });
  backendProcess.stdout?.on('data', d => console.log(`[backend] ${d}`));
  backendProcess.stderr?.on('data', d => console.error(`[backend] ${d}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'PgIDE - PostgreSQL IDE',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
}

app.whenReady().then(() => {
  startBackend();
  // Wait for backend to start
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
