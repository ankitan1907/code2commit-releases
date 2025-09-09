
require('dotenv').config();
const { app, BrowserWindow, globalShortcut, shell, ipcMain, clipboard, dialog } = require('electron');
app.disableHardwareAcceleration();

const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const http = require('http');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const exists = promisify(fs.exists);
const unlink = promisify(fs.unlink);

// DEBUG: Check if .env file exists and log all environment variables
const envPath = path.join(__dirname, '.env');
console.log('Looking for .env file at:', envPath);
console.log('File exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  console.log('Contents of .env file:');
  console.log(fs.readFileSync(envPath, 'utf8'));
}

console.log('All environment variables:');
Object.keys(process.env).forEach(key => {
  if (key.includes('GITHUB') || key.includes('GIT') || key.includes('CLIENT')) {
    console.log(`${key}: ${process.env[key] ? 'SET' : 'NOT SET'}`);
  }
});

// Use environment variables for security
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

console.log('CLIENT_ID:', CLIENT_ID ? '***SET***' : 'NOT SET');
console.log('CLIENT_SECRET:', CLIENT_SECRET ? '***SET***' : 'NOT SET');

// If environment variables are not set, provide a clear error
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ ERROR: GitHub OAuth credentials are missing!');
  console.error('Please create a .env file in the root directory with:');
  console.error('GITHUB_CLIENT_ID=your_client_id_here');
  console.error('GITHUB_CLIENT_SECRET=your_client_secret_here');
  
  // Show error dialog to user
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'Configuration Error', 
      'GitHub OAuth credentials are missing!\n\n' +
      'Please create a .env file in the application directory with:\n' +
      'GITHUB_CLIENT_ID=your_client_id\n' +
      'GITHUB_CLIENT_SECRET=your_client_secret'
    );
  });
}

const TOKEN_FILE_PATH = path.join(app.getPath('userData'), 'github-token.json');
const WELCOME_FLAG_PATH = path.join(app.getPath('userData'), 'welcome-flag.json');
let mainWindow;
let authWindow;
let authServer;

function createWindow() {
  // Determine the correct icon path based on platform
  let iconPath;
  if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'icons', 'icon.ico');
  } else if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'icons', 'icon.icns');
  } else {
    iconPath = path.join(__dirname, 'icons', 'icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 450,
    height: 650,
    show: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    icon: iconPath, // Set the custom icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    }
  });

  // Use the correct path to your HTML file - check both locations
  let htmlPath;
  const rootPopupPath = path.join(__dirname, 'popup.html');
  const srcPopupPath = path.join(__dirname, 'src', 'renderer', 'ui', 'popup.html');
  
  if (fs.existsSync(rootPopupPath)) {
    htmlPath = rootPopupPath;
  } else if (fs.existsSync(srcPopupPath)) {
    htmlPath = srcPopupPath;
  } else {
    console.error('❌ ERROR: Could not find popup.html in either location:');
    console.error('1.', rootPopupPath);
    console.error('2.', srcPopupPath);
    dialog.showErrorBox(
      'File Not Found', 
      'Could not find popup.html. Please make sure it exists in the application directory.'
    );
    return;
  }
  
  console.log('Loading HTML from:', htmlPath);
  mainWindow.loadFile(htmlPath);

  // Enable DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create a simple HTTP server to handle the OAuth callback
function createAuthServer() {
  return new Promise((resolve, reject) => {
    authServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head>
            <title>Authentication Complete</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; text-align: center; background: #0d1117; color: #e6edf3; }
              h1 { color: ${code ? '#3fb950' : '#ff7b72'}; }
              .success { color: #3fb950; }
              .error { color: #ff7b72}; }
            </style>
          </head>
          <body>
            <h1 class="${code ? 'success' : 'error'}">
              Authentication ${code ? 'Successful' : 'Failed'}
            </h1>
            <p>You can close this window and return to CodeSnap.</p>
            <script>
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `);

      if (error) {
        reject(new Error(`OAuth error: ${error}`));
      } else if (code) {
        resolve(code);
      } else {
        reject(new Error('No code received from GitHub'));
      }

      authServer.close();
    });

    authServer.listen(3457, '127.0.0.1', (err) => {
      if (err) {
        reject(err);
      }
    });
  });
}

async function createAuthWindow() {
  try {
    const serverPromise = createAuthServer();

    return new Promise((resolve, reject) => {
      authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        },
        parent: mainWindow,
        modal: true,
        title: 'GitHub Authentication - Code2Commit'
      });

      const authURL = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo&redirect_uri=http://localhost:3457`;
      console.log('Opening GitHub OAuth URL:', authURL);
      authWindow.loadURL(authURL);

      serverPromise.then(async (code) => {
        try {
          const response = await exchangeCodeForToken(code);
          if (response.success) {
            await storeToken(response.token);
            resolve({ success: true, token: response.token });
          } else {
            reject(new Error(response.error));
          }
        } catch (err) {
          reject(err);
        }
        if (authWindow) {
          authWindow.close();
        }
      }).catch(err => {
        reject(err);
        if (authWindow) {
          authWindow.close();
        }
      });

      authWindow.on('closed', () => {
        authWindow = null;
        if (authServer) {
          authServer.close();
        }
        reject(new Error('Authentication window was closed by user'));
      });
    });
  } catch (error) {
    throw new Error(`Failed to create auth window: ${error.message}`);
  }
}

async function exchangeCodeForToken(code) {
  try {
    console.log('Attempting OAuth token exchange with:');
    console.log('CLIENT_ID:', CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('CLIENT_SECRET:', CLIENT_SECRET ? 'SET' : 'NOT SET');
    console.log('Code received:', code ? 'YES' : 'NO');
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return { 
        success: false, 
        error: 'GitHub OAuth credentials are not configured. Please check your .env file.' 
      };
    }
    
    const response = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: 'http://localhost:3457'
    }, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Code2Commit-Electron-App'
      }
    });
    
    if (response.data.error) {
      return { success: false, error: response.data.error_description };
    }
    
    return { success: true, token: response.data.access_token };
  } catch (error) {
    console.error('Token exchange failed:', error);
    return { success: false, error: error.message };
  }
}

