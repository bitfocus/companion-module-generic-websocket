# companion-module-generic-websocket

See HELP.md and LICENSE

# Version History

### v2.3.1 (2026-04-09)
* Bugfix: Add error handling to WebSocket ping logic to prevent process crashes [H1]
* Bugfix: Fix Origin header protocol mismatch (use HTTPS for WSS connections) [H2]
* Bugfix: Fix bitwise logic error in upgrade script [C2]
* Bugfix: add WebSocket state check before sending to prevent crashes [C1]
* Maintenance: Add .gitattributes for consistent line endings [C4]
* Maintenance: Add Prettier for code formatting and enforce Node 22+ requirements [C5, M4]

### v2.3.0 (2026-03-22)
* Feature: add User Agent simulation (Chrome, Firefox, Safari, Custom)
* Feature: add configurable hex ping to keep connection alive
* Feature: add Send Hex action for binary protocol devices
* Bugfix: fix ping timer not stopping when disabled in config

### v2.2.0 (2025-05-20)
* Feature: add option to add prefix and suffix to feedback JSON path
* Feature: extend termination characters to various common options
* Feature: add variable for timestamp of last data received
* Bugfix: promisify send action to work with action groups
* Chore: bump companion-module/base to 1.12.0
* Chore: bump ws to 8.18.2
* Chore: bump companion-module/tools to 2.3.0

### v2.1.0 (2023-04-18)
* Feature: change connection parameters from IP / Port to URL
* Feature: add regex checking for Host URL
* Feature: add option to append return-newline to sent data
* Chore: bump object-path to 0.11.8

### v2.0.0 (2022-03-07)
* Major: rewrite for Companion v3

### v1.0.3 (2022-05-28)
* Bugfix: fix reconnect timer

### v1.0.2 (2022-04-16)
* Feat: allow defining variable name for feedback 

### v1.0.1 (2022-02-02)
* Chore: Bulk reformat

### v1.0.0 (2021-08-18)
* Initial Release