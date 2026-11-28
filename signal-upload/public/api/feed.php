<?php
// RSSを代わりに取ってくる中継(ブラウザからは海外サイトのRSSを直接読めないため)
// ?id=  feeds.json に登録した媒体
// ?url= 利用者が追加したサイト。サイトのURLなら、ページ内に書かれた RSS の場所を探して取ってくる
// 結果は10分間ファイルに保存して使い回す

require __DIR__ . '/_lib.php';

const TTL = 600;

function is_feed($body)
{
    $head = substr($body, 0, 8192);
    return !preg_match('/<html[\s>]/i', $head) && preg_match('/<(rss|feed|rdf:RDF)[\s>]/i', $head);
}

function resolve_url($href, $base)
{
    if (preg_match('#^https?://#i', $href)) {
        return $href;
    }
    $b = parse_url($base);
    if (strpos($href, '//') === 0) {
        return $b['scheme'] . ':' . $href;
    }
    $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
    if (strpos($href, '/') === 0) {
        return $origin . $href;
    }
    $dir = preg_replace('#/[^/]*$#', '/', isset($b['path']) ? $b['path'] : '/');
    return $origin . $dir . $href;
}

function discover_feed($html, $base)
{
    if (!preg_match_all('/<link\b[^>]*>/i', $html, $m)) {
        return null;
    }
    foreach ($m[0] as $tag) {
        if (
            preg_match('/\brel=["\']?alternate\b/i', $tag) &&
            preg_match('/\btype=["\']?application\/(rss|atom)\+xml/i', $tag) &&
            preg_match('/\bhref=["\']([^"\']+)["\']/i', $tag, $href)
        ) {
            return resolve_url(html_entity_decode($href[1], ENT_QUOTES), $base);
        }
    }
    return null;
}

// 返り値は [RSS本文, RSSのURL, エラー]
function fetch_feed_or_site($url)
{
    list($body, $finalUrl, $error) = fetch_public($url);
    if ($error) {
        return [null, null, $error];
    }
    if (is_feed($body)) {
        return [$body, $finalUrl, null];
    }
    $feedUrl = discover_feed($body, $finalUrl);
    if (!$feedUrl) {
        return [null, null, 'no feed'];
    }
    list($body, $feedUrl, $error) = fetch_public($feedUrl);
    if ($error) {
        return [null, null, $error];
    }
    return is_feed($body) ? [$body, $feedUrl, null] : [null, null, 'no feed'];
}

function fetch_registered($url)
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => TIMEOUT,
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_ENCODING => '',
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    } else {
        $ctx = stream_context_create(['http' => [
            'timeout' => TIMEOUT,
            'header' => 'User-Agent: ' . USER_AGENT . "\r\n",
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $status = $body === false ? 0 : 200;
    }
    if ($body === false || $status >= 400) {
        return [null, null, 'upstream ' . $status];
    }
    return [$body, $url, null];
}

if (isset($_GET['url'])) {
    if (!function_exists('curl_init')) {
        fail(501, 'curl required');
    }
    $target = (string) $_GET['url'];
    if (strlen($target) > 2048) {
        fail(400, 'bad url');
    }
    $key = 'u-' . sha1($target);
    $fetch = 'fetch_feed_or_site';
} else {
    $id = isset($_GET['id']) ? (string) $_GET['id'] : '';
    $feeds = json_decode(@file_get_contents(__DIR__ . '/feeds.json'), true);
    if (!is_array($feeds) || !preg_match('/^[a-z0-9-]+$/', $id) || !isset($feeds[$id])) {
        fail(404, 'unknown feed');
    }
    $target = $feeds[$id];
    $key = $id;
    $fetch = 'fetch_registered';
}

$cacheDir = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/' . $key . '.xml';
$urlFile = $cacheDir . '/' . $key . '.url';

function send_feed_url($url)
{
    header('X-Feed-Url: ' . preg_replace('/[\x00-\x1f\x7f]/', '', trim($url)));
}

function send_cached($cacheFile, $urlFile)
{
    header('Content-Type: application/xml; charset=utf-8');
    if (is_file($urlFile)) {
        send_feed_url(file_get_contents($urlFile));
    }
    readfile($cacheFile);
    exit;
}

if (is_file($cacheFile) && time() - filemtime($cacheFile) < TTL) {
    send_cached($cacheFile, $urlFile);
}

list($body, $feedUrl, $error) = $fetch($target);

if ($error) {
    // 取得に失敗したら、古くても保存済みのものがあれば返す
    if (is_file($cacheFile)) {
        send_cached($cacheFile, $urlFile);
    }
    fail($error === 'no feed' || $error === 'bad url' ? 422 : 502, $error);
}

if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
@file_put_contents($cacheFile, $body, LOCK_EX);
@file_put_contents($urlFile, $feedUrl, LOCK_EX);

// 利用者が追加したサイトのキャッシュは増え続けるので、ときどき1日以上前のものを消す
if (mt_rand(1, 50) === 1) {
    foreach (glob($cacheDir . '/u-*') ?: [] as $file) {
        if (time() - filemtime($file) > 86400) {
            @unlink($file);
        }
    }
}

header('Content-Type: application/xml; charset=utf-8');
send_feed_url($feedUrl);
echo $body;
