Add-Type -AssemblyName System.Drawing

$srcIconPath = (Resolve-Path 'desktop/src-tauri/icons/icon.png').Path
$orig = [System.Drawing.Bitmap]::FromFile($srcIconPath)

# Bounding box of white ROG font logo in 512x512 icon.png is [84..428, 148..270]
$srcX = 84
$srcY = 148
$srcW = 344
$srcH = 122

# Crop and extract alpha-channel white logo
$logo = New-Object System.Drawing.Bitmap($srcW, $srcH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($x = 0; $x -lt $srcW; $x++) {
    for ($y = 0; $y -lt $srcH; $y++) {
        $p = $orig.GetPixel($srcX + $x, $srcY + $y)
        $t = ($p.R - 15.0) / (255.0 - 15.0)
        if ($t -lt 0) { $t = 0 }
        if ($t -gt 1) { $t = 1 }
        $a = [int][Math]::Round($t * 255.0)
        $logo.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
    }
}

function Get-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2.0
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

$densities = @(
    @{ name = 'mipmap-ldpi'; legacy = 36; adaptive = 81 },
    @{ name = 'mipmap-mdpi'; legacy = 48; adaptive = 108 },
    @{ name = 'mipmap-hdpi'; legacy = 72; adaptive = 162 },
    @{ name = 'mipmap-xhdpi'; legacy = 96; adaptive = 216 },
    @{ name = 'mipmap-xxhdpi'; legacy = 144; adaptive = 324 },
    @{ name = 'mipmap-xxxhdpi'; legacy = 192; adaptive = 432 }
)

$bgColor = [System.Drawing.Color]::FromArgb(255, 15, 23, 42) # #0F172A

foreach ($d in $densities) {
    $dir = Join-Path 'mobile/android/app/src/main/res' $d.name
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $L = $d.legacy
    $A = $d.adaptive

    # 1. ic_launcher.png (Legacy squircle / rounded rect)
    $bmpLegacy = New-Object System.Drawing.Bitmap($L, $L, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmpLegacy)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $r = [float]($L * 0.18)
    $path = Get-RoundedRectPath 0 0 $L $L $r
    $g.FillPath($brush, $path)

    $targetW = [float]($L * 0.65)
    $targetH = [float]($targetW * ($srcH / [float]$srcW))
    $targetX = [float](($L - $targetW) / 2.0)
    $targetY = [float](($L - $targetH) / 2.0 - ($L * 0.02))
    $g.DrawImage($logo, [System.Drawing.RectangleF]::new($targetX, $targetY, $targetW, $targetH))
    $g.Dispose()
    $brush.Dispose()
    $path.Dispose()

    $bmpLegacy.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpLegacy.Dispose()

    # 2. ic_launcher_round.png (Legacy circle)
    $bmpRound = New-Object System.Drawing.Bitmap($L, $L, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmpRound)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $brush = New-Object System.Drawing.SolidBrush($bgColor)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, ($L - 1), ($L - 1))
    $g.FillPath($brush, $path)

    $targetW = [float]($L * 0.60)
    $targetH = [float]($targetW * ($srcH / [float]$srcW))
    $targetX = [float](($L - $targetW) / 2.0)
    $targetY = [float](($L - $targetH) / 2.0 - ($L * 0.02))
    $g.DrawImage($logo, [System.Drawing.RectangleF]::new($targetX, $targetY, $targetW, $targetH))
    $g.Dispose()
    $brush.Dispose()
    $path.Dispose()

    $bmpRound.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpRound.Dispose()

    # 3. ic_launcher_foreground.png (Adaptive icon foreground, 108dp canvas, safe zone 72dp)
    $bmpFg = New-Object System.Drawing.Bitmap($A, $A, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmpFg)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $targetW = [float]($A * 0.58)
    $targetH = [float]($targetW * ($srcH / [float]$srcW))
    $targetX = [float](($A - $targetW) / 2.0)
    $targetY = [float](($A - $targetH) / 2.0 - ($A * 0.02))
    $g.DrawImage($logo, [System.Drawing.RectangleF]::new($targetX, $targetY, $targetW, $targetH))
    $g.Dispose()

    $bmpFg.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpFg.Dispose()

    # 4. ic_launcher_background.png (Adaptive icon background, 108dp solid #0F172A)
    $bmpBg = New-Object System.Drawing.Bitmap($A, $A, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmpBg)
    $g.Clear($bgColor)
    $g.Dispose()

    $bmpBg.Save((Join-Path $dir 'ic_launcher_background.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpBg.Dispose()

    Write-Host "Generated icons for $dir (Legacy: ${L}x${L}, Adaptive: ${A}x${A})"
}

$orig.Dispose()
$logo.Dispose()
Write-Host 'Icon generation complete!'
