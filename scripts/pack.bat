pnpm pack
for /f %%i in ('dir /b /s *.tgz') do set "package=%%i"
npm install -g %package%