@echo off
echo Starting MYRQAI Worker Engine...
cd worker
start cmd /k "node ghost-server.js"
echo Starting MYRQAI Main Worker...
start cmd /k "node worker.js"
echo All systems active.
pause