<#
.SYNOPSIS
    Automated Packaging & Release Verification Script for MoneyVision Universal Release APK
.DESCRIPTION
    Runs Ticket 07 Universal Release APK Packaging and verifies 10 Security & Compatibility Criteria.
.PARAMETER Mode
    Packaging mode: auto (default), gradle, offline, or verify.
.PARAMETER VerifyOnly
    Switch to run only the 10-criteria security verification without building an APK.
#>

param(
    [string]$Mode = "auto",
    [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host "   MONEYVISION - UNIVERSAL RELEASE APK PACKAGING (POWERSHELL)" -ForegroundColor Cyan
Write-Host "   Mode: $Mode | VerifyOnly: $($VerifyOnly.IsPresent)" -ForegroundColor Cyan
Write-Host "========================================================================`n" -ForegroundColor Cyan

# 1. Check Node.js runtime
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js runtime detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Error "Node.js is not found in PATH. Please install Node.js 18+ to package the APK."
    exit 1
}

# 2. Check Java & keytool environment
$keytoolFound = $false
try {
    & keytool -help >$null 2>&1
    Write-Host "[OK] keytool utility detected in PATH" -ForegroundColor Green
    $keytoolFound = $true
} catch {
    # Check standard JDK directories
    $jdkPaths = @(
        "C:\Program Files\Java\jdk-25",
        "C:\Program Files\Java\jdk-21",
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\Android\Android Studio\jbr"
    )
    foreach ($jdk in $jdkPaths) {
        $kt = Join-Path $jdk "bin\keytool.exe"
        if (Test-Path $kt) {
            Write-Host "[OK] Java JDK detected at $jdk" -ForegroundColor Green
            if (-not $env:JAVA_HOME) {
                $env:JAVA_HOME = $jdk
            }
            $env:PATH = "$jdk\bin;" + $env:PATH
            $keytoolFound = $true
            break
        }
    }
    if (-not $keytoolFound) {
        Write-Host "[INFO] keytool not in PATH, falling back to static keystore inspection" -ForegroundColor Yellow
    }
}

# 3. Check Android SDK environment
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
        Write-Host "[OK] Android SDK detected at $defaultSdk" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] Android SDK configured at $($env:ANDROID_HOME)" -ForegroundColor Green
}

# 4. Execute Packaging or Verification Pipeline
if ($VerifyOnly -or ($Mode -eq "verify")) {
    Write-Host "`n>>> Running 10-Criteria Security & Integrity Verification (scripts/verify-apk-package.mjs)..." -ForegroundColor Yellow
    node "$ScriptDir/verify-apk-package.mjs"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Release APK verification failed with exit code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "`n>>> Executing Build & Packaging Pipeline (scripts/build-release-apk.mjs --mode $Mode)..." -ForegroundColor Yellow
    node "$ScriptDir/build-release-apk.mjs" --mode $Mode

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Release APK packaging failed with exit code $LASTEXITCODE."
        exit $LASTEXITCODE
    }

    Write-Host "`n>>> Running 10-Criteria Security & Integrity Verification (scripts/verify-apk-package.mjs)..." -ForegroundColor Yellow
    node "$ScriptDir/verify-apk-package.mjs"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Release APK verification failed with exit code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}

Write-Host "`n[SUCCESS] Universal Release APK Packaging and Verification Completed Successfully!`n" -ForegroundColor Green
exit 0
