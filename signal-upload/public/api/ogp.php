<?php
// デザイン会社を追加するとき、サイトの名前・説明・画像を読むための中継
// ?url= のページから <title>・<meta>・<link> のタグだけを抜き出して JSON で返す(ページ全体は返さない)
// 読み取り方は画面側(src/lib/ogp.ts)で決める。結果は1日ファイルに保存して使い回す

require __DIR__ . '/_lib.php';

const OGP_TTL = 86400;
const MAX_TAGS_BYTES = 65536;

if (!function_exists('curl_init')) {
    fail(501, 'curl required');
}
$target = isset($_GET['url']) ? (string) $_GET['url'] : '';
if ($target === '' || strlen($target) > 2048) {
    fail(400, 'bad url');
}

$cacheDir = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/u-ogp-' . sha1($target) . '.json';

header('Content-Type: application/json; charset=utf-8');

if (is_file($cacheFile) && time() - filemtime($cacheFile) < OGP_TTL) {
    readfile($cacheFile);
    exit;
}

list($body, $finalUrl, $error) = fetch_public($target);
if ($error) {
    fail($error === 'bad url' ? 422 : 502, $error);
}

$end = stripos($body, '</head>');
$head = $end === false ? substr($body, 0, 512 * 1024) : substr($body, 0, $end);
if (!preg_match('/<(html|head|title|meta)[\s>]/i', $head)) {
    fail(422, 'not html');
}
preg_match_all('/<title\b[^>]*>[^<]*<\/title>|<meta\b[^>]*>|<link\b[^>]*>/i', $head, $m);
$tags = substr(implode("\n", $m[0]), 0, MAX_TAGS_BYTES);
// 日本の古いサイトは Shift_JIS などのことがあるので UTF-8 にそろえる
if (
    preg_match('/charset=["\']?([\w-]+)/i', $head, $charset) &&
    !preg_match('/^utf-?8$/i', $charset[1]) &&
    function_exists('mb_convert_encoding')
) {
    try {
        $converted = @mb_convert_encoding($tags, 'UTF-8', $charset[1]);
        if ($converted !== false) {
            $tags = $converted;
        }
    } catch (Throwable $e) {
        // 知らない文字コード名なら、そのまま返す
    }
}

$json = json_encode(
    ['url' => $finalUrl, 'tags' => $tags],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
);
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}
@file_put_contents($cacheFile, $json, LOCK_EX);
echo $json;
