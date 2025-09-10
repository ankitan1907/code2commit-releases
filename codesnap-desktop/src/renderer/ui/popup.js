// Enhanced popup.js with smart problem detection for Code2Commit

document.addEventListener('DOMContentLoaded', function() {
    const popupController = new PopupController();
});

class PopupController {
    constructor() {
        this.isAuthenticated = false;
        this.repositories = [];
        this.currentClipboardContent = '';
        this.currentUser = null;
        this.snippetsSaved = parseInt(localStorage.getItem('code2commit-solutions-committed') || '0');
        this.stats = {
            snippetsSaved: this.snippetsSaved,
            reposCount: 0
        };
        this.init();
    }

    async init() {
        console.log('Code2Commit initializing...');
        
        // Show landing screen first
        await this.showLandingScreen();
        
        // Then check auth and show appropriate view
        setTimeout(async () => {
            await this.checkAuthAndShowView();
            this.setupEventListeners();
            this.setupModalListeners();
            this.setupIPCListeners();
            this.startClipboardMonitoring();
        }, 1000);
    }

    async showLandingScreen() {
        return new Promise((resolve) => {
            // Landing screen is already visible
            setTimeout(() => {
                resolve();
            }, 1500);
        });
    }

    async checkAuthAndShowView() {
        try {
            const firstUseResult = await window.electronAPI.getFirstUseFlag();
            const hasSeenWelcome = firstUseResult.success ? firstUseResult.hasSeenWelcome : false;

            // Check if we have a valid token
            const tokenResponse = await window.electronAPI.getToken();

            if (tokenResponse.success && tokenResponse.token) {
                this.isAuthenticated = true;
                this.updateAuthStatus(true);
                this.showView('main-view');
                await this.loadRepositories();
                await this.loadUserProfile();
                this.addLogEntry('success', 'Successfully authenticated with GitHub');
                this.updateStats();
                this.addLogEntry('info', 'Welcome! Press Ctrl + Shift + V anytime to commit solutions intelligently.');
            } else if (hasSeenWelcome) {
                this.isAuthenticated = false;
                this.updateAuthStatus(false);
                this.showView('auth-view');
                this.addLogEntry('info', 'Please authenticate with GitHub to continue');
            } else {
                this.showView('welcome-view');
                this.addLogEntry('info', 'Welcome to Code2Commit!');
                this.animateFeatureCards();
            }
        } catch (error) {
            console.error('Failed to check auth status:', error);
            this.updateAuthStatus(false);
            this.showView('welcome-view');
            this.addLogEntry('error', 'An error occurred during startup: ' + error.message);
        }
    }

