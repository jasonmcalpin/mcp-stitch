#!/usr/bin/env bash
set -euo pipefail

VERSION_BUMP="${1:-patch}"
NPM_CACHE="${NPM_CACHE:-/private/tmp/mcp-stitch-npm-cache}"

case "$VERSION_BUMP" in
  patch|minor|major|prepatch|preminor|premajor|prerelease)
    ;;
  *)
    echo "Invalid version bump: $VERSION_BUMP"
    echo "Use one of: patch, minor, major, prepatch, preminor, premajor, prerelease"
    exit 1
    ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. That is okay for a release,"
  echo "but they will be included in the release commit after publish."
  echo
fi

echo "Release bump: $VERSION_BUMP"
echo "npm cache: $NPM_CACHE"
echo

read -r -p "Commit message: " COMMIT_MESSAGE
if [[ -z "${COMMIT_MESSAGE// }" ]]; then
  echo "Commit message is required."
  exit 1
fi

echo
echo "Bumping package version..."
npm version "$VERSION_BUMP" --no-git-tag-version

VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

echo
echo "Building..."
npm run build

echo
echo "Checking package contents..."
npm --cache "$NPM_CACHE" pack --dry-run

echo
read -r -p "Publish mcp-stitch@$VERSION to npm? [y/N] " CONFIRM_PUBLISH
case "$CONFIRM_PUBLISH" in
  y|Y|yes|YES)
    npm --cache "$NPM_CACHE" publish --access public
    ;;
  *)
    echo "Publish cancelled. Version files were updated but no npm package was published."
    exit 1
    ;;
esac

echo
echo "Committing and pushing..."
git add .
git commit -m "$COMMIT_MESSAGE"
git tag "$TAG"
git push
git push origin "$TAG"

echo
echo "Released mcp-stitch@$VERSION and pushed $TAG."
