<?php

declare(strict_types=1);

use App\Presentation\HealthController;
use Slim\App;

return function (App $app): void {
    $app->get('/api/health', HealthController::class);
};
