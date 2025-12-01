#!/usr/bin/env bash
# Deploy Backend Script
# This script builds the Single Agent Docker image, pushes it to ECR, and deploys the CDK stacks.
#
# Usage: ./scripts/deploy-backend.sh [--profile <aws-profile>] [--tag <image-tag>] [--skip-build]
#
# Examples:
#   ./scripts/deploy-backend.sh                          # Uses default2 profile, auto-generates tag
#   ./scripts/deploy-backend.sh --profile myprofile      # Uses custom AWS profile
#   ./scripts/deploy-backend.sh --tag v5                 # Uses specific image tag
#   ./scripts/deploy-backend.sh --skip-build             # Skip Docker build, just deploy CDK

set -euo pipefail

# Configuration
REGION="us-east-2"
# Get AWS account ID from AWS CLI or use environment variable
ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)}"
ECR_REPO="intelligent-content-detection-single-agent"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

# Default values
PROFILE="default2"
TAG=""
SKIP_BUILD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            PROFILE="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Generate tag if not provided
if [[ -z "$TAG" ]]; then
    TAG="v$(date +%Y%m%d-%H%M%S)"
fi

# Get script and project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="${PROJECT_ROOT}/backend"
INFRA_DIR="${PROJECT_ROOT}/infrastructure"

echo "========================================"
echo "Backend Deployment Script"
echo "========================================"
echo "AWS Profile: ${PROFILE}"
echo "Region: ${REGION}"
echo "Image Tag: ${TAG}"
echo ""

if [[ "$SKIP_BUILD" == false ]]; then
    echo "Step 1: Building Docker image..."
    echo "  Using DOCKER_BUILDKIT=0 for Lambda-compatible format"
    
    cd "$BACKEND_DIR"
    DOCKER_BUILDKIT=0 docker build --platform linux/amd64 \
        -f lambda/agent-single/Dockerfile \
        -t "${ECR_URI}:${TAG}" .
    echo "  Docker build successful"

    echo ""
    echo "Step 2: Logging into ECR..."
    aws ecr get-login-password --region "$REGION" --profile "$PROFILE" | \
        docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
    echo "  ECR login successful"

    echo ""
    echo "Step 3: Pushing image to ECR..."
    docker push "${ECR_URI}:${TAG}"
    echo "  Image pushed successfully"

    echo ""
    echo "Step 4: Updating CDK stack with new image tag..."
    sed -i.bak "s/tagOrDigest: '[^']*'/tagOrDigest: '${TAG}'/" "${INFRA_DIR}/lib/stacks/api-stack.ts"
    rm -f "${INFRA_DIR}/lib/stacks/api-stack.ts.bak"
    echo "  Updated api-stack.ts with tag: ${TAG}"
else
    echo "Step 1-4: Skipping Docker build (--skip-build flag set)"
fi

echo ""
echo "Step 5: Building CDK TypeScript..."
cd "$INFRA_DIR"
npm run build
echo "  CDK build successful"

echo ""
echo "Step 6: Deploying CDK stacks..."
npx cdk deploy ApiStack --require-approval never --profile "$PROFILE"
echo "  CDK deployment successful"

echo ""
echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo "Image: ${ECR_URI}:${TAG}"
echo ""

