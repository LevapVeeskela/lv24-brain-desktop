#Requires -Version 5.1
<#
.SYNOPSIS
    Enables, disables or inspects Windows Error Reporting LocalDumps for lv24-brain-desktop.exe.

.DESCRIPTION
    Configures the machine-wide registry key
    HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\<AppName>.
    Enable and Disable need an elevated PowerShell. The script never triggers a UAC
    prompt: it refuses and exits with code 1 instead. Status is read-only, works for
    any user and is the default check when troubleshooting.

    The script is idempotent. It creates or removes only the app-specific subkey and
    never deletes other LocalDumps entries, unrelated registry keys or existing dump
    files. Dumps contain process memory; see docs/operations.md before sharing them.

.PARAMETER Enable
    Create or update the app-specific LocalDumps key. This is the default action.

.PARAMETER Disable
    Remove only the app-specific LocalDumps key. Existing dump files are kept.

.PARAMETER Status
    Print the current configuration, resolved dump folder and dump files. Read-only.

.PARAMETER DumpFolder
    Folder for dump files. Must be an absolute path or start with an environment
    variable. Default: %LOCALAPPDATA%\by.lv24.brain.desktop\crashes.

.PARAMETER DumpType
    0 = custom, 1 = mini (default), 2 = full.

.PARAMETER DumpCount
    Maximum number of dump files in the dump folder (1-100, default 10). When the
    limit is exceeded, WER replaces the oldest dump in the folder.

.PARAMETER AppName
    Executable file name without a path. Default: lv24-brain-desktop.exe.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\enable-local-dumps.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\enable-local-dumps.ps1 -Status

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\enable-local-dumps.ps1 -Disable

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\enable-local-dumps.ps1 -DumpType 2 -DumpCount 3
#>
[CmdletBinding(DefaultParameterSetName = 'Enable')]
param(
    [Parameter(ParameterSetName = 'Enable')]
    [switch]$Enable,

    [Parameter(ParameterSetName = 'Disable')]
    [switch]$Disable,

    [Parameter(ParameterSetName = 'Status')]
    [switch]$Status,

    [Parameter(ParameterSetName = 'Enable')]
    [ValidateNotNullOrEmpty()]
    [string]$DumpFolder = '%LOCALAPPDATA%\by.lv24.brain.desktop\crashes',

    [Parameter(ParameterSetName = 'Enable')]
    [ValidateSet(0, 1, 2)]
    [int]$DumpType = 1,

    [Parameter(ParameterSetName = 'Enable')]
    [ValidateRange(1, 100)]
    [int]$DumpCount = 10,

    [ValidatePattern('^[A-Za-z0-9._-]+\.exe$')]
    [string]$AppName = 'lv24-brain-desktop.exe'
)

$ErrorActionPreference = 'Stop'

$LocalDumpsRoot = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps'
$KeyPath = Join-Path -Path $LocalDumpsRoot -ChildPath $AppName

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-RegistryValue {
    param(
        [string]$Path,
        [string]$Name
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    $key = Get-Item -LiteralPath $Path
    return $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
}

function Format-ByteSize {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) {
        return ('{0:N1} GB' -f ($Bytes / 1GB))
    }
    if ($Bytes -ge 1MB) {
        return ('{0:N1} MB' -f ($Bytes / 1MB))
    }
    if ($Bytes -ge 1KB) {
        return ('{0:N1} KB' -f ($Bytes / 1KB))
    }
    return ('{0} B' -f $Bytes)
}

function Get-DumpTypeName {
    param($Value)
    switch ([string]$Value) {
        '0' { return '0 (custom)' }
        '1' { return '1 (mini)' }
        '2' { return '2 (full)' }
        default { return ("unexpected value '{0}'" -f $Value) }
    }
}

function Get-LocalDumpState {
    param([string]$Path)
    return [pscustomobject]@{
        Exists     = Test-Path -LiteralPath $Path
        DumpFolder = Get-RegistryValue -Path $Path -Name 'DumpFolder'
        DumpType   = Get-RegistryValue -Path $Path -Name 'DumpType'
        DumpCount  = Get-RegistryValue -Path $Path -Name 'DumpCount'
    }
}

