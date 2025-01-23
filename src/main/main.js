import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import winston from 'winston';


let mainWindow;
let settingsWindow;
let store;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue'
    }
};

const logger = winston.createLogger({
    level: customLevels.levels,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: path.join(__dirname, 'app.log'), level: 'debug' }),
        new winston.transports.Console()
    ]
});

winston.addColors(customLevels.colors);

app.on('ready', async () => {
    const { default: Store } = await import('electron-store');
    store = new Store();
    mainWindow = createMainWindow();
    setupIPC();

    logger.info('Application started.');
    autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on('update-available', () => {
    logger.info('Update available.');
});

autoUpdater.on('update-downloaded', () => {
    logger.info('Update downloaded. Will install now...');
    autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (error) => {
    logger.error('Update error:', error);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (!mainWindow) mainWindow = createMainWindow();
});

app.on('uncaughtException', function (error) {
    logger.error('Uncaught exception:', error);
    app.quit();
});

/**
 * Creates the main application window.
 */
function createMainWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            devTools: false,
        },
    });

    win.loadFile(path.join(__dirname, '../renderer/views/index.html'));

    // Remove menu bar for a cleaner look
    win.setMenuBarVisibility(false);

    return win;
}

/**
 * Creates the settings window.
 */
function createSettingsWindow() {
    if (settingsWindow) return;

    settingsWindow = new BrowserWindow({
        width: 600,
        height: 400,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            devTools: false,
        },
    });

    settingsWindow.loadFile(path.join(__dirname, '../renderer/views/settings.html'));
    settingsWindow.setMenuBarVisibility(false);

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

/**
 * Sets up IPC communication between the main process and renderer processes.
 */
function setupIPC() {
    ipcMain.on('open-settings', () => {
        createSettingsWindow();
    });

    ipcMain.handle('open-external', (event, url) => {
        event.preventDefault();
        shell.openExternal(url);
    });

    ipcMain.handle('fetch-match-data', async (_, matchLink) => {
        return fetchMatchData(matchLink); // Assume fetchMatchData is implemented elsewhere
    });

	ipcMain.handle('settings:get', async (event, key) => {
		return loadSettings(key, ''); // Provide a default empty string if key does not exist
	});
	
	ipcMain.handle('settings:set', async (event, key, value) => {
		saveSettings(key, value); // Save the key-value pair
		return true;
	});
	
	ipcMain.on('settings:close', (event) => {
		const win = BrowserWindow.getFocusedWindow();
		if (win) win.close();
	});

    ipcMain.on('log-message', (event, level, message) => {
        logger.log({ level, message });
    });
}

/**
 * Loads application settings from a local file.
 * @param {string} key The key for the setting to retrieve.
 */
function loadSettings(key) {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        if (!fs.existsSync(settingsPath)) return null;

        const settings = JSON.parse(fs.readFileSync(settingsPath));
        return settings[key] || null;
    } catch (error) {
        logger.error('Error loading settings:', error);
        return null;
    }
}

/**
 * Saves application settings to a local file.
 * @param {string} key The key for the setting to save.
 * @param {*} value The value to save for the setting.
 */
function saveSettings(key, value) {
    try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        let settings = {};

        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath));
        }

        settings[key] = value;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
        logger.error('Error saving settings:', error);
    }
}

