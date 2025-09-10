const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Authentication - matches your main.js handlers
    startOAuth: () => ipcRenderer.invoke('startOAuth'),
    getToken: () => ipcRenderer.invoke('get-token'),
    clearToken: () => ipcRenderer.invoke('clear-token'),
    
    // First use flag - matches your main.js handlers  
    getFirstUseFlag: () => ipcRenderer.invoke('get-first-use-flag'),
    setFirstUseFlag: (flag) => ipcRenderer.invoke('set-first-use-flag', flag),
    
    // Repositories - matches your main.js handlers
    getUserRepos: () => ipcRenderer.invoke('get-user-repos'),
    saveCodeToRepo: (repoName, filePath, commitMessage, codeContent) => 
        ipcRenderer.invoke('save-code-to-repo', repoName, filePath, commitMessage, codeContent),
    
    // Clipboard
    readClipboard: () => ipcRenderer.invoke('read-clipboard'),
    
    // Window management
    keepWindowOpen: () => ipcRenderer.invoke('keep-window-open'),
    
    // Events - matches your main.js sender
    onShowModal: (callback) => ipcRenderer.on('show-modal-with-content', callback),
    
    // Debug method
    testConnection: () => {
        console.log('Electron API connection test');
        return Promise.resolve({ success: true, message: 'API is connected' });
    }
});