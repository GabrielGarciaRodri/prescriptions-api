import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';


async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.set('trust proxy', 1);
  
  // Seguridad
  app.use(helmet());

  // CORS
  const origin = config.get<string>('APP_ORIGIN') ?? 'http://localhost:3001';
  app.enableCors({
    origin: origin === '*' ? true : origin.split(',').map((s) => s.trim()),
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

  const port = Number(config.get<string>('PORT')) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend listening on port ${port} (prefix /api)`);
}
bootstrap();