function Resolve-DumpFolder {
    param([string]$Folder)
    $raw = $Folder.Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        throw 'DumpFolder must not be empty.'
    }
    $raw = $raw -replace '/', '\'
    while ($raw.Length -gt 3 -and $raw.EndsWith('\')) {
        $raw = $raw.Substring(0, $raw.Length - 1)
    }
    $expanded = [Environment]::ExpandEnvironmentVariables($raw)
    if ($expanded.IndexOf('%') -ge 0) {
        throw "DumpFolder contains an environment variable that is not defined: '$raw'."
    }
    if (-not [IO.Path]::IsPathRooted($expanded)) {
        throw "DumpFolder must be an absolute path or start with an environment variable such as %LOCALAPPDATA%: '$raw'."
    }
    try {
        $fullPath = [IO.Path]::GetFullPath($expanded)
    } catch {
        throw "DumpFolder is not a valid path: '$raw'."
    }
    if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        throw "DumpFolder points to an existing file: '$fullPath'."
    }
    return [pscustomobject]@{
        Stored   = $raw
        FullPath = $fullPath
    }
}

function Assert-Elevated {
    param([string]$Action)
    if (Test-IsElevated) {
        return
    }
    Write-Host ''
    Write-Host "-$Action needs an elevated PowerShell." -ForegroundColor Yellow
    Write-Host '  The LocalDumps key lives under HKLM and applies to every user on this machine.'
    Write-Host '  This script never prompts for UAC. Start an elevated shell and re-run the same'
    Write-Host '  command (including any -AppName, -DumpFolder, -DumpType or -DumpCount options):'
    Write-Host "    powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -$Action"
    Write-Host "  Key: $KeyPath"
    Write-Host ''
    Write-Host 'No changes were made.'
    exit 1
}

function Show-Status {
    $state = Get-LocalDumpState -Path $KeyPath
    Write-Host "LocalDumps for $AppName"
    Write-Host "  Key        : $KeyPath (machine-wide, HKLM)"
    if (-not $state.Exists) {
        Write-Host '  Configured : no (the app-specific key does not exist)'
        Write-Host '  Effect     : WER does not collect an app-specific dump for this executable.'
        Write-Host '  Enable     : run -Enable from an elevated shell (see docs/operations.md).'
        return
    }

    Write-Host '  Configured : yes'
    $resolved = $null
    if ($null -eq $state.DumpFolder) {
        Write-Host '  DumpFolder : (not set; WER default folder applies)'
    } else {
        $resolved = [Environment]::ExpandEnvironmentVariables([string]$state.DumpFolder)
        Write-Host "  DumpFolder : $($state.DumpFolder)"
        if (Test-Path -LiteralPath $resolved -PathType Container) {
            Write-Host "  Resolved   : $resolved (exists)"
        } else {
            Write-Host "  Resolved   : $resolved (missing)"
        }
    }

    if ($null -eq $state.DumpType) {
        Write-Host '  DumpType   : (not set)'
    } else {
        Write-Host "  DumpType   : $(Get-DumpTypeName $state.DumpType)"
    }

    if ($null -eq $state.DumpCount) {
        Write-Host '  DumpCount  : (not set)'
    } else {
        Write-Host "  DumpCount  : $($state.DumpCount)"
    }

    if ($null -ne $resolved -and (Test-Path -LiteralPath $resolved -PathType Container)) {
        $dumps = @(Get-ChildItem -LiteralPath $resolved -File -Filter '*.dmp' -ErrorAction SilentlyContinue)
        $totalBytes = [long]0
        foreach ($dump in $dumps) {
            $totalBytes += $dump.Length
        }
        Write-Host "  Dump files : $($dumps.Count) file(s), $(Format-ByteSize $totalBytes)"
        if ($dumps.Count -gt 0) {
            $latest = $dumps | Sort-Object -Property LastWriteTime -Descending | Select-Object -First 1
            Write-Host "  Newest     : $($latest.Name) ($($latest.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
        }
    } else {
        Write-Host '  Dump files : folder does not exist yet'
    }

    if (Test-IsElevated) {
        Write-Host '  Shell      : elevated'
    } else {
        Write-Host '  Shell      : not elevated (Status is read-only; Enable/Disable need admin)'
    }
}

