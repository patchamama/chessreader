<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Presentation\Health\HealthController;
use App\Tests\TestCase;

class HealthControllerTest extends TestCase
{
    public function testContainerResolvesHealthController(): void
    {
        $container = $this->buildContainer();
        $controller = $container->get(HealthController::class);

        $this->assertInstanceOf(HealthController::class, $controller);
    }
}
