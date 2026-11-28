<?php
// サイトの追加・削除を、同期コードごとにサーバーへ保存する(登録なしで、ほかの端末と同じ一覧を使うため)
// コードを知っている人は誰でも読み書きできるので、コードは合言葉として扱う
//   GET    ?code=XXXX  保存内容を返す
//   POST   {data}      新しいコードを作って保存する({code, data} なら既存のコードに上書き)
//   DELETE ?code=XXXX  保存内容を消す

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = '/^[A-HJ-NP-Z2-9]{16}$/';
const MAX_BODY_BYTES = 65536;
const MAX_CREATES_PER_DAY = 20;
const DATA_KEYS = ['customSources', 'removedSources', 'customStudios', 'removedStudios'];
// 保存ファイルは .php にし、先頭で終わらせる。.htaccess が効かないサーバーでも URL で中身を読めないように
const FILE_GUARD = "<?php exit; ?>\n";

function reply($status, $body = null)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    exit($body === null ? '' : json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

$dir = __DIR__ . '/data';
if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
}
// 保存内容を URL で直接読めないようにする(ファイル名もコードのハッシュにしてある)
if (!is_file($dir . '/index.html')) {
    @file_put_contents($dir . '/index.html', '');
}
if (!is_file($dir . '/.htaccess')) {
    @file_put_contents(
        $dir . '/.htaccess',
        "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n"
    );
}

function data_file($dir, $code)
{
    return $dir . '/sync-' . hash('sha256', $code) . '.php';
}

function valid_code($code)
{
    return is_string($code) && preg_match(CODE_PATTERN, $code);
}

function new_code()
{
    $code = '';
    foreach (str_split(random_bytes(16)) as $byte) {
        $code .= CODE_ALPHABET[ord($byte) % 32];
    }
    return $code;
}

// 1つの IP から1日に作れるコードの数を絞る(ディスクを埋められないように)
function allow_create($dir)
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $file = $dir . '/rate-' . sha1($ip . date('Y-m-d')) . '.txt';
    $count = is_file($file) ? (int) file_get_contents($file) : 0;
    if ($count >= MAX_CREATES_PER_DAY) {
        return false;
    }
    @file_put_contents($file, (string) ($count + 1), LOCK_EX);
    foreach (glob($dir . '/rate-*.txt') ?: [] as $old) {
        if (filemtime($old) < time() - 2 * 86400) {
            @unlink($old);
        }
    }
    return true;
}

// 決まった4つのキーの配列だけを保存する。中身の細かい確認は画面側で読むときに行う
function clean_data($data)
{
    if (!is_array($data)) {
        return null;
    }
    $clean = [];
    foreach (DATA_KEYS as $key) {
        $value = isset($data[$key]) ? $data[$key] : [];
        if (!is_array($value) || ($value && array_keys($value) !== range(0, count($value) - 1))) {
            return null;
        }
        $clean[$key] = $value;
    }
    return $clean;
}

function save($dir, $code, $data)
{
    $record = ['data' => $data, 'updatedAt' => time()];
    $tmp = data_file($dir, $code) . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $json = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (@file_put_contents($tmp, FILE_GUARD . $json) === false || !@rename($tmp, data_file($dir, $code))) {
        @unlink($tmp);
        reply(500, ['error' => 'save failed']);
    }
    return $record;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' || $method === 'DELETE') {
    $code = isset($_GET['code']) ? (string) $_GET['code'] : '';
    if (!valid_code($code)) {
        reply(400, ['error' => 'bad code']);
    }
    $file = data_file($dir, $code);
    if (!is_file($file)) {
        reply(404, ['error' => 'not found']);
    }
    if ($method === 'DELETE') {
        @unlink($file);
        reply(204);
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    exit(substr((string) file_get_contents($file), strlen(FILE_GUARD)));
}

if ($method !== 'POST') {
    reply(405, ['error' => 'method not allowed']);
}

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
    reply(413, ['error' => 'too large']);
}
$body = json_decode($raw, true);
$data = clean_data(is_array($body) && isset($body['data']) ? $body['data'] : null);
if ($data === null) {
    reply(400, ['error' => 'bad data']);
}

if (isset($body['code'])) {
    // 上書きは、すでにあるコードだけ(コードを作る数の制限をすり抜けられないように)
    if (!valid_code($body['code'])) {
        reply(400, ['error' => 'bad code']);
    }
    if (!is_file(data_file($dir, $body['code']))) {
        reply(404, ['error' => 'not found']);
    }
    $record = save($dir, $body['code'], $data);
    reply(200, ['code' => $body['code'], 'updatedAt' => $record['updatedAt']]);
}

if (!allow_create($dir)) {
    reply(429, ['error' => 'too many codes']);
}
do {
    $code = new_code();
} while (is_file(data_file($dir, $code)));
$record = save($dir, $code, $data);
reply(201, ['code' => $code, 'updatedAt' => $record['updatedAt']]);
