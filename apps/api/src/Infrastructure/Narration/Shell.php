<?php

declare(strict_types=1);

namespace App\Infrastructure\Narration;

/** Runs an external program without a shell (arguments are never interpreted). */
final class Shell
{
    /**
     * @param list<string> $command
     * @return string standard output
     */
    public static function run(array $command, ?string $stdin = null, int $timeoutSeconds = 120): string
    {
        $proc = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) {
            throw new \RuntimeException('cannot run ' . $command[0]);
        }
        if ($stdin !== null) {
            fwrite($pipes[0], $stdin);
        }
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $out   = '';
        $err   = '';
        $start = time();
        do {
            $out .= (string) stream_get_contents($pipes[1]);
            $err .= (string) stream_get_contents($pipes[2]);
            $status = proc_get_status($proc);
            if ($status['running'] && time() - $start > $timeoutSeconds) {
                proc_terminate($proc);
                throw new \RuntimeException($command[0] . ' timed out');
            }
            if ($status['running']) {
                usleep(20000);
            }
        } while ($status['running']);
        $out .= (string) stream_get_contents($pipes[1]);
        $err .= (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        if ($status['exitcode'] !== 0) {
            throw new \RuntimeException($command[0] . ' failed: ' . substr(trim($err) ?: trim($out), -300));
        }
        return $out;
    }

    /** Full path of a program on this machine, or null. */
    public static function find(string $name): ?string
    {
        $dirs = array_merge(explode(PATH_SEPARATOR, (string) getenv('PATH')), ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']);
        foreach (array_unique($dirs) as $dir) {
            foreach (PHP_OS_FAMILY === 'Windows' ? [$name . '.exe', $name] : [$name] as $file) {
                $path = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . $file;
                if ($dir !== '' && is_file($path) && is_executable($path)) {
                    return $path;
                }
            }
        }
        return null;
    }
}
