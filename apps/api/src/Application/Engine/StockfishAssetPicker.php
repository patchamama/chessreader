<?php

declare(strict_types=1);

namespace App\Application\Engine;

/**
 * Chooses the build of a Stockfish release for this server. Release asset
 * names change over time (stockfish-ubuntu-x86-64-avx2.tar in 17,
 * stockfish-linux-x86-64-universal.tar.gz in 19), so the choice goes by
 * operating system and CPU words, preferring builds that run everywhere.
 */
final class StockfishAssetPicker
{
    /** Builds that run on any CPU of the family come first; avx512/vnni need recent CPUs. */
    private const PREFERENCE = ['universal', 'apple-silicon', 'avx2', 'sse41-popcnt', ''];

    /** @param list<string> $names */
    public static function pick(array $names, string $os, string $arch): ?string
    {
        $os = strtolower($os);
        $arch = strtolower($arch);
        $osWords = str_contains($os, 'darwin') || str_contains($os, 'mac') ? ['macos']
            : (str_contains($os, 'win') ? ['windows'] : ['linux', 'ubuntu']);
        $arm = str_contains($arch, 'arm') || str_contains($arch, 'aarch');

        $candidates = array_values(array_filter($names, function (string $n) use ($osWords, $arm) {
            $n = strtolower($n);
            if (!preg_match('/\.(tar|tar\.gz|zip)$/', $n)) {
                return false;
            }
            $osOk = false;
            foreach ($osWords as $w) {
                $osOk = $osOk || str_contains($n, "stockfish-{$w}-");
            }
            if (!$osOk) {
                return false;
            }
            $isArm = (bool) preg_match('/arm|apple-silicon|m1/', $n);
            $isX86 = str_contains($n, 'x86-64');
            // "macos-universal" serves both; otherwise the build must match the CPU.
            if (!$isArm && !$isX86) {
                return true;
            }
            return $arm ? $isArm : $isX86;
        }));

        foreach (self::PREFERENCE as $word) {
            foreach ($candidates as $n) {
                $base = preg_replace('/\.(tar\.gz|tar|zip)$/', '', strtolower($n));
                if ($word === '' ? !preg_match('/avx512|vnni|bmi2/', $base) : str_contains($base, $word)) {
                    return $n;
                }
            }
        }
        return null;
    }
}
