import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ===== CONFIGURE SWAGGER/OPENAPI =====
  const config = new DocumentBuilder()
    .setTitle('BridgeWise API')
    .setDescription(
      'BridgeWise is a comprehensive cross-chain bridging and transaction orchestration API that enables seamless asset transfers and fee estimation across multiple blockchain networks including Stellar, LayerZero, and Hop Protocol.',
    )
    .setVersion('1.0.0')
    .addTag('Health', 'Health check and status endpoints')
    .addTag('Transactions', 'Transaction creation, management and tracking')
    .addTag('Fee Estimation', 'Network fee estimation and gas cost prediction')
    .addServer('http://localhost:3000', 'Local development server')
    .addServer('https://api.bridgewise.example.com', 'Production server')
    .setContact(
      'BridgeWise Support',
      'https://bridgewise.example.com',
      'support@bridgewise.example.com',
    )
    .setLicense('UNLICENSED', '')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestHeaders: true,
    },
    customSiteTitle: 'BridgeWise API Documentation',
  });

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
  const corsOrigin = configService.get('CORS_ORIGIN' as any) as string | undefined;
  app.enableCors({
    origin: corsOrigin || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // ===== REQUEST ID MIDDLEWARE =====
  // Use dedicated RequestIdMiddleware to set req.id and response header
  app.use((req, res, next) => new RequestIdMiddleware().use(req, res, next));

  await app.listen(configService.get('server').port);
  console.log(`✅ Application is running on port ${configService.get('server').port}`);
}

bootstrap().catch((err) => {
  console.error('❌ Error during application bootstrap:', err);
  process.exit(1);
});