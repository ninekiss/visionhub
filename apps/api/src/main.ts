import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap(){const app=await NestFactory.create(AppModule);app.setGlobalPrefix('api/v1');app.enableCors({origin:process.env.CORS_ORIGINS?.split(',')??['http://localhost:5173']});const port=Number(process.env.PORT??3000);await app.listen(port,'0.0.0.0');console.log(`VisionHub API listening on :${port}/api/v1`)}
void bootstrap();
