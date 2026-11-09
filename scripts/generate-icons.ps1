# Generates the committed app and tray icons with System.Drawing (Windows).
# The generated PNGs are checked in, so this script is only needed when the
# visual identity changes.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root "src-tauri/icons"
New-Item -ItemType Directory -Force -Path $icons | Out-Null

function New-RoundedRectanglePath {
    param(
        [System.Drawing.RectangleF]$Rect,
        [float]$Radius
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $arc = New-Object System.Drawing.RectangleF($Rect.X, $Rect.Y, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)
    $arc.X = $Rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $Rect.X
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-AppIcon {
    param([int]$Size, [string]$Path)
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $shape = New-RoundedRectanglePath $rect ($Size * 0.19)
    $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 13, 26, 48),
        [System.Drawing.Color]::FromArgb(255, 4, 10, 20),
        42.0
    )
    $graphics.FillPath($background, $shape)

    $nodes = @(
        @(0.50, 0.20), @(0.50, 0.80), @(0.23, 0.34), @(0.77, 0.34),
        @(0.23, 0.66), @(0.77, 0.66), @(0.50, 0.50)
    )
    $linkPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(115, 52, 211, 153), [Math]::Max(2.0, $Size * 0.011))
    foreach ($node in $nodes) {
        $graphics.DrawLine(
            $linkPen,
            [float]($Size * 0.5),
            [float]($Size * 0.5),
            [float]($Size * $node[0]),
            [float]($Size * $node[1])
        )
    }
    $linkPen.Dispose()

    $accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))
    foreach ($node in $nodes) {
        $radius = if ($node[0] -eq 0.50 -and $node[1] -eq 0.50) { $Size * 0.085 } else { $Size * 0.054 }
        $graphics.FillEllipse(
            $accent,
            [float]($Size * $node[0] - $radius),
            [float]($Size * $node[1] - $radius),
            [float]($radius * 2),
            [float]($radius * 2)
        )
    }

    $hole = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 8, 15, 26))
    $holeRadius = $Size * 0.034
    $graphics.FillEllipse($hole, [float]($Size * 0.5 - $holeRadius), [float]($Size * 0.5 - $holeRadius), [float]($holeRadius * 2), [float]($holeRadius * 2))

    $hole.Dispose()
    $accent.Dispose()
    $background.Dispose()
    $shape.Dispose()
    $graphics.Dispose()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

function New-TrayIcon {
    param([string]$Name, [System.Drawing.Color]$Color, [string]$Path)
    $size = 32
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $rim = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 2, 6, 12))
    $graphics.FillEllipse($rim, 1, 1, 30, 30)
    $dot = New-Object System.Drawing.SolidBrush($Color)
    $graphics.FillEllipse($dot, 5, 5, 22, 22)
    $shine = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
    $graphics.FillEllipse($shine, 9, 8, 7, 5)

    $shine.Dispose()
    $dot.Dispose()
    $rim.Dispose()
    $graphics.Dispose()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

New-AppIcon -Size 1024 -Path (Join-Path $icons "app-icon.png")
New-TrayIcon -Name "running" -Color ([System.Drawing.Color]::FromArgb(255, 52, 211, 153)) -Path (Join-Path $icons "tray-running.png")
New-TrayIcon -Name "starting" -Color ([System.Drawing.Color]::FromArgb(255, 251, 191, 36)) -Path (Join-Path $icons "tray-starting.png")
New-TrayIcon -Name "paused" -Color ([System.Drawing.Color]::FromArgb(255, 148, 163, 184)) -Path (Join-Path $icons "tray-paused.png")
New-TrayIcon -Name "error" -Color ([System.Drawing.Color]::FromArgb(255, 248, 113, 113)) -Path (Join-Path $icons "tray-error.png")
New-TrayIcon -Name "stopped" -Color ([System.Drawing.Color]::FromArgb(255, 100, 116, 139)) -Path (Join-Path $icons "tray-stopped.png")

Write-Host "icons written to $icons"
