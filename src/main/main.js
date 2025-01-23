import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import bristol from 'bristol';


let mainWindow;
let settingsWindow;
let store;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appdataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
const logPath = path.join(appdataPath, '\\r4g-faceit-stats', '\\app.log');

app.on('ready', async () => {
    const { default: Store } = await import('electron-store');
    store = new Store();
    mainWindow = createMainWindow();
    setupIPC();

    bristol.addTarget('console').withFormatter('human').withLowestSeverity('debug');

    fs.exists(logPath, function (exists) {
        if(!exists)
        {
            fs.writeFile(logPath, {flag: 'wx'}, function (err, data) 
            { 
            });
        }
    });

    bristol.addTarget('file', { file: logPath });
    bristol.info('Application started.');
    autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on('update-available', () => {
    bristol.info('Update available.');
});

autoUpdater.on('update-downloaded', () => {
    bristol.info('Update downloaded. Will install now...');
    autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (error) => {
    bristol.error('Update error:', error);
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (!mainWindow) mainWindow = createMainWindow();
});

app.on('uncaughtException', function (error) {
    bristol.error('Uncaught exception:', error);
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
        if(level == 'error')
            bristol.error(message);
        if(level == 'warn')
            bristol.warn(message);
        if(level == 'info')
            bristol.info(message);
        if(level == 'debug')
            bristol.debug(message);
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
        bristol.error('Error loading settings:', error);
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
        bristol.error('Error saving settings:', error);
    }
}

