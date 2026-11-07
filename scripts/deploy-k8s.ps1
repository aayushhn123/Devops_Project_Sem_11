# Builds the image and deploys PriceScope to the current Kubernetes context.
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-k8s.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$sha = git -C $root rev-parse --short HEAD
$now = (Get-Date).ToUniversalTime()
$built = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
# A new tag for every deploy: nodes cache images by tag, so reusing one would keep running the old code.
$image = "pricescope-app:1.0.0-" + $now.ToString("yyyyMMddHHmmss")

Write-Host "1/5 Building $image"
docker build -t $image -t pricescope-app:1.0.0 --build-arg APP_VERSION=1.0.0 --build-arg GIT_SHA=$sha --build-arg BUILD_TIME=$built $root
if ($LASTEXITCODE) { throw "docker build failed" }

# Docker Desktop's kind cluster has its own image store, so the image must be copied in.
$node = docker ps --filter "name=desktop-control-plane" --format "{{.Names}}"
if ($node) {
    Write-Host "2/5 Loading image into cluster node $node"
    $tar = Join-Path $env:TEMP "pricescope-app.tar"
    docker save -o $tar $image
    docker cp $tar "${node}:/pricescope-app.tar"
    docker exec $node ctr -n k8s.io images import /pricescope-app.tar
    docker exec $node rm /pricescope-app.tar
    Remove-Item $tar
} else {
    Write-Host "2/5 No kind node found, assuming the cluster can see local images"
}

Write-Host "3/5 Applying namespace and secret"
kubectl apply -f "$root\k8s\00-namespace.yaml"
if (-not (kubectl get secret pricescope-db -n pricescope --ignore-not-found -o name)) {
    $password = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    kubectl create secret generic pricescope-db -n pricescope --from-literal=PGPASSWORD=$password
}

Write-Host "4/5 Applying manifests"
kubectl delete job db-loader -n pricescope --ignore-not-found   # Jobs are immutable
Get-ChildItem "$root\k8s\*.yaml" | Sort-Object Name | ForEach-Object {
    (Get-Content -Raw $_.FullName) -replace "pricescope-app:1\.0\.0", $image | kubectl apply -f -
}

Write-Host "5/5 Waiting for everything to be ready"
kubectl rollout status statefulset/postgres -n pricescope --timeout=180s
kubectl wait --for=condition=complete job/db-loader -n pricescope --timeout=180s
kubectl rollout status deployment/pricescope-app -n pricescope --timeout=180s
kubectl get all -n pricescope
Write-Host "`nPriceScope is running at http://localhost:8081"