async function storeToken(token) {
  try {
    const data = JSON.stringify({ token: token, timestamp: Date.now() });
    await writeFile(TOKEN_FILE_PATH, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getToken() {
  try {
    if (await exists(TOKEN_FILE_PATH)) {
      const data = await readFile(TOKEN_FILE_PATH);
      const tokenData = JSON.parse(data);
      
      // Check if token is expired (older than 7 days for more reasonable expiry)
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (tokenData.timestamp && tokenData.timestamp < sevenDaysAgo) {
        await clearToken();
        return { success: false, error: 'Token expired' };
      }
      
      return { success: true, token: tokenData.token };
    }
    return { success: false, error: 'Token file does not exist' };
  } catch (error) {
    console.error('Failed to get token:', error);
    return { success: false, error: error.message };
  }
}

async function clearToken() {
  try {
    if (await exists(TOKEN_FILE_PATH)) {
      await unlink(TOKEN_FILE_PATH);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getFirstUseFlag() {
  try {
    if (await exists(WELCOME_FLAG_PATH)) {
      const data = await readFile(WELCOME_FLAG_PATH);
      const flag = JSON.parse(data);
      return { success: true, hasSeenWelcome: flag.hasSeenWelcome || false };
    }
    return { success: true, hasSeenWelcome: false };
  } catch (error) {
    console.error('Failed to get first use flag:', error);
    return { success: false, error: error.message };
  }
}

async function setFirstUseFlag(hasSeenWelcome = true) {
  const flag = { hasSeenWelcome: hasSeenWelcome, timestamp: Date.now() };
  try {
    await writeFile(WELCOME_FLAG_PATH, JSON.stringify(flag, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Failed to set first use flag:', error);
    return { success: false, error: error.message };
  }
}

function setupOAuthHandlers() {
  ipcMain.handle('startOAuth', async () => {
    try {
      const result = await createAuthWindow();
      return result;
    } catch (error) {
      console.error('OAuth failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-token', async () => await getToken());
  ipcMain.handle('clear-token', clearToken);
  ipcMain.handle('get-first-use-flag', getFirstUseFlag);
  ipcMain.handle('set-first-use-flag', (event, hasSeenWelcome = true) => {
    return setFirstUseFlag(hasSeenWelcome);
  });

  // Add the keep-window-open handler
  ipcMain.handle('keep-window-open', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    return { success: true };
  });

  ipcMain.handle('get-user-repos', async (event) => {
    try {
      const tokenData = await getToken();
      if (!tokenData.success) {
        return { success: false, error: 'User is not authenticated' };
      }
      
      const token = tokenData.token;
      const response = await axios.get('https://api.github.com/user/repos', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Code2Commit-Electron-App'
        },
        params: {
          per_page: 100,
          sort: 'updated',
          affiliation: 'owner,collaborator' // Only repos user can push to
        }
      });
      
      return {
        success: true,
        repos: response.data.map(repo => ({
          full_name: repo.full_name,
          name: repo.name,
          owner: repo.owner.login,
          private: repo.private,
          permissions: repo.permissions // Include permissions info
        }))
      };
    } catch (error) {
      console.error('Failed to get user repos:', error.response ? error.response.data : error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  });

  ipcMain.handle('save-code-to-repo', async (event, repoName, filePath, commitMessage, codeContent) => {
    try {
      const tokenData = await getToken();
      if (!tokenData.success) {
        return { success: false, error: 'User is not authenticated' };
      }
      
      const token = tokenData.token;
      const apiUrl = `https://api.github.com/repos/${repoName}/contents/${filePath}`;
      const base64Content = Buffer.from(codeContent).toString('base64');
      
      const payload = {
        message: commitMessage,
        content: base64Content,
        branch: 'main'
      };

      // Check if file exists and get its SHA
      let sha = null;
      try {
        const fileResponse = await axios.get(apiUrl, {
          headers: { 
            Authorization: `token ${token}`,
            'User-Agent': 'Code2Commit-Electron-App'
          }
        });
        sha = fileResponse.data.sha;
        payload.sha = sha;
      } catch (e) {
        // File doesn't exist, which is fine for new files
        if (e.response && e.response.status !== 404) {
          throw e;
        }
      }

      const commitResponse = await axios.put(apiUrl, payload, {
        headers: { 
          Authorization: `token ${token}`,
          'User-Agent': 'Code2Commit-Electron-App'
        }
      });
      
      return { 
        success: true, 
        url: commitResponse.data.commit.html_url,
        sha: commitResponse.data.content.sha 
      };
    } catch (error) {
      console.error('Push to repo failed:', error.response ? error.response.data : error.message);
      return { success: false, error: error.response?.data?.message || error.message };
    }
  });

  ipcMain.handle('read-clipboard', () => {
    try {
      return clipboard.readText();
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      return '';
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupOAuthHandlers();

  const ret = globalShortcut.register('CommandOrControl+Shift+V', async () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        const clipboardContent = clipboard.readText();
        if (clipboardContent && clipboardContent.trim()) {
          mainWindow.webContents.send('show-modal-with-content', clipboardContent);
        }
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  if (ret) {
    console.log('Global shortcut Ctrl+Shift+V registered successfully!');
  } else {
    console.log('ERROR: Global shortcut registration failed!');
    console.log('This might be because another application is using this shortcut.');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (authServer) {
    authServer.close();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});