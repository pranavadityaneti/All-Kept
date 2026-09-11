#!/usr/bin/env bash
# The app and its share extension are separate targets; CocoaPods cannot share a source file across
# them, so SharedStore.swift exists twice. This fails the moment the two copies differ.
set -e
cd "$(dirname "$0")/.."
cmp modules/share-save/ios/SharedStore.swift targets/share/SharedStore.swift && echo "SharedStore.swift: both copies identical"
