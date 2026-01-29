import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ===== CONFIGURE GLOBAL VALIDATION =====
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties that are not defined in the DTO
      whitelist: true,
      // Throw an error when unknown properties are present
      forbidNonWhitelisted: true,
      // Transform plain objects into DTO instances
      transform: true,
      // Enable implicit primitive type conversion (e.g., string -> number)
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Use 400 for validation errors
      errorHttpStatusCode: 400,
    }),
  );

  // ===== ENABLE CORS =====
  app.enableCors({
    origin: configService.get('CORS_ORIGIN') || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // ===== REQUEST ID MIDDLEWARE =====
  // Use dedicated RequestIdMiddleware to set req.id and response header
  const { RequestIdMiddleware } = await import('./common/middleware/request-id.middleware');
  app.use((req, res, next) => new RequestIdMiddleware().use(req, res, next));

  await app.listen(configService.get('server').port);
  console.log(`✅ Application is running on port ${configService.get('server').port}`);
}

bootstrap().catch((err) => {
  console.error('❌ Error during application bootstrap:', err);
  process.exit(1);
});