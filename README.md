# Intelligent Content Detection

AI-powered photo content detection system for construction and insurance workflows. Automatically identifies roof damage, construction materials, and generates structured metadata.

## Architecture

- **Frontend**: React + TypeScript with AWS Amplify
- **Backend**: AWS Lambda (Python) with API Gateway
- **Storage**: S3 (photos) + DynamoDB (metadata)
- **AI**: OpenAI Vision API with OpenRouter fallback
- **Infrastructure**: AWS CDK (TypeScript)

## Prerequisites

- AWS CLI configured
- AWS CDK installed (`npm install -g aws-cdk`)
- Node.js 18+
- Python 3.11+
- OpenAI API key
- OpenRouter API key

## Quick Start

### One-Shot Deployment

```bash
chmod +x scripts/deploy-all.sh
./scripts/deploy-all.sh
```

This script will:
1. Check prerequisites
2. Prompt for API keys
3. Deploy all infrastructure
4. Store secrets
5. Setup frontend

### Manual Deployment

#### 1. Deploy Infrastructure

```bash
cd infrastructure
npm install
cdk bootstrap
cdk deploy --all
```

#### 2. Store API Keys

```bash
chmod +x scripts/setup-secrets.sh
./scripts/setup-secrets.sh
```

#### 3. Setup Frontend

```bash
cd frontend
npm install
npm run build
```

Then deploy to Amplify Console or use Amplify CLI.

## Project Structure

```
intelligent-content-detection/
├── infrastructure/          # AWS CDK infrastructure
├── backend/                # Lambda functions
│   ├── lambda/            # Lambda handlers
│   └── shared/            # Shared libraries
├── frontend/               # React application
├── scripts/                # Deployment scripts
└── _docs/                  # Documentation
```

## API Endpoints

- `POST /photos/upload` - Get presigned URL for upload
- `POST /photos/{photoId}/detect` - Trigger detection
- `GET /photos/{photoId}/metadata` - Get detection results

## Features

- ✅ Roof damage detection (hail, wind, missing shingles)
- ✅ Material detection and counting
- ✅ Bounding box visualization
- ✅ Real-time processing
- ✅ Cost-optimized architecture

## Cost Optimization

- DynamoDB on-demand billing
- S3 Intelligent-Tiering
- CloudWatch 7-day log retention
- Lambda right-sized memory
- AI response caching

## Security

- Secrets stored in AWS Secrets Manager
- S3 server-side encryption
- DynamoDB encryption at rest
- IAM least privilege
- CORS configuration

## Development

### Local Testing

```bash
# Backend
cd backend/lambda/content-detection
pip install -r requirements.txt

# Frontend
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
cd backend
pytest tests/
```

## License

MIT

