#!/bin/bash
# Run all tests for the intelligent-content-detection project

set -e

echo "========================================="
echo "Running All Tests"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Backend Python Tests
echo ""
echo -e "${BLUE}Running Backend Python Tests...${NC}"
echo "----------------------------------------"
cd backend

# Check if virtual environment exists, create if not
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null || true

# Install test dependencies
echo "Installing test dependencies..."
pip install -q -r tests/requirements.txt
pip install -q -r lambda/content-detection/requirements.txt

# Run all tests
echo "Running unittest tests..."
python -m unittest discover -s tests -p "test_*.py" -v

echo ""
echo -e "${GREEN}✓ Backend tests completed${NC}"
cd ..

echo ""
echo "========================================="
echo -e "${GREEN}All tests completed successfully!${NC}"
echo "========================================="

