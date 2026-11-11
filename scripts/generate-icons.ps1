# Rebuilds brand/icon geometry from mark.json and colors from global.css :root.
# Windows PowerShell 5.1+ / PowerShell on Windows; System.Drawing is OS-provided.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
# No network, native icon tools, fonts or additional dependencies are required.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root 'src-tauri/icons'
$brand = Join-Path $root 'public/brand'
$mark = Get-Content -LiteralPath (Join-Path $root 'src/shared/brand/mark.json') -Raw | ConvertFrom-Json
$stylesheet = Get-Content -LiteralPath (Join-Path $root 'src/app/styles/global.css') -Raw
$tokenBlock = [regex]::Match($stylesheet, '(?s):root\s*\{(?<tokens>.*?)\}')
if (-not $tokenBlock.Success) {
    throw 'Cannot generate icons: global.css has no :root token block.'
}
$hexTokens = @{}
foreach ($token in [regex]::Matches($tokenBlock.Groups['tokens'].Value, '(?m)^\s*(?<name>--[a-zA-Z0-9-]+)\s*:\s*(?<hex>#[a-fA-F0-9]{6})\s*;')) {
    $hexTokens[$token.Groups['name'].Value] = $token.Groups['hex'].Value
}
$palette = @{}
foreach ($entry in $mark.palette.PSObject.Properties) {
    $tokenName = [string]$entry.Value
    if (-not $hexTokens.ContainsKey($tokenName)) {
        throw "Cannot generate icons: palette '$($entry.Name)' requires a direct six-digit HEX :root token '$tokenName'."
    }
    $palette[$entry.Name] = $hexTokens[$tokenName]
}
New-Item -ItemType Directory -Force -Path $icons, $brand | Out-Null

function Get-BrandColor([string]$Name) {
    if (-not $palette.ContainsKey($Name)) {
        throw "Unknown icon palette entry '$Name'."
    }
    return [System.Drawing.ColorTranslator]::FromHtml($palette[$Name])
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

function New-MarkPath([string]$Data) {
    # The shared source uses absolute SVG M/L/C/Z commands, never SVG rasterization.
    $number = '[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?'
    $pattern = "[MLCZ]|$number"
    if ([regex]::Replace($Data, $pattern, '') -notmatch '^[\s,]*$') {
        throw "Unsupported command in mark geometry: $Data"
    }
    $tokens = @([regex]::Matches($Data, $pattern) | ForEach-Object { $_.Value })
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $index = 0
    $current = $null
    $start = $null
    try {
        while ($index -lt $tokens.Count) {
            $command = $tokens[$index++]
            $count = switch ($command) { 'M' { 2 } 'L' { 2 } 'C' { 6 } 'Z' { 0 } default { throw 'Expected an absolute M/L/C/Z command.' } }
            if ($index + $count -gt $tokens.Count) { throw "Incomplete $command command in mark geometry." }
            $values = @()
            for ($item = 0; $item -lt $count; $item++) {
                $values += [float]::Parse($tokens[$index++], [System.Globalization.CultureInfo]::InvariantCulture)
            }
            if ($command -ne 'M' -and $null -eq $current) { throw 'Mark paths must start with M.' }
            switch ($command) {
                'M' {
                    $path.StartFigure()
                    $current = $values
                    $start = $values
                }
                'L' {
                    $path.AddLine([float]$current[0], [float]$current[1], [float]$values[0], [float]$values[1])
                    $current = $values
                }
                'C' {
                    $path.AddBezier([float]$current[0], [float]$current[1], [float]$values[0], [float]$values[1], [float]$values[2], [float]$values[3], [float]$values[4], [float]$values[5])
                    $current = @($values[4], $values[5])
                }
                'Z' {
                    $path.CloseFigure()
                    $current = $start
                }
            }
        }
        if ($path.PointCount -eq 0) { throw 'Empty mark geometry.' }
        return $path
    } catch {
        $path.Dispose()
        throw
    }
}

function Draw-Mark([System.Drawing.Graphics]$Graphics, [System.Drawing.Color]$Color) {
    $brush = New-Object System.Drawing.SolidBrush($Color)
    foreach ($path in $silhouettePaths) { $Graphics.FillPath($brush, $path) }
    $cut = New-Object System.Drawing.Pen((Get-BrandColor 'canvas'), [float]$mark.cutoutWidth)
    $cut.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cut.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cut.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    foreach ($path in $cutoutPaths) { $Graphics.DrawPath($cut, $path) }
    $cut.Dispose()
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
        $graphics.TranslateTransform(1.28, 1.28)
        $graphics.ScaleTransform(0.84, 0.84)
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
        $graphics.TranslateTransform(2.56, 2.56)
        $graphics.ScaleTransform(0.84, 0.84)
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

# Validate all source geometry before writing any generated assets.
$silhouettePaths = @($mark.silhouettes | ForEach-Object { New-MarkPath $_ })
$cutoutPaths = @($mark.cutouts | ForEach-Object { New-MarkPath $_ })

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
$paths = @($mark.silhouettes | ForEach-Object { "<path d=`"$_`"/>" }) -join ''
$cuts = @($mark.cutouts | ForEach-Object { "<path d=`"$_`"/>" }) -join ''
$mask = "<defs><mask id=`"neuro-cutouts`" maskUnits=`"userSpaceOnUse`" x=`"0`" y=`"0`" width=`"32`" height=`"32`" style=`"forced-color-adjust:none`"><rect width=`"32`" height=`"32`" fill=`"white`"/><g fill=`"none`" stroke=`"black`" stroke-width=`"$($mark.cutoutWidth)`" stroke-linecap=`"round`" stroke-linejoin=`"round`">$cuts</g></mask></defs>"
$geometry = "$mask<g fill=`"currentColor`" mask=`"url(#neuro-cutouts)`">$paths</g>"
$svgMark = "<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 32 32`">$geometry</svg>`n"
$svgApp = "<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 32 32`" color=`"$($palette.accent)`"><rect width=`"32`" height=`"32`" rx=`"7`" fill=`"$($palette.canvas)`"/><g transform=`"translate(2.56 2.56) scale(.84)`">$geometry</g></svg>`n"
[System.IO.File]::WriteAllText((Join-Path $brand 'mark-monochrome.svg'), $svgMark, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $brand 'mark.svg'), $svgApp, (New-Object System.Text.UTF8Encoding($false)))
foreach ($path in @($silhouettePaths) + @($cutoutPaths)) { $path.Dispose() }
Write-Host "Rebuilt desktop icons and SVGs from mark.json geometry and global.css theme tokens"
