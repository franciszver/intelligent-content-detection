#!/bin/bash
# Setup secrets in AWS Secrets Manager

set -e

read -sp "Enter OpenAI API key: " OPENAI_KEY
echo ""
read -sp "Enter OpenRouter API key: " OPENROUTER_KEY
echo ""

if [ -z "$OPENAI_KEY" ] || [ -z "$OPENROUTER_KEY" ]; then
    echo "❌ API keys are required"
    exit 1
fi

echo "Storing secrets..."

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

echo "✅ Secrets stored successfully"

