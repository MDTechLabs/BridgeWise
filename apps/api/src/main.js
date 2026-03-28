"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const request_id_middleware_1 = require("./common/middleware/request-id.middleware");
const app_module_1 = require("./app.module");
const config_service_1 = require("./config/config.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_service_1.ConfigService);
    // ===== CONFIGURE SWAGGER/OPENAPI =====
    const config = new swagger_1.DocumentBuilder()
        .setTitle('BridgeWise API')
        .setDescription('BridgeWise is a comprehensive cross-chain bridging and transaction orchestration API that enables seamless asset transfers and fee estimation across multiple blockchain networks including Stellar, LayerZero, and Hop Protocol.')
        .setVersion('1.0.0')
        .addTag('Health', 'Health check and status endpoints')
        .addTag('Transactions', 'Transaction creation, management and tracking')
        .addTag('Fee Estimation', 'Network fee estimation and gas cost prediction')
        .addServer('http://localhost:3000', 'Local development server')
        .addServer('https://api.bridgewise.example.com', 'Production server')
        .setContact('BridgeWise Support', 'https://bridgewise.example.com', 'support@bridgewise.example.com')
        .setLicense('UNLICENSED', '')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
            docExpansion: 'list',
            filter: true,
            showRequestHeaders: true,
        },
        customSiteTitle: 'BridgeWise API Documentation',
    });
    // ===== CONFIGURE GLOBAL VALIDATION =====
    app.useGlobalPipes(new common_1.ValidationPipe({
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
    }));

      app.useGlobalFilters(new GlobalExceptionFilter());
    // ===== ENABLE CORS =====
    const corsOrigin = configService.get('CORS_ORIGIN');
    app.enableCors({
        origin: corsOrigin || '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
    });
    // ===== REQUEST ID MIDDLEWARE =====
    // Use dedicated RequestIdMiddleware to set req.id and response header
    app.use((req, res, next) => new request_id_middleware_1.RequestIdMiddleware().use(req, res, next));
    await app.listen(configService.get('server').port);
    console.log(`✅ Application is running on port ${configService.get('server').port}`);
}
bootstrap().catch((err) => {
    console.error('❌ Error during application bootstrap:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map