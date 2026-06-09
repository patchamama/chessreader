<?php

declare(strict_types=1);

namespace App\Application\Recognition;

use App\Domain\Chess\RecognizedGame;
use App\Infrastructure\Chess\Recognition\SanRecognizer;
use App\Infrastructure\Chess\Recognition\SanToken;
use App\Infrastructure\Chess\Recognition\SpanishNotationNormalizer;
use App\Infrastructure\Chess\Recognition\VariationParser;

/**
 * Recognises chess game fragments in a chapter's text/HTML.
 *
 * Returns an array of RecognizedGame, each with a GameTree.
 */
final class RecognizeMovesHandler
{
    private const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    public function __construct(
        private readonly SpanishNotationNormalizer $normalizer,
        private readonly SanRecognizer $recognizer,
        private readonly VariationParser $parser,
    ) {
    }

    /**
     * @return RecognizedGame[]
     */
    public function handle(RecognizeMovesCommand $command): array
    {
        $text = $command->text;

        // Normalise Spanish notation
        $normalised = $this->normalizer->normalizeText($text);

        // Tokenise
        $tokens = $this->recognizer->tokenize($normalised);

        if (empty($tokens)) {
            return [];
        }

        // Split into game sequences (new game = move-number 1 non-ellipsis after moves)
        $gameSequences = $this->splitIntoGameSequences($tokens);

        $results = [];

        foreach ($gameSequences as $seq) {
            $moveTokens = array_filter($seq, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE);
            if (empty($moveTokens)) {
                continue;
            }

            $charStart = $seq[0]->charStart;
            $charEnd = $seq[count($seq) - 1]->charEnd;
            $source = mb_substr($normalised, $charStart, $charEnd - $charStart);

            $tree = $this->parser->buildGameTree($seq, self::START_FEN);

            if (empty($tree->getNodes())) {
                continue;
            }

            $results[] = new RecognizedGame($charStart, $charEnd, $source, $tree);
        }

        return $results;
    }

    /**
     * @param SanToken[] $tokens
     * @return SanToken[][]
     */
    private function splitIntoGameSequences(array $tokens): array
    {
        $sequences = [];
        $current = [];

        foreach ($tokens as $token) {
            if (
                $token->type === SanToken::TYPE_MOVE_NUMBER &&
                $token->moveNumber === 1 &&
                !$token->isEllipsis &&
                count(array_filter($current, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE)) > 0
            ) {
                $sequences[] = $current;
                $current = [$token];
            } elseif ($token->type === SanToken::TYPE_RESULT && !empty($current)) {
                $current[] = $token;
                $sequences[] = $current;
                $current = [];
            } else {
                $current[] = $token;
            }
        }

        $hasMoves = count(array_filter($current, fn(SanToken $t) =>
            $t->type === SanToken::TYPE_MOVE || $t->type === SanToken::TYPE_MOVE_NUMBER
        )) > 0;

        if ($hasMoves) {
            $sequences[] = $current;
        }

        return $sequences;
    }
}
