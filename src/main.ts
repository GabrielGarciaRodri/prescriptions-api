import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Seguridad
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: config.get<string>('APP_ORIGIN') ?? 'http://localhost:3001',
    credentials: true,
  });

  // Prefijo global
  app.setGlobalPrefix('api');

  // Validación global con DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // remueve propiedades no decoradas
      forbidNonWhitelisted: true, // rechaza requests con propiedades extra
      transform: true,            // transforma payloads a instancias de DTO
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`Backend corriendo en http://localhost:${port}/api`);
}
bootstrap();