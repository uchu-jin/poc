<?php
// feed.php と ogp.php が共通で使う、外部サイトを安全に取ってくる処理

const TIMEOUT = 15;
const MAX_BYTES = 3 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (NewsCurator)';

function fail($code, $message)
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    exit($message);
}

// 社内網やサーバー自身を取りに行かせないため、公開アドレスに解決できるホストだけを通す
function public_ip($host)
{
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : gethostbynamel($host);
    if (!$ips) {
        return null;
    }
    $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
    if (defined('FILTER_FLAG_GLOBAL_RANGE')) {
        $flags |= FILTER_FLAG_GLOBAL_RANGE;
    }
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, $flags)) {
            return null;
        }
    }
    return $ips[0];
}

// 返り値は [本文, 最終的なURL, エラー]。リダイレクト先も1つずつ確かめる
function fetch_public($url)
{
    for ($hop = 0; $hop <= 5; $hop++) {
        $p = parse_url($url);
        $scheme = strtolower(isset($p['scheme']) ? $p['scheme'] : '');
        if (!in_array($scheme, ['http', 'https'], true) || empty($p['host'])) {
            return [null, $url, 'bad url'];
        }
        $port = isset($p['port']) ? $p['port'] : ($scheme === 'https' ? 443 : 80);
        if (!in_array($port, [80, 443], true)) {
            return [null, $url, 'bad port'];
        }
        $ip = public_ip($p['host']);
        if (!$ip) {
            return [null, $url, 'blocked host'];
        }

        $body = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RESOLVE => [$p['host'] . ':' . $port . ':' . $ip],
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => TIMEOUT,
            CURLOPT_USERAGENT => USER_AGENT,
            CURLOPT_ENCODING => '',
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body) {
                $body .= $chunk;
                return strlen($body) > MAX_BYTES ? 0 : strlen($chunk);
            },
        ]);
        $ok = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $location = curl_getinfo($ch, CURLINFO_REDIRECT_URL);

        if ($ok === false) {
            return [null, $url, 'fetch failed'];
        }
        if ($status >= 300 && $status < 400 && $location) {
            $url = $location;
            continue;
        }
        if ($status >= 400) {
            return [null, $url, 'upstream ' . $status];
        }
        return [$body, $url, null];
    }
    return [null, $url, 'too many redirects'];
}
