import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuarioEmpresa } from '../usuarios/usuario-empresa.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { validarSegredoJwt } from './segredo';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, UsuarioEmpresa]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: validarSegredoJwt(config.getOrThrow<string>('JWT_SECRET')),
        signOptions: { expiresIn: Number(config.get('JWT_EXPIRES_IN', 28800)) },
      }),
    }),
  ],
  controllers: [AuthController],
  // A ordem importa: o limite de requisições vale antes da autenticação, inclusive para tokens inválidos.
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
