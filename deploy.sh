#!/bin/bash
set -e

cd /Users/brianshrader/Documents/Games/Cursor/Frequencies

if [ ! -f "package.json" ]; then
  echo "Error: package.json not found. Are you in the right directory?"
  exit 1
fi

echo "Building project..."
npm run build

echo "Creating deploy.zip..."
rm -f deploy.zip
cd dist
zip -r ../deploy.zip .
cd ..

echo "Deploying frontend ZIP to Amplify..."

AMPLIFY_APP_ID="d11e4bu75ja2xt"
AMPLIFY_BRANCH="staging"
AWS_REGION="us-east-1"

DEPLOY_JSON=$(aws amplify create-deployment \
  --app-id "$AMPLIFY_APP_ID" \
  --branch-name "$AMPLIFY_BRANCH" \
  --region "$AWS_REGION")

JOB_ID=$(echo "$DEPLOY_JSON" | jq -r '.jobId')
UPLOAD_URL=$(echo "$DEPLOY_JSON" | jq -r '.zipUploadUrl')

curl -T deploy.zip "$UPLOAD_URL"

aws amplify start-deployment \
  --app-id "$AMPLIFY_APP_ID" \
  --branch-name "$AMPLIFY_BRANCH" \
  --job-id "$JOB_ID" \
  --region "$AWS_REGION"

echo "Amplify deployment started: job $JOB_ID"

echo "Syncing files to server..."
rsync -avz \
  --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'generated-logos' \
  --exclude 'generated-portraits' \
  --exclude 'generated-remote-vans' \
  --exclude 'generated-jingles' \
  --exclude 'saves' \
  --exclude 'data/cloud_saves' \
  --exclude 'data/stripe_customers.json' \
  --exclude 'logs' \
  --exclude 'server-deploy.sh' \
  --exclude 'landing-images' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'keys' \
  --exclude 'deploy.zip' \
  -e "ssh -i /Users/brianshrader/Documents/Games/Cursor/Frequencies/keys/airwaveempirekey.pem" \
  ./ admin@3.18.148.115:~/airwave-empire/


echo "Running server deploy..."
ssh -i /Users/brianshrader/Documents/Games/Cursor/Frequencies/keys/airwaveempirekey.pem \
  admin@3.18.148.115 \
  "cd ~/airwave-empire && ./server-deploy.sh"

echo "Done."


