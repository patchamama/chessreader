<?php

declare(strict_types=1);

namespace App\Application\Studies;

use App\Domain\Studies\StudyRepository;

/** Listing, reading, rating and deleting the stored studies. */
final class StudyCatalog
{
    public const SORTS = ['name', 'author', 'rating', 'likes', 'updated', 'imported'];

    public function __construct(private readonly StudyRepository $studies)
    {
    }

    /**
     * @return array{studies: list<array<string, mixed>>, authors: list<array{author: string, count: int}>}
     * @throws \InvalidArgumentException on an unknown sort or direction
     */
    public function list(string $sort, string $dir, ?string $author, ?string $q): array
    {
        if (!in_array($sort, self::SORTS, true)) {
            throw new \InvalidArgumentException('sort must be one of ' . implode(', ', self::SORTS));
        }
        if (!in_array($dir, ['asc', 'desc'], true)) {
            throw new \InvalidArgumentException('dir must be asc or desc');
        }
        $author = $author === '' ? null : $author;
        $q = $q === null ? null : trim($q);
        $studies = array_map(self::public(...), $this->studies->list($sort, $dir, $author, $q === '' ? null : $q));
        return ['studies' => $studies, 'authors' => $this->studies->authors()];
    }

    /** @return array{study: array<string, mixed>, pgn: string}|null */
    public function get(string $id): ?array
    {
        $study = $this->studies->find($id);
        return $study === null ? null : ['study' => self::public($study), 'pgn' => (string) $this->studies->pgn($id)];
    }

    /**
     * @param array<string, mixed> $body only myRating and lichessLikes are accepted
     * @return array<string, mixed>
     * @throws \InvalidArgumentException invalid value; \OutOfBoundsException unknown study
     */
    public function update(string $id, array $body): array
    {
        $fields = [];
        if (array_key_exists('myRating', $body)) {
            $v = $body['myRating'];
            if ($v !== null && (!is_int($v) || $v < 1 || $v > 5)) {
                throw new \InvalidArgumentException('myRating must be an integer from 1 to 5, or null');
            }
            $fields['myRating'] = $v;
        }
        if (array_key_exists('lichessLikes', $body)) {
            $v = $body['lichessLikes'];
            if ($v !== null && (!is_int($v) || $v < 0)) {
                throw new \InvalidArgumentException('lichessLikes must be an integer of 0 or more, or null');
            }
            $fields['lichessLikes'] = $v;
        }
        if ($fields === []) {
            throw new \InvalidArgumentException('send myRating and/or lichessLikes');
        }
        if ($this->studies->find($id) === null) {
            throw new \OutOfBoundsException('study not found');
        }
        $this->studies->update($id, $fields);
        return self::public((array) $this->studies->find($id));
    }

    /**
     * Deletes a study (and with $group its group's parts). Needs the importer or an admin, for every study deleted.
     *
     * @throws \OutOfBoundsException unknown study; \DomainException not allowed
     */
    public function delete(string $id, bool $group, ?int $userId, bool $isAdmin): int
    {
        $study = $this->studies->find($id) ?? throw new \OutOfBoundsException('study not found');
        $ids = [$id];
        if ($group) {
            $groupId = $study['groupId'] ?? ($this->studies->groupMembers($id) !== [] ? $id : null);
            if ($groupId !== null) {
                $ids = array_values(array_unique([...$ids, ...$this->studies->groupMembers((string) $groupId)]));
            }
        }
        if (!$isAdmin) {
            foreach ($ids as $one) {
                $owner = $this->studies->find($one)['createdBy'] ?? null;
                if ($owner === null || $owner !== $userId) {
                    throw new \DomainException('only the user who imported a study, or an admin, can delete it');
                }
            }
        }
        return $this->studies->delete($ids);
    }

    /** @param array<string, mixed> $study @return array<string, mixed> */
    private static function public(array $study): array
    {
        unset($study['createdBy']);
        return $study;
    }
}