function Invoke-Enable {
    $resolved = Resolve-DumpFolder -Folder $DumpFolder
    Assert-Elevated -Action 'Enable'

    try {
        [IO.Directory]::CreateDirectory($resolved.FullPath) | Out-Null
    } catch {
        throw "Cannot create dump folder '$($resolved.FullPath)': $($_.Exception.Message)"
    }
    if (-not (Test-Path -LiteralPath $resolved.FullPath -PathType Container)) {
        throw "Dump folder was not created: '$($resolved.FullPath)'."
    }

    $before = Get-LocalDumpState -Path $KeyPath
    $changed = (-not $before.Exists) -or
        ([string]$before.DumpFolder -ne $resolved.Stored) -or
        ($before.DumpType -ne $DumpType) -or
        ($before.DumpCount -ne $DumpCount)

    try {
        if (-not (Test-Path -LiteralPath $KeyPath)) {
            New-Item -Path $KeyPath -Force | Out-Null
        }
        New-ItemProperty -LiteralPath $KeyPath -Name 'DumpFolder' -PropertyType ExpandString -Value $resolved.Stored -Force | Out-Null
        New-ItemProperty -LiteralPath $KeyPath -Name 'DumpType' -PropertyType DWord -Value $DumpType -Force | Out-Null
        New-ItemProperty -LiteralPath $KeyPath -Name 'DumpCount' -PropertyType DWord -Value $DumpCount -Force | Out-Null
    } catch {
        throw "Cannot write '$KeyPath': $($_.Exception.Message)"
    }

    $after = Get-LocalDumpState -Path $KeyPath
    if (-not $after.Exists -or
        [string]$after.DumpFolder -ne $resolved.Stored -or
        $after.DumpType -ne $DumpType -or
        $after.DumpCount -ne $DumpCount) {
        throw "Registry verification failed for '$KeyPath'. Re-run -Status for the stored values."
    }

    Write-Host ''
    if ($before.Exists -and -not $changed) {
        Write-Host "Already configured: $AppName (no changes needed)"
    } elseif ($before.Exists) {
        Write-Host "Updated LocalDumps for $AppName"
    } else {
        Write-Host "Enabled LocalDumps for $AppName"
    }
    Write-Host "  Key        : $KeyPath"
    Write-Host "  DumpFolder : $($resolved.Stored)"
    Write-Host "  Resolved   : $($resolved.FullPath)"
    Write-Host "  DumpType   : $(Get-DumpTypeName $DumpType)"
    Write-Host "  DumpCount  : $DumpCount"
    Write-Host '  Scope      : machine-wide (HKLM), applies to all users'
    Write-Host '  Privacy    : dumps contain process memory; see docs/operations.md before sharing.'
}

function Invoke-Disable {
    Assert-Elevated -Action 'Disable'
    if (-not (Test-Path -LiteralPath $KeyPath)) {
        Write-Host "LocalDumps is not configured for $AppName (key does not exist). Nothing to remove."
        return
    }

    $folder = Get-RegistryValue -Path $KeyPath -Name 'DumpFolder'
    try {
        Remove-Item -LiteralPath $KeyPath -Force
    } catch {
        throw "Cannot remove '$KeyPath': $($_.Exception.Message)"
    }
    if (Test-Path -LiteralPath $KeyPath) {
        throw "Registry key still exists after removal: '$KeyPath'."
    }

    Write-Host "Removed LocalDumps configuration for $AppName."
    Write-Host "  Key        : $KeyPath"
    if ($null -ne $folder) {
        Write-Host "  Dumps kept : $([Environment]::ExpandEnvironmentVariables([string]$folder))"
    }
    Write-Host '  Scope      : other LocalDumps entries, registry keys and dump files were not touched.'
}

if (-not (Test-Path -LiteralPath 'HKLM:\')) {
    Write-Host 'This script only supports Windows (no HKLM: registry provider is available).' -ForegroundColor Red
    exit 1
}

try {
    switch ($PSCmdlet.ParameterSetName) {
        'Enable' { Invoke-Enable; exit 0 }
        'Disable' { Invoke-Disable; exit 0 }
        'Status' { Show-Status; exit 0 }
        default { throw "Unsupported action '$($PSCmdlet.ParameterSetName)'." }
    }
} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
