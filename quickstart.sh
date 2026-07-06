#!/bin/bash

# OLASUBOMI-MD Bot - Quick Start Script

echo "🤖 OLASUBOMI-MD Bot - Quick Start"
echo "=================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "📥 Please install Node.js first"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    echo "Creating .env with default values..."
    cat > .env << EOF
BOT_NAME=OLASUBOMI-MD
BOT_VERSION=3.0.0
BOT_PREFIX=.
BOT_MODE=private
OWNER_NUMBER=
OWNER_NAME=Olasubomi
BOT_DESCRIPTION=Advanced WhatsApp Bot
EOF
    echo "✅ .env created"
    echo ""
fi

# Ask user for deployment method
echo "Choose deployment method:"
echo "1) Local (npm start)"
echo "2) PM2 (production)"
echo ""
read -p "Enter choice (1-2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "🚀 Starting bot locally..."
    npm start
elif [ "$choice" == "2" ]; then
    echo ""
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo "📥 Installing PM2 globally..."
        npm install -g pm2
    fi
    
    echo "🚀 Starting bot with PM2..."
    pm2 start ecosystem.config.js
    echo ""
    echo "✅ Bot started with PM2"
    echo "📊 View status: pm2 monit"
    echo "📋 View logs: pm2 logs OLASUBOMI-MD"
else
    echo "❌ Invalid choice"
    exit 1
fi
