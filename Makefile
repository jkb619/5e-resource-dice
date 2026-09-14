# Resource Dice — build & release helper
#
# Usage:
#   make module    Build module.zip and upload it to a GitHub release
#   make build     Build module.zip only (no upload)
#   make clean      Remove the built zip
#
# Requires: zip, python3, and the GitHub CLI (gh) authenticated via `gh auth login`.

# Files that ship inside the module. module.json MUST be at the archive root.
CONTENTS := module.json scripts styles lang README.md

# Read the version straight out of the manifest so the release tag always matches.
VERSION := $(shell python3 -c "import json; print(json.load(open('module.json'))['version'])")

ZIP := module.zip

.PHONY: module build upload clean version

## Build the zip, then create/replace the matching GitHub release.
module: build upload

## Build module.zip with the manifest at the archive root.
build: clean
	@echo "Building $(ZIP) (v$(VERSION))..."
	@zip -r $(ZIP) $(CONTENTS) -x '*.git*' '*/.DS_Store'
	@echo "Done. Contents:"
	@unzip -l $(ZIP)

## Publish the zip to a GitHub release tagged with the manifest version.
## If a release for this version already exists, its asset is replaced.
upload:
	@command -v gh >/dev/null 2>&1 || { echo "ERROR: GitHub CLI (gh) not found. Install it or run 'make build' and upload manually."; exit 1; }
	@test -f $(ZIP) || { echo "ERROR: $(ZIP) not found. Run 'make build' first."; exit 1; }
	@if gh release view $(VERSION) >/dev/null 2>&1; then \
		echo "Release $(VERSION) exists — replacing asset..."; \
		gh release upload $(VERSION) $(ZIP) --clobber; \
	else \
		echo "Creating release $(VERSION)..."; \
		gh release create $(VERSION) $(ZIP) --title "$(VERSION)" --notes "Release $(VERSION)"; \
	fi
	@echo "Uploaded $(ZIP) to release $(VERSION)."

## Remove the built artifact.
clean:
	@rm -f $(ZIP)

## Print the version parsed from module.json.
version:
	@echo $(VERSION)
