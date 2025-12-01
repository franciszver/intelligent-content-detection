# Deploy Backend Script
# This script builds the Single Agent Docker image, pushes it to ECR, and deploys the CDK stacks.
#
# Usage: .\scripts\deploy-backend.ps1 [-Profile <aws-profile>] [-Tag <image-tag>] [-SkipBuild]
#
# Examples:
#   .\scripts\deploy-backend.ps1                          # Uses default2 profile, auto-generates tag
#   .\scripts\deploy-backend.ps1 -Profile myprofile       # Uses custom AWS profile
#   .\scripts\deploy-backend.ps1 -Tag v5                  # Uses specific image tag
#   .\scripts\deploy-backend.ps1 -SkipBuild               # Skip Docker build, just deploy CDK

param(
    [string]$Profile = "default2",
    [string]$Tag = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Configuration
$REGION = "us-east-2"
# Get AWS account ID from AWS CLI or use environment variable
$ACCOUNT_ID = if ($env:AWS_ACCOUNT_ID) { $env:AWS_ACCOUNT_ID } else { (aws sts get-caller-identity --profile $Profile --query Account --output text) }
$ECR_REPO = "intelligent-content-detection-single-agent"
$ECR_URI = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"

# Generate tag if not provided
if (-not $Tag) {
    $Tag = "v" + (Get-Date -Format "yyyyMMdd-HHmmss")
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Backend Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AWS Profile: $Profile"
Write-Host "Region: $REGION"
Write-Host "Image Tag: $Tag"
Write-Host ""

# Get script and project directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $ProjectRoot "backend"
$InfraDir = Join-Path $ProjectRoot "infrastructure"

if (-not $SkipBuild) {
    Write-Host "Step 1: Building Docker image..." -ForegroundColor Yellow
    Write-Host "  Using DOCKER_BUILDKIT=0 for Lambda-compatible format"
    
    Push-Location $BackendDir
    try {
        $env:DOCKER_BUILDKIT = "0"
        docker build --platform linux/amd64 -f lambda/agent-single/Dockerfile -t "${ECR_URI}:${Tag}" .
        if ($LASTEXITCODE -ne 0) {
            throw "Docker build failed"
        }
        Write-Host "  Docker build successful" -ForegroundColor Green
    }
    finally {
        Pop-Location
        Remove-Item Env:DOCKER_BUILDKIT -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "Step 2: Logging into ECR..." -ForegroundColor Yellow
    $loginPassword = aws ecr get-login-password --region $REGION --profile $Profile
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get ECR login password"
    }
    $loginPassword | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
    if ($LASTEXITCODE -ne 0) {
        throw "Docker login to ECR failed"
    }
    Write-Host "  ECR login successful" -ForegroundColor Green

    Write-Host ""
    Write-Host "Step 3: Pushing image to ECR..." -ForegroundColor Yellow
    docker push "${ECR_URI}:${Tag}"
    if ($LASTEXITCODE -ne 0) {
        throw "Docker push failed"
    }
    Write-Host "  Image pushed successfully" -ForegroundColor Green

    Write-Host ""
    Write-Host "Step 4: Updating CDK stack with new image tag..." -ForegroundColor Yellow
    $ApiStackPath = Join-Path $InfraDir "lib/stacks/api-stack.ts"
    $content = Get-Content $ApiStackPath -Raw
    $newContent = $content -replace "tagOrDigest: '[^']*'", "tagOrDigest: '$Tag'"
    Set-Content $ApiStackPath $newContent
    Write-Host "  Updated api-stack.ts with tag: $Tag" -ForegroundColor Green
}
else {
    Write-Host "Step 1-4: Skipping Docker build (--SkipBuild flag set)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 5: Building CDK TypeScript..." -ForegroundColor Yellow
Push-Location $InfraDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "CDK build failed"
    }
    Write-Host "  CDK build successful" -ForegroundColor Green

    Write-Host ""
    Write-Host "Step 6: Deploying CDK stacks..." -ForegroundColor Yellow
    npx cdk deploy ApiStack --require-approval never --profile $Profile
    if ($LASTEXITCODE -ne 0) {
        throw "CDK deployment failed"
    }
    Write-Host "  CDK deployment successful" -ForegroundColor Green
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Image: ${ECR_URI}:${Tag}"
Write-Host ""

