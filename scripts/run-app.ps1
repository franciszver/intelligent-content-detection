# Run the Intelligent Content Detection application locally
# This script sets up the frontend to connect to your deployed AWS backend

param(
    [string]$AwsProfile = "default",
    [string]$Region = "us-east-2"
)

Write-Host "Starting Intelligent Content Detection Application" -ForegroundColor Cyan
Write-Host "AWS Profile: $AwsProfile    Region: $Region" -ForegroundColor Gray
Write-Host ""

# Check if frontend directory exists
if (-not (Test-Path "frontend")) {
    Write-Host "ERROR: Frontend directory not found!" -ForegroundColor Red
    exit 1
}

# Get API endpoint from CloudFormation
Write-Host "Getting API endpoint from AWS..." -ForegroundColor Yellow
$apiEndpoint = aws cloudformation describe-stacks `
    --stack-name intelligent-content-detection-api `
    --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" `
    --output text `
    --region $Region `
    --profile $AwsProfile `
    2>$null

if (-not $apiEndpoint -or $apiEndpoint -eq "None") {
    Write-Host "WARNING: Could not find API endpoint. Is the backend deployed?" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To deploy the backend, run:" -ForegroundColor Cyan
    Write-Host "  .\scripts\deploy-all.ps1 -AwsProfile $AwsProfile" -ForegroundColor White
    Write-Host ""
    $manualEndpoint = Read-Host "Enter API endpoint manually (or press Enter to exit)"
    if (-not $manualEndpoint) {
        exit 1
    }
    $apiEndpoint = $manualEndpoint.TrimEnd("/")
} else {
    $apiEndpoint = $apiEndpoint.TrimEnd("/")
    Write-Host "SUCCESS: Found API endpoint: $apiEndpoint" -ForegroundColor Green
}

# Create .env file
Write-Host ""
Write-Host "Creating frontend/.env file..." -ForegroundColor Yellow

# Check if endpoint already includes /prod, if not add it
if ($apiEndpoint -notmatch '/prod$') {
    $apiEndpoint = "$apiEndpoint/prod"
}

$envLines = @()
$envLines += "VITE_API_BASE_URL=$apiEndpoint"
$envContent = $envLines -join [Environment]::NewLine
$envPath = Join-Path "frontend" ".env"
$envContent | Set-Content -Encoding UTF8 $envPath
Write-Host "SUCCESS: Created $envPath" -ForegroundColor Green
Write-Host "API URL: $apiEndpoint" -ForegroundColor Gray

# Install frontend dependencies if needed
Write-Host ""
Write-Host "Checking frontend dependencies..." -ForegroundColor Yellow
Push-Location frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Gray
    npm install
    Write-Host "SUCCESS: Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "SUCCESS: Dependencies already installed" -ForegroundColor Green
}

# Start dev server
Write-Host ""
Write-Host "Starting development server..." -ForegroundColor Cyan
Write-Host "The app will open at http://localhost:5173" -ForegroundColor Gray
Write-Host 'Press Ctrl+C to stop the server' -ForegroundColor Gray
Write-Host ""

npm run dev

Pop-Location

