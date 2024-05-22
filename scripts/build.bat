@echo off

rem Build dist/index.js file
pnpm run build:ncc

rem Add shebang to the top of dist/index.js
rem Note: Windows doesn't use shebangs, so this step is optional
echo // #!/usr/bin/env node > temp
type dist\index.js >> temp
move /y temp dist\index.js

rem Make dist/index.js executable (not needed on Windows)
rem chmod +x dist/index.js