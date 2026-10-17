<#
.SYNOPSIS
    Installs the Developer Excellence & Ponytail Master Skills Pack (51 skills)
    into Antigravity either globally or into a specific target project.

.DESCRIPTION
    Options:
      -Global (Default): Installs as a global Antigravity plugin into ~/.gemini/config/plugins/dev-excellence-pack
      -TargetProject <Path>: Installs skills directly into <Path>/.agents/skills
      -Force: Overwrites existing files without prompting

.EXAMPLE
    .\install.ps1 -Global
    .\install.ps1 -TargetProject "C:\Projects\MyOtherApp"
#>

[CmdletBinding(DefaultParameterSetName = "Global")]
param(
    [Parameter(ParameterSetName = "Global")]
    [switch]$Global = $true,

    [Parameter(ParameterSetName = "TargetProject", Mandatory = $true)]
    [string]$TargetProject,

    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$SkillsSource = Join-Path $ScriptDir "skills"

if (-not (Test-Path $SkillsSource)) {
    Write-Error "Source skills directory not found at: $SkillsSource"
    exit 1
}

$SkillCount = (Get-ChildItem -Path $SkillsSource -Directory).Count

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Developer Excellence & Ponytail Skills Pack (v1.0.0)    " -ForegroundColor Cyan
Write-Host " Total skills in package: $SkillCount                    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($PSCmdlet.ParameterSetName -eq "TargetProject" -and $TargetProject) {
    if (-not (Test-Path $TargetProject)) {
        Write-Error "Target project path does not exist: $TargetProject"
        exit 1
    }

    $DestDir = Join-Path $TargetProject ".agents\skills"
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    Write-Host "[*] Installing $SkillCount skills into project: $DestDir..." -ForegroundColor Yellow
    Get-ChildItem -Path $SkillsSource -Directory | ForEach-Object {
        $skillDest = Join-Path $DestDir $_.Name
        Copy-Item -Path $_.FullName -Destination $skillDest -Recurse -Force
        Write-Host "  -> Installed skill: $($_.Name)" -ForegroundColor Green
    }

    Write-Host "`n[SUCCESS] Project installation complete! $SkillCount skills added to: $DestDir" -ForegroundColor Green
}
else {
    # Global installation
    $UserProfile = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile)
    $PluginsBase = Join-Path $UserProfile ".gemini\config\plugins"
    $PluginDest = Join-Path $PluginsBase "dev-excellence-pack"

    Write-Host "[*] Installing as Global Antigravity Plugin to: $PluginDest..." -ForegroundColor Yellow

    if (-not (Test-Path $PluginDest)) {
        New-Item -ItemType Directory -Path $PluginDest -Force | Out-Null
    }

    # Copy skills directory
    $DestSkillsDir = Join-Path $PluginDest "skills"
    if (Test-Path $DestSkillsDir) {
        Remove-Item -Path $DestSkillsDir -Recurse -Force
    }
    Copy-Item -Path $SkillsSource -Destination $DestSkillsDir -Recurse -Force

    # Copy manifest and readme
    Copy-Item -Path (Join-Path $ScriptDir "plugin.json") -Destination $PluginDest -Force
    Copy-Item -Path (Join-Path $ScriptDir "README.md") -Destination $PluginDest -Force

    Write-Host "`n[SUCCESS] Global plugin successfully installed!" -ForegroundColor Green
    Write-Host "Location: $PluginDest" -ForegroundColor White
    Write-Host "Total skills available globally across all projects: $SkillCount" -ForegroundColor Green
    Write-Host "Antigravity will automatically discover all 51 skills immediately." -ForegroundColor Cyan
}
