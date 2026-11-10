# Rebuilds every committed brand/icon asset from src/shared/brand/mark.json.
# Windows PowerShell 5.1+ / PowerShell on Windows; System.Drawing is OS-provided.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
# No network, native icon tools, fonts or additional dependencies are required.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root 'src-tauri/icons'
$brand = Join-Path $root 'public/brand'
$mark = Get-Content -LiteralPath (Join-Path $root 'src/shared/brand/mark.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $icons, $brand | Out-Null

function Get-BrandColor([string]$Name) {
    return [System.Drawing.ColorTranslator]::FromHtml($mark.palette.$Name)
}

function New-RoundedRectanglePath([float]$Size, [float]$Radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $arc = New-Object System.Drawing.RectangleF(0, 0, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)
    $arc.X = $Size - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Size - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = 0
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-Mark([System.Drawing.Graphics]$Graphics, [System.Drawing.Color]$Color) {
    $pen = New-Object System.Drawing.Pen($Color, [float]$mark.strokeWidth)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    foreach ($points in $mark.paths) {
        for ($index = 1; $index -lt $points.Count; $index++) {
            $a = $points[$index - 1]
            $b = $points[$index]
            $Graphics.DrawLine($pen, [float]$a[0], [float]$a[1], [float]$b[0], [float]$b[1])
        }
    }
    $brush = New-Object System.Drawing.SolidBrush($Color)
    $radius = [float]$mark.nodeRadius
    foreach ($point in $mark.nodes) {
        $Graphics.FillEllipse($brush, [float]($point[0] - $radius), [float]($point[1] - $radius), [float]($radius * 2), [float]($radius * 2))
    }
    $pen.Dispose()
    $brush.Dispose()
}

function New-IconBitmap([int]$Size, [string]$State = '') {
    # Render at 4x for smooth small-size edges; the source uses a 32-unit grid.
    $renderSize = $Size * 4
    $render = New-Object System.Drawing.Bitmap($renderSize, $renderSize)
    $graphics = [System.Drawing.Graphics]::FromImage($render)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.ScaleTransform([float]($renderSize / 32.0), [float]($renderSize / 32.0))
    $background = New-Object System.Drawing.SolidBrush((Get-BrandColor 'canvas'))
    $shape = New-RoundedRectanglePath 32 7
    $graphics.FillPath($background, $shape)
    if ($State) {
        # Leave space for the dot without changing the source mark proportions.
        $graphics.ScaleTransform(0.82, 0.82)
        Draw-Mark $graphics (Get-BrandColor 'trayMark')
        $graphics.ResetTransform()
        $graphics.ScaleTransform([float]($renderSize / 32.0), [float]($renderSize / 32.0))
        $rim = New-Object System.Drawing.SolidBrush((Get-BrandColor 'canvas'))
        $dot = New-Object System.Drawing.SolidBrush((Get-BrandColor $State))
        $glyph = New-Object System.Drawing.Pen((Get-BrandColor 'canvas'), 1.4)
        $glyph.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $glyph.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $glyphBrush = New-Object System.Drawing.SolidBrush((Get-BrandColor 'canvas'))
        $graphics.FillEllipse($rim, 18, 18, 14, 14)
        $graphics.FillEllipse($dot, 20, 20, 10, 10)
        switch ($State) {
            'running' {
                $graphics.DrawLine($glyph, 22.1, 25.1, 24.2, 27)
                $graphics.DrawLine($glyph, 24.2, 27, 27.9, 23)
            }
            'starting' {
                $graphics.DrawLine($glyph, 25, 22, 25, 25)
                $graphics.DrawLine($glyph, 25, 25, 27, 25)
            }
            'paused' {
                $graphics.FillRectangle($glyphBrush, 22.5, 22.5, 1.8, 5)
                $graphics.FillRectangle($glyphBrush, 25.7, 22.5, 1.8, 5)
            }
            'error' {
                $graphics.DrawLine($glyph, 25, 22, 25, 25.5)
                $graphics.FillEllipse($glyphBrush, 24.25, 27, 1.5, 1.5)
            }
            'stopped' { $graphics.FillRectangle($glyphBrush, 22.7, 22.7, 4.6, 4.6) }
        }
        $rim.Dispose()
        $dot.Dispose()
        $glyph.Dispose()
        $glyphBrush.Dispose()
    } else {
        Draw-Mark $graphics (Get-BrandColor 'accent')
    }
    $shape.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $resample = [System.Drawing.Graphics]::FromImage($bitmap)
    $resample.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resample.DrawImage($render, 0, 0, $Size, $Size)
    $resample.Dispose()
    $render.Dispose()
    return $bitmap
}

function Get-PngBytes([int]$Size, [string]$State = '') {
    $bitmap = New-IconBitmap $Size $State
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    $bytes = $stream.ToArray()
    $stream.Dispose()
    return ,$bytes
}

function Write-BigEndian([System.IO.BinaryWriter]$Writer, [uint32]$Value) {
    $bytes = [System.BitConverter]::GetBytes($Value)
    [Array]::Reverse($bytes)
    $Writer.Write($bytes)
}

# Explicit desktop outputs: no accidental mobile/Windows Store icon proliferation.
$pngFiles = @{
    'app-icon.png' = 1024
    'icon.png' = 512
    '32x32.png' = 32
    '64x64.png' = 64
    '128x128.png' = 128
    '128x128@2x.png' = 256
}
foreach ($entry in $pngFiles.GetEnumerator()) {
    [System.IO.File]::WriteAllBytes((Join-Path $icons $entry.Key), (Get-PngBytes $entry.Value))
}
foreach ($state in @('running', 'starting', 'paused', 'error', 'stopped')) {
    [System.IO.File]::WriteAllBytes((Join-Path $icons "tray-$state.png"), (Get-PngBytes 32 $state))
}

# ICO: PNG-compressed frames supported by Windows Vista+; all useful sizes.
$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$icoFrames = @($icoSizes | ForEach-Object { ,(Get-PngBytes $_) })
$icoStream = [System.IO.File]::Create((Join-Path $icons 'icon.ico'))
$icoWriter = New-Object System.IO.BinaryWriter($icoStream)
$icoWriter.Write([uint16]0)
$icoWriter.Write([uint16]1)
$icoWriter.Write([uint16]$icoSizes.Count)
$offset = 6 + 16 * $icoSizes.Count
for ($index = 0; $index -lt $icoSizes.Count; $index++) {
    $dimension = if ($icoSizes[$index] -eq 256) { 0 } else { $icoSizes[$index] }
    $icoWriter.Write([byte]$dimension)
    $icoWriter.Write([byte]$dimension)
    $icoWriter.Write([byte]0)
    $icoWriter.Write([byte]0)
    $icoWriter.Write([uint16]1)
    $icoWriter.Write([uint16]32)
    $icoWriter.Write([uint32]$icoFrames[$index].Length)
    $icoWriter.Write([uint32]$offset)
    $offset += $icoFrames[$index].Length
}
foreach ($frame in $icoFrames) { $icoWriter.Write([byte[]]$frame) }
$icoWriter.Dispose()

# ICNS: standard PNG-backed types, including Retina and 1024px representations.
$icnsTypes = @('icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10')
$icnsSizes = @(16, 32, 64, 128, 256, 512, 1024)
$icnsFrames = @($icnsSizes | ForEach-Object { ,(Get-PngBytes $_) })
$length = 8
foreach ($frame in $icnsFrames) { $length += 8 + $frame.Length }
$icnsStream = [System.IO.File]::Create((Join-Path $icons 'icon.icns'))
$icnsWriter = New-Object System.IO.BinaryWriter($icnsStream)
$icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
Write-BigEndian $icnsWriter $length
for ($index = 0; $index -lt $icnsTypes.Count; $index++) {
    $icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes($icnsTypes[$index]))
    Write-BigEndian $icnsWriter ($icnsFrames[$index].Length + 8)
    $icnsWriter.Write([byte[]]$icnsFrames[$index])
}
$icnsWriter.Dispose()

# Readable source-derived SVGs: header/forced-color mark and colored app master.
$paths = @($mark.paths | ForEach-Object {
    $points = @($_ | ForEach-Object { $_ -join ',' }) -join ' '
    "<polyline points=`"$points`"/>"
}) -join ''
$nodes = @($mark.nodes | ForEach-Object {
    "<circle cx=`"$($_[0])`" cy=`"$($_[1])`" r=`"$($mark.nodeRadius)`"/>"
}) -join ''
$geometry = "<g fill=`"none`" stroke=`"currentColor`" stroke-width=`"$($mark.strokeWidth)`" stroke-linecap=`"round`" stroke-linejoin=`"round`">$paths</g><g fill=`"currentColor`">$nodes</g>"
$svgMark = "<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 32 32`">$geometry</svg>`n"
$svgApp = "<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 32 32`" color=`"$($mark.palette.accent)`"><rect width=`"32`" height=`"32`" rx=`"7`" fill=`"$($mark.palette.canvas)`"/>$geometry</svg>`n"
[System.IO.File]::WriteAllText((Join-Path $brand 'mark-monochrome.svg'), $svgMark, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $brand 'mark.svg'), $svgApp, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Rebuilt desktop icons and SVGs from src/shared/brand/mark.json"
