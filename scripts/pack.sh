#!/usr/bin/env bash

# SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
#
# SPDX-License-Identifier: MIT

pnpm pack && npm install -g $(pwd)/$(ls ./*.tgz | head -1)