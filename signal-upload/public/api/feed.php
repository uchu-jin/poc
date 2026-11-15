<?php
// RSSを代わりに取ってくる中継(ブラウザからは海外サイトのRSSを直接読めないため)
// 取得できるのは feeds.json に登録した媒体だけ。結果は10分間ファイルに保存して使い回す

$id = isset($_GET['id']) ? $_GET['id'] : '';
$feeds = json_decode(@file_get_contents(__DIR__ . '/feeds.json'), true);

if (!is_array($feeds) || !preg_match('/^[a-z0-9-]+$/', $id) || !isset($feeds[$id])) {
    http_response_code(404);
    exit('unknown feed');
}

$cacheDir = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/' . $id . '.xml';
$ttl = 600;

header('Content-Type: application/xml; charset=utf-8');

if (is_file($cacheFile) && time() - filemtime($cacheFile) < $ttl) {
    readfile($cacheFile);
    exit;
}

$body = false;
$status = 0;
if (function_exists('curl_init')) {
    $ch = curl_init($feeds[$id]);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (NewsCurator)',
        CURLOPT_ENCODING => '',
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    $ctx = stream_context_create(['http' => [
        'timeout' => 15,
        'header' => "User-Agent: Mozilla/5.0 (NewsCurator)\r\n",
    ]]);
    $body = @file_get_contents($feeds[$id], false, $ctx);
    $status = $body === false ? 0 : 200;
}

if ($body === false || $status >= 400) {
    // 取得に失敗したら、古くても保存済みのものがあれば返す
    if (is_file($cacheFile)) {
        readfile($cacheFile);
        exit;
    }
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    exit('upstream ' . $status);
}

if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
@file_put_contents($cacheFile, $body, LOCK_EX);
echo $body;