    // Smart Problem Detection Functions
    detectPlatformFromUrl(text) {
        const urlPatterns = {
            leetcode: {
                pattern: /(?:https?:\/\/)?(?:www\.)?leetcode\.com\/problems\/([^\/\s?#]+)/i,
                icon: 'fas fa-code',
                name: 'LeetCode'
            },
            geeksforgeeks: {
                pattern: /(?:https?:\/\/)?(?:www\.)?geeksforgeeks\.org\/(?:problems|practice)\/([^\/\s?#]+)/i,
                icon: 'fas fa-terminal',
                name: 'GeeksforGeeks'
            },
            hackerrank: {
                pattern: /(?:https?:\/\/)?(?:www\.)?hackerrank\.com\/challenges\/([^\/\s?#]+)/i,
                icon: 'fas fa-code-branch',
                name: 'HackerRank'
            },
            codechef: {
                pattern: /(?:https?:\/\/)?(?:www\.)?codechef\.com\/(?:problems|practice)\/([^\/\s?#]+)/i,
                icon: 'fas fa-utensils',
                name: 'CodeChef'
            },
            codeforces: {
                pattern: /(?:https?:\/\/)?(?:www\.)?codeforces\.com\/(?:contest\/\d+\/)?problem\/([^\/\s?#]+)/i,
                icon: 'fas fa-trophy',
                name: 'Codeforces'
            }
        };

        for (const [platform, config] of Object.entries(urlPatterns)) {
            const match = text.match(config.pattern);
            if (match) {
                return {
                    platform,
                    problemSlug: match[1],
                    config
                };
            }
        }
        return null;
    }

    extractProblemNameFromCode(code) {
        const lines = code.split('\n').slice(0, 30); // scan first 30 lines

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Check for explicit markers
            const markers = [/problem[:\-]/i, /question[:\-]/i, /title[:\-]/i];
            for (const marker of markers) {
                if (marker.test(trimmed)) {
                    const name = trimmed.replace(marker, '').trim();
                    if (this.isValidProblemName(name)) {
                        return this.cleanProblemName(name);
                    }
                }
            }

            // If problem name inside block comment
            const blockCommentMatch = trimmed.match(/\/\*+\s*(.+?)\s*\*+\//);
            if (blockCommentMatch && this.isValidProblemName(blockCommentMatch[1])) {
                return this.cleanProblemName(blockCommentMatch[1]);
            }

            // If single-line comment
            const commentMatch = trimmed.match(/\/\/\s*(.+)/);
            if (commentMatch && this.isValidProblemName(commentMatch[1])) {
                return this.cleanProblemName(commentMatch[1]);
            }

            // Function/method names that might indicate problem name
            const functionMatch = trimmed.match(/(?:function|def|class)\s+(\w+)/);
            if (functionMatch && this.isValidProblemName(functionMatch[1])) {
                return this.cleanProblemName(functionMatch[1]);
            }
        }

        return null;
    }

    isValidProblemName(name) {
        if (!name || typeof name !== 'string') return false;
        
        const trimmed = name.trim();
        if (trimmed.length < 3 || trimmed.length > 100) return false;
        if (/^\d+\.?\d*$/.test(trimmed) || /^[^\w\s]*$/.test(trimmed)) return false;
        
        const excludePatterns = [
            /^(solution|answer|code|program|algorithm|class|def|function|public|static|void|main)$/i,
            /^(author|name|date|time|version|import|include|using|from):/i,
            /^[{}()\[\]<>;=+*-]+$/,
            /^test/i,
            /^[a-z]$/i // single letter
        ];
        
        return !excludePatterns.some(pattern => pattern.test(trimmed));
    }

    cleanProblemName(name) {
        return name
            .replace(/^\d+\.?\s*/, '') // Remove leading numbers
            .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .toLowerCase()
            .trim();
    }

    detectLanguage(code) {
        const lowerCode = code.toLowerCase();
        const patterns = {
            'py': [/def\s+\w+/, /import\s+\w+/, /print\s*\(/, /class\s+\w+/, /if\s+__name__\s*==\s*['""]__main__['""]:/],
            'js': [/function\s+\w+/, /const\s+\w+\s*=/, /console\.log/, /=>\s*{/, /require\s*\(/],
            'java': [/public\s+class\s+\w+/, /public\s+static\s+void\s+main/, /System\.out\.print/, /import\s+java\./],
            'cpp': [/#include\s*<[\w.]+>/, /std::\w+/, /cout\s*<</, /cin\s*>>/, /int\s+main\s*\(/],
            'cs': [/using\s+System/, /public\s+class\s+\w+/, /Console\.Write/, /static\s+void\s+Main/],
            'rb': [/def\s+\w+/, /require\s+['"]/, /puts\s+/, /class\s+\w+/],
            'php': [/<\?php/, /function\s+\w+/, /echo\s+/, /require_once/],
            'go': [/func\s+\w+/, /package\s+\w+/, /fmt\.Print/, /import\s+['"]/],
            'rs': [/fn\s+\w+/, /println!/, /use\s+std::/, /struct\s+\w+/],
            'ts': [/function\s+\w+/, /const\s+\w+\s*:/, /console\.log/, /interface\s+\w+/]
        };

        const scores = {};
        for (const [lang, regexes] of Object.entries(patterns)) {
            scores[lang] = regexes.reduce((count, regex) => count + (regex.test(lowerCode) ? 1 : 0), 0);
        }

        const bestMatch = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b, ['txt', 0]);
        return bestMatch[1] > 0 ? bestMatch[0] : 'txt';
    }

    generateSmartFileName(platformData, problemName, language) {
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (platformData && problemName) {
            const platform = platformData.platform.toLowerCase();
            return `${platform}/${problemName}-${platform}.${language}`;
        } else if (problemName) {
            return `solutions/${problemName}.${language}`;
        } else {
            return `solutions/solution-${timestamp}.${language}`;
        }
    }

    detectDifficulty(problemName) {
        if (!problemName) return 'medium';
        const name = problemName.toLowerCase();
        if (name.includes('easy') || name.includes('beginner') || name.includes('simple')) return 'easy';
        if (name.includes('hard') || name.includes('difficult') || name.includes('complex')) return 'hard';
        return 'medium';
    }

    generateSmartCommitMessage(platformData, problemName) {
        if (platformData && problemName) {
            const platformName = platformData.config.name;
            const cleanName = problemName.replace(/-/g, ' ');
            return `Add ${platformName.toLowerCase()} solution for ${cleanName}`;
        } else if (problemName) {
            const cleanName = problemName.replace(/-/g, ' ');
            return `Add solution for ${cleanName}`;
        } else {
            return `Add coding solution`;
        }
    }

    showPlatformDetection(platformData) {
        const indicator = document.getElementById('platform-indicator');
        const icon = document.getElementById('platform-icon');
        const text = document.getElementById('platform-text');
        
        if (platformData && indicator && icon && text) {
            icon.className = platformData.config.icon;
            text.textContent = `Detected: ${platformData.config.name}`;
            indicator.style.display = 'flex';
        } else if (indicator) {
            indicator.style.display = 'none';
        }
    }

    showSmartSuggestions(filePath, commitMessage) {
        const pathSuggestion = document.getElementById('path-suggestion');
        const messageSuggestion = document.getElementById('message-suggestion');
        
        if (pathSuggestion) {
            pathSuggestion.textContent = `Smart suggestion: ${filePath}`;
            pathSuggestion.style.display = 'block';
        }
        
        if (messageSuggestion) {
            messageSuggestion.textContent = `Auto-generated: ${commitMessage}`;
            messageSuggestion.style.display = 'block';
        }
    }

    animateFeatureCards() {
        const cards = document.querySelectorAll('.feature-card');
        cards.forEach((card, index) => {
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateX(0)';
            }, index * 150);
        });
    }

    showView(viewId) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            
            // If showing main view, ensure window stays open
            if (viewId === 'main-view') {
                this.keepWindowOpen();
            }
        }
    }

    // Method to keep the window open
    keepWindowOpen() {
        // Tell the main process to keep the window open
        if (window.electronAPI && window.electronAPI.keepWindowOpen) {
            window.electronAPI.keepWindowOpen();
        }
    }

    updateAuthStatus(isConnected) {
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        if (statusDot && statusText) {
            if (isConnected) {
                statusDot.classList.add('connected');
                statusText.textContent = 'Connected';
            } else {
                statusDot.classList.remove('connected');
                statusText.textContent = 'Not Connected';
            }
        }
    }

    updateStats() {
        const snippetsElement = document.getElementById('snippets-count');
        const reposElement = document.getElementById('repos-count');
        
        if (snippetsElement) {
            snippetsElement.textContent = this.stats.snippetsSaved;
        }
        if (reposElement) {
            reposElement.textContent = this.stats.reposCount;
        }
    }

    setupEventListeners() {
        // Get Started Button
        document.getElementById('get-started-btn')?.addEventListener('click', async () => {
            const button = document.getElementById('get-started-btn');
            const originalText = button.innerHTML;
            
            try {
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
                button.disabled = true;
                
                const result = await window.electronAPI.setFirstUseFlag(true);
                
                if (result.success) {
                    this.addLogEntry('info', 'Setup completed successfully.');
                    this.showView('auth-view');
                } else {
                    throw new Error(result.error || 'Failed to set first use flag');
                }
            } catch (error) {
                console.error('Setup error:', error);
                this.addLogEntry('error', 'Setup failed: ' + error.message);
                this.showView('auth-view');
            } finally {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        });

        // How it Works Button
        document.getElementById('how-it-works-btn')?.addEventListener('click', () => {
            this.showHowItWorksModal();
        });

        // How it Works Modal Close
        document.getElementById('how-it-works-close')?.addEventListener('click', () => {
            this.hideHowItWorksModal();
        });

        // Understood Button
        document.getElementById('understood-btn')?.addEventListener('click', async () => {
            this.hideHowItWorksModal();
            
            try {
                await window.electronAPI.setFirstUseFlag(true);
                this.showView('auth-view');
            } catch (error) {
                console.error('Error setting first use flag:', error);
                this.showView('auth-view');
            }
        });

        // Auth Button
        document.getElementById('auth-button')?.addEventListener('click', () => this.handleAuthentication());

        // Main view buttons
        document.getElementById('open-modal-btn')?.addEventListener('click', () => this.handleOpenModal(null));
        document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
        document.getElementById('refresh-repos')?.addEventListener('click', () => this.loadRepositories());
        document.getElementById('refresh-profile')?.addEventListener('click', () => this.refreshProfile());
        
        // Keep window open when interacting with it
        document.addEventListener('mousedown', () => this.keepWindowOpen());
        document.addEventListener('keydown', () => this.keepWindowOpen());
    }

    setupModalListeners() {
        // Save Modal
        const saveModal = document.getElementById('save-modal');
        document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closeSaveModal());
        document.getElementById('cancel-btn')?.addEventListener('click', () => this.closeSaveModal());
        saveModal?.addEventListener('click', (e) => {
            if (e.target.id === 'save-modal') {
                this.closeSaveModal();
            }
        });

        // Save Form
        document.getElementById('save-form')?.addEventListener('submit', (e) => this.handleSave(e));

        // Repository Selection Change
        document.getElementById('repo-select-modal')?.addEventListener('change', () => {
            this.updateFilePathSuggestion();
        });

        // Success Modal Close
        document.getElementById('success-close-btn')?.addEventListener('click', () => {
            this.closeSuccessModal();
        });

        // How it Works Modal
        const howItWorksModal = document.getElementById('how-it-works-modal');
        howItWorksModal?.addEventListener('click', (e) => {
            if (e.target.id === 'how-it-works-modal') {
                this.hideHowItWorksModal();
            }
        });

        // Real-time smart detection on code input
        document.getElementById('code-content')?.addEventListener('input', (e) => {
            this.performSmartDetection(e.target.value);
        });
    }

    setupIPCListeners() {
        if (window.electronAPI && window.electronAPI.onShowModal) {
            window.electronAPI.onShowModal((event, clipboardContent) => {
                console.log('Received clipboard content via shortcut:', clipboardContent);
                this.currentClipboardContent = clipboardContent;
                this.handleOpenModal(clipboardContent);
            });
        }
    }

    async startClipboardMonitoring() {
        setInterval(async () => {
            try {
                if (window.electronAPI && window.electronAPI.readClipboard) {
                    const content = await window.electronAPI.readClipboard();
                    if (content && content.trim() && content !== this.currentClipboardContent) {
                        this.currentClipboardContent = content;
                    }
                }
            } catch (error) {
                console.error('Failed to read clipboard:', error);
            }
        }, 2000);
    }

    showHowItWorksModal() {
        const modal = document.getElementById('how-it-works-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    hideHowItWorksModal() {
        const modal = document.getElementById('how-it-works-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    async handleAuthentication() {
        const authButton = document.getElementById('auth-button');
        if (!authButton) return;
        
        const originalText = authButton.innerHTML;
        authButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        authButton.disabled = true;
        
        try {
            this.addLogEntry('info', 'Starting GitHub OAuth flow...');
            const response = await window.electronAPI.startOAuth();
            
            if (response.success) {
                this.isAuthenticated = true;
                this.updateAuthStatus(true);
                
                // Show success view with animation
                this.showView('success-view');
                this.addLogEntry('success', 'Successfully connected to GitHub!');

                setTimeout(async () => {
                    this.showView('main-view');
                    
                    // Load repositories immediately
                    await this.loadRepositories();
                    await this.loadUserProfile();
                    this.updateStats();

                    // Show dashboard welcome log
                    this.addLogEntry('info', 'Welcome! Press Ctrl + Shift + V anytime to commit solutions intelligently.');
                }, 2000);
            } else {
                throw new Error(response.error || 'Authentication failed');
            }
        } catch (error) {
            console.error('Authentication error:', error);
            this.addLogEntry('error', 'Authentication failed: ' + error.message);
        } finally {
            authButton.innerHTML = originalText;
            authButton.disabled = false;
        }
    }

    async loadUserProfile() {
        try {
            // Get user info from GitHub API
            const tokenResponse = await window.electronAPI.getToken();
            if (tokenResponse.success && tokenResponse.token) {
                const response = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${tokenResponse.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (response.ok) {
                    const userData = await response.json();
                    this.currentUser = {
                        username: userData.login,
                        avatarUrl: userData.avatar_url,
                        profileUrl: userData.html_url
                    };
                    
                    // Update UI with user info
                    const usernameElement = document.getElementById('username');
                    const avatarElement = document.getElementById('user-avatar');
                    
                    if (usernameElement) usernameElement.textContent = userData.name || userData.login;
                    if (avatarElement) avatarElement.src = userData.avatar_url;
                } else {
                    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
                }
            }
        } catch (error) {
            console.error('Failed to load user profile:', error);
            this.addLogEntry('error', 'Failed to load user profile: ' + error.message);
        }
    }

    async handleLogout() {
        try {
            await window.electronAPI.clearToken();
            this.isAuthenticated = false;
            this.repositories = [];
            this.currentUser = null;
            this.stats.reposCount = 0;
            this.updateAuthStatus(false);
            this.updateStats();
            this.showView('auth-view');
            this.addLogEntry('info', 'Successfully logged out from GitHub.');
        } catch (error) {
            this.addLogEntry('error', 'Logout failed: ' + error.message);
        }
    }

    async loadRepositories() {
        this.addLogEntry('info', 'Loading your repositories...');
        const repoSelects = document.querySelectorAll('#repo-select, #repo-select-modal');
        
        repoSelects.forEach(select => {
            select.innerHTML = '<option value="">Loading repositories...</option>';
            select.disabled = true;
        });
        
        try {
            const response = await window.electronAPI.getUserRepos();
            
            if (response.success && response.repos) {
                this.repositories = response.repos;
                this.stats.reposCount = this.repositories.length;
                this.updateStats();
                this.addLogEntry('success', `Loaded ${this.repositories.length} repositories.`);
                
                repoSelects.forEach(select => {
                    select.disabled = false;
                    select.innerHTML = '<option value="">Select a repository...</option>' + 
                        this.repositories.map(repo => 
                            `<option value="${repo.full_name}">${repo.name}${repo.private ? ' 🔒' : ' 🌍'}</option>`
                        ).join('');
                });
            } else {
                throw new Error(response.error || 'Failed to fetch repositories.');
            }
        } catch (error) {
            this.addLogEntry('error', 'Failed to load repositories: ' + error.message);
            
            repoSelects.forEach(select => {
                select.innerHTML = '<option value="">Failed to load repositories</option>';
                select.disabled = false;
            });
        }
    }

    async refreshProfile() {
        const button = document.getElementById('refresh-profile');
        const originalContent = button.innerHTML;
        
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        button.disabled = true;
        
        try {
            await this.loadRepositories();
            await this.loadUserProfile();
            this.addLogEntry('info', 'Profile refreshed successfully.');
        } catch (error) {
            this.addLogEntry('error', 'Failed to refresh profile: ' + error.message);
        } finally {
            button.innerHTML = originalContent;
            button.disabled = false;
        }
    }

    handleOpenModal(content) {
        if (!this.isAuthenticated) {
            this.addLogEntry('error', 'Please authenticate with GitHub first.');
            this.showView('auth-view');
            return;
        }

        this.addLogEntry('info', 'Opening smart commit modal...');
        const modal = document.getElementById('save-modal');
        const codeEditor = document.getElementById('code-content');
        
        if (modal && codeEditor) {
            // Use provided content or current clipboard content
            const contentToUse = content || this.currentClipboardContent || '';
            codeEditor.value = contentToUse;
            
            // Perform smart detection and auto-populate fields
            this.performSmartDetection(contentToUse);
            
            modal.classList.add('active');
            
            // Load repositories if not already loaded
            if (this.repositories.length === 0) {
                this.loadRepositories();
            }
        }
    }

    performSmartDetection(content) {
        if (!content || !content.trim()) return;

        // Detect platform from URL patterns in content
        const platformData = this.detectPlatformFromUrl(content);
        
        // Extract problem name from comments or URL
        let problemName = null;
        if (platformData) {
            problemName = this.cleanProblemName(platformData.problemSlug);
        } else {
            problemName = this.extractProblemNameFromCode(content);
        }
        
        // Detect programming language
        const language = this.detectLanguage(content);
        
        // Generate smart suggestions
        const filePath = this.generateSmartFileName(platformData, problemName, language);
        const commitMessage = this.generateSmartCommitMessage(platformData, problemName);
        
        // Update UI
        this.showPlatformDetection(platformData);
        this.populateFields(filePath, commitMessage);
        this.showSmartSuggestions(filePath, commitMessage);
    }

    populateFields(filePath, commitMessage) {
        const filePathInput = document.getElementById('file-path');
        const commitMessageInput = document.getElementById('commit-message');

        if (filePathInput) {
            filePathInput.value = filePath;
        }
        if (commitMessageInput) {
            commitMessageInput.value = commitMessage;
        }
    }

    closeSaveModal() {
        const modal = document.getElementById('save-modal');
        if (modal) {
            modal.classList.remove('active');
            document.getElementById('save-form')?.reset();
            
            // Hide smart suggestions
            const pathSuggestion = document.getElementById('path-suggestion');
            const messageSuggestion = document.getElementById('message-suggestion');
            const platformIndicator = document.getElementById('platform-indicator');
            
            if (pathSuggestion) pathSuggestion.style.display = 'none';
            if (messageSuggestion) messageSuggestion.style.display = 'none';
            if (platformIndicator) platformIndicator.style.display = 'none';
        }
    }

    showSuccessModal(message, url) {
        const modal = document.getElementById('success-save-modal');
        const messageElement = document.getElementById('save-success-message');
        
        if (modal && messageElement) {
            messageElement.textContent = message;
            modal.classList.add('active');
            
            // Auto-close after 3 seconds
            setTimeout(() => {
                this.closeSuccessModal();
            }, 3000);
        }
    }

    closeSuccessModal() {
        const modal = document.getElementById('success-save-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    updateFilePathSuggestion() {
        const repoSelect = document.getElementById('repo-select-modal');
        const filePathInput = document.getElementById('file-path');
        const codeContent = document.getElementById('code-content')?.value || '';

        if (!repoSelect || !filePathInput || !repoSelect.value) return;

        // If a smart suggestion already exists, don't overwrite it
        if (filePathInput.value && !filePathInput.value.startsWith('solution-')) {
            return;
        }

        // Try smart detection again
        const platformData = this.detectPlatformFromUrl(codeContent);
        let problemName = null;

        if (platformData) {
            problemName = this.cleanProblemName(platformData.problemSlug);
        } else {
            problemName = this.extractProblemNameFromCode(codeContent);
        }

        const language = this.detectLanguage(codeContent);
        const filePath = this.generateSmartFileName(platformData, problemName, language);

        filePathInput.value = filePath;
    }

    async handleSave(e) {
        e.preventDefault();
        const saveButton = document.getElementById('save-btn');
        if (!saveButton) return;
        
        const originalText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Committing...';
        saveButton.disabled = true;
        
        try {
            const repoName = document.getElementById('repo-select-modal')?.value;
            const filePath = document.getElementById('file-path')?.value;
            const commitMessage = document.getElementById('commit-message')?.value;
            const codeContent = document.getElementById('code-content')?.value;
            
            if (!repoName || !filePath || !commitMessage || !codeContent) {
                throw new Error('Please fill in all required fields');
            }
            
            this.addLogEntry('info', `Smart committing to ${repoName}/${filePath}...`);
            
            const response = await window.electronAPI.saveCodeToRepo(
                repoName, filePath, commitMessage, codeContent
            );
            
            if (response.success) {
                // Update stats
                this.stats.snippetsSaved++;
                localStorage.setItem('code2commit-solutions-committed', this.stats.snippetsSaved.toString());
                this.updateStats();
                
                this.addLogEntry('success', `Successfully committed to ${repoName}/${filePath}`);
                this.closeSaveModal();
                this.showSuccessModal(
                    `Solution committed successfully to ${repoName}!`,
                    response.url
                );
            } else {
                throw new Error(response.error || 'Failed to commit code');
            }
        } catch (error) {
            this.addLogEntry('error', 'Commit failed: ' + error.message);
        } finally {
            saveButton.innerHTML = originalText;
            saveButton.disabled = false;
        }
    }

    addLogEntry(type, message) {
        const statusLog = document.getElementById('status-log');
        if (!statusLog) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        
        const icons = {
            'success': '✅',
            'error': '❌',
            'info': 'ℹ️',
            'warning': '⚠️'
        };
        
        const icon = icons[type] || 'ℹ️';
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        entry.innerHTML = `
            <div class="log-icon">${icon}</div>
            <div class="log-content">
                <div class="log-message">${message}</div>
                <div class="log-time">${timeString}</div>
            </div>
        `;
        
        statusLog.insertBefore(entry, statusLog.firstChild);
        
        // Limit log entries to prevent memory issues
        const entries = statusLog.querySelectorAll('.log-entry');
        if (entries.length > 50) {
            statusLog.removeChild(entries[entries.length - 1]);
        }
        
        statusLog.scrollTop = 0;
    }
}