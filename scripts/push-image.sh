#!/usr/bin/env bash
# Builds the app image, pushes it to the ECR repository Terraform created, and
# restarts the ECS service on it. Run after `terraform -chdir=infra apply`.
# Needs: AWS CLI v2 logged in to the same account, Docker.
set -euo pipefail

tf() { terraform -chdir=infra output -raw "$1"; }
REPO="$(tf ecr_repository_url)"
CLUSTER="$(tf ecs_cluster)"
SERVICE="$(tf ecs_service)"
REGION="$(echo "$REPO" | cut -d. -f4)"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build --platform linux/amd64 -t "$REPO:latest" .
docker push "$REPO:latest"
aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment > /dev/null
echo "Waiting for the service to become stable..."
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"
echo "Done: $(tf app_url)"
