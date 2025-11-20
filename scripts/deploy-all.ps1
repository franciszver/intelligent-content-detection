<#
.SYNOPSIS
    Windows PowerShell one-shot deployment for Intelligent Content Detection.

.DESCRIPTION
    - Checks prerequisites (AWS CLI, CDK, Node.js, Python, Docker).
    - Deploys CDK stacks (S3, DynamoDB, Lambda, API Gateway, Secrets, Monitoring).
    - Stores OpenAI/OpenRouter API keys in Secrets Manager.
    - Installs frontend deps, creates .env pointing at the deployed API.
    - Prints next-step instructions for Amplify hosting.

.PARAMETER AwsProfile
    AWS credential profile to use. Defaults to "default".

.PARAMETER Region
    AWS region for deployment. Defaults to "us-east-2".
#>
param(
    [string]$AwsProfile = "default",
    [string]$Region = "us-east-2"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param(
        [Parameter(Mandatory)]
        [string]$Command,
        [Parameter(Mandatory)]
        [string]$InstallHint
    )

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Command '$Command' not found. Install from: $InstallHint"
    }
}

function ConvertTo-PlainText {
    param(
        [Parameter(Mandatory)]
        [System.Security.SecureString]$SecureValue
    )

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

Write-Host "🚀 Intelligent Content Detection - Windows Deploy" -ForegroundColor Cyan
Write-Host "Profile: $AwsProfile    Region: $Region"
Write-Host ""

Write-Host "📋 Checking prerequisites..."
Require-Command -Command "aws" -InstallHint "https://aws.amazon.com/cli/"
Require-Command -Command "npx" -InstallHint "https://nodejs.org/"
Require-Command -Command "python" -InstallHint "https://www.python.org/downloads/"
Require-Command -Command "docker" -InstallHint "https://www.docker.com/products/docker-desktop/"
Require-Command -Command "cdk" -InstallHint "npm install -g aws-cdk"

try {
    docker info | Out-Null
}
catch {
    throw "Docker Desktop must be running for Lambda bundling."
}
Write-Host "✅ Prerequisites OK" -ForegroundColor Green
Write-Host ""

Write-Host "🔑 Enter API keys (input hidden)"
$openAiSecure = Read-Host "OpenAI API key" -AsSecureString
$openRouterSecure = Read-Host "OpenRouter API key" -AsSecureString

$openAiKey = ConvertTo-PlainText -SecureValue $openAiSecure
$openRouterKey = ConvertTo-PlainText -SecureValue $openRouterSecure
if (-not $openAiKey -or -not $openRouterKey) {
    throw "Both OpenAI and OpenRouter keys are required."
}

Write-Host ""
Write-Host "🏗️  Deploying infrastructure (CDK)..."
Push-Location (Resolve-Path "$PSScriptRoot/../infrastructure")
if (-not (Test-Path "node_modules")) {
    npm install
}

$accountId = (aws sts get-caller-identity --profile $AwsProfile --query Account --output text)
if (-not $accountId) {
    throw "Unable to retrieve AWS account ID with profile '$AwsProfile'."
}

cdk bootstrap "aws://$accountId/$Region" --profile $AwsProfile
cdk deploy --all --require-approval never --profile $AwsProfile
Pop-Location
Write-Host "✅ CDK deployment complete" -ForegroundColor Green
Write-Host ""

Write-Host "🔐 Storing secrets..."
aws secretsmanager put-secret-value `
    --secret-id openai-api-key `
    --secret-string $openAiKey `
    --region $Region `
    --profile $AwsProfile `
    2>$null `
    || aws secretsmanager create-secret `
        --name openai-api-key `
        --secret-string $openAiKey `
        --region $Region `
        --profile $AwsProfile

aws secretsmanager put-secret-value `
    --secret-id openrouter-api-key `
    --secret-string $openRouterKey `
    --region $Region `
    --profile $AwsProfile `
    2>$null `
    || aws secretsmanager create-secret `
        --name openrouter-api-key `
        --secret-string $openRouterKey `
        --region $Region `
        --profile $AwsProfile
Write-Host "✅ Secrets stored" -ForegroundColor Green
Write-Host ""

Write-Host "📡 Discovering API endpoint..."
$apiEndpoint = aws cloudformation describe-stacks `
    --stack-name intelligent-content-detection-api `
    --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" `
    --output text `
    --region $Region `
    --profile $AwsProfile

if (-not $apiEndpoint) {
    Write-Warning "Could not determine API endpoint from stack outputs."
}
else {
    $apiEndpoint = $apiEndpoint.TrimEnd("/")
    Write-Host "API Endpoint: $apiEndpoint"

    $frontendEnvPath = Join-Path (Resolve-Path ..\frontend) ".env"
    "VITE_API_BASE_URL=$apiEndpoint/prod" | Set-Content -Encoding UTF8 $frontendEnvPath
    Write-Host "Created frontend/.env pointing to API" -ForegroundColor Green
}
Write-Host ""

Write-Host "🎨 Frontend dependencies..."
Push-Location (Resolve-Path "$PSScriptRoot/../frontend")
if (-not (Test-Path "node_modules")) {
    npm install
}
Write-Host "✅ Frontend ready for Amplify deploy" -ForegroundColor Green
Pop-Location
Write-Host ""

Write-Host "✅ Deployment script finished" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Initialize Amplify (if not already):" -ForegroundColor Yellow
Write-Host "     cd frontend"
Write-Host "     amplify init"
Write-Host "     amplify add hosting"
Write-Host "     amplify publish"
Write-Host "2. Or deploy via Amplify Console using the built 'frontend/dist' folder."
Write-Host "3. Verify API + UI end-to-end."

