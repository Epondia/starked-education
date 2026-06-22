$routesDir = Join-Path -Path $PSScriptRoot "..\backend\src\routes"
Get-ChildItem -Path $routesDir -Recurse -Include *.js,*.ts | ForEach-Object {
    $content = Get-Content -Path $_.FullName -Raw
    if ($content -notmatch "@swagger") {
        $base = $_.BaseName
        $placeholder = @"
/**
 * @swagger
 * /${base}:
 *   get:
 *     summary: Placeholder endpoint
 *     responses:
 *       200:
 *         description: Successful response
 */
"@
        Set-Content -Path $_.FullName -Value ($placeholder + "`r`n" + $content)
        Write-Host "Added placeholder to $($_.FullName)"
    }
}
