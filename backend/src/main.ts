import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  const configService = app.get(ConfigService);
  const corsAllowedOriginsRaw = (configService.get<string>("CORS_ALLOWED_ORIGINS") ?? "").trim();
  const allowAllOrigins = corsAllowedOriginsRaw === "*";
  const allowedOrigins = corsAllowedOriginsRaw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow non-browser clients (curl, server-to-server) with no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowAllOrigins || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(configService.get("PORT") ?? 4001);

  await app.listen(port);
}

bootstrap();
