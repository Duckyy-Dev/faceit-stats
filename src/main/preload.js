const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Opens the settings window
    openSettings: () => ipcRenderer.send('open-settings'),

    // Loads a specific setting
    loadSetting: (key) => ipcRenderer.invoke('settings:get', key),

    // Saves a specific setting
    saveSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

    // Opens an external URL in the default browser
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Fetches match data from the backend
    fetchMatchData: (matchLink) => ipcRenderer.invoke('fetch-match-data', matchLink),

    // Listens for any updates for long-running tasks or operations
    on: (channel, callback) => {
        const validChannels = ['loading-status', 'operation-complete'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (_, ...args) => callback(...args));
        }
    },

    // Removes listeners for the specified channel
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },
});
