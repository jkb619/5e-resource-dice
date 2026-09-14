# Resource Dice — build & release helper
#
# Usage:
#   make module    Bump version, commit & push, build module.zip, upload release
#   make bump      Interactively bump the version in module.json (M/m/p)
#   make push      Commit all changes and push to the current branch
#   make build     Build module.zip only (no version change, no upload)
#   make upload    Upload the current module.zip to a matching GitHub release
#   make clean     Remove the built zip
#   make version   Print the current version from module.json
#
# Requires: git, zip, python3, and the GitHub CLI (gh) authenticated via `gh auth login`.

# Files that ship inside the module. module.json MUST be at the archive root.
CONTENTS := module.json scripts styles lang README.md

# Read the version straight out of the manifest so the release tag always matches.
VERSION = $(shell python3 -c "import json; print(json.load(open('module.json'))['version'])")

ZIP := module.zip

.PHONY: module bump push build upload clean version

## Full release flow: bump the version, commit & push, build the zip, upload it.
## Push happens before upload so the branch manifest (which Foundry reads for
## updates) and the GitHub release always stay in lockstep.
module: bump push build upload

## Interactively bump the semantic version in module.json.
## Prompts for Major / minor / patch and shows the resulting version.
bump:
	@python3 scripts/bump_version.py

## Commit every change and push to the current branch. This keeps main's
## module.json in sync so Foundry sees the new version on refresh.
push:
	@command -v git >/dev/null 2>&1 || { echo "ERROR: git not found."; exit 1; }
	@if git diff --quiet && git diff --cached --quiet; then \
		echo "No changes to commit — pushing any unpushed commits."; \
	else \
		git add -A; \
		git commit -m "Release $(VERSION)"; \
	fi
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	echo "Pushing to origin/$$branch..."; \
	git push -u origin "$$branch"

## Build module.zip with the manifest at the archive root.
build: clean
	@echo "Building $(ZIP) (v$(VERSION))..."
	@zip -r $(ZIP) $(CONTENTS) -x '*.git*' '*/.DS_Store'
	@echo "Done. Contents:"
	@unzip -l $(ZIP)

## Publish the zip to a GitHub release tagged with the manifest version.
## Confirms the version with you first. If a release for this version already
## exists, its asset is replaced (--clobber); otherwise the release is created.
upload:
	@command -v gh >/dev/null 2>&1 || { echo "ERROR: GitHub CLI (gh) not found. Install it or upload manually."; exit 1; }
	@test -f $(ZIP) || { echo "ERROR: $(ZIP) not found. Run 'make build' first."; exit 1; }
	@echo ""
	@echo "About to upload version: $(VERSION)"
	@printf "Proceed with release v$(VERSION)? [y/N] "; \
	read ans; \
	case "$$ans" in \
		[yY]|[yY][eE][sS]) ;; \
		*) echo "Aborted."; exit 1 ;; \
	esac
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
