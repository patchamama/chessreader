<?php

declare(strict_types=1);

use App\Presentation\Admin\AdminController;
use App\Presentation\Engine\EngineController;
use App\Presentation\Engine\HumanMoveController;
use App\Presentation\Comments\CommentsController;
use App\Presentation\Resources\ResourcesController;
use App\Presentation\Auth\AuthController;
use App\Presentation\Diagram\DiagramController;
use App\Presentation\Eval\EvalController;
use App\Presentation\Health\HealthController;
use App\Presentation\Ingestion\IngestionController;
use App\Presentation\Library\BookConfigController;
use App\Presentation\Library\LibraryController;
use App\Presentation\Narration\NarrationController;
use App\Presentation\Notes\NotesController;
use App\Presentation\Trainer\TrainerController;
use App\Presentation\Recognition\RecognitionController;
use App\Presentation\Webparser\WebparserController;
use App\Presentation\Middleware\AuthMiddleware;
use App\Presentation\Middleware\RequireAdminMiddleware;
use App\Presentation\Middleware\RequireApprovedMiddleware;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return function (App $app): void {
    // JSON (and form) request bodies: without it getParsedBody() is null for the browser's JSON requests.
    $app->addBodyParsingMiddleware();

    $app->get('/api/health', HealthController::class);

    // Auth routes (public)
    $app->group('/api/auth', function (RouteCollectorProxy $group) {
        $group->post('/register', [AuthController::class, 'register']);
        $group->post('/login', [AuthController::class, 'login']);
        $group->post('/password-reset/request', [AuthController::class, 'requestReset']);
        $group->post('/password-reset/confirm', [AuthController::class, 'resetPassword']);
    });

    // Admin routes (require JWT + Admin role)
    $app->group('/api/admin', function (RouteCollectorProxy $group) {
        $group->get('/pending-users', [AdminController::class, 'pendingUsers']);
        $group->get('/active-users', [AdminController::class, 'activeUsers']);
        $group->get('/blocked-users', [AdminController::class, 'blockedUsers']);
        $group->get('/users/{id:[0-9]+}/books', [AdminController::class, 'userBooks']);
        $group->post('/users/{id:[0-9]+}/approve', [AdminController::class, 'approve']);
        $group->post('/users/{id:[0-9]+}/reject', [AdminController::class, 'reject']);
        $group->post('/users/{id:[0-9]+}/password', [AdminController::class, 'setPassword']);
        $group->post('/users/{id:[0-9]+}/send-reset', [AdminController::class, 'sendResetLink']);
        $group->get('/engine/stockfish', [EngineController::class, 'status']);
        $group->post('/engine/stockfish/install', [EngineController::class, 'install']);
        $group->put('/engine/stockfish/selected', [EngineController::class, 'select']);
    })->add(RequireAdminMiddleware::class)->add(AuthMiddleware::class);

    // Notes routes (per-user scratch notes; require JWT + Approved)
    $app->group('/api/notes', function (RouteCollectorProxy $group) {
        $group->get('', [NotesController::class, 'get']);
        $group->put('', [NotesController::class, 'save']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Position Trainer routes (spaced repetition; require JWT + Approved)
    $app->group('/api/trainer', function (RouteCollectorProxy $group) {
        $group->get('/lines', [TrainerController::class, 'list']);
        $group->post('/lines', [TrainerController::class, 'add']);
        $group->post('/lines/{id:[0-9]+}/review', [TrainerController::class, 'review']);
        $group->delete('/lines/{id:[0-9]+}', [TrainerController::class, 'delete']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Recognition route (require JWT + Approved)
    $app->group('/api/recognition', function (RouteCollectorProxy $group) {
        $group->post('/parse', [RecognitionController::class, 'parse']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Eval routes (require JWT + Approved)
    $app->group('/api/eval', function (RouteCollectorProxy $group) {
        $group->post('/position', [EvalController::class, 'position']);
        $group->post('/game', [EvalController::class, 'game']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // How people play: Maia's prediction for a rating (require JWT + Approved)
    $app->group('/api/engine', function (RouteCollectorProxy $group) {
        $group->get('/human', [HumanMoveController::class, 'predict']);
        $group->get('/players', [HumanMoveController::class, 'engines']);
        $group->get('/play', [HumanMoveController::class, 'play']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Private resources from the books (require JWT + Approved)
    $app->get('/api/resources/{name}', [ResourcesController::class, 'get'])->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Human commentary by position (require JWT + Approved)
    $app->group('/api/comments', function (RouteCollectorProxy $group) {
        $group->get('/position', [CommentsController::class, 'position']);
        $group->get('/games/{id}', [CommentsController::class, 'game']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Diagram routes (require JWT + Approved)
    $app->group('/api/diagrams', function (RouteCollectorProxy $group) {
        $group->post('/regenerate', [DiagramController::class, 'regenerate']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Narration audio (require JWT + Approved)
    $app->group('/api/narration', function (RouteCollectorProxy $group) {
        $group->post('/render', [NarrationController::class, 'render']);
        $group->get('/providers', [NarrationController::class, 'providers']);
        $group->get('/audio/{id}.mp3', [NarrationController::class, 'audio']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Webparser routes (require JWT + Approved)
    $app->group('/api/webparser', function (RouteCollectorProxy $group) {
        $group->post('/parse', [WebparserController::class, 'parse']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Public book cover — served as a plain <img>, which cannot send an auth
    // header. Only exposes the cover image binary (no sensitive data).
    $app->get('/api/library/books/{id:[0-9]+}/cover', [LibraryController::class, 'cover']);
    // Chapter images (diagrams, figures) — same reason: the reader shows them
    // with plain <img>/<image> tags. Serves image entries of the EPUB only.
    $app->get('/api/library/books/{id:[0-9]+}/images/{path:.+}', [LibraryController::class, 'image']);

    // Library routes (require JWT + Approved)
    $app->group('/api/library', function (RouteCollectorProxy $group) {
        $group->get('/books', [LibraryController::class, 'books']);
        $group->get('/books/{id:[0-9]+}/chapters/{n:[0-9]+}', [LibraryController::class, 'chapter']);
        $group->put('/books/{id:[0-9]+}', [LibraryController::class, 'updateBook']);
        $group->delete('/books/{id:[0-9]+}', [LibraryController::class, 'deleteBook']);
        $group->post('/books/{id:[0-9]+}/touch', [LibraryController::class, 'touch']);
        // Per-book custom render config — READ is open to any approved user.
        $group->get('/books/{id:[0-9]+}/config', [BookConfigController::class, 'get']);
        $group->post('/upload', [IngestionController::class, 'upload']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);

    // Per-book config WRITE — admin only.
    $app->group('/api/library', function (RouteCollectorProxy $group) {
        $group->put('/books/{id:[0-9]+}/config', [BookConfigController::class, 'save']);
    })->add(RequireAdminMiddleware::class)->add(AuthMiddleware::class);

    // Errata: corrected main lines of book games (require JWT + Approved)
    $app->group('/api/errata', function (RouteCollectorProxy $group) {
        $group->get('', [\App\Presentation\Errata\ErrataController::class, 'list']);
        $group->post('', [\App\Presentation\Errata\ErrataController::class, 'save']);
    })->add(RequireApprovedMiddleware::class)->add(AuthMiddleware::class);
};
