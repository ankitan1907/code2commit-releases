#!/bin/bash

# CodeSnap Setup Script
echo "🚀 Setting up CodeSnap..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm found: $(npm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "🔧 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your GitHub OAuth credentials"
    echo "   1. Go to https://github.com/settings/applications/new"
    echo "   2. Create OAuth app with callback URL: http://localhost:3456/callback"
    echo "   3. Add your Client ID and Secret to .env file"
else
    echo "✅ .env file already exists"
fi

# Create icons directory if it doesn't exist
if [ ! -d "icons" ]; then
    echo "📁 Creating icons directory..."
    mkdir icons
    echo "⚠️  Please add your app icons to the icons/ directory"
    echo "   Recommended: icon48.png, icon.ico, icon.icns"
fi

# Create src directory structure
echo "📂 Creating directory structure..."
mkdir -p src/renderer/ui

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your GitHub OAuth credentials"
echo "2. Add app icons to icons/ directory (optional)"
echo "3. Run: npm start"
echo ""
echo "For detailed instructions, see README.md"