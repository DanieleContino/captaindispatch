<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:windows-shell-rules -->
# Windows Shell — CMD, not PowerShell

The default terminal in this workspace is **cmd.exe** (set via `.vscode/settings.json`).
- Use `&&` to chain commands: `git add . && git commit -m "..." && git push`
- Do NOT use PowerShell syntax (`;` as separator, `$env:`, etc.)
- If a command fails with "token '&&' is not a valid statement separator", the terminal has fallen back to PowerShell — run commands one by one or restart the terminal.
- All `execute_command` calls must use cmd-compatible syntax.
<!-- END:windows-shell-rules -->
