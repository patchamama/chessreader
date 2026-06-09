<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Recognition;

/**
 * Scans text for chess SAN tokens, preserving character offsets.
 * Expects English notation (normalise Spanish first).
 */
final class SanRecognizer
{
    // SAN move pattern (English notation)
    private const SAN_MOVE_PATTERN =
        '/(?<![a-zA-Z])(O-O-O|O-O|[KQRBN][a-h1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*|[KQRBN][a-h1-8]?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*|[a-h]x?[a-h][1-8](?:=[QRBN])?[+#]?[!?]*|[a-h][1-8](?:=[QRBN])?[+#]?[!?]*)(?=[^a-zA-Z]|$)/';

    /**
     * @return SanToken[]
     */
    public function tokenize(string $text): array
    {
        $rawMatches = [];

        // Variation markers
        $len = strlen($text);
        for ($i = 0; $i < $len; $i++) {
            if ($text[$i] === '(') {
                $rawMatches[] = ['start' => $i, 'end' => $i + 1, 'token' => new SanToken(
                    SanToken::TYPE_VARIATION_OPEN, '(', $i, $i + 1
                )];
            } elseif ($text[$i] === ')') {
                $rawMatches[] = ['start' => $i, 'end' => $i + 1, 'token' => new SanToken(
                    SanToken::TYPE_VARIATION_CLOSE, ')', $i, $i + 1
                )];
            }
        }

        // Move numbers: \d{1,3}\.{1,3}
        preg_match_all('/\b(\d{1,3})(\.{1,3})/', $text, $mnMatches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($mnMatches as $m) {
            $num = (int) $m[1][0];
            $dots = $m[2][0];
            $isEllipsis = strlen($dots) >= 2;
            $start = $m[0][1];
            $end = $start + strlen($m[0][0]);
            $rawMatches[] = ['start' => $start, 'end' => $end, 'token' => new SanToken(
                SanToken::TYPE_MOVE_NUMBER,
                $m[0][0],
                $start,
                $end,
                $num,
                $isEllipsis,
                $isEllipsis ? 'black' : 'white',
            )];
        }

        // Result tokens
        preg_match_all('/\b(1-0|0-1|1\/2-1\/2|\*)\b/', $text, $resMatches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($resMatches as $m) {
            $start = $m[0][1];
            $end = $start + strlen($m[0][0]);
            $rawMatches[] = ['start' => $start, 'end' => $end, 'token' => new SanToken(
                SanToken::TYPE_RESULT, $m[0][0], $start, $end
            )];
        }

        // SAN moves
        $pattern = self::SAN_MOVE_PATTERN;
        preg_match_all($pattern, $text, $sanMatches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($sanMatches as $m) {
            $san = $m[1][0];
            $start = $m[1][1];
            $end = $start + strlen($san);
            $rawMatches[] = ['start' => $start, 'end' => $end, 'token' => new SanToken(
                SanToken::TYPE_MOVE, $san, $start, $end, null, false, null, $san
            )];
        }

        // Sort by start, resolve overlaps
        usort($rawMatches, function (array $a, array $b): int {
            if ($a['start'] !== $b['start']) {
                return $a['start'] <=> $b['start'];
            }
            return $b['end'] <=> $a['end']; // longer first
        });

        $used = [];
        $nonOverlapping = [];
        foreach ($rawMatches as $match) {
            $conflict = false;
            for ($i = $match['start']; $i < $match['end']; $i++) {
                if (isset($used[$i])) {
                    $conflict = true;
                    break;
                }
            }
            if (!$conflict) {
                for ($i = $match['start']; $i < $match['end']; $i++) {
                    $used[$i] = true;
                }
                $nonOverlapping[] = $match;
            }
        }

        // Sort non-overlapping by start position
        usort($nonOverlapping, fn(array $a, array $b) => $a['start'] <=> $b['start']);

        // Assign color/moveNumber to moves based on preceding move-number token
        $currentMoveNumber = 1;
        $nextColor = 'white';
        $tokens = [];

        foreach ($nonOverlapping as $match) {
            /** @var SanToken $token */
            $token = $match['token'];
            if ($token->type === SanToken::TYPE_MOVE_NUMBER) {
                $currentMoveNumber = $token->moveNumber ?? 1;
                $nextColor = $token->isEllipsis ? 'black' : 'white';
                $tokens[] = $token;
            } elseif ($token->type === SanToken::TYPE_MOVE) {
                $tokens[] = new SanToken(
                    $token->type,
                    $token->raw,
                    $token->charStart,
                    $token->charEnd,
                    $currentMoveNumber,
                    false,
                    $nextColor,
                    $token->san,
                );
                $nextColor = $nextColor === 'white' ? 'black' : 'white';
            } else {
                $tokens[] = $token;
            }
        }

        return $tokens;
    }
}
