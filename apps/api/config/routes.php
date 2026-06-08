<?php

declare(strict_types=1);

use App\Presentation\Admin\AdminController;
use App\Presentation\Auth\AuthController;
use App\Presentation\Health\HealthController;
use App\Presentation\Middleware\AuthMiddleware;
use App\Presentation\Middleware\RequireAdminMiddleware;
use Slim\App;
use Slim\Routing\RouteCollectorProxy;

return function (App $app): void {
    $app->get('/api/health', HealthController::class);

    // Auth routes (public)
    $app->group('/api/auth', function (RouteCollectorProxy $group) {
        $group->post('/register', [AuthController::class, 'register']);
        $group->post('/login', [AuthController::class, 'login']);
    });

    // Admin routes (require JWT + Admin role)
    $app->group('/api/admin', function (RouteCollectorProxy $group) {
        $group->get('/pending-users', [AdminController::class, 'pendingUsers']);
        $group->post('/users/{id}/approve', [AdminController::class, 'approve']);
        $group->post('/users/{id}/reject', [AdminController::class, 'reject']);
    })->add(RequireAdminMiddleware::class)->add(AuthMiddleware::class);
};
