[CmdletBinding()]
param(
    [string]$OutputDirectory = "artifacts",
    [switch]$SkipQa,
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $repoRoot

if (-not $AllowDirty) {
    $dirty = git status --porcelain
    if ($dirty) {
        throw "Refusing to package a dirty worktree. Commit/stash changes or pass -AllowDirty for an explicitly non-release artifact."
    }
}

if (-not $SkipQa) {
    npm run qa:smoke
    if ($LASTEXITCODE -ne 0) { throw "qa:smoke failed." }
}

npm run build
if ($LASTEXITCODE -ne 0) { throw "Next.js build failed." }

$fullCommit = (git rev-parse HEAD).Trim()
$env:CHACHA_RELEASE_COMMIT = $fullCommit
$env:CHACHA_RELEASE_DIRTY = if ($AllowDirty) { "true" } else { "false" }
node scripts/deploy/prepare-standalone.mjs
if ($LASTEXITCODE -ne 0) { throw "Standalone preparation failed." }

$commit = $fullCommit.Substring(0, 12)
$resolvedOutput = Join-Path $repoRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
$artifact = Join-Path $resolvedOutput "chacha-street-$commit.tar.gz"

tar -C .next/standalone -czf $artifact .
if ($LASTEXITCODE -ne 0) { throw "tar packaging failed." }

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant()
$checksumLine = "$hash  $(Split-Path -Leaf $artifact)`n"
[System.IO.File]::WriteAllText(
  "$artifact.sha256",
  $checksumLine,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Artifact: $artifact"
Write-Host "SHA256:   $hash"
