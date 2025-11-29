# Run all tests for the intelligent-content-detection project

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Running All Tests" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Backend Python Tests
Write-Host ""
Write-Host "Running Backend Python Tests..." -ForegroundColor Blue
Write-Host "----------------------------------------" -ForegroundColor Gray

Push-Location backend

# Check if virtual environment exists, create if not
if (-not (Test-Path "venv")) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
if (Test-Path "venv\Scripts\Activate.ps1") {
    & .\venv\Scripts\Activate.ps1
}

# Install test dependencies
Write-Host "Installing test dependencies..." -ForegroundColor Yellow
pip install -q -r tests/requirements.txt
pip install -q -r lambda/content-detection/requirements.txt

# Run all tests
Write-Host "Running unittest tests..." -ForegroundColor Yellow
python -m unittest discover -s tests -p "test_*.py" -v

Write-Host ""
Write-Host "Backend tests completed" -ForegroundColor Green

Pop-Location

# Frontend TypeScript/React Tests
Write-Host ""
Write-Host "Running Frontend Tests..." -ForegroundColor Blue
Write-Host "----------------------------------------" -ForegroundColor Gray

Push-Location frontend

# Check if node_modules exists, install if not
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
}

# Run frontend tests with coverage
Write-Host "Running Vitest tests with coverage..." -ForegroundColor Yellow
npm run test:coverage

Write-Host ""
Write-Host "Frontend tests completed" -ForegroundColor Green

Pop-Location

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "All tests completed successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan

