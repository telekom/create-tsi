REM SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
REM
REM SPDX-License-Identifier: MIT

pnpm pack
for /f %%i in ('dir /b /s *.tgz') do set "package=%%i"
npm install -g %package%