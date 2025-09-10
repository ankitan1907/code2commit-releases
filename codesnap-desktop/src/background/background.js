// Service worker for CodeSnap extension
class GitHubAPI {
  constructor() {
    this.baseURL = 'https://api.github.com';
  }

  async getStoredToken() {
    const result = await chrome.storage.local.get(['github_token']);
    return result.github_token;
  }

  async storeToken(token) {
    await chrome.storage.local.set({ github_token: token });
    return { success: true };
  }

  async getUserRepos() {
    const token = await this.getStoredToken();
    if (!token) {
      throw new Error('No GitHub token found');
    }

    try {
      const response = await fetch(`${this.baseURL}/user/repos?sort=updated&per_page=100`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid token. Please check your GitHub token.');
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const repos = await response.json();
      return repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        html_url: repo.html_url
      }));
    } catch (error) {
      console.error('GitHub API error:', error);
      throw error;
    }
  }

  async pushToRepo(owner, repo, path, content, message) {
    const token = await this.getStoredToken();
    if (!token) throw new Error('No GitHub token found');

    try {
      // Check if file exists
      let sha = null;
      try {
        const existingFileResponse = await fetch(
          `${this.baseURL}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'X-GitHub-Api-Version': '2022-11-28'
            }
          }
        );

        if (existingFileResponse.ok) {
          const fileData = await existingFileResponse.json();
          sha = fileData.sha;
        }
      } catch (e) {
        // File doesn't exist, which is fine
      }

      // Encode content to base64
      const encoder = new TextEncoder();
      const encodedContent = encoder.encode(content);
      let base64Content = '';
      for (let i = 0; i < encodedContent.length; i++) {
        base64Content += String.fromCharCode(encodedContent[i]);
      }
      const contentBase64 = btoa(base64Content);

      const body = {
        message: message,
        content: contentBase64,
        ...(sha && { sha: sha })
      };

      const response = await fetch(
        `${this.baseURL}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify(body)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `GitHub API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Push to repo error:', error);
      throw error;
    }
  }
}

class PlatformDetector {
  static detectPlatform(url) {
    const hostname = new URL(url).hostname.toLowerCase();
    
    const platforms = {
      // Competitive Programming
      'leetcode.com': 'leetcode',
      'geeksforgeeks.org': 'geeksforgeeks',
      'hackerrank.com': 'hackerrank',
      'codechef.com': 'codechef',
      'codeforces.com': 'codeforces',
      'atcoder.jp': 'atcoder',
      'topcoder.com': 'topcoder',
      'spoj.com': 'spoj',
      'codewars.com': 'codewars',
      'exercism.org': 'exercism',
      
      // Development Platforms
      'github.com': 'github',
      'gitlab.com': 'gitlab',
      'bitbucket.org': 'bitbucket',
      'stackoverflow.com': 'stackoverflow',
      'stackblitz.com': 'stackblitz',
      'codesandbox.io': 'codesandbox',
      'codepen.io': 'codepen',
      'replit.com': 'replit',
      'glitch.com': 'glitch',
      
      // Learning Platforms
      'freecodecamp.org': 'freecodecamp',
      'codecademy.com': 'codecademy',
      'coursera.org': 'coursera',
      'udemy.com': 'udemy',
      'pluralsight.com': 'pluralsight',
      'edx.org': 'edx',
      'khanacademy.org': 'khanacademy',
      
      // Documentation & Tutorials
      'developer.mozilla.org': 'mdn',
      'w3schools.com': 'w3schools',
      'tutorialspoint.com': 'tutorialspoint',
      'javatpoint.com': 'javatpoint',
      
      // Specialized Platforms
      'kaggle.com': 'kaggle',
      'colab.research.google.com': 'colab',
      'jupyter.org': 'jupyter',
      'observablehq.com': 'observable',
      'medium.com': 'medium',
      'dev.to': 'dev-to'
    };

    for (const domain in platforms) {
      if (hostname.includes(domain)) {
        return platforms[domain];
      }
    }

    return 'unknown';
  }

  static detectLanguage(code) {
    // Python
    if (/^(import |from |def |class |if __name__|print\()/m.test(code)) return 'python';
    if (/^\s*(#.*)?[\n\r]*\s*(import|from|def|class)/m.test(code)) return 'python';
    
    // JavaScript
    if (/^(const |let |var |function |=>)/m.test(code)) return 'javascript';
    if (/(console\.log|document\.|window\.|function\s*\()/m.test(code)) return 'javascript';
    
    // TypeScript
    if (/^(interface |type |enum )/m.test(code)) return 'typescript';
    if (/(: string|: number|: boolean|<.*>)/m.test(code)) return 'typescript';
    
    // Java
    if (/^(public class|import java\.|System\.out)/m.test(code)) return 'java';
    if (/(public static void main|class.*{)/m.test(code)) return 'java';
    
    // C++
    if (/(#include|using namespace|int main|cout\s*<<)/m.test(code)) return 'cpp';
    if (/^#include\s*<.*>/m.test(code)) return 'cpp';
    
    // C
    if (/(#include.*\.h|int main|printf)/m.test(code)) return 'c';
    if (/^#include\s*<(stdio|stdlib|string)\.h>/m.test(code)) return 'c';
    
    // C#
    if (/(using System|public class|Console\.WriteLine)/m.test(code)) return 'csharp';
    if (/^using\s+System/m.test(code)) return 'csharp';
    
    // Go
    if (/^(package |import |func |var )/m.test(code)) return 'go';
    if (/(fmt\.Print|func main)/m.test(code)) return 'go';
    
    // Rust
    if (/^(use |fn |let |mod )/m.test(code)) return 'rust';
    if (/(println!|fn main)/m.test(code)) return 'rust';
    
    // PHP
    if (/^<\?php|^\$|function.*\(/m.test(code)) return 'php';
    if (/(\$_GET|\$_POST|echo|print)/m.test(code)) return 'php';
    
    // Ruby
    if (/^(require |class |def |module )/m.test(code)) return 'ruby';
    if (/(puts|print|p\s)/m.test(code)) return 'ruby';
    
    // Swift
    if (/^(import |class |struct |func )/m.test(code)) return 'swift';
    if (/(print\(|var |let )/m.test(code)) return 'swift';
    
    // SQL
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)/i.test(code)) return 'sql';
    if (/(FROM|WHERE|JOIN|GROUP BY)/i.test(code)) return 'sql';
    
    // HTML
    if (/^<!DOCTYPE html|^<html|^<div|^<span|^<p/m.test(code)) return 'html';
    if (/<\w+.*>/m.test(code)) return 'html';
    
    // CSS
    if (/^(\.|#|@|\/\*)/m.test(code)) return 'css';
    if (/(color:|font-|margin:|padding:)/m.test(code)) return 'css';
    
    // Bash
    if (/^(#!\/bin\/bash|echo |grep |awk )/m.test(code)) return 'bash';
    if (/(\$\{|\$\(|if \[)/m.test(code)) return 'bash';

    return 'txt';
  }

  static getFileExtension(language) {
    const extensions = {
      'python': 'py',
      'javascript': 'js',
      'typescript': 'ts',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'csharp': 'cs',
      'go': 'go',
      'rust': 'rs',
      'php': 'php',
      'ruby': 'rb',
      'swift': 'swift',
      'kotlin': 'kt',
      'scala': 'scala',
      'r': 'r',
      'matlab': 'm',
      'html': 'html',
      'css': 'css',
      'sql': 'sql',
      'bash': 'sh',
      'powershell': 'ps1',
      'dockerfile': 'dockerfile',
      'yaml': 'yml',
      'json': 'json',
      'xml': 'xml',
      'markdown': 'md'
    };

    return extensions[language] || 'txt';
  }

  static sanitizeTitle(title) {
    return title
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 50)
      .replace(/^-+|-+$/g, '');
  }

  static generateFilePath(pageTitle, pageUrl, language) {
    const platform = this.detectPlatform(pageUrl);
    const sanitizedTitle = this.sanitizeTitle(pageTitle) || 'code-snippet';
    const extension = this.getFileExtension(language);
    
    return `${platform}/${sanitizedTitle}.${extension}`;
  }
}

class CodeSnap {
  constructor() {
    this.gitHub = new GitHubAPI();
    this.setupListeners();
    this.createContextMenu();
  }

  setupListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep the message channel open for async response
    });

    chrome.commands.onCommand.addListener((command) => {
      if (command === 'push-selected') {
        this.handleKeyboardShortcut();
      }
      // Add new command for clipboard push
      if (command === 'push-clipboard') {
        this.handleClipboardShortcut();
      }
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'push-to-github') {
        this.handleContextMenuClick(info, tab);
      }
    });
  }

  async handleClipboardShortcut() {
    try {
      // Read clipboard content by asking the active tab to read it
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Inject content script if needed
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contentScript.js']
        });
      } catch (e) {
        // Script might already be injected
      }
      
      // Ask the content script to read clipboard content
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'read-clipboard'
      });
      
      if (response && response.success && response.text && response.text.trim()) {
        // Show confirmation dialog
        await chrome.tabs.sendMessage(tab.id, {
          action: 'show-confirmation',
          data: {
            code: response.text,
            pageTitle: tab.title,
            pageUrl: tab.url,
            fromClipboard: true
          }
        });
      } else {
        this.showNotification('Error', 'Clipboard is empty or could not be read', 'basic');
      }
    } catch (error) {
      console.error('Clipboard shortcut error:', error);
      this.showNotification('Error', 'Failed to read clipboard: ' + error.message, 'basic');
    }
  }

  async handleKeyboardShortcut() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      // Inject content script if needed
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['contentScript.js']
        });
      } catch (e) {
        // Script might already be injected
      }
      
      // Get selected text with better detection
      const selectedText = await this.getSelectedText(tab.id);
      
      if (selectedText) {
        await this.showConfirmationDialog(tab, selectedText);
      } else {
        this.showNotification('No text selected', 'Please select some text to push to GitHub.', 'basic');
      }
    } catch (error) {
      this.showNotification('Error', error.message, 'basic');
    }
  }

  async getSelectedText(tabId) {
    try {
      // Use a more reliable method to get selected text
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Try multiple methods to get selected text
          if (window.getSelection().toString().trim()) {
            return window.getSelection().toString().trim();
          }
          
          // Check for textarea/input selections
          const activeElement = document.activeElement;
          if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
            return activeElement.value.substring(
              activeElement.selectionStart,
              activeElement.selectionEnd
            ).trim();
          }
          
          return '';
        }
      });
      
      return results[0]?.result || '';
    } catch (error) {
      console.error('Error getting selected text:', error);
      return '';
    }
  }

  createContextMenu() {
    // Check if context menu already exists before creating
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'push-to-github',
        title: 'Push Code to GitHub',
        contexts: ['selection']
      });
    });
  }

   async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'get-repos':
          try {
            const repos = await this.gitHub.getUserRepos();
            sendResponse({ success: true, repos });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'push-code':
          try {
            const result = await this.gitHub.pushToRepo(
              request.data.owner,
              request.data.repo,
              request.data.path,
              request.data.content,
              request.data.message
            );
            sendResponse({ success: true, result });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'store-token':
          try {
            const result = await this.gitHub.storeToken(request.token);
            sendResponse({ success: true, result });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'get-token':
          try {
            const token = await this.gitHub.getStoredToken();
            sendResponse({ success: true, token });
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleContextMenuClick(info, tab) {
    try {
      if (info.selectionText) {
        await this.showConfirmationDialog(tab, info.selectionText);
      }
    } catch (error) {
      this.showNotification('Error', error.message, 'basic');
    }
  }

  async showConfirmationDialog(tab, selectedText) {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'show-confirmation',
      data: {
        code: selectedText,
        pageTitle: tab.title,
        pageUrl: tab.url
      }
    });
  }

  async pushCode(data) {
    const { owner, repo, path, content, message } = data;
    
    try {
      const result = await this.gitHub.pushToRepo(owner, repo, path, content, message);
      
      this.showNotification(
        'Success!', 
        `Code pushed to ${owner}/${repo}`,
        'basic'
      );
      
      return result;
    } catch (error) {
      this.showNotification(
        'Push Failed', 
        error.message,
        'basic'
      );
      throw error;
    }
  }

  showNotification(title, message, type = 'basic') {
    chrome.notifications.create({
      type,
      iconUrl: 'icons/icon48.png',
      title,
      message
    });
  }
}

// Initialize the extension
const codeSnap = new CodeSnap();