#!/bin/bash
# One-shot deployment script for Intelligent Content Detection

set -e

echo "🚀 Starting Intelligent Content Detection Deployment"
echo "=================================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found. Please install it." >&2; exit 1; }
command -v cdk >/dev/null 2>&1 || { echo "❌ AWS CDK not found. Please install it: npm install -g aws-cdk" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Please install it." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 not found. Please install it." >&2; exit 1; }

echo "✅ All prerequisites met"
echo ""

# Prompt for API keys
echo "🔑 API Keys Setup"
echo "-----------------"
read -sp "Enter OpenAI API key: " OPENAI_KEY
echo ""
read -sp "Enter OpenRouter API key: " OPENROUTER_KEY
echo ""

if [ -z "$OPENAI_KEY" ] || [ -z "$OPENROUTER_KEY" ]; then
    echo "❌ API keys are required"
    exit 1
fi

# Deploy infrastructure
echo ""
echo "🏗️  Deploying Infrastructure (CDK)"
echo "-----------------------------------"
cd infrastructure

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing CDK dependencies..."
    npm install
fi

# Bootstrap CDK (if needed)
echo "Bootstrapping CDK..."
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-2 || echo "CDK already bootstrapped"

# Deploy stacks
echo "Deploying CDK stacks..."
cdk deploy --all --require-approval never

# Store secrets
echo ""
echo "🔐 Storing API Keys in Secrets Manager"
echo "--------------------------------------"
aws secretsmanager put-secret-value \
    --secret-id openai-api-key \
    --secret-string "$OPENAI_KEY" \
    --region us-east-2 || \
aws secretsmanager create-secret \
    --name openai-api-key \
    --secret-string "$OPENAI_KEY" \
    --region us-east-2

aws secretsmanager put-secret-value \
    --secret-id openrouter-api-key \
    --secret-string "$OPENROUTER_KEY" \
    --region us-east-2 || \
aws secretsmanager create-secret \
    --name openrouter-api-key \
    --secret-string "$OPENROUTER_KEY" \
    --region us-east-2

echo "✅ Secrets stored"
cd ..

# Get API endpoint from CDK outputs
echo ""
echo "📡 Getting API Endpoint"
echo "----------------------"
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name intelligent-content-detection-api \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text \
    --region us-east-2)

if [ -z "$API_ENDPOINT" ]; then
    echo "⚠️  Could not retrieve API endpoint. Please check CDK outputs."
else
    echo "API Endpoint: $API_ENDPOINT"
fi

# Frontend setup
echo ""
echo "🎨 Setting up Frontend"
echo "----------------------"
cd frontend

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Create .env file for local development
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    echo "VITE_API_BASE_URL=$API_ENDPOINT" > .env
    echo "✅ Created .env file"
fi

echo ""
echo "✅ Frontend setup complete"
echo ""
echo "📝 Next Steps:"
echo "1. Initialize Amplify: cd frontend && amplify init"
echo "2. Add hosting: amplify add hosting"
echo "3. Deploy: amplify publish"
echo ""
echo "Or deploy manually:"
echo "  cd frontend && npm run build"
echo "  Then upload the 'dist' folder to Amplify Console"
echo ""
echo "🎉 Deployment script completed!"
echo ""
echo "API Endpoint: $API_ENDPOINT"

