#!/bin/bash

# Caravan-X Publishing Script
# Usage: ./scripts/publish.sh [patch|minor|major]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Caravan-X Publishing Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if we're on main branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  echo -e "${RED}Error: You must be on the main/master branch to publish.${NC}"
  echo -e "Current branch: ${YELLOW}$BRANCH${NC}"
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: You have uncommitted changes.${NC}"
  echo "Please commit or stash them before publishing."
  git status --short
  exit 1
fi

# Get version bump type (default to patch)
VERSION_TYPE=${1:-patch}

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo -e "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
  echo "Usage: ./scripts/publish.sh [patch|minor|major]"
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${YELLOW}$CURRENT_VERSION${NC}"
echo -e "Bump type: ${YELLOW}$VERSION_TYPE${NC}"
echo ""

# Confirmation
read -p "Continue with $VERSION_TYPE version bump? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi


echo ""
echo -e "${GREEN}Step 1: Building project...${NC}"
npm run build

echo ""
echo -e "${GREEN}Step 2: Bumping version ($VERSION_TYPE)...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "New version: ${GREEN}$NEW_VERSION${NC}"

echo ""
echo -e "${GREEN}Step 3: Committing version bump...${NC}"
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"

echo ""
echo -e "${GREEN}Step 4: Creating git tag...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo -e "${GREEN}Step 5: Pushing to remote...${NC}"
git push origin $BRANCH
git push origin "v$NEW_VERSION"

echo ""
echo -e "${GREEN}Step 6: Publishing to npm...${NC}"
npm publish

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Successfully published v$NEW_VERSION!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Package: https://www.npmjs.com/package/caravan-x"
echo "Release: https://github.com/Legend101Zz/CaravanX/releases/tag/v$NEW_VERSION"
