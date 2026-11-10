# Operations: Windows crash dumps

Windows Error Reporting (WER) **LocalDumps** writes a dump when
`lv24-brain-desktop.exe` dies from an unhandled native exception.
`scripts/enable-local-dumps.ps1` configures it with built-in Windows tools only:
no debugger, SDK or extra runtime dependency is required.

## What it captures

- Access violations, stack overflows, heap corruption and similar unhandled
  exceptions (`0xC0000005`, `0xC00000FD`, `0xC0000374`, ...).
- Abort-style exits such as `0xC0000409` (`abort()`), when the process actually
  raises the exception.
- One dump per crash, written by `WerFault.exe` shortly after the process exits.
  Dumps are named `<exe>.<pid>.dmp`.

It does **not** capture:

- Task Manager "End task", `taskkill /F`, logoff or shutdown: these call
  `TerminateProcess` without an exception, so there is nothing to dump.
- Ordinary Rust or Go panics that print a message and exit normally. A panic
  that aborts the process can still produce a dump; a normal unwind usually
  does not. Use the app log for those.
- Hangs or freezes. LocalDumps runs only on a crash.
- Other executables. The bundled engine sidecar (`brain.exe`), WebView2
  renderers (`msedgewebview2.exe`) and installers need their own configuration,
  for example `-AppName brain.exe`.
- Crashes when WER is disabled by policy or a debugger is attached.

## Registry values

The script writes one machine-wide key, only when `-Enable` runs elevated:

`HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\lv24-brain-desktop.exe`

| Value | Type | Meaning |
| --- | --- | --- |
| `DumpFolder` | `REG_EXPAND_SZ` | Where dumps are written. Default `%LOCALAPPDATA%\by.lv24.brain.desktop\crashes`. |
| `DumpType` | `REG_DWORD` | `0` custom, `1` mini (default), `2` full. |
| `DumpCount` | `REG_DWORD` | Maximum dump files in the folder (default `10`); when exceeded, the oldest is replaced. |

`0` is accepted for compatibility, but custom dumps normally need
`CustomDumpFlags`, which this script does not set; prefer `1` or `2`.

## Enable, inspect, disable

Enable (elevated PowerShell; the script refuses and exits `1` otherwise and
never shows a UAC prompt itself):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/enable-local-dumps.ps1 -Enable
```

Re-running is safe: unchanged settings report `Already configured`, the folder
is created if missing and the key is written only if needed.

Inspect (no elevation needed, changes nothing):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/enable-local-dumps.ps1 -Status
```

Disable (elevated) removes only the app-specific key; existing dumps and other
applications' LocalDumps entries are left alone:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/enable-local-dumps.ps1 -Disable
```

Custom folder, dump type or dump count (also elevated):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/enable-local-dumps.ps1 `
  -DumpFolder 'C:\ProgramData\lv24-brain\crashes' -DumpType 2 -DumpCount 3
```

`-DumpFolder` must be absolute or start with an environment variable. The
default keeps `%LOCALAPPDATA%`, so WER resolves it per crashing user.

## Where dumps land

The default is `%LOCALAPPDATA%\by.lv24.brain.desktop\crashes`, for example
`C:\Users\<name>\AppData\Local\by.lv24.brain.desktop\crashes`. Because the key
is under HKLM, every user gets their own folder with this default. The script
creates the folder for the account that runs it; on a shared PC either create
the folder for each user or pass a path that every user can write to.

## Disk use and privacy

Dumps contain process memory. Mini dumps are usually a few MB to tens of MB;
full dumps can reach hundreds of MB or more. `DumpCount` caps the number of
dump files in the folder, not their size, and the script never deletes dumps for
you.

A dump may contain the local API bearer token, prompts, project paths,
usernames, configuration values and other data the process held in memory. It
is not encrypted and inherits the profile's file permissions. Treat it as
private: do not paste dumps into public issues, chats or repositories, and
delete files you no longer need.

## Attaching a dump to an issue

Include:

- App version (About/Settings), Windows build (`winver`), engine version
  (`brain version`).
- Local time with time zone of the crash, what you were doing, and whether the
  app crashed or was killed. Killed processes produce no dump.
- The exception code from Event Viewer (Windows Logs > Application,
  "Application Error", event 1000) and relevant lines from the app log.
- The dump, zipped, through a private channel. For public issues prefer the
  `!analyze -v` output or the faulting stack from WinDbg instead of the file.

Do not attach a full dump publicly without reviewing it; it can contain
personal data and secrets.

## If no dump appears

- Run `-Status`: it shows the key, resolved folder, dump type and existing files.
- Check that the executable name matches the running process exactly, for
  example `lv24-brain-desktop.exe`; use `-AppName` for another binary.
- Confirm the Windows Error Reporting service is running: `Get-Service WerSvc`.
- Check policy `HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting`
  for `Disabled=1`, and check free disk space and folder permissions.
- Remember that Task Manager kills and handled exceptions never produce dumps.
