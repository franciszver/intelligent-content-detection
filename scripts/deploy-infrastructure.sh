#!/bin/bash
# Deploy infrastructure only

set -e

cd infrastructure

if [ ! -d "node_modules" ]; then
    npm install
fi

cdk deploy --all --require-approval never

cd ..

