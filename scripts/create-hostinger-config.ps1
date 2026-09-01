[CmdletBinding()]
param(
    [string]$EnvFile,
    [string]$OutputFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent $scriptDirectory

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $repositoryRoot '.env'
}
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $OutputFile = Join-Path $repositoryRoot 'release\hostinger-staging\album-app\config.php'
}

function Read-RequiredDotEnvValues {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string[]]$Names
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw '.env was not found.'
    }

    $wanted = @{}
    foreach ($name in $Names) {
        $wanted[$name] = $null
    }

    foreach ($line in [System.IO.File]::ReadLines($Path)) {
        if ($line -notmatch '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            continue
        }

        $name = $Matches[1]
        if (-not $wanted.ContainsKey($name)) {
            continue
        }

        $value = $Matches[2]
        if ($value.Length -ge 2) {
            $first = $value[0]
            $last = $value[$value.Length - 1]
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        if ([string]::IsNullOrWhiteSpace($value)) {
            throw "$name is not configured in .env."
        }

        $wanted[$name] = $value
    }

    foreach ($name in $Names) {
        if ([string]::IsNullOrWhiteSpace([string]$wanted[$name])) {
            throw "$name is not configured in .env."
        }
    }

    return $wanted
}

function ConvertTo-PhpSingleQuotedString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    if ($Value.IndexOfAny(@([char]0, [char]10, [char]13)) -ge 0) {
        throw 'A configuration value contains an unsupported control character.'
    }

    return "'" + $Value.Replace('\', '\\').Replace("'", "\'") + "'"
}

$secretNames = @(
    'COOKIE_SECRET',
    'ADMIN_KEY',
    'ALBUM_ACCESS_TOKEN',
    'TOKEN_ENCRYPTION_KEY',
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET'
)

$localValues = Read-RequiredDotEnvValues -Path $EnvFile -Names $secretNames

$mysqlHost = Read-Host 'MYSQL_HOST shown by Hostinger'
$mysqlDatabase = Read-Host 'Full MYSQL_DATABASE shown by Hostinger'
$mysqlUser = Read-Host 'Full MYSQL_USER shown by Hostinger'
$mysqlPasswordSecure = Read-Host 'MYSQL_PASSWORD created in Hostinger' -AsSecureString

if ([string]::IsNullOrWhiteSpace($mysqlHost) -or
    [string]::IsNullOrWhiteSpace($mysqlDatabase) -or
    [string]::IsNullOrWhiteSpace($mysqlUser)) {
    throw 'All MySQL fields must be configured.'
}

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlPasswordSecure)
try {
    $mysqlPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

if ([string]::IsNullOrWhiteSpace($mysqlPassword)) {
    throw 'MYSQL_PASSWORD must be configured.'
}

$lines = @(
    '<?php',
    '',
    'declare(strict_types=1);',
    '',
    '// Generated locally. Keep this file outside public_html and never commit it.',
    'return [',
    "    'PUBLIC_APP_URL' => $(ConvertTo-PhpSingleQuotedString 'https://album-staging.inesymartin.es'),",
    "    'COOKIE_SECRET' => $(ConvertTo-PhpSingleQuotedString ([string]$localValues['COOKIE_SECRET'])),",
    "    'ADMIN_KEY' => $(ConvertTo-PhpSingleQuotedString ([string]$localValues['ADMIN_KEY'])),",
    "    'ALBUM_ACCESS_TOKEN' => $(ConvertTo-PhpSingleQuotedString ([string]$localValues['ALBUM_ACCESS_TOKEN'])),",
    "    'TOKEN_ENCRYPTION_KEY' => $(ConvertTo-PhpSingleQuotedString ([string]$localValues['TOKEN_ENCRYPTION_KEY'])),",
    "    'MICROSOFT_CLIENT_ID' => $(ConvertTo-PhpSingleQuotedString ([string]$localValues['MICROSOFT_CLIENT_ID'])),",
    "    'MICROSOFT_CLIENT_SECRET' => $(ConvertTo-PhpSingleQuotedString ([string]$localValues['MICROSOFT_CLIENT_SECRET'])),",
    "    'MICROSOFT_REDIRECT_URI' => $(ConvertTo-PhpSingleQuotedString 'https://album-staging.inesymartin.es/api/admin/microsoft/callback'),",
    "    'ONEDRIVE_FOLDER' => $(ConvertTo-PhpSingleQuotedString 'Boda/Album/Staging/Originales'),",
    "    'MAX_FILE_BYTES' => 16106127360,",
    "    'MAX_BATCH_FILES' => 50,",
    "    'MYSQL_HOST' => $(ConvertTo-PhpSingleQuotedString $mysqlHost),",
    "    'MYSQL_PORT' => 3306,",
    "    'MYSQL_DATABASE' => $(ConvertTo-PhpSingleQuotedString $mysqlDatabase),",
    "    'MYSQL_USER' => $(ConvertTo-PhpSingleQuotedString $mysqlUser),",
    "    'MYSQL_PASSWORD' => $(ConvertTo-PhpSingleQuotedString $mysqlPassword),",
    '];'
)

$outputDirectory = Split-Path -Parent $OutputFile
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
[System.IO.File]::WriteAllLines($OutputFile, $lines, [System.Text.UTF8Encoding]::new($false))

foreach ($name in $secretNames) {
    Write-Output ($name.PadRight(26) + 'configured')
}
Write-Output ('MYSQL_HOST'.PadRight(26) + 'configured')
Write-Output ('MYSQL_DATABASE'.PadRight(26) + 'configured')
Write-Output ('MYSQL_USER'.PadRight(26) + 'configured')
Write-Output ('MYSQL_PASSWORD'.PadRight(26) + 'configured')
Write-Output 'Hostinger config.php created without displaying values.'

$mysqlPassword = $null
$mysqlPasswordSecure.Dispose()
$localValues.Clear()
