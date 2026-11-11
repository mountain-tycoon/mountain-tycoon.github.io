/* global process */
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    if (process.env.NODE_ENV === 'development') {
        console.log('Running in development mode');
        console.log('Loading URL: http://localhost:7777');
        win.loadURL('http://localhost:7777');
        win.webContents.openDevTools();
    } else {
        console.log('Running in production mode');
        const indexPath = path.join(__dirname, '../dist/index.html');
        console.log(`Loading File: ${indexPath}`);
        win.loadFile(indexPath);
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
